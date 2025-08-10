import {CatoMcpToolWrapper, McpToolDef, McpToolDefContext} from "../common/catoMcpTool.js";
import {
    emptyMetricsResponse,
    DEFAULT_TIMEFRAME,
    standardizeMetricsInput,
    calculateHostUtilization,
    isValidSiteMetricResponse
} from "../../utils/metricsUtils.js";

export function buildSiteMetricsTool(ctx: McpToolDefContext): CatoMcpToolWrapper {
    const toolDef: McpToolDef = {
        name: "site_metrics",
        description: `Returns aggregated metrics for sites (no timeseries data).

Retrieves summary metrics data for sites, providing totals, averages, and current values for analysis and reporting.

**Data Returned:**
- Site identification (ID, name, type, connection type, region)
- Aggregated metrics: total bytes, packet counts, loss percentages, latency, jitter
- Current host counts and utilization percentages
- Interface breakdown with aggregated metrics per interface

For timeseries data and trend analysis, use the 'site_metrics_timeseries' tool instead.

        BYTE VALUES: Returns raw byte values to preserve precision. Unit information is provided in the 'units' field.

        IMPORTANT: Carefully review the timeFrame parameter description and examples below to ensure correct usage (in-day, cross-day, cross-month, cross-year absolute UTC formats).

Example questions this tool can help answer:
- "What are the total bandwidth consumption stats for each site over the last 24 hours?"
- "Which sites have the highest packet loss percentages today?"
- "Show me current host utilization for all sites"
- "What's the average RTT for each site's interfaces this week?"`,
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
                    default: DEFAULT_TIMEFRAME,
                    pattern: "^((last\\.[^,]+)|(utc\\.[^,]+))$",
                    examples: [
                        "last.PT2H",
                        "utc.2025-04-22/{00:00:00--14:00:00}",
                        "utc.2025-04-{01/00:00:00--07/23:59:59}",
                        "utc.2025-{04-01/00:00:00--05-01/00:00:00}",
                        "utc.{2024-12-30/00:00:00--2025-01-05/23:59:59}"
                    ]
                },
                siteIDs: {
                    type: "array",
                    items: {type: "string"},
                    description: "Optional list of site IDs to filter by. If omitted, returns data for all sites."
                },
                groupInterfaces: {
                    type: "boolean",
                    description: "Whether to aggregate all interfaces into a single metric per site.",
                    default: true
                },
                groupDevices: {
                    type: "boolean",
                    description: "For HA sites, whether to aggregate primary and secondary devices.",
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
query siteMetrics($accountID: ID!, $timeFrame: TimeFrame!, $siteIDs: [ID!], $groupInterfaces: Boolean = true, $groupDevices: Boolean = true) {
  accountMetrics(accountID: $accountID, timeFrame: $timeFrame, groupInterfaces: $groupInterfaces, groupDevices: $groupDevices) {
    id
    from
    to
    granularity
    sites(siteIDs: $siteIDs) {
      id
      name
      info {
        name
        type
        connType
        region
      }
      metrics {
        bytesUpstream
        bytesDownstream
        bytesTotal
        packetsUpstream
        packetsDownstream
        lostUpstream
        lostDownstream
        lostUpstreamPcnt
        lostDownstreamPcnt
        packetsDiscardedUpstream
        packetsDiscardedDownstream
        jitterUpstream
        jitterDownstream
        rtt
        hostCount
        flowCount
        hostLimit
      }
      interfaces {
        name
        metrics {
          bytesUpstream
          bytesDownstream
          bytesTotal
          packetsUpstream
          packetsDownstream
          lostUpstream
          lostDownstream
          lostUpstreamPcnt
          lostDownstreamPcnt
          jitterUpstream
          jitterDownstream
          rtt
        }
        interfaceInfo {
          id
          upstreamBandwidth
          downstreamBandwidth
        }
        remoteIP
        remoteIPInfo {
          ip
          provider
          city
          countryName
          countryCode
        }
      }
    }
  }
}
`

function processSiteData(accountMetrics: any): { sites: any[] } {
    const sites: any[] = [];

    for (const site of accountMetrics.sites || []) {
        const siteData: any = {
            siteId: site.id,
            siteName: site.name || site.info?.name,
            siteType: site.info?.type,
            connType: site.info?.connType,
            region: site.info?.region,
            metrics: site.metrics || {},
            interfaces: []
        };

        // Calculate host utilization if both hostCount and hostLimit are available
        if (siteData.metrics.hostCount !== undefined && siteData.metrics.hostLimit !== undefined) {
            siteData.metrics.hostUtilizationPct = calculateHostUtilization(
                siteData.metrics.hostCount,
                siteData.metrics.hostLimit
            );
        }

        for (const intf of site.interfaces || []) {
            const intfData: any = {
                name: intf.name,
                remoteIP: intf.remoteIP,
                remoteIPInfo: intf.remoteIPInfo,
                interfaceInfo: intf.interfaceInfo,
                metrics: intf.metrics || {}
            };
            siteData.interfaces.push(intfData);
        }
        sites.push(siteData);
    }
    return { sites };
}

function handleResponse(variables: Record<string, any>, response: any): any {
    if (!isValidSiteMetricResponse(variables.accountID, response)) {
        return emptyMetricsResponse(response.data?.accountMetrics);
    }
    const accountMetrics = response.data.accountMetrics;
    
    const { sites } = processSiteData(accountMetrics);
    
    const totalInterfaces = sites.reduce((sum, site) => sum + (site.interfaces?.length || 0), 0);
    const sitesWithMetrics = sites.filter(site => Object.keys(site.metrics || {}).length > 0).length;

    return {
        data: {
            timeFrame: {
                from: accountMetrics.from,
                to: accountMetrics.to,
            },
            granularity: accountMetrics.granularity,
            summary: {
                sitesReturned: sites.length,
                sitesWithMetrics: sitesWithMetrics,
                totalInterfaces: totalInterfaces,
                note: "Returns aggregated metrics only. For timeseries data, use site_metrics_timeseries tool."
            },
            sites: sites
        }
    };
} 