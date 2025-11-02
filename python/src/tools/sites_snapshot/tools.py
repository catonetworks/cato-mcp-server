"""
Site snapshot tools
"""
from typing import List
from ..common.cato_mcp_tool import CatoMcpToolWrapper, McpToolDefContext
from .sites_by_location_tool import build_sites_by_location_tool
from .site_details_tool import build_site_details_tool
from .site_types_tool import build_site_types_tool
from .socket_versions_tool import build_socket_versions_tool
from .wan_connectivity_tool import build_wan_connectivity_tool


def build_site_snapshot_tools(ctx: McpToolDefContext) -> List[CatoMcpToolWrapper]:
    """
    Build all site snapshot tools.
    
    Args:
        ctx: The tool definition context
        
    Returns:
        List of tool wrappers
    """
    return [
        build_sites_by_location_tool(ctx),
        build_site_details_tool(ctx),
        build_site_types_tool(ctx),
        build_socket_versions_tool(ctx),
        build_wan_connectivity_tool(ctx)
    ]

