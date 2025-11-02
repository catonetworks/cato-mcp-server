"""
Top site bandwidth consumers tool
"""
from typing import Any, Dict
from ..common.cato_mcp_tool import CatoMcpToolWrapper, McpToolDef, McpToolDefContext
from ...utils.metrics_utils import (
    empty_metrics_response,
    is_valid_site_metric_response,
    format_bytes,
    DEFAULT_TIMEFRAME,
    DEFAULT_TOP_N,
    standardize_metrics_input,
    calculate_bytes_total
)


def build_top_site_bandwidth_consumers_tool(ctx: McpToolDefContext) -> CatoMcpToolWrapper:
    """
    Build the top site bandwidth consumers tool.
    
    Args:
        ctx: The tool definition context
        
    Returns:
        The tool wrapper
    """
    tool_def: McpToolDef = {
        "name": "top_site_bandwidth_consumers",
        "description": """Ranks sites by total traffic (bytesUpstream + bytesDownstream) in a given time frame. Useful for capacity planning and identifying unusual traffic patterns.
        
        NOTE: Byte values are automatically formatted using binary units (KiB, MiB, GiB, etc.) with base 1024 for human readability. Raw byte totals are also provided for calculations.
        
        IMPORTANT: Carefully review the timeFrame parameter description and examples in the input schema to ensure correct usage (in-day, cross-day, cross-month, cross-year absolute UTC formats).""",
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
                    "items": {
                        "type": "string"
                    },
                    "description": "Optional list of site IDs to filter by. If not provided, all sites will be considered."
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
                    "description": "For sites, whether to aggregate traffic from all interfaces into a single total per site before ranking.",
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
query topSiteBandwidthConsumers($accountID: ID!, $timeFrame: TimeFrame!, $siteIDs: [ID!], $groupInterfaces: Boolean = true) {
  accountMetrics(accountID: $accountID, timeFrame: $timeFrame, groupInterfaces: $groupInterfaces) {
    id
    from
    to
    sites(siteIDs: $siteIDs) {
      id
      info {
        name
      }
      metrics {
        bytesUpstream
        bytesDownstream
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
    top_n = variables.get("topN") or DEFAULT_TOP_N
    
    consumers = account_metrics.get("sites", [])
    
    if not consumers:
        return empty_metrics_response(account_metrics)
    
    ranked_consumers = sorted([
        {
            "id": consumer.get("id"),
            "name": consumer.get("info", {}).get("name") or consumer.get("name"),
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
            }
        }
        for consumer in consumers
    ], key=lambda x: x["totalBytes"], reverse=True)[:top_n]
    
    return {
        "data": {
            "timeFrame": {
                "from": account_metrics.get("from"),
                "to": account_metrics.get("to"),
            },
            "summary": {
                "consumerType": "sites",
                "showingTop": len(ranked_consumers),
            },
            "topConsumers": ranked_consumers,
        }
    }

