"""
User metrics timeseries tool
"""
from typing import Any, Dict, List
from ..common.cato_mcp_tool import CatoMcpToolWrapper, McpToolDef, McpToolDefContext
from ...utils.metrics_utils import (
    empty_metrics_response,
    DEFAULT_TIMEFRAME,
    DEFAULT_BUCKETS,
    standardize_metrics_input,
    calculate_summary,
    calculate_host_utilization,
    is_valid_user_metric_response
)


def build_user_metrics_timeseries_tool(ctx: McpToolDefContext) -> CatoMcpToolWrapper:
    """
    Build the user metrics timeseries tool.
    
    Args:
        ctx: The tool definition context
        
    Returns:
        The tool wrapper
    """
    tool_def: McpToolDef = {
        "name": "user_metrics_timeseries",
        "description": """Retrieves time-bucketed metrics data for VPN-connected users, enabling trend analysis and performance monitoring over time.

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

IMPORTANT: Carefully review the timeFrame parameter description and examples below to ensure correct usage (in-day, cross-day, cross-month, cross-year absolute UTC formats).""",
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
                "timeseries": {
                    "type": "array",
                    "items": {
                        "type": "string",
                        "enum": [
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
                    "description": "List of metrics for which to retrieve timeseries data.",
                    "default": ["bytesTotal"]
                },
                "userIDs": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "List of user IDs to analyze. Use entity_lookup tool (type: 'vpnUser') to discover user IDs first."
                },
                "perSecond": {
                    "type": "boolean",
                    "description": "Whether to normalize data to per-second rates (divide by bucket duration).",
                    "default": False
                },
                "aggregationFunction": {
                    "type": "string",
                    "enum": ["sum", "avg", "max", "min"],
                    "description": "How to aggregate data across multiple interfaces when grouping is enabled.",
                    "default": "sum"
                }
            },
            "required": ["accountID", "timeFrame", "userIDs", "timeseries"],
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
        
    Raises:
        ValueError: If userIDs or timeseries are not provided
    """
    # If no userIDs provided, guide user to use entity_lookup first
    if not variables.get("userIDs") or len(variables.get("userIDs", [])) == 0:
        raise ValueError("UserIDs are required for timeseries analysis. Please use entity_lookup tool first:\n1. Call entity_lookup with type='vpnUser' to find user IDs\n2. Then call this tool with the discovered userIDs")
    
    # If no timeseries metrics specified, throw error
    if not variables.get("timeseries") or len(variables.get("timeseries", [])) == 0:
        raise ValueError("Timeseries metrics are required. Please specify which metrics you want timeseries data for (e.g., ['bytesTotal', 'rtt', 'lostDownstreamPcnt'])")
    
    variables["groupInterfaces"] = True
    variables["groupDevices"] = True
    return standardize_metrics_input(variables)


GQL_QUERY = """
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
"""


def _process_user_timeseries_data(account_metrics: Dict[str, Any], aggregation_fn: str) -> Dict[str, List[Dict[str, Any]]]:
    """
    Process user timeseries data from account metrics.
    
    Args:
        account_metrics: Account metrics dictionary
        aggregation_fn: Aggregation function name
        
    Returns:
        Dictionary with users list
    """
    users = []
    
    for user in account_metrics.get("users", []):
        user_data: Dict[str, Any] = {
            "userId": user.get("id"),
            "userName": user.get("name"),
            "userTimeseries": {},
            "interfaces": []
        }
        
        # Process user-level timeseries (hostCount, flowCount, hostLimit)
        user_timeseries_fields = {
            "hostCount": user.get("hostCount"),
            "flowCount": user.get("flowCount"),
            "hostLimit": user.get("hostLimit")
        }
        
        for field_name, ts in user_timeseries_fields.items():
            if ts:
                data_points = ts.get("data") or []
                summary = calculate_summary(data_points, aggregation_fn)
                user_data["userTimeseries"][ts.get("label")] = {
                    "label": ts.get("label"),
                    "units": ts.get("units"),
                    "sum": ts.get("sum"),
                    "summary": summary,
                    "buckets": len(data_points),
                    "data": data_points
                }
        
        # Calculate host utilization timeseries if both hostCount and hostLimit are available
        if "hostCount" in user_data["userTimeseries"] and "hostLimit" in user_data["userTimeseries"]:
            host_count_data = user_data["userTimeseries"]["hostCount"].get("data", [])
            host_limit_data = user_data["userTimeseries"]["hostLimit"].get("data", [])
            
            if host_count_data and host_limit_data:
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
                    user_data["userTimeseries"]["hostUtilizationPct"] = {
                        "label": "hostUtilizationPct",
                        "units": "percent",
                        "sum": None,
                        "summary": summary,
                        "buckets": len(utilization_data),
                        "data": utilization_data
                    }
        
        # Process interface-level timeseries
        for intf in user.get("interfaces", []):
            intf_data: Dict[str, Any] = {
                "name": intf.get("name"),
                "remoteIP": intf.get("remoteIP"),
                "remoteIPInfo": intf.get("remoteIPInfo"),
                "timeseries": {}
            }
            
            for ts in intf.get("timeseries", []):
                data_points = ts.get("data") or []
                summary = calculate_summary(data_points, aggregation_fn)
                intf_data["timeseries"][ts.get("label")] = {
                    "label": ts.get("label"),
                    "units": ts.get("units"),
                    "sum": ts.get("sum"),
                    "summary": summary,
                    "buckets": len(data_points),
                    "data": data_points,
                    "info": ts.get("info")
                }
            
            user_data["interfaces"].append(intf_data)
        
        users.append(user_data)
    
    return {"users": users}


def _handle_response(variables: Dict[str, Any], response: Dict[str, Any]) -> Dict[str, Any]:
    """
    Handle response.
    
    Args:
        variables: The input variables
        response: The GraphQL response
        
    Returns:
        Processed response
    """
    if not is_valid_user_metric_response(variables.get("accountID", ""), response):
        return empty_metrics_response(response.get("data", {}).get("accountMetrics"))
    
    account_metrics = response["data"]["accountMetrics"]
    buckets = variables.get("buckets") or DEFAULT_BUCKETS
    requested_timeseries = variables.get("timeseries") or []
    aggregation_fn = variables.get("aggregationFunction") or 'sum'
    
    users_data = _process_user_timeseries_data(account_metrics, aggregation_fn)
    users = users_data["users"]
    
    total_interfaces = sum(len(user.get("interfaces", [])) for user in users)
    total_timeseries_metrics = sum(
        len(user.get("userTimeseries", {})) + sum(len(intf.get("timeseries", {})) for intf in user.get("interfaces", []))
        for user in users
    )
    
    return {
        "data": {
            "timeFrame": {
                "from": account_metrics.get("from"),
                "to": account_metrics.get("to"),
            },
            "granularity": account_metrics.get("granularity"),
            "bucketCount": buckets,
            "summary": {
                "usersReturned": len(users),
                "totalInterfaces": total_interfaces,
                "totalTimeseriesMetrics": total_timeseries_metrics,
                "timeseriesMetricsRequested": requested_timeseries,
                "note": "Returns timeseries data for users and their interfaces. User-level metrics include hostCount, flowCount, hostLimit, and calculated hostUtilizationPct."
            },
            "users": users
        }
    }

