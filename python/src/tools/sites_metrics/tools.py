"""
Site metrics tools
"""
from typing import List
from ..common.cato_mcp_tool import CatoMcpToolWrapper, McpToolDefContext
from .site_network_health_tool import build_site_network_health_tool
from .top_site_bandwidth_consumers_tool import build_top_site_bandwidth_consumers_tool
from .site_metrics_tool import build_site_metrics_tool
from .site_metrics_timeseries_tool import build_site_metrics_timeseries_tool
from .site_metrics_summary_tool import build_site_metrics_summary_tool
from .annotation_event_counter_tool import build_annotation_event_counter_tool


def build_account_metrics_tools(ctx: McpToolDefContext) -> List[CatoMcpToolWrapper]:
    """
    Build all site account metrics tools.
    
    Args:
        ctx: The tool definition context
        
    Returns:
        List of tool wrappers
    """
    return [
        build_site_network_health_tool(ctx),
        build_top_site_bandwidth_consumers_tool(ctx),
        build_site_metrics_tool(ctx),
        build_site_metrics_timeseries_tool(ctx),
        build_site_metrics_summary_tool(ctx),
        build_annotation_event_counter_tool(ctx)
    ]

