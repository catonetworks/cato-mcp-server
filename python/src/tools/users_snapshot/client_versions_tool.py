"""
Client versions tool
"""
from typing import Any, Dict
from ..common.cato_mcp_tool import CatoMcpToolWrapper, McpToolDef, McpToolDefContext
from .user_utils import is_valid_response, empty_users_response


def build_client_versions_tool(ctx: McpToolDefContext) -> CatoMcpToolWrapper:
    """
    Build the client versions tool.
    
    Args:
        ctx: The tool definition context
        
    Returns:
        The tool wrapper
    """
    tool_def: McpToolDef = {
        "name": "user_software_versions",
        "description": """Retrieves information about client software versions for all currently connected VPN users (both remote and in-office).
            This data can be used to identify users running older client versions.
            This tool provides data on users' software and client versions from the Account Snapshot. It returns the 'version' (client version string), 'versionNumber' (numeric client version), and 'osType' for each connected user.
            This tool does not return information for disconnected users.
        
            Example questions this tool can help answer:
            - "Which users are running a client `versionNumber` less than 80000000, and what is their `deviceName` and `osType`?"
            - "Could you provide a list of all connected users grouped by their `osType` and then by client `version`?"
        
            Returns:
                A dictionary containing user version information, or an error.""",
        "inputSchema": {
            "type": "object",
            "properties": {
                "accountID": {
                    "type": "string",
                    "description": "Unique identifier for the customer account.",
                    "default": ctx["accountId"]
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
query socketAndClientVersions($accountID: ID!) {
  accountSnapshot(accountID: $accountID) {
    id
    timestamp
    users {
      id
      name
      connectivityStatus
      deviceName
      version
      versionNumber
      osType
      connectedInOffice
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
    user_count_by_version: Dict[str, int] = {}
    
    for user in all_users:
        version = user.get("version")
        if version:
            user_count_by_version[version] = user_count_by_version.get(version, 0) + 1
    
    return {
        "data": {
            "accountSnapshotTimestamp": response["data"]["accountSnapshot"]["timestamp"],
            "users": all_users,
            "usersCount": len(all_users),
            "userCountByVersion": user_count_by_version,
        }
    }

