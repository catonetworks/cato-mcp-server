import {CatoMcpToolWrapper, McpToolDef, McpToolDefContext} from "../common/catoMcpTool.js";
import {
    emptyMetricsResponse, 
    isValidSiteMetricResponse, 
    DEFAULT_TIMEFRAME, 
    HEALTH_THRESHOLDS
} from "../../utils/metricsUtils.js";

export function buildSiteNetworkHealthTool(ctx: McpToolDefContext): CatoMcpToolWrapper {
    const toolDef: McpToolDef = {
        name: "site_network_health",
        description: `Retrieves a summary of network health for all sites over a specified time frame.
            This tool analyzes historical data to identify sites that have experienced poor network quality, 
            such as high packet loss, latency (RTT), or jitter. It's designed to answer questions about which 
            sites are having performance issues.
        
            Example questions this tool can help answer:
            - "Which sites had a round-trip-time greater than 150ms yesterday?"
            - "Show me all sites that experienced more than 2% packet loss in the last week."
            - "Are there any sites with high jitter on their WAN links?"
            
            Returns:
                A summary of unhealthy sites, including the specific metrics that crossed the defined thresholds.`,
        inputSchema: {
            type: "object",
            properties: {
                accountID: {
                    type: "string",
                    description: "Unique identifier for the customer account.",
                    default: ctx.accountId
                },
                timeFrame: {
                    type: "string",
                    description: "The time frame for the data in format: 'last.P{duration}' (ISO-8601, e.g., 'last.P1D' for 1 day) or 'utc.{date/time range}' (e.g., 'utc.2023-01-{01/00:00:00--31/23:59:59}').",
                    default: DEFAULT_TIMEFRAME
                },
                rttThreshold: {
                    type: "number",
                    description: `The RTT (Round-Trip Time) threshold in milliseconds (ms) to consider a site unhealthy. Defaults to ${HEALTH_THRESHOLDS.RTT}ms.`,
                    default: HEALTH_THRESHOLDS.RTT
                },
                packetLossThreshold: {
                    type: "number",
                    description: `The packet loss threshold in percent (%) to consider a site unhealthy. Defaults to ${HEALTH_THRESHOLDS.PACKET_LOSS}%.`,
                    default: HEALTH_THRESHOLDS.PACKET_LOSS
                },
                jitterThreshold: {
                    type: "number",
                    description: `The jitter threshold in milliseconds (ms) to consider a site unhealthy. Defaults to ${HEALTH_THRESHOLDS.JITTER}ms.`,
                    default: HEALTH_THRESHOLDS.JITTER
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
        responseHandler: handleResponse,
    }
}


const gqlQuery = `
query siteNetworkHealth($accountID: ID!, $timeFrame: TimeFrame!, $groupInterfaces: Boolean = false, $groupDevices: Boolean = true) {
  accountMetrics(accountID: $accountID, timeFrame: $timeFrame, groupInterfaces: $groupInterfaces, groupDevices: $groupDevices) {
    id
    from
    to
    sites {
      id
      info {
        name
      }
      interfaces {
        name
        metrics {
          rtt
          jitterUpstream
          jitterDownstream
          lostUpstreamPcnt
          lostDownstreamPcnt
        }
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

    const allSites = accountMetrics.sites;
    const unhealthySites: any[] = [];

    const rttThreshold = variables.rttThreshold || HEALTH_THRESHOLDS.RTT;
    const packetLossThreshold = variables.packetLossThreshold || HEALTH_THRESHOLDS.PACKET_LOSS;
    const jitterThreshold = variables.jitterThreshold || HEALTH_THRESHOLDS.JITTER;

    for (const site of allSites) {
        const unhealthyInterfaces: any[] = [];
        for (const intf of site.interfaces || []) {
            const metrics = intf.metrics;
            if (!metrics) {
                continue;
            }

            const isUnhealthy =
                (metrics.rtt != null && metrics.rtt > rttThreshold) ||
                (metrics.lostUpstreamPcnt != null && metrics.lostUpstreamPcnt > packetLossThreshold) ||
                (metrics.lostDownstreamPcnt != null && metrics.lostDownstreamPcnt > packetLossThreshold) ||
                (metrics.jitterUpstream != null && metrics.jitterUpstream > jitterThreshold) ||
                (metrics.jitterDownstream != null && metrics.jitterDownstream > jitterThreshold);

            if (isUnhealthy) {
                unhealthyInterfaces.push({
                    interfaceName: intf.name,
                    metrics: {
                        rtt: metrics.rtt,
                        jitterUpstream: metrics.jitterUpstream,
                        jitterDownstream: metrics.jitterDownstream,
                        lostUpstreamPcnt: metrics.lostUpstreamPcnt,
                        lostDownstreamPcnt: metrics.lostDownstreamPcnt,
                    }
                });
            }
        }

        if (unhealthyInterfaces.length > 0) {
            unhealthySites.push({
                siteId: site.id,
                siteName: site.info.name,
                unhealthyInterfaces: unhealthyInterfaces,
            });
        }
    }

    return {
        data: {
            timeFrame: {
                from: response.data.accountMetrics.from,
                to: response.data.accountMetrics.to,
            },
            summary: {
                sitesScanned: allSites.length,
                unhealthySiteCount: unhealthySites.length,
                thresholds: {
                    rtt: `${rttThreshold}ms`,
                    packetLoss: `${packetLossThreshold}%`,
                    jitter: `${jitterThreshold}ms`,
                }
            },
            unhealthySites: unhealthySites,
        }
    };
} 