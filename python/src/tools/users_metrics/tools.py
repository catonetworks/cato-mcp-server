"""
User metrics tools
"""
from typing import List
from ..common.cato_mcp_tool import CatoMcpToolWrapper, McpToolDefContext
from .top_users_bandwidth_consumers_tool import build_top_users_bandwidth_consumers_tool
from .user_metrics_tool import build_user_metrics_tool
from .user_metrics_timeseries_tool import build_user_metrics_timeseries_tool


def build_user_account_metrics_tools(ctx: McpToolDefContext) -> List[CatoMcpToolWrapper]:
    """
    Build all user account metrics tools.
    
    Args:
        ctx: The tool definition context
        
    Returns:
        List of tool wrappers
    """
    return [
        build_top_users_bandwidth_consumers_tool(ctx),
        build_user_metrics_tool(ctx),
        build_user_metrics_timeseries_tool(ctx)
    ]

