import {CatoMcpToolWrapper, McpToolDef, McpToolDefContext} from "../common/catoMcpTool.js";
import {
    emptyMetricsResponse,
    DEFAULT_TIMEFRAME, 
    DEFAULT_BUCKETS,
    standardizeMetricsInput,
    calculateSummary,
    calculateHostUtilization,
    isValidUserMetricResponse
} from "../../utils/metricsUtils.js";

export function buildUserMetricsTimeseriesTool(ctx: McpToolDefContext): CatoMcpToolWrapper {
    const toolDef: McpToolDef = {
        name: "user_metrics_timeseries",
        description: `Retrieves time-bucketed metrics data for VPN-connected users, enabling trend analysis and performance monitoring over time.

IMPORTANT: This tool only returns data for users connected via VPN and will not return information for those connected through other methods.

**Workflow:**
1. **First:** Use the 'entity_lookup' tool (type: 'vpnUser') to find user IDs by name or other criteria.
2. **Then:** Use this tool with the discovered userIDs and specify which metrics you want timeseries data for.

**Data Returned:**
- User identification (ID, name)
- Interface-level timeseries: bytes (up/down/total/max), packet loss (counts/percentages), packet discards (percentages), RTT, health, tunnel age, last mile metrics, jitter
- Time-bucketed data points for trend analysis with configurable granularity

Example questions this tool can help answer:
- "How has any user's connection quality (RTT, packet loss) trended over the last 24 hours?"
- "Show me bandwidth usage patterns for any user over the past week in hourly buckets"
- "What was the peak number of connected devices for any user last month?"
- "Identify time periods when any user's connection health dropped below acceptable levels"

BYTE VALUES: Returns raw byte values to preserve precision. Unit information is in the 'units' field.

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
                    default: DEFAULT_TIMEFRAME
                },
                buckets: {
                    type: "integer",
                    description: "Number of time buckets to divide the timeFrame into (1-1000). Higher values give finer granularity.",
                    default: DEFAULT_BUCKETS,
                    minimum: 1,
                    maximum: 1000
                },
                timeseries: {
                    type: "array",
                    items: {
                        type: "string",
                        enum: [
                            "bytesUpstream", "bytesDownstream", "bytesTotal",
                            "bytesUpstreamMax", "bytesDownstreamMax",
                            "lostUpstreamPcnt", "lostDownstreamPcnt",
                            "packetsDiscardedUpstreamPcnt", "packetsDiscardedDownstreamPcnt",
                            "rtt", "health", "tunnelAge",
                            "lastMilePacketLoss", "lastMileLatency",
                            "jitterUpstream", "jitterDownstream",
                            "lostUpstream", "lostDownstream"
                        ]
                    },
                    description: "List of metrics for which to retrieve timeseries data.",
                    default: ["bytesTotal"]
                },
                userIDs: {
                    type: "array",
                    items: {type: "string"},
                    description: "List of user IDs to analyze. Use entity_lookup tool (type: 'vpnUser') to discover user IDs first."
                },
                perSecond: {
                    type: "boolean",
                    description: "Whether to normalize data to per-second rates (divide by bucket duration).",
                    default: false
                },
                aggregationFunction: {
                    type: "string",
                    enum: ["sum", "avg", "max", "min"],
                    description: "How to aggregate data across multiple interfaces when grouping is enabled.",
                    default: "sum"
                }
            },
            required: ["accountID", "timeFrame", "userIDs", "timeseries"],
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
        throw new Error("UserIDs are required for timeseries analysis. Please use entity_lookup tool first:\n1. Call entity_lookup with type='vpnUser' to find user IDs\n2. Then call this tool with the discovered userIDs");
    }
    
    // If no timeseries metrics specified, throw error
    if (!variables.timeseries || variables.timeseries.length === 0) {
        throw new Error("Timeseries metrics are required. Please specify which metrics you want timeseries data for (e.g., ['bytesTotal', 'rtt', 'lostDownstreamPcnt'])");
    }
    
    variables.groupInterfaces = true;
    variables.groupDevices = true;
    return standardizeMetricsInput(variables);
}

const gqlQuery = `
query userMetricsTimeseries($accountID: ID!, $timeFrame: TimeFrame!, $buckets: Int!, $timeseries: [TimeseriesMetricType!]!, $userIDs: [ID!], $perSecond: Boolean = false, $groupInterfaces: Boolean = true, $groupDevices: Boolean = true) {
  accountMetrics(accountID: $accountID, timeFrame: $timeFrame, groupInterfaces: $groupInterfaces, groupDevices: $groupDevices) {
    id
    from
    to
    granularity
    
    users(userIDs: $userIDs) {
      id
      name
      hostCount {
        label
        units
        sum
        data(perSecond: $perSecond)
        info
      }
      flowCount {
        label
        units
        sum
        data(perSecond: $perSecond)
        info
      }
      hostLimit {
        label
        units
        sum
        data(perSecond: $perSecond)
        info
      }
      interfaces {
        name
        remoteIP
        timeseries(buckets: $buckets, labels: $timeseries) {
            label
            units
            sum
            data(perSecond: $perSecond)
            info
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

function processUserTimeseriesData(accountMetrics: any, aggregationFn: string): { users: any[] } {
    const users: any[] = [];

    for (const user of accountMetrics.users || []) {
        const userData: any = {
            userId: user.id,
            userName: user.name,
            userTimeseries: {},
            interfaces: []
        };
        
        // Process user-level timeseries (hostCount, flowCount, hostLimit)
        const userTimeseriesFields = {
            hostCount: user.hostCount,
            flowCount: user.flowCount,
            hostLimit: user.hostLimit
        };

        for (const [fieldName, ts] of Object.entries(userTimeseriesFields)) {
            if (ts) {
                const dataPoints = ts.data || [];
                const summary = calculateSummary(dataPoints, aggregationFn);
                userData.userTimeseries[ts.label] = {
                    label: ts.label,
                    units: ts.units,
                    sum: ts.sum,
                    summary: summary,
                    buckets: dataPoints.length,
                    data: dataPoints
                };
            }
        }

        // Calculate host utilization timeseries if both hostCount and hostLimit are available
        if (userData.userTimeseries.hostCount && userData.userTimeseries.hostLimit) {
            const hostCountData = userData.userTimeseries.hostCount.data;
            const hostLimitData = userData.userTimeseries.hostLimit.data;
            const utilizationData: number[][] = [];
            const maxBuckets = Math.min(hostCountData.length, hostLimitData.length);

            for (let i = 0; i < maxBuckets; i++) {
                if (hostCountData[i] && hostLimitData[i]) {
                    const timestamp = hostCountData[i][0];
                    const hostCount = hostCountData[i][1] || 0;
                    const hostLimit = hostLimitData[i][1] || 1;
                    const utilization = calculateHostUtilization(hostCount, hostLimit);
                    utilizationData.push([timestamp, utilization]);
                }
            }
            if (utilizationData.length > 0) {
                const summary = calculateSummary(utilizationData, aggregationFn);
                userData.userTimeseries.hostUtilizationPct = {
                    label: "hostUtilizationPct",
                    units: "percent",
                    sum: null,
                    summary: summary,
                    buckets: utilizationData.length,
                    data: utilizationData
                };
            }
        }

        // Process interface-level timeseries
        for (const intf of user.interfaces || []) {
            const intfData: any = {
                name: intf.name,
                remoteIP: intf.remoteIP,
                remoteIPInfo: intf.remoteIPInfo,
                timeseries: {}
            };
            
            for (const ts of intf.timeseries || []) {
                const dataPoints = ts.data || [];
                const summary = calculateSummary(dataPoints, aggregationFn);
                intfData.timeseries[ts.label] = {
                    label: ts.label,
                    units: ts.units,
                    sum: ts.sum,
                    summary: summary,
                    buckets: dataPoints.length,
                    data: dataPoints,
                    info: ts.info || null
                };
            }
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
    const buckets = variables.buckets || DEFAULT_BUCKETS;
    const requestedTimeseries = variables.timeseries || [];
    const aggregationFn = variables.aggregationFunction || 'sum';
    
    const { users } = processUserTimeseriesData(accountMetrics, aggregationFn);
    
    const totalInterfaces = users.reduce((sum, user) => sum + (user.interfaces?.length || 0), 0);
    const totalTimeseriesMetrics = users.reduce((sum, user) => {
        const userMetrics = Object.keys(user.userTimeseries || {}).length;
        const interfaceMetrics = user.interfaces?.reduce((intfSum: number, intf: any) => 
            intfSum + Object.keys(intf.timeseries || {}).length, 0) || 0;
        return sum + userMetrics + interfaceMetrics;
    }, 0);

    return {
        data: {
            timeFrame: {
                from: accountMetrics.from,
                to: accountMetrics.to,
            },
            granularity: accountMetrics.granularity,
            bucketCount: buckets,
            summary: {
                usersReturned: users.length,
                totalInterfaces: totalInterfaces,
                totalTimeseriesMetrics: totalTimeseriesMetrics,
                timeseriesMetricsRequested: requestedTimeseries,
                note: "Returns timeseries data for users and their interfaces. User-level metrics include hostCount, flowCount, hostLimit, and calculated hostUtilizationPct."
            },
            users: users
        }
    };
} 