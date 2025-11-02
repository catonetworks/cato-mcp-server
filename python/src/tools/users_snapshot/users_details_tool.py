"""
User details tool
"""
from typing import Any, Dict
from ..common.cato_mcp_tool import CatoMcpToolWrapper, McpToolDef, McpToolDefContext
from .user_utils import is_valid_response, empty_users_response


def build_users_details_tool(ctx: McpToolDefContext) -> CatoMcpToolWrapper:
    """
    Build the user details tool.
    
    Args:
        ctx: The tool definition context
        
    Returns:
        The tool wrapper
    """
    tool_def: McpToolDef = {
        "name": "user_details",
        "description": """Retrieves two comprehensive lists from the Account Snapshot: 'remoteUsers' which returns all connected remote VPN users and 'inOfficeUsers' that returns all connected VPN users in office. 
            When asked about all the connected users in the account, consider the users from both lists. This tool only returns currently connected users by default.
            For each user in the snapshot, it returns: name, popName, connectedInOffice, osType and client version. 
            If the connectedInOffice parameter is true the user is in-office, meaning their client uses the office's socket connection; when False it is considered a remote user. 
            
            To get information about disconnected users: First use the entity_lookup tool with type 'vpnUser' to retrieve user IDs, then call this tool with the 'userIDs' parameter to get details for those specific users (regardless of connection status).
            
            In addition to individual user data, this tool also calculates and returns the following aggregate metrics:
            totalUsersCount: Total number of connected VPN users in the snapshot
            remoteUsersCount: Number of VPN users currently connected not in an office (connectedInOffice: false)
            inOfficeUsersCount: Number of VPN users currently connected from an office (connectedInOffice: true)
            
            This makes the tool ideal for both granular user inspection and high-level analysis of connectivity trends across the organization.
            It does NOT return information about disconnected users or non-VPN users connected to a site's network.
            
            Example questions this tool can help answer:
            
            How many total VPN users are connected?
            Show a full list of VPN users and whether they are connected in office or remotely
            List all remote VPN users along with their PoP and OS details
            Which PoP currently has the highest number of active remote users?
            Show me how many users per PoP name are currently connected?
            What are the most common operating systems among our in-office users?
            Which PoP location currently has the highest number of connected remote users?
            Are there any remote users connected via PoP 'London-PoP' right now?
        """,
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
query remoteUsersDetails($accountID: ID!, $userIDs: [ID!]) {
  accountSnapshot(accountID: $accountID) {
    id
    timestamp
    users(userIDs: $userIDs) {
      id
      name
      popName
      connectivityStatus
      connectedInOffice
      osType
      version
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
    if not is_valid_response(variables.get("accountID", ""), response):
        return empty_users_response(response.get("data", {}).get("accountSnapshot", {}).get("timestamp", ""))
    
    all_users = response["data"]["accountSnapshot"]["users"]
    connected_users = [user for user in all_users if user.get("connectivityStatus") == 'connected']
    remote_users = [user for user in connected_users if not user.get("connectedInOffice")]
    in_office_users = [user for user in connected_users if user.get("connectedInOffice")]
    
    users_count_per_pop_name: Dict[str, int] = {}
    
    for user in connected_users:
        pop_name = user.get("popName") or "Unknown"
        users_count_per_pop_name[pop_name] = users_count_per_pop_name.get(pop_name, 0) + 1
    
    note = ""
    if variables.get("userIDs") and len(variables.get("userIDs", [])) > 0:
        note = f"Filtered results for {len(variables['userIDs'])} specific user ID(s). This includes users regardless of connection status. Connected users are split into remote/in-office categories."
    else:
        note = "Showing all connected users only. To see disconnected users, use entity_lookup tool first to get user IDs, then call this tool with userIDs parameter."
    
    return {
        "data": {
            "accountSnapshotTimestamp": response["data"]["accountSnapshot"]["timestamp"],
            "totalUsersCount": len(connected_users),
            "totalRequestedUsers": len(all_users),
            "remoteUsers": remote_users,
            "remoteUsersCount": len(remote_users),
            "inOfficeUsers": in_office_users,
            "inOfficeUsersCount": len(in_office_users),
            "usersCountPerPopName": users_count_per_pop_name,
            "note": note,
            "userIDs_filter_applied": variables.get("userIDs") or None
        }
    }

