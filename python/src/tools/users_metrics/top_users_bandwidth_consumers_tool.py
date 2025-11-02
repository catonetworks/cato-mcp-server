"""
Top users bandwidth consumers tool
"""
from typing import Any, Dict
from ..common.cato_mcp_tool import CatoMcpToolWrapper, McpToolDef, McpToolDefContext
from ...utils.metrics_utils import (
    empty_metrics_response,
    format_bytes,
    DEFAULT_TIMEFRAME,
    DEFAULT_TOP_N,
    standardize_metrics_input,
    calculate_bytes_total,
    is_valid_user_metric_response
)


def build_top_users_bandwidth_consumers_tool(ctx: McpToolDefContext) -> CatoMcpToolWrapper:
    """
    Build the top users bandwidth consumers tool.
    
    Args:
        ctx: The tool definition context
        
    Returns:
        The tool wrapper
    """
    tool_def: McpToolDef = {
        "name": "top_users_bandwidth_consumers",
        "description": """Ranks VPN-connected users by total traffic (bytesUpstream + bytesDownstream) in a given time frame. Useful for bandwidth monitoring, cost management, and identifying unusual usage patterns.

IMPORTANT: This tool only returns data for users connected via VPN and will not return information for those connected through other methods.

NOTE: Byte values are automatically formatted using binary units (KiB, MiB, GiB, etc.) with base 1024 for human readability. Raw byte totals are also provided for calculations.

Example questions this tool can help answer:
- "Who are the top 10 bandwidth consumers this month?"
- "Which users exceeded 50 GB of total traffic today?"
- "Show me the top 5 users by bandwidth consumption this week with upload/download breakdown"
- "Identify users with unusually high bandwidth usage for security analysis"

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
                    "items": {
                        "type": "string"
                    },
                    "description": "required list of user IDs to filter by. If not provided, all VPN users will be considered. Use entity_lookup tool (type: 'vpnUser') to discover user IDs."
                },
                "topN": {
                    "type": "integer",
                    "description": "The number of top consumers to return (1-50).",
                    "default": DEFAULT_TOP_N,
                    "minimum": 1,
                    "maximum": 50
                },
                "groupInterfaces": {
                    "type": "boolean",
                    "description": "Whether to aggregate traffic from all user interfaces into a single total per user before ranking.",
                    "default": True
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
    """
    variables["groupDevices"] = True
    return standardize_metrics_input(variables)


GQL_QUERY = """
query topUsersBandwidthConsumers($accountID: ID!, $timeFrame: TimeFrame!, $userIDs: [ID!], $groupInterfaces: Boolean = true, $groupDevices: Boolean = true) {
  accountMetrics(accountID: $accountID, timeFrame: $timeFrame, groupInterfaces: $groupInterfaces, groupDevices: $groupDevices) {
    id
    from
    to
    users(userIDs: $userIDs) {
      id
      name
      metrics {
        bytesUpstream
        bytesDownstream
        duration
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
    if not is_valid_user_metric_response(variables.get("accountID", ""), response):
        return empty_metrics_response(response.get("data", {}).get("accountMetrics"))
    
    account_metrics = response["data"]["accountMetrics"]
    top_n = variables.get("topN") or DEFAULT_TOP_N
    
    consumers = account_metrics.get("users", [])
    
    if not consumers:
        return empty_metrics_response(account_metrics)
    
    ranked_consumers = sorted([
        {
            "id": consumer.get("id"),
            "name": consumer.get("name"),
            "totalBytes": calculate_bytes_total(
                consumer.get("metrics", {}).get("bytesUpstream") or 0,
                consumer.get("metrics", {}).get("bytesDownstream") or 0
            ),
            "totalUsage": format_bytes(calculate_bytes_total(
                consumer.get("metrics", {}).get("bytesUpstream") or 0,
                consumer.get("metrics", {}).get("bytesDownstream") or 0
            )),
            "breakdown": {
                "upload": format_bytes(consumer.get("metrics", {}).get("bytesUpstream") or 0),
                "download": format_bytes(consumer.get("metrics", {}).get("bytesDownstream") or 0)
            },
            "duration": consumer.get("metrics", {}).get("duration") or 0
        }
        for consumer in consumers
        if calculate_bytes_total(
            consumer.get("metrics", {}).get("bytesUpstream") or 0,
            consumer.get("metrics", {}).get("bytesDownstream") or 0
        ) > 0
    ], key=lambda x: x["totalBytes"], reverse=True)[:top_n]
    
    return {
        "data": {
            "timeFrame": {
                "from": account_metrics.get("from"),
                "to": account_metrics.get("to"),
            },
            "summary": {
                "consumerType": "users",
                "showingTop": len(ranked_consumers),
                "totalUsersAnalyzed": len(consumers),
                "note": "Only VPN-connected users with traffic > 0 are included in rankings."
            },
            "topConsumers": ranked_consumers,
        }
    }

