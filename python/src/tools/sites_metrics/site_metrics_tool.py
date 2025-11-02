"""
Site metrics tool
"""
from typing import Any, Dict, List
from ..common.cato_mcp_tool import CatoMcpToolWrapper, McpToolDef, McpToolDefContext
from ...utils.metrics_utils import (
    empty_metrics_response,
    DEFAULT_TIMEFRAME,
    standardize_metrics_input,
    calculate_host_utilization,
    is_valid_site_metric_response
)


def build_site_metrics_tool(ctx: McpToolDefContext) -> CatoMcpToolWrapper:
    """
    Build the site metrics tool.
    
    Args:
        ctx: The tool definition context
        
    Returns:
        The tool wrapper
    """
    tool_def: McpToolDef = {
        "name": "site_metrics",
        "description": """Returns aggregated metrics for sites (no timeseries data).

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
- "What is the average RTT for each site interfaces this week?"
""",
        "inputSchema": {
            "type": "object",
            "properties": {
                "accountID": {
                    "type": "string",
                    "description": "Tenant account ID.",
                    "default": ctx["accountId"]
                },
                "timeFrame": {
                    "type": "string",
                    "description": "Time frame for the data (required). Format '<type>.<value>'.\n1) Relative: 'last.<ISO-8601 duration>' – examples: last.PT5M (5 min), last.PT2H (2 h), last.P1D (1 day), last.P3M (3 months), last.P1Y (1 year).\n2) Absolute UTC range: 'utc.<range>'. The curly braces {} group the time components that vary; constant parts like the year remain outside. Note the difference in brace placement for cross-year vs. same-year queries. Correct examples: in-day → utc.2024-05-11/{00:00:00--12:00:00}, utc.2025-04-22/{09:15:00--17:45:00}; full-day → utc.2024-05-12/{00:00:00--23:59:59}, utc.2025-04-22/{00:00:00--23:59:59}; cross-day (same month) → utc.2024-05-{01/00:00:00--07/23:59:59}, utc.2025-04-{15/08:00:00--16/18:00:00}; full-month → utc.2024-05-{01/00:00:00--31/23:59:59}, utc.2025-02-{01/00:00:00--28/23:59:59}; cross-month (same year) → utc.2024-{05-01/00:00:00--06-01/00:00:00}, utc.2025-{03-15/12:00:00--04-10/06:30:00}; cross-year → utc.{2023-12-31/22:00:00--2024-01-01/02:00:00}, utc.{2024-12-30/00:00:00--2025-01-05/23:59:59}.",
                    "default": DEFAULT_TIMEFRAME
                },
                "siteIDs": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Optional list of site IDs to filter by. If omitted, returns data for all sites."
                },
                "groupInterfaces": {
                    "type": "boolean",
                    "description": "Whether to aggregate all interfaces into a single metric per site.",
                    "default": True
                },
                "groupDevices": {
                    "type": "boolean",
                    "description": "For HA sites, whether to aggregate primary and secondary devices.",
                    "default": True
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
        "inputHandler": _handle_input,
        "responseHandler": _handle_response,
    }


def _handle_input(variables: Dict[str, Any]) -> Dict[str, Any]:
    """
    Handle input variables.
    
    Args:
        variables: The input variables
        
    Returns:
        Processed variables
    """
    return standardize_metrics_input(variables)


GQL_QUERY = """
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
"""


def _process_site_data(account_metrics: Dict[str, Any]) -> Dict[str, List[Any]]:
    """
    Process site data from account metrics.
    
    Args:
        account_metrics: Account metrics dictionary
        
    Returns:
        Dictionary with sites list
    """
    sites = []
    
    for site in account_metrics.get("sites", []):
        site_data: Dict[str, Any] = {
            "siteId": site.get("id"),
            "siteName": site.get("name") or site.get("info", {}).get("name"),
            "siteType": site.get("info", {}).get("type"),
            "connType": site.get("info", {}).get("connType"),
            "region": site.get("info", {}).get("region"),
            "metrics": site.get("metrics") or {},
            "interfaces": []
        }
        
        # Calculate host utilization if both hostCount and hostLimit are available
        if site_data["metrics"].get("hostCount") is not None and site_data["metrics"].get("hostLimit") is not None:
            site_data["metrics"]["hostUtilizationPct"] = calculate_host_utilization(
                site_data["metrics"]["hostCount"],
                site_data["metrics"]["hostLimit"]
            )
        
        for intf in site.get("interfaces", []):
            intf_data: Dict[str, Any] = {
                "name": intf.get("name"),
                "remoteIP": intf.get("remoteIP"),
                "remoteIPInfo": intf.get("remoteIPInfo"),
                "interfaceInfo": intf.get("interfaceInfo"),
                "metrics": intf.get("metrics") or {}
            }
            site_data["interfaces"].append(intf_data)
        
        sites.append(site_data)
    
    return {"sites": sites}


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
    
    sites_data = _process_site_data(account_metrics)
    sites = sites_data["sites"]
    
    total_interfaces = sum(len(site.get("interfaces", [])) for site in sites)
    sites_with_metrics = sum(1 for site in sites if len(site.get("metrics", {})) > 0)
    
    return {
        "data": {
            "timeFrame": {
                "from": account_metrics.get("from"),
                "to": account_metrics.get("to"),
            },
            "granularity": account_metrics.get("granularity"),
            "summary": {
                "sitesReturned": len(sites),
                "sitesWithMetrics": sites_with_metrics,
                "totalInterfaces": total_interfaces,
                "note": "Returns aggregated metrics only. For timeseries data, use site_metrics_timeseries tool."
            },
            "sites": sites
        }
    }

