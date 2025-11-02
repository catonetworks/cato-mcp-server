"""
Tools registry for Cato MCP tools
"""
from typing import Dict
from .common.cato_mcp_tool import CatoMcpToolWrapper, McpToolDefContext


# cato mcp tools
_cato_mcp_tool_wrappers: Dict[str, CatoMcpToolWrapper] = {}


def get_cato_mcp_tools() -> list[Dict]:
    """
    Get all Cato MCP tools.
    
    Returns:
        List of tool definitions
    """
    return [tool["toolDef"] for tool in _cato_mcp_tool_wrappers.values()]


def find_mcp_tool(tool_name: str) -> CatoMcpToolWrapper:
    """
    Find the mcp tool to execute.
    
    Args:
        tool_name: The tool to locate
        
    Returns:
        The tool wrapper
        
    Raises:
        ValueError: If the tool is not found
    """
    tool = _cato_mcp_tool_wrappers.get(tool_name)
    if not tool:
        raise ValueError(f"Tool {tool_name} not found")
    return tool


def init_cato_mcp_tool_wrappers(account_id: str) -> None:
    """
    Build all Cato MCP tool wrappers.
    
    Args:
        account_id: The account ID
    """
    # Import here to avoid circular dependencies
    from .entity_lookup.entity_lookup_tool import build_entity_lookup_tool
    from .sites_snapshot.tools import build_site_snapshot_tools
    from .users_snapshot.tools import build_user_snapshot_tools
    from .sites_metrics.tools import build_account_metrics_tools as build_sites_account_metrics_tools
    from .users_metrics.tools import build_user_account_metrics_tools
    
    ctx: McpToolDefContext = {
        "accountId": account_id
    }
    
    tools = [
        build_entity_lookup_tool(ctx),
        *build_site_snapshot_tools(ctx),
        *build_user_snapshot_tools(ctx),
        *build_sites_account_metrics_tools(ctx),
        *build_user_account_metrics_tools(ctx)
    ]
    
    for tool in tools:
        _cato_mcp_tool_wrappers[tool["toolDef"]["name"]] = tool

