"""
Main entry point for Cato MCP Server
"""
import asyncio
import json
import signal
import sys
from typing import Any, Callable, Dict, Optional

from mcp.server import Server  # type: ignore[import-untyped]
from mcp.server.stdio import stdio_server  # type: ignore[import-untyped]
from mcp.types import (  # type: ignore[import-untyped]
    CallToolRequest,
    CallToolResult,
    ListToolsRequest,
    ListToolsResult,
    TextContent,
    LoggingLevel,
)

from .utils.env import get_env_variable
from .utils.mcp_logger import init_mcp_logger, log
from .tools.tools import find_mcp_tool, get_cato_mcp_tools, init_cato_mcp_tool_wrappers
from .graphql.graphql import initialize_graphql_client, execute_graphql_request


# the mcp server
_mcp_server: Optional[Server] = None

# cato accountId
_account_id: str = ""


def build_mcp_server() -> Server:
    """
    Build the MCP server.
    
    Returns:
        The MCP server instance
    """
    return Server(
        name="cato-mcp-server",
        version="1.0.0",
    )


def extract_tool_default_values(tool_name: str) -> Dict[str, Any]:
    """
    Extract default values from tool schema properties.
    
    Args:
        tool_name: The name of the tool
        
    Returns:
        Dictionary of default values
    """
    variables: Dict[str, Any] = {}
    
    # Get the tool definition to access default values
    tool = find_mcp_tool(tool_name)
    tool_properties = tool["toolDef"]["inputSchema"].get("properties", {})
    
    # Apply default values from the schema
    for prop_name, prop_def in tool_properties.items():
        if isinstance(prop_def, dict) and "default" in prop_def:
            variables[prop_name] = prop_def["default"]
            log("debug", f"Applied default for {prop_name}: {prop_def['default']}")
    
    return variables


def llm_provided_variables_override(
    variables_default_values: Dict[str, Any],
    tool_name: str,
    mcp_tool_request_arguments: Optional[Dict[str, Any]]
) -> Dict[str, Any]:
    """
    Override default variables with LLM-provided arguments.
    
    Args:
        variables_default_values: The default variables from tool schema
        tool_name: The name of the tool (for error reporting)
        mcp_tool_request_arguments: The MCP tool invocation request arguments
        
    Returns:
        Variables dictionary with overrides applied
    """
    variables = variables_default_values.copy()
    
    # Override with provided arguments
    if mcp_tool_request_arguments:
        for arg_name, arg_value in mcp_tool_request_arguments.items():
            if arg_value is not None:
                # Handle JSON strings
                if isinstance(arg_value, str) and (arg_value.strip().startswith('{') or arg_value.strip().startswith('[')):
                    try:
                        arg_value = json.loads(arg_value)
                    except json.JSONDecodeError as e:
                        raise ValueError(f"Error parsing {tool_name} tool argument {arg_name} with value {arg_value}: {e}")
                
                variables[arg_name] = arg_value
                log("debug", f"Override {arg_name} with provided value: {arg_value}")
    
    return variables


def prepare_graphql_variables(
    tool_name: str,
    mcp_tool_request_arguments: Optional[Dict[str, Any]],
    input_handler: Optional[Callable[[Dict[str, Any]], Dict[str, Any]]] = None
) -> Dict[str, Any]:
    """
    Prepare the GraphQL variables for the request.
    
    Args:
        tool_name: The name of the tool
        mcp_tool_request_arguments: The MCP tool invocation request arguments
        input_handler: An optional input handler to modify the variables before sending the request
        
    Returns:
        Prepared variables dictionary
    """
    variables_default_values = extract_tool_default_values(tool_name)
    variables_with_overrides = llm_provided_variables_override(
        variables_default_values,
        tool_name,
        mcp_tool_request_arguments
    )
    
    if not input_handler:
        return variables_with_overrides
    
    handled_variables = input_handler(variables_with_overrides)
    log("debug", f"Variables after inputHandler: {json.dumps(handled_variables)}")
    return handled_variables


def initialize_account_id() -> None:
    """
    Initialize the default accountId.
    """
    global _account_id
    _account_id = get_env_variable("CATO_ACCOUNT_ID")


