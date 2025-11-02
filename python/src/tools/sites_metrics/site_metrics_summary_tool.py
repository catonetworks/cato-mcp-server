"""
Site metrics summary tool
"""
from typing import Any, Dict, List, Set
from ..common.cato_mcp_tool import CatoMcpToolWrapper, McpToolDef, McpToolDefContext
from ...utils.metrics_utils import (
    empty_metrics_response,
    is_valid_site_metric_response,
    format_bytes,
    DEFAULT_TIMEFRAME,
    standardize_metrics_input,
    calculate_bytes_total,
    calculate_host_utilization,
    calculate_upstream_downstream_ratio,
    aggregate_values,
    generate_health_flags,
    GROUP_KEY_GENERATORS,
    sort_results
)


def build_site_metrics_summary_tool(ctx: McpToolDefContext) -> CatoMcpToolWrapper:
    """
    Build the site metrics summary tool.
    
    Args:
        ctx: The tool definition context
        
    Returns:
        The tool wrapper
    """
    tool_def: McpToolDef = {
        "name": "site_metrics_summary",
        "description": """NOTE: Returns only one aggregated record per group (no per-timestamp arrays).

Provides aggregated metrics analysis for sites grouped by various dimensions like site type, connection type, region, or interface role. Includes capacity utilization analysis and comparative statistics.
        
        BYTE FORMATTING: For byte metrics (bytesUpstream, bytesDownstream, bytesTotal), both raw values and human-readable formatted values are provided. Formatted values use binary units (KiB, MiB, GiB, etc.) with base 1024.

        IMPORTANT: Carefully review the timeFrame parameter description and examples below to ensure correct usage (in-day, cross-day, cross-month, cross-year absolute UTC formats).
        
        Example questions this tool can help answer:
        - "What was the average RTT for each site yesterday, and which sites exceeded 150 ms?"
        - "Which WAN interface experienced the highest upstream packet-loss percentage in the past 24 hours?"
        - "What is the combined downstream throughput for all interfaces during business hours this month?"
        - "How many hosts were connected per site last Monday, and which sites were within 10% of their hostLimit?"
        - "What is the average flowCount per site type (BRANCH, DATACENTER, etc.) for Q1?"
        - "Which connection types (SOCKET, IPSEC_V2, etc.) account for the highest cumulative traffic this month?"
        - "What is the ratio of upstream-to-downstream bytes for each interface role (WAN_1 vs WAN_2) this week?"
        - "Calculate the cumulative bytesTotal for all IPsec sites versus all Socket sites for the previous month."
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
                "groupBy": {
                    "type": "string",
                    "enum": ["site", "siteType", "connType", "region", "interfaceRole", "interfaceName", "socketHA"],
                    "description": "Dimension to group results by: 'site' (individual sites), 'siteType' (BRANCH/DATACENTER/etc), 'connType' (SOCKET/IPSEC/etc), 'region' (PoP regions), 'interfaceRole' (WAN_1/WAN_2/etc), 'interfaceName' (interface names), 'socketHA' (primary/secondary HA role).",
                    "default": "site"
                },
                "metrics": {
                    "type": "array",
                    "items": {
                        "type": "string",
                        "enum": [
                            "bytesDownstream", "bytesUpstream", "bytesTotal",
                            "packetsDownstream", "packetsUpstream",
                            "lostDownstream", "lostUpstream", "lostDownstreamPcnt", "lostUpstreamPcnt",
                            "packetsDiscardedDownstream", "packetsDiscardedUpstream",
                            "jitterDownstream", "jitterUpstream", "rtt", "flowCount", "hostCount", "hostLimit"
                        ]
                    },
                    "description": "List of metrics to aggregate and analyze for each group.",
                    "default": ["bytesTotal", "rtt", "lostUpstreamPcnt", "lostDownstreamPcnt"]
                },
                "siteIDs": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Optional list of site IDs to filter by. If omitted, includes all sites."
                },
                "aggregationFunction": {
                    "type": "string",
                    "enum": ["sum", "avg", "max", "min"],
                    "description": "How to aggregate metrics within each group: 'sum' for totals, 'avg' for averages, 'max' for peaks, 'min' for minimums.",
                    "default": "avg"
                },
                "thresholds": {
                    "type": "object",
                    "properties": {
                        "rtt": {"type": "number", "description": "RTT threshold in milliseconds to flag as unhealthy."},
                        "packetLoss": {"type": "number", "description": "Packet loss threshold in percent to flag as unhealthy."},
                        "jitter": {"type": "number", "description": "Jitter threshold in milliseconds to flag as unhealthy."},
                        "hostUtilization": {"type": "number", "description": "Host utilization threshold (hostCount/hostLimit) in percent to flag as near capacity."}
                    },
                    "description": "Optional thresholds to identify sites/groups exceeding specified limits.",
                    "additionalProperties": False
                },
                "includeCapacityAnalysis": {
                    "type": "boolean",
                    "description": "Whether to include capacity utilization analysis (hostCount vs hostLimit, interface bandwidth usage).",
                    "default": False
                },
                "sortBy": {
                    "type": "string",
                    "description": "Which metric to sort results by (must be one of the requested metrics).",
                    "default": "bytesTotal"
                },
                "sortOrder": {
                    "type": "string",
                    "enum": ["asc", "desc"],
                    "description": "Sort order: 'desc' for highest first, 'asc' for lowest first.",
                    "default": "desc"
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
query siteMetricsSummary($accountID: ID!, $timeFrame: TimeFrame!, $siteIDs: [ID!], $groupInterfaces: Boolean, $groupDevices: Boolean) {
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
"""


def _group_site_data(account_metrics: Dict[str, Any], variables: Dict[str, Any]) -> Dict[str, Any]:
    """
    Group site data based on groupBy parameter.
    
    Args:
        account_metrics: Account metrics dictionary
        variables: Input variables
        
    Returns:
        Dictionary of grouped data
    """
    group_by = variables.get("groupBy") or 'site'
    groups: Dict[str, Any] = {}
    
    for site in account_metrics.get("sites", []):
        site_metrics = site.get("metrics") or {}
        
        # Enhanced metrics with calculated values
        enhanced_metrics = {
            **site_metrics,
            "bytesTotal": calculate_bytes_total(site_metrics.get("bytesUpstream") or 0, site_metrics.get("bytesDownstream") or 0)
        }
        
        if group_by == 'site':
            _add_site_to_group(groups, site, enhanced_metrics, group_by)
        elif group_by in ['interfaceRole', 'interfaceName', 'socketHA']:
            _add_interfaces_to_groups(groups, site, group_by)
        else:
            _add_site_to_property_group(groups, site, enhanced_metrics, group_by)
    
    return groups


def _add_site_to_group(groups: Dict[str, Any], site: Dict[str, Any], enhanced_metrics: Dict[str, Any], group_by: str) -> None:
    """
    Add site to group.
    
    Args:
        groups: Groups dictionary
        site: Site dictionary
        enhanced_metrics: Enhanced metrics dictionary
        group_by: Grouping key
    """
    generator = GROUP_KEY_GENERATORS.get(group_by)
    group_key = generator(site) if generator else f"{site.get('info', {}).get('name') or site.get('id')}"
    
    if group_key not in groups:
        groups[group_key] = {
            "groupKey": group_key,
            "groupType": 'site',
            "siteId": site.get("id"),
            "siteName": site.get("info", {}).get("name"),
            "siteType": site.get("info", {}).get("type"),
            "connType": site.get("info", {}).get("connType"),
            "region": site.get("info", {}).get("region"),
            "isHA": site.get("info", {}).get("isHA"),
            "metrics": [],
            "count": 0
        }
    groups[group_key]["metrics"].append(enhanced_metrics)
    groups[group_key]["count"] += 1


def _add_interfaces_to_groups(groups: Dict[str, Any], site: Dict[str, Any], group_by: str) -> None:
    """
    Add interfaces to groups.
    
    Args:
        groups: Groups dictionary
        site: Site dictionary
        group_by: Grouping key
    """
    for intf in site.get("interfaces", []):
        generator = GROUP_KEY_GENERATORS.get(group_by)
        group_key = generator(intf) if generator else 'Unknown'
        
        if group_key not in groups:
            groups[group_key] = {
                "groupKey": group_key,
                "groupType": group_by,
                "metrics": [],
                "count": 0,
                "sites": set()
            }
        
        intf_metrics = intf.get("metrics") or {}
        enhanced_intf_metrics = {
            **intf_metrics,
            "bytesTotal": calculate_bytes_total(intf_metrics.get("bytesUpstream") or 0, intf_metrics.get("bytesDownstream") or 0)
        }
        
        groups[group_key]["metrics"].append(enhanced_intf_metrics)
        groups[group_key]["count"] += 1
        groups[group_key]["sites"].add(site.get("info", {}).get("name") or site.get("id"))


def _add_site_to_property_group(groups: Dict[str, Any], site: Dict[str, Any], enhanced_metrics: Dict[str, Any], group_by: str) -> None:
    """
    Add site to property group.
    
    Args:
        groups: Groups dictionary
        site: Site dictionary
        enhanced_metrics: Enhanced metrics dictionary
        group_by: Grouping key
    """
    generator = GROUP_KEY_GENERATORS.get(group_by)
    group_key = generator(site) if generator else 'Unknown'
    
    if group_key not in groups:
        groups[group_key] = {
            "groupKey": group_key,
            "groupType": group_by,
            "metrics": [],
            "count": 0,
            "sites": set()
        }
    groups[group_key]["metrics"].append(enhanced_metrics)
    groups[group_key]["count"] += 1
    groups[group_key]["sites"].add(site.get("info", {}).get("name") or site.get("id"))


def _aggregate_metrics(groups: Dict[str, Any], variables: Dict[str, Any]) -> List[Dict[str, Any]]:
    """
    Aggregate metrics for each group.
    
    Args:
        groups: Groups dictionary
        variables: Input variables
        
    Returns:
        List of aggregated results
    """
    aggregation_fn = variables.get("aggregationFunction") or 'avg'
    requested_metrics = variables.get("metrics") or ["bytesTotal", "rtt", "lostUpstreamPcnt", "lostDownstreamPcnt"]
    thresholds = variables.get("thresholds") or {}
    include_capacity = variables.get("includeCapacityAnalysis") or False
    
    results = []
    for group in groups.values():
        aggregated: Dict[str, Any] = {
            "group": group["groupKey"],
            "groupType": group["groupType"],
            "count": group["count"]
        }
        
        # Add group context
        _add_group_context(aggregated, group)
        
        # Aggregate requested metrics
        _aggregate_requested_metrics(aggregated, group["metrics"], requested_metrics, aggregation_fn)
        
        # Add capacity analysis
        if include_capacity:
            _add_capacity_analysis(aggregated)
        
        # Add derived metrics
        _add_derived_metrics(aggregated)
        
        # Generate health flags
        aggregated["healthFlags"] = generate_health_flags(aggregated, thresholds)
        
        results.append(aggregated)
    
    return results


def _add_group_context(aggregated: Dict[str, Any], group: Dict[str, Any]) -> None:
    """
    Add group context to aggregated result.
    
    Args:
        aggregated: Aggregated result dictionary
        group: Group dictionary
    """
    if "sites" in group:
        sites_set = group["sites"]
        aggregated["sitesInGroup"] = list(sites_set) if isinstance(sites_set, set) else sites_set
    
    # Copy site-specific info for single-site groups
    if group.get("groupType") == 'site':
        aggregated["siteId"] = group.get("siteId")
        aggregated["siteName"] = group.get("siteName")
        aggregated["siteType"] = group.get("siteType")
        aggregated["connType"] = group.get("connType")
        aggregated["region"] = group.get("region")
        aggregated["isHA"] = group.get("isHA")


def _aggregate_requested_metrics(aggregated: Dict[str, Any], metrics: List[Dict[str, Any]], requested_metrics: List[str], aggregation_fn: str) -> None:
    """
    Aggregate requested metrics.
    
    Args:
        aggregated: Aggregated result dictionary
        metrics: List of metric dictionaries
        requested_metrics: List of requested metric names
        aggregation_fn: Aggregation function name
    """
    for metric_name in requested_metrics:
        values = [m.get(metric_name) for m in metrics]
        values = [v for v in values if v is not None and not (isinstance(v, float) and (v != v or v == float('inf') or v == float('-inf')))]
        
        aggregated_value = aggregate_values(values, aggregation_fn)
        aggregated[metric_name] = aggregated_value
        
        # Format bytes for readability
        if 'bytes' in metric_name or metric_name == 'bytesTotal':
            aggregated[f"{metric_name}Formatted"] = format_bytes(aggregated_value)


def _add_capacity_analysis(aggregated: Dict[str, Any]) -> None:
    """
    Add capacity analysis to aggregated result.
    
    Args:
        aggregated: Aggregated result dictionary
    """
    if aggregated.get("hostCount") and aggregated.get("hostLimit"):
        aggregated["hostUtilizationPct"] = calculate_host_utilization(aggregated["hostCount"], aggregated["hostLimit"])


def _add_derived_metrics(aggregated: Dict[str, Any]) -> None:
    """
    Add derived metrics to aggregated result.
    
    Args:
        aggregated: Aggregated result dictionary
    """
    if aggregated.get("bytesUpstream") and aggregated.get("bytesDownstream"):
        aggregated["upstreamDownstreamRatio"] = calculate_upstream_downstream_ratio(
            aggregated["bytesUpstream"],
            aggregated["bytesDownstream"]
        )


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
    sort_by = variables.get("sortBy") or 'bytesTotal'
    sort_order = variables.get("sortOrder") or 'desc'
    
    # Group data based on groupBy parameter
    groups = _group_site_data(account_metrics, variables)
    
    # Aggregate metrics for each group
    aggregated_results = _aggregate_metrics(groups, variables)
    
    # Sort results
    sorted_results = sort_results(aggregated_results, sort_by, sort_order)
    
    return {
        "data": {
            "timeFrame": {
                "from": account_metrics.get("from"),
                "to": account_metrics.get("to"),
            },
            "summary": {
                "groupBy": variables.get("groupBy") or 'site',
                "aggregationFunction": variables.get("aggregationFunction") or 'avg',
                "groupsReturned": len(sorted_results),
                "metricsAnalyzed": variables.get("metrics") or ["bytesTotal", "rtt", "lostUpstreamPcnt", "lostDownstreamPcnt"],
                "thresholdsApplied": list((variables.get("thresholds") or {}).keys())
            },
            "results": sorted_results
        }
    }

