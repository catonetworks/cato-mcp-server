import {CatoMcpToolWrapper, McpToolDef, McpToolDefContext} from "../common/catoMcpTool.js";
import {
    emptyMetricsResponse, 
    isValidSiteMetricResponse, 
    DEFAULT_TIMEFRAME, 
    DEFAULT_BUCKETS,
    standardizeMetricsInput,
    calculateSummary,
    calculateHostUtilization
} from "../../utils/metricsUtils.js";

export function buildSiteMetricsTimeseriesTool(ctx: McpToolDefContext): CatoMcpToolWrapper {
    const toolDef: McpToolDef = {
        name: "site_metrics_timeseries",
        description: `Retrieves time-bucketed metrics data for sites, enabling trend analysis, peak detection, and traffic pattern identification.

NOTE: Returns raw bucketed timestamp/value arrays; does NOT pre-aggregate metrics like average RTT per site.

For aggregated metrics without timeseries data, use the 'site_metrics' tool instead.
        
BYTE VALUES: Returns raw byte values (not formatted) to preserve precision for mathematical operations and trend analysis. Unit information is provided in the 'units' field. When byte values are referenced in formatted units, they use binary units (MiB, GiB, etc.) with base 1024, not decimal units (MB, GB, etc.) with base 1000.
        
IMPORTANT: Carefully review the timeFrame parameter description and examples below to ensure correct usage (in-day, cross-day, cross-month, cross-year absolute UTC formats).
        
Example questions this tool can help answer:
- "How has total account sites traffic trended hour-by-hour over the last 48 hours?"
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
    return standardizeMetricsInput(variables);
}

const gqlQuery = `
query siteMetricsTimeseries($accountID: ID!, $timeFrame: TimeFrame!, $buckets: Int!, $labels: [TimeseriesMetricType!]!, $siteIDs: [ID!], $groupInterfaces: Boolean = true, $groupDevices: Boolean = true, $perSecond: Boolean = false) {
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

function handleResponse(variables: Record<string, any>, response: any): any {
    if (!isValidSiteMetricResponse(variables.accountID, response)) {
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
                metricsRequested: requestedLabels,
                note: "Account timeseries represents aggregated data. Site data shows per-site metrics (hostCount, flowCount, hostLimit) and per-interface metrics, with aggregated site metrics when groupInterfaces=true."
            },
            accountTimeseries: accountTimeseries,
            sites: siteTimeseries,
        }
    };
} 