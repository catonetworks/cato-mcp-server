import {CatoMcpToolWrapper, McpToolDef, McpToolDefContext} from "../common/catoMcpTool.js";
import {
    emptyMetricsResponse,
    formatBytes,
    DEFAULT_TIMEFRAME,
    DEFAULT_TOP_N,
    standardizeMetricsInput,
    calculateBytesTotal,
    isValidUserMetricResponse
} from "../../utils/metricsUtils.js";

export function buildTopUsersBandwidthConsumersTool(ctx: McpToolDefContext): CatoMcpToolWrapper {
    const toolDef: McpToolDef = {
        name: "top_users_bandwidth_consumers",
        description: `Ranks VPN-connected users by total traffic (bytesUpstream + bytesDownstream) in a given time frame. Useful for bandwidth monitoring, cost management, and identifying unusual usage patterns.

IMPORTANT: This tool only returns data for users connected via VPN and will not return information for those connected through other methods.

NOTE: Byte values are automatically formatted using binary units (KiB, MiB, GiB, etc.) with base 1024 for human readability. Raw byte totals are also provided for calculations.

Example questions this tool can help answer:
- "Who are the top 10 bandwidth consumers this month?"
- "Which users exceeded 50 GB of total traffic today?"
- "Show me the top 5 users by bandwidth consumption this week with upload/download breakdown"
- "Identify users with unusually high bandwidth usage for security analysis"

IMPORTANT: Carefully review the timeFrame parameter description and examples below to ensure correct usage (in-day, cross-day, cross-month, cross-year absolute UTC formats).`,
        inputSchema: {
            type: "object",
            properties: {
                accountID: {
                    type: "string",
                    description: "Tenant account ID.",
                    default: ctx.accountId
                },
                timeFrame: {
                    type: "string",
                    description: "Time frame for the data (required). Format '<type>.<value>'.\n1) Relative: 'last.<ISO-8601 duration>' – examples: last.PT5M (5 min), last.PT2H (2 h), last.P1D (1 day), last.P3M (3 months), last.P1Y (1 year).\n2) Absolute UTC range: 'utc.<range>'. The curly braces {} group the time components that vary; constant parts like the year remain outside. Note the difference in brace placement for cross-year vs. same-year queries. Correct examples: in-day → utc.2024-05-11/{00:00:00--12:00:00}, utc.2025-04-22/{09:15:00--17:45:00}; full-day → utc.2024-05-12/{00:00:00--23:59:59}, utc.2025-04-22/{00:00:00--23:59:59}; cross-day (same month) → utc.2024-05-{01/00:00:00--07/23:59:59}, utc.2025-04-{15/08:00:00--16/18:00:00}; full-month → utc.2024-05-{01/00:00:00--31/23:59:59}, utc.2025-02-{01/00:00:00--28/23:59:59}; cross-month (same year) → utc.2024-{05-01/00:00:00--06-01/00:00:00}, utc.2025-{03-15/12:00:00--04-10/06:30:00}; cross-year → utc.{2023-12-31/22:00:00--2024-01-01/02:00:00}, utc.{2024-12-30/00:00:00--2025-01-05/23:59:59}.",
                    default: "last.P1D",
                    examples: [
                        "last.P1D",
                        "utc.2025-04-22/{00:00:00--14:00:00}",
                        "utc.2025-04-{01/00:00:00--07/23:59:59}",
                        "utc.2025-{04-01/00:00:00--05-01/00:00:00}",
                        "utc.{2024-12-30/00:00:00--2025-01-05/23:59:59}"
                    ]
                },
                userIDs: {
                    type: "array",
                    items: {
                        type: "string"
                    },
                    description: "required list of user IDs to filter by. If not provided, all VPN users will be considered. Use entity_lookup tool (type: 'vpnUser') to discover user IDs."
                },
                topN: {
                    type: "integer",
                    description: "The number of top consumers to return (1-50).",
                    default: DEFAULT_TOP_N,
                    minimum: 1,
                    maximum: 50
                },
                groupInterfaces: {
                    type: "boolean",
                    description: "Whether to aggregate traffic from all user interfaces into a single total per user before ranking.",
                    default: true
                }
            },
            required: ["accountID", "timeFrame","userIDs"],
            additionalProperties: false,
            $schema: "http://json-schema.org/draft-07/schema#"
        }
    };

    return {
        toolDef: toolDef,
        gqlQuery: gqlQuery,
        inputHandler: handleInput,
        responseHandler: handleResponse,
    }
}

function handleInput(variables: Record<string, any>): Record<string, any> {
    variables.groupDevices = true;
    return standardizeMetricsInput(variables);
}

const gqlQuery = `
query topUsersBandwidthConsumers($accountID: ID!, $timeFrame: TimeFrame!, $userIDs: [ID!], $groupInterfaces: Boolean = true, $groupDevices: Boolean = true) {
  accountMetrics(accountID: $accountID, timeFrame: $timeFrame, groupInterfaces: $groupInterfaces, groupDevices: $groupDevices) {
    id
    from
    to
    users(userIDs: $userIDs) {
      id
      name
      metrics {
        bytesUpstream
        bytesDownstream
        duration
      }
    }
  }
}
`

function handleResponse(variables: Record<string, any>, response: any): any {
    if (!isValidUserMetricResponse(variables.accountID, response)) {
        return emptyMetricsResponse(response.data?.accountMetrics);
    }
    const accountMetrics = response.data.accountMetrics;

    const topN = variables.topN || DEFAULT_TOP_N;
    
    const consumers = accountMetrics.users;

    if (!consumers) {
        return emptyMetricsResponse(accountMetrics);
    }
    
    const rankedConsumers = consumers.map((consumer: any) => {
        const totalBytes = calculateBytesTotal(consumer.metrics?.bytesUpstream || 0, consumer.metrics?.bytesDownstream || 0);
        return {
            id: consumer.id,
            name: consumer.name,
            totalBytes: totalBytes,
            totalUsage: formatBytes(totalBytes),
            breakdown: {
                upload: formatBytes(consumer.metrics?.bytesUpstream || 0),
                download: formatBytes(consumer.metrics?.bytesDownstream || 0)
            },
            duration: consumer.metrics?.duration || 0
        };
    })
    .filter((consumer: any) => consumer.totalBytes > 0) // Only include users with actual traffic
    .sort((a: any, b: any) => b.totalBytes - a.totalBytes)
    .slice(0, topN);

    return {
        data: {
            timeFrame: {
                from: accountMetrics.from,
                to: accountMetrics.to,
            },
            summary: {
                consumerType: "users",
                showingTop: rankedConsumers.length,
                totalUsersAnalyzed: consumers.length,
                note: "Only VPN-connected users with traffic > 0 are included in rankings."
            },
            topConsumers: rankedConsumers,
        }
    };
} 