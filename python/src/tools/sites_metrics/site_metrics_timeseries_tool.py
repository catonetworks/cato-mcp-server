"""
Site metrics timeseries tool
"""
from typing import Any, Dict, List
from ..common.cato_mcp_tool import CatoMcpToolWrapper, McpToolDef, McpToolDefContext
from ...utils.metrics_utils import (
    empty_metrics_response,
    is_valid_site_metric_response,
    DEFAULT_TIMEFRAME,
    DEFAULT_BUCKETS,
    standardize_metrics_input,
    calculate_summary,
    calculate_host_utilization
)


def build_site_metrics_timeseries_tool(ctx: McpToolDefContext) -> CatoMcpToolWrapper:
    """
    Build the site metrics timeseries tool.
    
    Args:
        ctx: The tool definition context
        
    Returns:
        The tool wrapper
    """
    tool_def: McpToolDef = {
        "name": "site_metrics_timeseries",
        "description": """Retrieves time-bucketed metrics data for sites, enabling trend analysis, peak detection, and traffic pattern identification.

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
- "Show me hourly hostCount variations for all sites to identify capacity planning needs."
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
                "buckets": {
                    "type": "integer",
                    "description": "Number of time buckets to divide the timeFrame into (1-1000). Higher values give finer granularity.",
                    "default": DEFAULT_BUCKETS,
                    "minimum": 1,
                    "maximum": 1000
                },
                "labels": {
                    "type": "array",
                    "items": {
                        "type": "string",
                        "enum": [
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
                    "description": "List of metrics to retrieve timeseries data for. Each metric will have its own timeseries.",
                    "default": ["bytesTotal"]
                },
                "siteIDs": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Optional list of site IDs to filter by. If omitted, returns data for all sites."
                },
                "groupInterfaces": {
                    "type": "boolean",
                    "description": "For sites, whether to aggregate all interfaces into a single timeseries per site.",
                    "default": True
                },
                "groupDevices": {
                    "type": "boolean",
                    "description": "For HA sites, whether to aggregate primary and secondary devices into a single timeseries.",
                    "default": True
                },
                "perSecond": {
                    "type": "boolean",
                    "description": "Whether to normalize data to per-second rates (divide by bucket duration).",
                    "default": False
                },
                "aggregationFunction": {
                    "type": "string",
                    "enum": ["sum", "avg", "max", "min"],
                    "description": "How to aggregate data across multiple sites/interfaces when grouping is enabled.",
                    "default": "sum"
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
"""


def _process_account_timeseries(account_metrics: Dict[str, Any], aggregation_fn: str) -> List[Dict[str, Any]]:
    """
    Process account-level timeseries data.
    
    Args:
        account_metrics: Account metrics dictionary
        aggregation_fn: Aggregation function name
        
    Returns:
        List of processed timeseries
    """
    account_timeseries = []
    for ts in account_metrics.get("timeseries", []):
        data_points = ts.get("data") or []
        summary = calculate_summary(data_points, aggregation_fn)
        
        account_timeseries.append({
            "label": ts.get("label"),
            "units": ts.get("units"),
            "sum": ts.get("sum"),
            "summary": summary,
            "buckets": len(data_points),
            "data": data_points
        })
    return account_timeseries


def _process_site_timeseries(site: Dict[str, Any], requested_labels: List[str], aggregation_fn: str, group_interfaces: bool) -> Dict[str, Any]:
    """
    Process site timeseries data.
    
    Args:
        site: Site dictionary
        requested_labels: List of requested metric labels
        aggregation_fn: Aggregation function name
        group_interfaces: Whether to group interfaces
        
    Returns:
        Processed site data dictionary
    """
    site_data: Dict[str, Any] = {
        "siteId": site.get("id"),
        "siteName": site.get("name") or site.get("info", {}).get("name"),
        "siteType": site.get("info", {}).get("type"),
        "connType": site.get("info", {}).get("connType"),
        "region": site.get("info", {}).get("region"),
        "siteMetrics": {},
        "interfaces": []
    }
    
    # Process site-level metrics (hostCount, flowCount, hostLimit)
    site_timeseries_fields = {
        "hostCount": site.get("hostCount"),
        "flowCount": site.get("flowCount"),
        "hostLimit": site.get("hostLimit")
    }
    
    for field_name, ts in site_timeseries_fields.items():
        if ts and (ts.get("label") in requested_labels or field_name in ["hostCount", "flowCount", "hostLimit"]):
            data_points = ts.get("data") or []
            summary = calculate_summary(data_points, aggregation_fn)
            
            site_data["siteMetrics"][ts.get("label")] = {
                "label": ts.get("label"),
                "units": ts.get("units"),
                "sum": ts.get("sum"),
                "summary": summary,
                "buckets": len(data_points),
                "data": data_points
            }
    
    # Calculate capacity utilization if both hostCount and hostLimit are available
    if "hostCount" in site_data["siteMetrics"] and "hostLimit" in site_data["siteMetrics"]:
        host_count_data = site_data["siteMetrics"]["hostCount"].get("data", [])
        host_limit_data = site_data["siteMetrics"]["hostLimit"].get("data", [])
        if host_count_data and host_limit_data:
            utilization_ts = _calculate_host_utilization_timeseries(host_count_data, host_limit_data, aggregation_fn)
            if utilization_ts:
                site_data["siteMetrics"]["hostUtilizationPct"] = utilization_ts
    
    # Process interface-level timeseries
    for intf in site.get("interfaces", []):
        intf_data = _process_interface_timeseries(intf, aggregation_fn)
        site_data["interfaces"].append(intf_data)
    
    # Aggregate interfaces if grouping is enabled
    if group_interfaces and site_data["interfaces"]:
        site_data["aggregatedMetrics"] = _aggregate_interface_metrics(site_data["interfaces"], aggregation_fn)
    
    return site_data


def _process_interface_timeseries(intf: Dict[str, Any], aggregation_fn: str) -> Dict[str, Any]:
    """
    Process interface timeseries data.
    
    Args:
        intf: Interface dictionary
        aggregation_fn: Aggregation function name
        
    Returns:
        Processed interface data dictionary
    """
    intf_data: Dict[str, Any] = {
        "name": intf.get("name"),
        "metrics": {}
    }
    
    for ts in intf.get("timeseries", []):
        data_points = ts.get("data") or []
        summary = calculate_summary(data_points, aggregation_fn)
        
        intf_data["metrics"][ts.get("label")] = {
            "label": ts.get("label"),
            "units": ts.get("units"),
            "sum": ts.get("sum"),
            "summary": summary,
            "buckets": len(data_points),
            "data": data_points
        }
    
    return intf_data


def _calculate_host_utilization_timeseries(host_count_data: List[List[Any]], host_limit_data: List[List[Any]], aggregation_fn: str) -> Dict[str, Any]:
    """
    Calculate host utilization timeseries.
    
    Args:
        host_count_data: Host count timeseries data
        host_limit_data: Host limit timeseries data
        aggregation_fn: Aggregation function name
        
    Returns:
        Utilization timeseries dictionary or None
    """
    utilization_data = []
    max_buckets = min(len(host_count_data), len(host_limit_data))
    
    for i in range(max_buckets):
        if host_count_data[i] and host_limit_data[i]:
            timestamp = host_count_data[i][0]
            host_count = host_count_data[i][1] if len(host_count_data[i]) > 1 else 0
            host_limit = host_limit_data[i][1] if len(host_limit_data[i]) > 1 else 1
            utilization = calculate_host_utilization(host_count, host_limit)
            utilization_data.append([timestamp, utilization])
    
    if utilization_data:
        summary = calculate_summary(utilization_data, aggregation_fn)
        return {
            "label": "hostUtilizationPct",
            "units": "percent",
            "sum": None,
            "summary": summary,
            "buckets": len(utilization_data),
            "data": utilization_data
        }
    return None


def _aggregate_interface_metrics(interfaces: List[Dict[str, Any]], aggregation_fn: str) -> Dict[str, Any]:
    """
    Aggregate metrics across interfaces.
    
    Args:
        interfaces: List of interface dictionaries
        aggregation_fn: Aggregation function name
        
    Returns:
        Aggregated metrics dictionary
    """
    aggregated_metrics: Dict[str, Any] = {}
    
    # Get all unique metric labels from interfaces
    all_labels = set()
    for intf in interfaces:
        all_labels.update(intf.get("metrics", {}).keys())
    
    # Aggregate each metric across interfaces
    for label in all_labels:
        interface_metrics = [intf.get("metrics", {}).get(label) for intf in interfaces if intf.get("metrics", {}).get(label)]
        
        if interface_metrics:
            # Aggregate sums
            total_sum = sum(m.get("sum") or 0 for m in interface_metrics)
            
            # Aggregate data points across time buckets
            aggregated_data = _aggregate_timeseries_data(interface_metrics)
            summary = calculate_summary(aggregated_data, aggregation_fn)
            
            aggregated_metrics[label] = {
                "label": label,
                "units": interface_metrics[0].get("units"),
                "sum": total_sum,
                "summary": summary,
                "buckets": len(aggregated_data),
                "data": aggregated_data
            }
    
    return aggregated_metrics


def _aggregate_timeseries_data(metrics: List[Dict[str, Any]]) -> List[List[Any]]:
    """
    Aggregate timeseries data across metrics.
    
    Args:
        metrics: List of metric dictionaries with timeseries data
        
    Returns:
        Aggregated data points list
    """
    aggregated_data = []
    max_buckets = max((len(m.get("data", [])) for m in metrics), default=0)
    
    for i in range(max_buckets):
        timestamp = None
        aggregated_value = 0
        
        for metric in metrics:
            metric_data = metric.get("data")
            if metric_data and i < len(metric_data) and metric_data[i]:
                timestamp = metric_data[i][0]  # Use timestamp from first available interface
                aggregated_value += metric_data[i][1] if len(metric_data[i]) > 1 else 0
        
        if timestamp is not None:
            aggregated_data.append([timestamp, aggregated_value])
    
    return aggregated_data


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
    aggregation_fn = variables.get("aggregationFunction") or 'sum'
    buckets = variables.get("buckets") or DEFAULT_BUCKETS
    requested_labels = variables.get("labels") or ["bytesTotal"]
    group_interfaces = variables.get("groupInterfaces", True)
    
    # Process account-level timeseries
    account_timeseries = _process_account_timeseries(account_metrics, aggregation_fn)
    
    # Process site data and their interfaces
    site_timeseries = []
    for site in account_metrics.get("sites", []):
        site_data = _process_site_timeseries(site, requested_labels, aggregation_fn, group_interfaces)
        site_timeseries.append(site_data)
    
    return {
        "data": {
            "timeFrame": {
                "from": account_metrics.get("from"),
                "to": account_metrics.get("to"),
            },
            "granularity": account_metrics.get("granularity"),
            "bucketCount": buckets,
            "summary": {
                "accountTimeseriesReturned": len(account_timeseries),
                "sitesReturned": len(site_timeseries),
                "metricsRequested": requested_labels,
                "note": "Account timeseries represents aggregated data. Site data shows per-site metrics (hostCount, flowCount, hostLimit) and per-interface metrics, with aggregated site metrics when groupInterfaces=true."
            },
            "accountTimeseries": account_timeseries,
            "sites": site_timeseries,
        }
    }