def setup_graceful_shutdown() -> None:
    """
    Setup graceful shutdown for the MCP server.
    """
    def shutdown_handler(signum: int, frame: Any) -> None:
        signal_name = "SIGTERM" if signum == signal.SIGTERM else "SIGINT"
        try:
            log("info", f"Received {signal_name}. Shutting down MCP server gracefully...")
            sys.exit(0)
        except Exception as error:
            log("error", f"Error during shutdown: {error}")
            sys.exit(1)
    
    # Listen for termination signals
    signal.signal(signal.SIGTERM, shutdown_handler)
    signal.signal(signal.SIGINT, shutdown_handler)


async def main() -> None:
    """
    Main entry point for the MCP server.
    """
    try:
        # Initialize cato accountId
        initialize_account_id()
        
        # Initialize cato GraphQL client
        initialize_graphql_client()
        
        # Build cato MCP server
        server = build_mcp_server()
        init_mcp_logger(server)
        init_cato_mcp_tool_wrappers(_account_id)
        
        # Setup signal handlers
        setup_graceful_shutdown()
    except Exception as error:
        print(f"Error during initialization: {error}", file=sys.stderr)
        import traceback
        traceback.print_exc(file=sys.stderr)
        raise
    
    # Register tools
    @server.list_tools()
    async def list_tools(request: ListToolsRequest) -> ListToolsResult:
        """
        List all available tools.
        
        Args:
            request: The list tools request
            
        Returns:
            List of tools
        """
        tools = get_cato_mcp_tools()
        return ListToolsResult(tools=tools)
    
    @server.call_tool()
    async def call_tool(tool_name: str, request: CallToolRequest) -> CallToolResult:
        """
        Handle tool call.
        
        Args:
            tool_name: The name of the tool
            request: The tool call request
            
        Returns:
            Tool call result
        """
        try:
            # Access arguments based on request structure
            # The error suggests request might be a dict, so check that first
            if isinstance(request, dict):
                # Try params.arguments first (matching TypeScript pattern), then top-level arguments
                tool_arguments = request.get('params', {}).get('arguments') or request.get('arguments') or {}
            elif hasattr(request, 'params') and hasattr(request.params, 'arguments'):
                tool_arguments = request.params.arguments or {}
            elif hasattr(request, 'arguments'):
                tool_arguments = request.arguments or {}
            else:
                tool_arguments = {}
            log("info", f"Executing {tool_name} query with args: {json.dumps(tool_arguments)}")
            
            # Find the tool to execute
            tool = find_mcp_tool(tool_name)
            
            graphql_variables = prepare_graphql_variables(
                tool_name,
                tool_arguments,
                tool.get("inputHandler")
            )
            log("debug", f"GraphQL request variables: {json.dumps(graphql_variables)}")
            
            tool_response = await execute_graphql_request(
                tool["gqlQuery"],
                graphql_variables,
                tool.get("responseHandler")
            )
            
            # Return the data
            return CallToolResult(
                content=[TextContent(type="text", text=tool_response)]
            )
        except Exception as error:
            log("error", f"Error executing {tool_name} tool: {error}")
            return CallToolResult(
                content=[TextContent(
                    type="text",
                    text=json.dumps({
                        "errors": {
                            "message": f"Error executing tool: {str(error)}"
                        }
                    })
                )]
            )
    
    # Start cato MCP server
    print("Starting MCP server...", file=sys.stderr)
    try:
        async with stdio_server() as (read_stream, write_stream):
            print("MCP server started, waiting for messages...", file=sys.stderr)
            await server.run(
                read_stream,
                write_stream,
                server.create_initialization_options()
            )
    except Exception as error:
        print(f"Error in server.run(): {error}", file=sys.stderr)
        import traceback
        traceback.print_exc(file=sys.stderr)
        raise


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("Server interrupted by user", file=sys.stderr)
        sys.exit(0)
    except Exception as error:
        import traceback
        print(f"Fatal error in main(): {error}", file=sys.stderr)
        traceback.print_exc(file=sys.stderr)
        sys.exit(1)
