import {CatoMcpToolWrapper, McpToolDef, McpToolDefContext} from "../common/catoMcpTool.js";
import {
    emptyMetricsResponse,
    isValidSiteMetricResponse,
    formatBytes,
    DEFAULT_TIMEFRAME,
    DEFAULT_TOP_N,
    standardizeMetricsInput,
    calculateBytesTotal
} from "../../utils/metricsUtils.js";

export function buildTopSiteBandwidthConsumersTool(ctx: McpToolDefContext): CatoMcpToolWrapper {
    const toolDef: McpToolDef = {
        name: "top_site_bandwidth_consumers",
        description: `Ranks sites by total traffic (bytesUpstream + bytesDownstream) in a given time frame. Useful for capacity planning and identifying unusual traffic patterns.
        
        NOTE: Byte values are automatically formatted using binary units (KiB, MiB, GiB, etc.) with base 1024 for human readability. Raw byte totals are also provided for calculations.`,
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
                    description: "Time frame for the data. Format: 'last.P{duration}' (e.g., 'last.P1D' for 1 day) or 'utc.{date/time range}' (e.g., 'utc.2023-01-{01/00:00:00--31/23:59:59}').",
                    default: DEFAULT_TIMEFRAME
                },
                siteIDs: {
                    type: "array",
                    items: {
                        type: "string"
                    },
                    description: "Optional list of site IDs to filter by. If not provided, all sites will be considered."
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
                    description: "For sites, whether to aggregate traffic from all interfaces into a single total per site before ranking.",
                    default: true
                }
            },
            required: ["accountID", "timeFrame"],
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
    return standardizeMetricsInput(variables);
}

const gqlQuery = `
query topSiteBandwidthConsumers($accountID: ID!, $timeFrame: TimeFrame!, $siteIDs: [ID!], $groupInterfaces: Boolean = true) {
  accountMetrics(accountID: $accountID, timeFrame: $timeFrame, groupInterfaces: $groupInterfaces) {
    id
    from
    to
    sites(siteIDs: $siteIDs) {
      id
      info {
        name
      }
      metrics {
        bytesUpstream
        bytesDownstream
      }
    }
  }
}
`

function handleResponse(variables: Record<string, any>, response: any): any {
    if (!isValidSiteMetricResponse(variables.accountID, response)) {
        return emptyMetricsResponse(response.data?.accountMetrics)
    }
    const accountMetrics = response.data.accountMetrics;

    const topN = variables.topN || DEFAULT_TOP_N;
    
    const consumers = accountMetrics.sites;

    if (!consumers) {
        return emptyMetricsResponse(accountMetrics);
    }
    
    const rankedConsumers = consumers.map((consumer: any) => {
        const totalBytes = calculateBytesTotal(consumer.metrics?.bytesUpstream || 0, consumer.metrics?.bytesDownstream || 0);
        return {
            id: consumer.id,
            name: consumer.info?.name || consumer.name,
            totalBytes: totalBytes,
            totalUsage: formatBytes(totalBytes),
            breakdown: {
                upload: formatBytes(consumer.metrics?.bytesUpstream || 0),
                download: formatBytes(consumer.metrics?.bytesDownstream || 0)
            }
        };
    })
    .sort((a: any, b: any) => b.totalBytes - a.totalBytes)
    .slice(0, topN);


    return {
        data: {
            timeFrame: {
                from: response.data.accountMetrics.from,
                to: response.data.accountMetrics.to,
            },
            summary: {
                consumerType: "sites",
                showingTop: rankedConsumers.length,
            },
            topConsumers: rankedConsumers,
        }
    };
} 