"""
Cato MCP Tool base types
"""
from typing import Any, Callable, Dict, Optional, TypedDict


class McpToolDefContext(TypedDict):
    """
    A context for defining the mcp-tools.
    """
    # the default accountId to use when the user doesn't provide one
    accountId: str


class McpToolDefInputSchema(TypedDict):
    """
    A typed class helper to define the inputSchema of the mcp-tools.
    """
    type: str
    properties: Dict[str, Any]
    required: list[str]
    additionalProperties: bool
    schema: str  # $schema in JSON, but Python doesn't allow $ in identifiers


class McpToolDef(TypedDict, total=False):
    """
    A typed class helper to define an mcp tool.
    """
    name: str
    description: str
    inputSchema: McpToolDefInputSchema
    outputSchema: Optional[Any]  # optional, if the tool returns a specific output schema


class CatoMcpToolWrapper(TypedDict, total=False):
    """
    A Cato mcp-tool wrapper class that also holds the tool's GraphQL query.
    """
    toolDef: McpToolDef
    gqlQuery: str
    inputHandler: Optional[Callable[[Dict[str, Any]], Dict[str, Any]]]
    responseHandler: Optional[Callable[[Dict[str, Any], Dict[str, Any]], Dict[str, Any]]]

