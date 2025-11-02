"""
User metrics tool
"""
from typing import Any, Dict, List
from ..common.cato_mcp_tool import CatoMcpToolWrapper, McpToolDef, McpToolDefContext
from ...utils.metrics_utils import (
    empty_metrics_response,
    DEFAULT_TIMEFRAME,
    DEFAULT_BUCKETS,
    standardize_metrics_input,
    is_valid_user_metric_response
)


def build_user_metrics_tool(ctx: McpToolDefContext) -> CatoMcpToolWrapper:
    """
    Build the user metrics tool.
    
    Args:
        ctx: The tool definition context
        
    Returns:
        The tool wrapper
    """
    tool_def: McpToolDef = {
        "name": "user_metrics",
        "description": """Returns aggregated metrics for VPN-connected users (no timeseries data).

IMPORTANT: This tool only returns data for users connected via VPN and will not return information for those connected through other methods.

**Workflow:**
1. **First:** Use the 'entity_lookup' tool (type: 'vpnUser') to find user IDs by name or other criteria.
2. **Then:** Use this tool with the discovered userIDs to get aggregated metrics.

**Data Returned:**
- User identification (ID, name)
- User-level aggregated metrics: bytes (up/down/total), packets (up/down), packet discard counts, packet loss counts, RTT, duration, granularity, host/flow counts and limits
- Interface breakdown with metrics: bandwidth, packets, latency, packet loss, jitter, discard counts, geographic and provider details

    For timeseries data and trend analysis, use the 'user_metrics_timeseries' tool instead.

    Example questions this tool can help answer:
    - "What are the total bandwidth consumption stats for each user over the last 24 hours?"
    - "Which users have the highest packet loss percentages today?"
    - "Show me current host utilization for all users"
    - "What's the average RTT for each user's interfaces this week?"

    BYTE VALUES: Returns raw byte values to preserve precision. Unit information is provided in the 'units' field.
    
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
                "userIDs": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "List of user IDs to analyze. Use entity_lookup tool (type: 'vpnUser') to discover user IDs first."
                }
            },
            "required": ["accountID", "timeFrame", "userIDs"],
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
        ValueError: If userIDs are not provided
    """
    # If no userIDs provided, guide user to use entity_lookup first
    if not variables.get("userIDs") or len(variables.get("userIDs", [])) == 0:
        raise ValueError("UserIDs are required for metrics analysis. Please use entity_lookup tool first:\n1. Call entity_lookup with type='vpnUser' to find user IDs\n2. Then call this tool with the discovered userIDs")
    
    variables["groupInterfaces"] = True
    variables["groupDevices"] = True
    return standardize_metrics_input(variables)


GQL_QUERY = """
query userMetrics($accountID: ID!, $timeFrame: TimeFrame!, $userIDs: [ID!], $groupInterfaces: Boolean = true, $groupDevices: Boolean = true) {
  accountMetrics(accountID: $accountID, timeFrame: $timeFrame, groupInterfaces: $groupInterfaces, groupDevices: $groupDevices) {
    id
    from
    to
    granularity
    
    users(userIDs: $userIDs) {
      id
      name
      metrics {
        bytesTotal
        bytesUpstream
        bytesDownstream
        packetsUpstream
        packetsDownstream
        packetsDiscardedUpstream
        packetsDiscardedDownstream
        lostUpstream
        lostDownstream
        rtt
        duration
        granularity
        hostCount
        flowCount
        hostLimit
      }
      interfaces {
        name
        remoteIP
        metrics {
          bytesUpstream
          bytesDownstream
          bytesTotal
          packetsUpstream
          packetsDownstream
          rtt
          lostUpstream
          lostDownstream
          lostUpstreamPcnt
          lostDownstreamPcnt
          packetsDiscardedUpstream
          packetsDiscardedDownstream
          jitterUpstream
          jitterDownstream
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


def _process_user_data(account_metrics: Dict[str, Any]) -> Dict[str, List[Dict[str, Any]]]:
    """
    Process user data from account metrics.
    
    Args:
        account_metrics: Account metrics dictionary
        
    Returns:
        Dictionary with users list
    """
    users = []
    
    for user in account_metrics.get("users", []):
        user_data: Dict[str, Any] = {
            "userId": user.get("id"),
            "userName": user.get("name"),
            "metrics": user.get("metrics") or {},
            "interfaces": []
        }
        
        for intf in user.get("interfaces", []):
            intf_data: Dict[str, Any] = {
                "name": intf.get("name"),
                "remoteIP": intf.get("remoteIP"),
                "remoteIPInfo": intf.get("remoteIPInfo"),
                "metrics": intf.get("metrics") or {}
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
    
    users_data = _process_user_data(account_metrics)
    users = users_data["users"]
    
    total_interfaces = sum(len(user.get("interfaces", [])) for user in users)
    users_with_metrics = sum(1 for user in users if len(user.get("metrics", {})) > 0)
    
    return {
        "data": {
            "timeFrame": {
                "from": account_metrics.get("from"),
                "to": account_metrics.get("to"),
            },
            "granularity": account_metrics.get("granularity"),
            "summary": {
                "usersReturned": len(users),
                "usersWithMetrics": users_with_metrics,
                "totalInterfaces": total_interfaces,
                "note": "Returns aggregated metrics only. For timeseries data, use user_metrics_timeseries tool."
            },
            "users": users
        }
    }

