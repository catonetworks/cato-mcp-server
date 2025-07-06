import {CatoMcpToolWrapper, McpToolDef, McpToolDefContext} from "../common/catoMcpTool.js";
import {
    emptyMetricsResponse, 
    isValidMetricResponse, 
    formatBytes, 
    DEFAULT_TIMEFRAME,
    standardizeMetricsInput,
    calculateBytesTotal,
    calculateHostUtilization,
    calculateUpstreamDownstreamRatio,
    aggregateValues,
    generateHealthFlags,
    GROUP_KEY_GENERATORS,
    sortResults
} from "./metricsUtils.js";

export function buildMetricsSiteSummaryTool(ctx: McpToolDefContext): CatoMcpToolWrapper {
    const toolDef: McpToolDef = {
        name: "metrics_site_summary",
        description: `NOTE: Returns only one aggregated record per group (no per-timestamp arrays).

Provides aggregated metrics analysis for sites grouped by various dimensions like site type, connection type, region, or interface role. Includes capacity utilization analysis and comparative statistics.
        
        BYTE FORMATTING: For byte metrics (bytesUpstream, bytesDownstream, bytesTotal), both raw values and human-readable formatted values are provided. Formatted values use binary units (KiB, MiB, GiB, etc.) with base 1024.
        
        Example questions this tool can help answer:
        - "What was the average RTT for each site yesterday, and which sites exceeded 150 ms?"
        - "Which WAN interface experienced the highest upstream packet-loss percentage in the past 24 hours?"
        - "What is the combined downstream throughput for all interfaces during business hours this month?"
        - "How many hosts were connected per site last Monday, and which sites were within 10% of their hostLimit?"
        - "What is the average flowCount per site type (BRANCH, DATACENTER, etc.) for Q1?"
        - "Which connection types (SOCKET, IPSEC_V2, etc.) account for the highest cumulative traffic this month?"
        - "What is the ratio of upstream-to-downstream bytes for each interface role (WAN_1 vs WAN_2) this week?"
        - "Calculate the cumulative bytesTotal for all IPsec sites versus all Socket sites for the previous month."`,
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
                groupBy: {
                    type: "string",
                    enum: ["site", "siteType", "connType", "region", "interfaceRole", "interfaceName", "socketHA"],
                    description: "Dimension to group results by: 'site' (individual sites), 'siteType' (BRANCH/DATACENTER/etc), 'connType' (SOCKET/IPSEC/etc), 'region' (PoP regions), 'interfaceRole' (WAN_1/WAN_2/etc), 'interfaceName' (interface names), 'socketHA' (primary/secondary HA role).",
                    default: "site"
                },
                metrics: {
                    type: "array",
                    items: {
                        type: "string",
                        enum: [
                            "bytesDownstream", "bytesUpstream", "bytesTotal",
                            "packetsDownstream", "packetsUpstream",
                            "lostDownstream", "lostUpstream", "lostDownstreamPcnt", "lostUpstreamPcnt",
                            "packetsDiscardedDownstream", "packetsDiscardedUpstream",
                            "jitterDownstream", "jitterUpstream", "rtt", "flowCount", "hostCount", "hostLimit"
                        ]
                    },
                    description: "List of metrics to aggregate and analyze for each group.",
                    default: ["bytesTotal", "rtt", "lostUpstreamPcnt", "lostDownstreamPcnt"]
                },
                siteIDs: {
                    type: "array",
                    items: {type: "string"},
                    description: "Optional list of site IDs to filter by. If omitted, includes all sites."
                },
                aggregationFunction: {
                    type: "string",
                    enum: ["sum", "avg", "max", "min"],
                    description: "How to aggregate metrics within each group: 'sum' for totals, 'avg' for averages, 'max' for peaks, 'min' for minimums.",
                    default: "avg"
                },
                thresholds: {
                    type: "object",
                    properties: {
                        rtt: {type: "number", description: "RTT threshold in milliseconds to flag as unhealthy."},
                        packetLoss: {type: "number", description: "Packet loss threshold in percent to flag as unhealthy."},
                        jitter: {type: "number", description: "Jitter threshold in milliseconds to flag as unhealthy."},
                        hostUtilization: {type: "number", description: "Host utilization threshold (hostCount/hostLimit) in percent to flag as near capacity."}
                    },
                    description: "Optional thresholds to identify sites/groups exceeding specified limits.",
                    additionalProperties: false
                },
                includeCapacityAnalysis: {
                    type: "boolean",
                    description: "Whether to include capacity utilization analysis (hostCount vs hostLimit, interface bandwidth usage).",
                    default: false
                },
                sortBy: {
                    type: "string",
                    description: "Which metric to sort results by (must be one of the requested metrics).",
                    default: "bytesTotal"
                },
                sortOrder: {
                    type: "string",
                    enum: ["asc", "desc"],
                    description: "Sort order: 'desc' for highest first, 'asc' for lowest first.",
                    default: "desc"
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
query metricsSiteSummary($accountID: ID!, $timeFrame: TimeFrame!, $siteIDs: [ID!], $groupInterfaces: Boolean, $groupDevices: Boolean) {
  accountMetrics(accountID: $accountID, timeFrame: $timeFrame, groupInterfaces: $groupInterfaces, groupDevices: $groupDevices) {
    id
    from
    to
    sites(siteIDs: $siteIDs) {
      id
      info {
        name
        type
        connType
        region
        isHA
        sockets {
          isPrimary
          platform
          version
        }
      }
      metrics {
        bytesDownstream
        bytesUpstream
        rtt
        jitterDownstream
        jitterUpstream
        lostDownstreamPcnt
        lostUpstreamPcnt
        packetsDownstream
        packetsUpstream
        packetsDiscardedDownstream
        packetsDiscardedUpstream
        flowCount
        hostCount
        hostLimit
      }
      interfaces {
        name
        interfaceInfo {
          wanRole
          upstreamBandwidth
          downstreamBandwidth
        }
        socketInfo {
          isPrimary
        }
        metrics {
          bytesDownstream
          bytesUpstream
          rtt
          jitterDownstream
          jitterUpstream
          lostDownstreamPcnt
          lostUpstreamPcnt
          packetsDownstream
          packetsUpstream
          packetsDiscardedDownstream
          packetsDiscardedUpstream
        }
      }
    }
  }
}
`

function groupSiteData(accountMetrics: any, variables: Record<string, any>): Record<string, any> {
    const groupBy = variables.groupBy || 'site';
    const groups: Record<string, any> = {};

    for (const site of accountMetrics.sites || []) {
        const siteMetrics = site.metrics || {};
        
        // Enhanced metrics with calculated values
        const enhancedMetrics = {
            ...siteMetrics,
            bytesTotal: calculateBytesTotal(siteMetrics.bytesUpstream || 0, siteMetrics.bytesDownstream || 0)
        };

        if (groupBy === 'site') {
            addSiteToGroup(groups, site, enhancedMetrics, groupBy);
        } else if (groupBy === 'interfaceRole' || groupBy === 'interfaceName' || groupBy === 'socketHA') {
            addInterfacesToGroups(groups, site, groupBy);
        } else {
            addSiteToPropertyGroup(groups, site, enhancedMetrics, groupBy);
        }
    }

    return groups;
}

function addSiteToGroup(groups: Record<string, any>, site: any, enhancedMetrics: any, groupBy: string): void {
    const generator = GROUP_KEY_GENERATORS[groupBy as keyof typeof GROUP_KEY_GENERATORS];
    const groupKey = generator ? generator(site) : `${site.info?.name || site.id}`;
    
    if (!groups[groupKey]) {
        groups[groupKey] = {
            groupKey: groupKey,
            groupType: 'site',
            siteId: site.id,
            siteName: site.info?.name,
            siteType: site.info?.type,
            connType: site.info?.connType,
            region: site.info?.region,
            isHA: site.info?.isHA,
            metrics: [],
            count: 0
        };
    }
    groups[groupKey].metrics.push(enhancedMetrics);
    groups[groupKey].count++;
}

function addInterfacesToGroups(groups: Record<string, any>, site: any, groupBy: string): void {
    for (const intf of site.interfaces || []) {
        const generator = GROUP_KEY_GENERATORS[groupBy as keyof typeof GROUP_KEY_GENERATORS];
        const groupKey = generator ? generator(intf) : 'Unknown';

        if (!groups[groupKey]) {
            groups[groupKey] = {
                groupKey: groupKey,
                groupType: groupBy,
                metrics: [],
                count: 0,
                sites: new Set()
            };
        }

        const intfMetrics = intf.metrics || {};
        const enhancedIntfMetrics = {
            ...intfMetrics,
            bytesTotal: calculateBytesTotal(intfMetrics.bytesUpstream || 0, intfMetrics.bytesDownstream || 0)
        };
        
        groups[groupKey].metrics.push(enhancedIntfMetrics);
        groups[groupKey].count++;
        groups[groupKey].sites.add(site.info?.name || site.id);
    }
}

function addSiteToPropertyGroup(groups: Record<string, any>, site: any, enhancedMetrics: any, groupBy: string): void {
    const generator = GROUP_KEY_GENERATORS[groupBy as keyof typeof GROUP_KEY_GENERATORS];
    const groupKey = generator ? generator(site) : 'Unknown';

    if (!groups[groupKey]) {
        groups[groupKey] = {
            groupKey: groupKey,
            groupType: groupBy,
            metrics: [],
            count: 0,
            sites: new Set()
        };
    }
    groups[groupKey].metrics.push(enhancedMetrics);
    groups[groupKey].count++;
    groups[groupKey].sites.add(site.info?.name || site.id);
}

function aggregateMetrics(groups: Record<string, any>, variables: Record<string, any>): any[] {
    const aggregationFn = variables.aggregationFunction || 'avg';
    const requestedMetrics = variables.metrics || ["bytesTotal", "rtt", "lostUpstreamPcnt", "lostDownstreamPcnt"];
    const thresholds = variables.thresholds || {};
    const includeCapacity = variables.includeCapacityAnalysis || false;

    return Object.values(groups).map((group: any) => {
        const aggregated: any = {
            group: group.groupKey,
            groupType: group.groupType,
            count: group.count
        };

        // Add group context
        addGroupContext(aggregated, group);

        // Aggregate requested metrics
        aggregateRequestedMetrics(aggregated, group.metrics, requestedMetrics, aggregationFn);

        // Add capacity analysis
        if (includeCapacity) {
            addCapacityAnalysis(aggregated);
        }

        // Add derived metrics
        addDerivedMetrics(aggregated);

        // Generate health flags
        aggregated.healthFlags = generateHealthFlags(aggregated, thresholds);

        return aggregated;
    });
}

function addGroupContext(aggregated: any, group: any): void {
    if (group.sites) {
        aggregated.sitesInGroup = Array.from(group.sites);
    }

    // Copy site-specific info for single-site groups
    if (group.groupType === 'site') {
        aggregated.siteId = group.siteId;
        aggregated.siteName = group.siteName;
        aggregated.siteType = group.siteType;
        aggregated.connType = group.connType;
        aggregated.region = group.region;
        aggregated.isHA = group.isHA;
    }
}

function aggregateRequestedMetrics(aggregated: any, metrics: any[], requestedMetrics: string[], aggregationFn: string): void {
    for (const metric of requestedMetrics) {
        const values = metrics
            .map((m: any) => m[metric])
            .filter((v: any) => v !== null && v !== undefined && !isNaN(v));

        const aggregatedValue = aggregateValues(values, aggregationFn);
        aggregated[metric] = aggregatedValue;

        // Format bytes for readability
        if (metric.includes('bytes') || metric === 'bytesTotal') {
            aggregated[`${metric}Formatted`] = formatBytes(aggregatedValue);
        }
    }
}

function addCapacityAnalysis(aggregated: any): void {
    if (aggregated.hostCount && aggregated.hostLimit) {
        aggregated.hostUtilizationPct = calculateHostUtilization(aggregated.hostCount, aggregated.hostLimit);
    }
}

function addDerivedMetrics(aggregated: any): void {
    if (aggregated.bytesUpstream && aggregated.bytesDownstream) {
        aggregated.upstreamDownstreamRatio = calculateUpstreamDownstreamRatio(
            aggregated.bytesUpstream, 
            aggregated.bytesDownstream
        );
    }
}

function handleResponse(variables: Record<string, any>, response: any): any {
    if (!isValidMetricResponse(variables.accountID, response)) {
        return emptyMetricsResponse(response.data?.accountMetrics)
    }

    const accountMetrics = response.data.accountMetrics;
    const sortBy = variables.sortBy || 'bytesTotal';
    const sortOrder = variables.sortOrder || 'desc';

    // Group data based on groupBy parameter
    const groups = groupSiteData(accountMetrics, variables);

    // Aggregate metrics for each group
    const aggregatedResults = aggregateMetrics(groups, variables);

    // Sort results
    const sortedResults = sortResults(aggregatedResults, sortBy, sortOrder);

    return {
        data: {
            timeFrame: {
                from: accountMetrics.from,
                to: accountMetrics.to,
            },
            summary: {
                groupBy: variables.groupBy || 'site',
                aggregationFunction: variables.aggregationFunction || 'avg',
                groupsReturned: sortedResults.length,
                metricsAnalyzed: variables.metrics || ["bytesTotal", "rtt", "lostUpstreamPcnt", "lostDownstreamPcnt"],
                thresholdsApplied: Object.keys(variables.thresholds || {})
            },
            results: sortedResults
        }
    };
} 