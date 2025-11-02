"""
User snapshot tools
"""
from typing import List
from ..common.cato_mcp_tool import CatoMcpToolWrapper, McpToolDefContext
from .users_details_tool import build_users_details_tool
from .user_connection_details_tool import build_user_connection_details_tool
from .client_versions_tool import build_client_versions_tool


def build_user_snapshot_tools(ctx: McpToolDefContext) -> List[CatoMcpToolWrapper]:
    """
    Build all user snapshot tools.
    
    Args:
        ctx: The tool definition context
        
    Returns:
        List of tool wrappers
    """
    return [
        build_users_details_tool(ctx),
        build_user_connection_details_tool(ctx),
        build_client_versions_tool(ctx)
    ]

