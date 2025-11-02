"""
User connection details tool
"""
from typing import Any, Dict
from ..common.cato_mcp_tool import CatoMcpToolWrapper, McpToolDef, McpToolDefContext


def build_user_connection_details_tool(ctx: McpToolDefContext) -> CatoMcpToolWrapper:
    """
    Build the user connection details tool.
    
    Args:
        ctx: The tool definition context
        
    Returns:
        The tool wrapper
    """
    tool_def: McpToolDef = {
        "name": "user_connection_details",
        "description": """Retrieves detailed connection information for all currently connected VPN users (both remote and in-office).
            This tool can be used to answer questions about how long specific users have been connected, their account status, and other session details.
            This tool provides specific details about user connections from the Account Snapshot. For each connected user, it returns 'connectivityStatus', 'operationalStatus' (e.g., active, pending_mfa_configuration), 'deviceName', 'uptime' (current session), 'lastConnected' timestamp, client 'version', 'osType', 'popName', and 'connectedInOffice' status.
            By default, this tool returns data for all connected VPN users. It does not return information for disconnected users.

            To get information about disconnected users: First use the entity_lookup tool with type 'vpnUser' to retrieve user IDs, then call this tool with the 'userIDs' parameter to get details for those specific users (regardless of connection status).
        
            Example questions this tool can help answer:
            - "How long has the user 'John Doe' been connected in their current session ('uptime')?"
            - "Which users have an 'operationalStatus' of 'pending_mfa_configuration' or 'pending_user_configuration'?"
            - "List all users who have been connected for more than 24 hours ('uptime') and the 'popName' they are connected to."

            Returns:
                A dictionary containing connection details for all connected users (or specified users if userIDs provided), or an error.""",
        "inputSchema": {
            "type": "object",
            "properties": {
                "accountID": {
                    "type": "string",
                    "description": "Unique identifier for the customer account.",
                    "default": ctx["accountId"]
                },
                "userIDs": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Optional list of specific user IDs to retrieve. If provided, returns details for these users regardless of connection status. If omitted, returns all connected users."
                },
                "user_name_or_id": {
                    "type": "string",
                    "description": "Optional user name or ID to focus on. This is a hint for the client-side LLM, not used for filtering within the tool."
                }
            },
            "required": ["accountID"],
            "additionalProperties": False,
            "schema": "http://json-schema.org/draft-07/schema#"
        }
    }
    
    return {
        "toolDef": tool_def,
        "gqlQuery": GQL_QUERY,
        "responseHandler": _handle_response,
    }


GQL_QUERY = """
query userConnectionDetails($accountID: ID!, $userIDs: [ID!]) {
  accountSnapshot(accountID: $accountID) {
    id
    timestamp
    users(userIDs: $userIDs) {
      id
      name
      connectivityStatus
      operationalStatus 
      deviceName
      uptime
      lastConnected
      version
      osType
      popName
      connectedInOffice
      devices {
        id
        connected
        connectedSince
        lastConnected
        lastDuration
        deviceUptime
        lastPopName
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
    if variables.get("user_name_or_id"):
        if "data" not in response:
            response["data"] = {}
        response["data"]["user_name_filter"] = variables.get("user_name_or_id") or None
    
    if variables.get("userIDs") and len(variables.get("userIDs", [])) > 0:
        if "data" not in response:
            response["data"] = {}
        response["data"]["userIDs_filter_applied"] = variables.get("userIDs")
        response["data"]["note"] = f"Filtered results for {len(variables['userIDs'])} specific user ID(s). This includes users regardless of connection status."
    else:
        if "data" not in response:
            response["data"] = {}
        response["data"]["note"] = "Showing all connected users only. To see disconnected users, use entity_lookup tool first to get user IDs, then call this tool with userIDs parameter."
    
    return response

