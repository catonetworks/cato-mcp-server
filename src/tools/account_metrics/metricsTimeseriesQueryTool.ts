import {CatoMcpToolWrapper, McpToolDef, McpToolDefContext} from "../common/catoMcpTool.js";
import {
    emptyMetricsResponse, 
    isValidMetricResponse, 
    DEFAULT_TIMEFRAME, 
    DEFAULT_BUCKETS,
    standardizeMetricsInput,
    calculateSummary,
    calculateHostUtilization
} from "./metricsUtils.js";

export function buildMetricsTimeseriesQueryTool(ctx: McpToolDefContext): CatoMcpToolWrapper {
    const toolDef: McpToolDef = {
        name: "metrics_timeseries_query",
        description: `NOTE: Returns raw bucketed timestamp/value arrays; does NOT pre-aggregate metrics like average RTT per site.

Retrieves time-bucketed metrics data for sites or users, enabling trend analysis, peak detection, and traffic pattern identification.
        
        BYTE VALUES: Returns raw byte values (not formatted) to preserve precision for mathematical operations and trend analysis. Unit information is provided in the 'units' field. When byte values are referenced in formatted units, they use binary units (MiB, GiB, etc.) with base 1024, not decimal units (MB, GB, etc.) with base 1000.
        
        Example questions this tool can help answer:
        - "How has total account traffic trended hour-by-hour over the last 48 hours?"
        - "Which sites exceeded 1 Gbit of total traffic in any 15-minute bucket last week?"
        - "What is the trend of tunnelAge for each interface over the past 7 days?"
        - "For each site, what was the peak packetsDownstream count in the past 90 days?"
        - "Identify time periods when any site's lastMileLatency exceeded 500 ms."
        - "Show me hourly hostCount variations for all sites to identify capacity planning needs."`,
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
                buckets: {
                    type: "integer",
                    description: "Number of time buckets to divide the timeFrame into (1-1000). Higher values give finer granularity.",
                    default: DEFAULT_BUCKETS,
                    minimum: 1,
                    maximum: 1000
                },
                labels: {
                    type: "array",
                    items: {
                        type: "string",
                        enum: [
                            "bytesDownstream", "bytesUpstream", "bytesTotal",
                            "bytesDownstreamMax", "bytesUpstreamMax",
                            "packetsDownstream", "packetsUpstream",
                            "lostDownstream", "lostUpstream", "lostDownstreamPcnt", "lostUpstreamPcnt",
                            "packetsDiscardedDownstream", "packetsDiscardedUpstream",
                            "packetsDiscardedDownstreamPcnt", "packetsDiscardedUpstreamPcnt",
                            "jitterDownstream", "jitterUpstream", "rtt",
                            "lastMileLatency", "lastMilePacketLoss", "tunnelAge"
                        ]
                    },
                    description: "List of metrics to retrieve timeseries data for. Each metric will have its own timeseries.",
                    default: ["bytesTotal"]
                },
                siteIDs: {
                    type: "array",
                    items: {type: "string"},
                    description: "Optional list of site IDs to filter by. If omitted, returns data for all sites."
                },
                userIDs: {
                    type: "array",
                    items: {type: "string"},
                    description: "Optional list of user IDs to filter by. If omitted and includeUsers is true, returns data for all users."
                },
                includeUsers: {
                    type: "boolean",
                    description: "Whether to include remote user timeseries data in addition to sites.",
                    default: false
                },
                groupInterfaces: {
                    type: "boolean",
                    description: "For sites, whether to aggregate all interfaces into a single timeseries per site.",
                    default: true
                },
                groupDevices: {
                    type: "boolean",
                    description: "For HA sites, whether to aggregate primary and secondary devices into a single timeseries.",
                    default: true
                },
                perSecond: {
                    type: "boolean",
                    description: "Whether to normalize data to per-second rates (divide by bucket duration).",
                    default: false
                },
                aggregationFunction: {
                    type: "string",
                    enum: ["sum", "avg", "max", "min"],
                    description: "How to aggregate data across multiple sites/interfaces when grouping is enabled.",
                    default: "sum"
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
    variables = standardizeMetricsInput(variables);
    
    // Handle user inclusion logic based on documentation
    if (!variables.includeUsers || !variables.userIDs) {
        variables.includeUsers = false;
        variables.userIDs = null;
    }
    
    return variables;
}

const gqlQuery = `
query metricsTimeseries($accountID: ID!, $timeFrame: TimeFrame!, $buckets: Int!, $labels: [TimeseriesMetricType!]!, $siteIDs: [ID!], $userIDs: [ID!], $includeUsers: Boolean = false, $groupInterfaces: Boolean = true, $groupDevices: Boolean = true, $perSecond: Boolean = false) {
  accountMetrics(accountID: $accountID, timeFrame: $timeFrame, groupInterfaces: $groupInterfaces, groupDevices: $groupDevices) {
    id
    from
    to
    granularity
    timeseries(buckets: $buckets, labels: $labels) {
      label
      units
      sum
      data(perSecond: $perSecond)
      info
    }
    sites(siteIDs: $siteIDs) {
      id
      name
      info {
        name
        type
        connType
        region
      }
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
        timeseries(buckets: $buckets, labels: $labels) {
          label
          units
          sum
          data(perSecond: $perSecond)
          info
        }
      }
    }
    users(userIDs: $userIDs) @include(if: $includeUsers) {
      id
      name
    }
  }
}
`

function processAccountTimeseries(accountMetrics: any, aggregationFn: string): any[] {
    const accountTimeseries: any[] = [];
    for (const ts of accountMetrics.timeseries || []) {
        const dataPoints = ts.data || [];
        const summary = calculateSummary(dataPoints, aggregationFn);
        
        accountTimeseries.push({
            label: ts.label,
            units: ts.units,
            sum: ts.sum,
            summary: summary,
            buckets: dataPoints.length,
            data: dataPoints
        });
    }
    return accountTimeseries;
}

function processSiteTimeseries(site: any, requestedLabels: string[], aggregationFn: string, groupInterfaces: boolean): any {
    const siteData: any = {
        siteId: site.id,
        siteName: site.name || site.info?.name,
        siteType: site.info?.type,
        connType: site.info?.connType,
        region: site.info?.region,
        siteMetrics: {},
        interfaces: []
    };

    // Process site-level metrics (hostCount, flowCount, hostLimit)
    const siteTimeseriesFields = {
        hostCount: site.hostCount,
        flowCount: site.flowCount,
        hostLimit: site.hostLimit
    };

    for (const [fieldName, ts] of Object.entries(siteTimeseriesFields)) {
        if (ts && (requestedLabels.includes(ts.label) || ["hostCount", "flowCount", "hostLimit"].includes(ts.label))) {
            const dataPoints = ts.data || [];
            const summary = calculateSummary(dataPoints, aggregationFn);

            siteData.siteMetrics[ts.label] = {
                label: ts.label,
                units: ts.units,
                sum: ts.sum,
                summary: summary,
                buckets: dataPoints.length,
                data: dataPoints
            };
        }
    }

    // Calculate capacity utilization if both hostCount and hostLimit are available
    if (siteData.siteMetrics.hostCount && siteData.siteMetrics.hostLimit) {
        siteData.siteMetrics.hostUtilizationPct = calculateHostUtilizationTimeseries(
            siteData.siteMetrics.hostCount.data,
            siteData.siteMetrics.hostLimit.data,
            aggregationFn
        );
    }

    // Process interface-level timeseries
    for (const intf of site.interfaces || []) {
        const intfData = processInterfaceTimeseries(intf, aggregationFn);
        siteData.interfaces.push(intfData);
    }

    // Aggregate interfaces if grouping is enabled
    if (groupInterfaces && siteData.interfaces.length > 0) {
        siteData.aggregatedMetrics = aggregateInterfaceMetrics(siteData.interfaces, aggregationFn);
    }

    return siteData;
}

function processInterfaceTimeseries(intf: any, aggregationFn: string): any {
    const intfData: any = {
        name: intf.name,
        metrics: {}
    };

    for (const ts of intf.timeseries || []) {
        const dataPoints = ts.data || [];
        const summary = calculateSummary(dataPoints, aggregationFn);
        
        intfData.metrics[ts.label] = {
            label: ts.label,
            units: ts.units,
            sum: ts.sum,
            summary: summary,
            buckets: dataPoints.length,
            data: dataPoints
        };
    }
    
    return intfData;
}

function calculateHostUtilizationTimeseries(hostCountData: number[][], hostLimitData: number[][], aggregationFn: string): any {
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
        return {
            label: "hostUtilizationPct",
            units: "percent",
            sum: null,
            summary: summary,
            buckets: utilizationData.length,
            data: utilizationData
        };
    }
    return null;
}

function aggregateInterfaceMetrics(interfaces: any[], aggregationFn: string): any {
    const aggregatedMetrics: any = {};
    
    // Get all unique metric labels from interfaces
    const allLabels = new Set<string>();
    interfaces.forEach((intf: any) => {
        Object.keys(intf.metrics || {}).forEach(label => allLabels.add(label));
    });

    // Aggregate each metric across interfaces
    allLabels.forEach((label: string) => {
        const interfaceMetrics = interfaces
            .map((intf: any) => intf.metrics[label])
            .filter((metric: any) => metric);

        if (interfaceMetrics.length > 0) {
            // Aggregate sums
            const totalSum = interfaceMetrics.reduce((sum: number, metric: any) => sum + (metric.sum || 0), 0);
            
            // Aggregate data points across time buckets
            const aggregatedData = aggregateTimeseriesData(interfaceMetrics);
            const summary = calculateSummary(aggregatedData, aggregationFn);
            
            aggregatedMetrics[label] = {
                label: label,
                units: interfaceMetrics[0].units,
                sum: totalSum,
                summary: summary,
                buckets: aggregatedData.length,
                data: aggregatedData
            };
        }
    });

    return aggregatedMetrics;
}

function aggregateTimeseriesData(metrics: any[]): number[][] {
    const aggregatedData: number[][] = [];
    const maxBuckets = Math.max(...metrics.map((m: any) => m.data?.length || 0));
    
    for (let i = 0; i < maxBuckets; i++) {
        let timestamp = null;
        let aggregatedValue = 0;
        
        metrics.forEach((metric: any) => {
            if (metric.data && metric.data[i]) {
                timestamp = metric.data[i][0]; // Use timestamp from first available interface
                aggregatedValue += metric.data[i][1] || 0;
            }
        });
        
        if (timestamp !== null) {
            aggregatedData.push([timestamp, aggregatedValue]);
        }
    }

    return aggregatedData;
}

function processUserTimeseries(users: any[]): any[] {
    const userTimeseries: any[] = [];
    for (const user of users || []) {
        const userData: any = {
            userId: user.id,
            userName: user.name,
            note: "User timeseries data comes from account-level timeseries when userIDs filter is applied"
        };
        userTimeseries.push(userData);
    }
    return userTimeseries;
}

function handleResponse(variables: Record<string, any>, response: any): any {
    if (!isValidMetricResponse(variables.accountID, response)) {
        return emptyMetricsResponse(response.data?.accountMetrics)
    }

    const accountMetrics = response.data.accountMetrics;
    const aggregationFn = variables.aggregationFunction || 'sum';
    const buckets = variables.buckets || DEFAULT_BUCKETS;
    const requestedLabels = variables.labels || ["bytesTotal"];
    const groupInterfaces = variables.groupInterfaces !== false;
    
    // Process account-level timeseries
    const accountTimeseries = processAccountTimeseries(accountMetrics, aggregationFn);
    
    // Process site data and their interfaces
    const siteTimeseries: any[] = [];
    for (const site of accountMetrics.sites || []) {
        const siteData = processSiteTimeseries(site, requestedLabels, aggregationFn, groupInterfaces);
        siteTimeseries.push(siteData);
    }

    // Process user data
    const userTimeseries = processUserTimeseries(accountMetrics.users);

    return {
        data: {
            timeFrame: {
                from: accountMetrics.from,
                to: accountMetrics.to,
            },
            granularity: accountMetrics.granularity,
            bucketCount: buckets,
            summary: {
                accountTimeseriesReturned: accountTimeseries.length,
                sitesReturned: siteTimeseries.length,
                usersReturned: userTimeseries.length,
                metricsRequested: requestedLabels,
                note: "Account timeseries represents aggregated data. Site data shows per-site metrics (hostCount, flowCount, hostLimit) and per-interface metrics, with aggregated site metrics when groupInterfaces=true. User-specific timeseries are reflected in account timeseries when userIDs filter is applied."
            },
            accountTimeseries: accountTimeseries,
            sites: siteTimeseries,
            users: userTimeseries
        }
    };
} 