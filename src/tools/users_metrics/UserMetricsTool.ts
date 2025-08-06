import {CatoMcpToolWrapper, McpToolDef, McpToolDefContext} from "../common/catoMcpTool.js";
import {
    emptyMetricsResponse,
    DEFAULT_TIMEFRAME, 
    DEFAULT_BUCKETS,
    standardizeMetricsInput,
    isValidUserMetricResponse
} from "../../utils/metricsUtils.js";

export function buildUserMetricsTool(ctx: McpToolDefContext): CatoMcpToolWrapper {
    const toolDef: McpToolDef = {
        name: "user_metrics",
        description: `Returns aggregated metrics for VPN-connected users (no timeseries data).

IMPORTANT: This tool only returns data for users connected via VPN and will not return information for those connected through other methods.

**Workflow:**
1. **First:** Use the 'entity_lookup' tool (type: 'vpnUser') to find user IDs by name or other criteria.
2. **Then:** Use this tool with the discovered userIDs to get aggregated metrics.

**Data Returned:**
- User identification (ID, name)
- User-level aggregated metrics: bytes (up/down/total), packets (up/down), packet discard counts, packet loss counts, RTT, duration, granularity, host/flow counts and limits
- Interface breakdown with metrics: bandwidth, packets, latency, packet loss, jitter, discard counts, geographic and provider details

    For timeseries data and trend analysis, use the 'user_metrics_timeseries' tool instead.

    Example questions this tool can help answer:
    - "What are the total bandwidth consumption stats for each user over the last 24 hours?"
    - "Which users have the highest packet loss percentages today?"
    - "Show me current host utilization for all users"
    - "What's the average RTT for each user's interfaces this week?"

    BYTE VALUES: Returns raw byte values to preserve precision. Unit information is provided in the 'units' field.`,
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
                userIDs: {
                    type: "array",
                    items: {type: "string"},
                    description: "List of user IDs to analyze. Use entity_lookup tool (type: 'vpnUser') to discover user IDs first."
                }
            },
            required: ["accountID", "timeFrame", "userIDs"],
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
    // If no userIDs provided, guide user to use entity_lookup first
    if (!variables.userIDs || variables.userIDs.length === 0) {
        throw new Error("UserIDs are required for metrics analysis. Please use entity_lookup tool first:\n1. Call entity_lookup with type='vpnUser' to find user IDs\n2. Then call this tool with the discovered userIDs");
    }
    
    variables.groupInterfaces = true;
    variables.groupDevices = true;
    return standardizeMetricsInput(variables);
}

const gqlQuery = `
query userMetrics($accountID: ID!, $timeFrame: TimeFrame!, $userIDs: [ID!], $groupInterfaces: Boolean = true, $groupDevices: Boolean = true) {
  accountMetrics(accountID: $accountID, timeFrame: $timeFrame, groupInterfaces: $groupInterfaces, groupDevices: $groupDevices) {
    id
    from
    to
    granularity
    
    users(userIDs: $userIDs) {
      id
      name
      metrics {
        bytesTotal
        bytesUpstream
        bytesDownstream
        packetsUpstream
        packetsDownstream
        packetsDiscardedUpstream
        packetsDiscardedDownstream
        lostUpstream
        lostDownstream
        rtt
        duration
        granularity
        hostCount
        flowCount
        hostLimit
      }
      interfaces {
        name
        remoteIP
        metrics {
          bytesUpstream
          bytesDownstream
          bytesTotal
          packetsUpstream
          packetsDownstream
          rtt
          lostUpstream
          lostDownstream
          lostUpstreamPcnt
          lostDownstreamPcnt
          packetsDiscardedUpstream
          packetsDiscardedDownstream
          jitterUpstream
          jitterDownstream
        }
        remoteIPInfo {
          ip
          provider
          city
          countryName
          countryCode
          latitude
          longitude
          state
        }
      }
    }
  }
}
`

function processUserData(accountMetrics: any): { users: any[] } {
    const users: any[] = [];

    for (const user of accountMetrics.users || []) {
        const userData: any = {
            userId: user.id,
            userName: user.name,
            metrics: user.metrics || {},
            interfaces: []
        };

        for (const intf of user.interfaces || []) {
            const intfData: any = {
                name: intf.name,
                remoteIP: intf.remoteIP,
                remoteIPInfo: intf.remoteIPInfo,
                metrics: intf.metrics || {}
            };
            userData.interfaces.push(intfData);
        }
        users.push(userData);
    }
    return { users };
}

function handleResponse(variables: Record<string, any>, response: any): any {
    if (!isValidUserMetricResponse(variables.accountID, response)) {
        return emptyMetricsResponse(response.data?.accountMetrics);
    }
    const accountMetrics = response.data.accountMetrics;
    
    const { users } = processUserData(accountMetrics);
    
    const totalInterfaces = users.reduce((sum, user) => sum + (user.interfaces?.length || 0), 0);
    const usersWithMetrics = users.filter(user => Object.keys(user.metrics || {}).length > 0).length;

    return {
        data: {
            timeFrame: {
                from: accountMetrics.from,
                to: accountMetrics.to,
            },
            granularity: accountMetrics.granularity,
            summary: {
                usersReturned: users.length,
                usersWithMetrics: usersWithMetrics,
                totalInterfaces: totalInterfaces,
                note: "Returns aggregated metrics only. For timeseries data, use user_metrics_timeseries tool."
            },
            users: users
        }
    };
} 