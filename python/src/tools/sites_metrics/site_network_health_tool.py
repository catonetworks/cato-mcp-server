"""
Site network health tool
"""
from typing import Any, Dict
from ..common.cato_mcp_tool import CatoMcpToolWrapper, McpToolDef, McpToolDefContext
from ...utils.metrics_utils import (
    empty_metrics_response,
    is_valid_site_metric_response,
    DEFAULT_TIMEFRAME,
    HEALTH_THRESHOLDS
)


def build_site_network_health_tool(ctx: McpToolDefContext) -> CatoMcpToolWrapper:
    """
    Build the site network health tool.
    
    Args:
        ctx: The tool definition context
        
    Returns:
        The tool wrapper
    """
    tool_def: McpToolDef = {
        "name": "site_network_health",
        "description": """Retrieves a summary of network health for all sites over a specified time frame.
            This tool analyzes historical data to identify sites that have experienced poor network quality, 
            such as high packet loss, latency (RTT), or jitter. It's designed to answer questions about which 
            sites are having performance issues.
        
            IMPORTANT: Carefully review the timeFrame parameter description and examples below to ensure correct usage (in-day, cross-day, cross-month, cross-year absolute UTC formats).
        
            Example questions this tool can help answer:
            - "Which sites had a round-trip-time greater than 150ms yesterday?"
            - "Show me all sites that experienced more than 2% packet loss in the last week."
            - "Are there any sites with high jitter on their WAN links?"
            
            Returns:
                A summary of unhealthy sites, including the specific metrics that crossed the defined thresholds.""",
        "inputSchema": {
            "type": "object",
            "properties": {
                "accountID": {
                    "type": "string",
                    "description": "Unique identifier for the customer account.",
                    "default": ctx["accountId"]
                },
                "timeFrame": {
                    "type": "string",
                    "description": "Time frame for the data (required). Format '<type>.<value>'.\n1) Relative: 'last.<ISO-8601 duration>' – examples: last.PT5M (5 min), last.PT2H (2 h), last.P1D (1 day), last.P3M (3 months), last.P1Y (1 year).\n2) Absolute UTC range: 'utc.<range>'. The curly braces {} group the time components that vary; constant parts like the year remain outside. Note the difference in brace placement for cross-year vs. same-year queries. Correct examples: in-day → utc.2024-05-11/{00:00:00--12:00:00}, utc.2025-04-22/{09:15:00--17:45:00}; full-day → utc.2024-05-12/{00:00:00--23:59:59}, utc.2025-04-22/{00:00:00--23:59:59}; cross-day (same month) → utc.2024-05-{01/00:00:00--07/23:59:59}, utc.2025-04-{15/08:00:00--16/18:00:00}; full-month → utc.2024-05-{01/00:00:00--31/23:59:59}, utc.2025-02-{01/00:00:00--28/23:59:59}; cross-month (same year) → utc.2024-{05-01/00:00:00--06-01/00:00:00}, utc.2025-{03-15/12:00:00--04-10/06:30:00}; cross-year → utc.{2023-12-31/22:00:00--2024-01-01/02:00:00}, utc.{2024-12-30/00:00:00--2025-01-05/23:59:59}.",
                    "default": DEFAULT_TIMEFRAME
                },
                "rttThreshold": {
                    "type": "number",
                    "description": f"The RTT (Round-Trip Time) threshold in milliseconds (ms) to consider a site unhealthy. Defaults to {HEALTH_THRESHOLDS['RTT']}ms.",
                    "default": HEALTH_THRESHOLDS["RTT"]
                },
                "packetLossThreshold": {
                    "type": "number",
                    "description": f"The packet loss threshold in percent (%) to consider a site unhealthy. Defaults to {HEALTH_THRESHOLDS['PACKET_LOSS']}%.",
                    "default": HEALTH_THRESHOLDS["PACKET_LOSS"]
                },
                "jitterThreshold": {
                    "type": "number",
                    "description": f"The jitter threshold in milliseconds (ms) to consider a site unhealthy. Defaults to {HEALTH_THRESHOLDS['JITTER']}ms.",
                    "default": HEALTH_THRESHOLDS["JITTER"]
                }
            },
            "required": ["accountID", "timeFrame"],
            "additionalProperties": False,
            "schema": "http://json-schema.org/draft-07/schema#"
        }
    }
    
    return {
        "toolDef": tool_def,
        "gqlQuery": GQL_QUERY,
        "responseHandler": _handle_response,
    }


GQL_QUERY = """
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
"""


def _handle_response(variables: Dict[str, Any], response: Dict[str, Any]) -> Dict[str, Any]:
    """
    Handle response.
    
    Args:
        variables: The input variables
        response: The GraphQL response
        
    Returns:
        Processed response
    """
    if not is_valid_site_metric_response(variables.get("accountID", ""), response):
        return empty_metrics_response(response.get("data", {}).get("accountMetrics"))
    
    account_metrics = response["data"]["accountMetrics"]
    all_sites = account_metrics.get("sites", [])
    unhealthy_sites = []
    
    rtt_threshold = variables.get("rttThreshold") or HEALTH_THRESHOLDS["RTT"]
    packet_loss_threshold = variables.get("packetLossThreshold") or HEALTH_THRESHOLDS["PACKET_LOSS"]
    jitter_threshold = variables.get("jitterThreshold") or HEALTH_THRESHOLDS["JITTER"]
    
    for site in all_sites:
        unhealthy_interfaces = []
        for intf in site.get("interfaces", []):
            metrics = intf.get("metrics")
            if not metrics:
                continue
            
            is_unhealthy = (
                (metrics.get("rtt") is not None and metrics["rtt"] > rtt_threshold) or
                (metrics.get("lostUpstreamPcnt") is not None and metrics["lostUpstreamPcnt"] > packet_loss_threshold) or
                (metrics.get("lostDownstreamPcnt") is not None and metrics["lostDownstreamPcnt"] > packet_loss_threshold) or
                (metrics.get("jitterUpstream") is not None and metrics["jitterUpstream"] > jitter_threshold) or
                (metrics.get("jitterDownstream") is not None and metrics["jitterDownstream"] > jitter_threshold)
            )
            
            if is_unhealthy:
                unhealthy_interfaces.append({
                    "interfaceName": intf.get("name"),
                    "metrics": {
                        "rtt": metrics.get("rtt"),
                        "jitterUpstream": metrics.get("jitterUpstream"),
                        "jitterDownstream": metrics.get("jitterDownstream"),
                        "lostUpstreamPcnt": metrics.get("lostUpstreamPcnt"),
                        "lostDownstreamPcnt": metrics.get("lostDownstreamPcnt"),
                    }
                })
        
        if len(unhealthy_interfaces) > 0:
            unhealthy_sites.append({
                "siteId": site.get("id"),
                "siteName": site.get("info", {}).get("name"),
                "unhealthyInterfaces": unhealthy_interfaces,
            })
    
    return {
        "data": {
            "timeFrame": {
                "from": account_metrics.get("from"),
                "to": account_metrics.get("to"),
            },
            "summary": {
                "sitesScanned": len(all_sites),
                "unhealthySiteCount": len(unhealthy_sites),
                "thresholds": {
                    "rtt": f"{rtt_threshold}ms",
                    "packetLoss": f"{packet_loss_threshold}%",
                    "jitter": f"{jitter_threshold}ms",
                }
            },
            "unhealthySites": unhealthy_sites,
        }
    }

