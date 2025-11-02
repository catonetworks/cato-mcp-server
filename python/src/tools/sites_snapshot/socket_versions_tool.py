"""
Socket versions tool
"""
from typing import Any, Dict
from ..common.cato_mcp_tool import CatoMcpToolWrapper, McpToolDef, McpToolDefContext
from .site_utils import is_valid_response, empty_sites_response


def build_socket_versions_tool(ctx: McpToolDefContext) -> CatoMcpToolWrapper:
    """
    Build the socket versions tool.
    
    Args:
        ctx: The tool definition context
        
    Returns:
        The tool wrapper
    """
    tool_def: McpToolDef = {
        "name": "socket_versions",
        "description": """Retrieves information about socket/device versions across all sites.
            This data can be used to identify sites that need socket upgrades, sites with socket versions below a threshold.
            For sites, it includes `device.version` and `socketInfo.version` for individual sockets, along with `haStatus.socketVersion` for HA pairs. 
        
            Example questions this tool can help answer:
            - "Which sites have sockets whose software (`socketInfo.version`) was last updated before '2023-06-01T00:00:00Z'?"
            - "Are there any sites where the HA `socketVersion` indicates a mismatch between primary and secondary sockets?"
        
            Returns:
                A dictionary containing site version information, or an error.""",
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
    sites {
      id
      connectivityStatus
      operationalStatus
      info {
        name
        type
      }
      devices {
        id
        connected
        version
        haRole
        socketInfo {
          id
          isPrimary
          platform
          serial
          version
          versionUpdateTime
        }
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
    if not is_valid_response(variables.get("accountID", ""), response):
        return empty_sites_response(response.get("data", {}).get("accountSnapshot", {}).get("timestamp", ""))
    
    all_sites = response["data"]["accountSnapshot"]["sites"]
    socket_count_by_version: Dict[str, int] = {}
    
    for site in all_sites:
        for device in site.get("devices", []):
            socket_info = device.get("socketInfo")
            if socket_info and socket_info.get("version"):
                socket_version = socket_info["version"]
                socket_count_by_version[socket_version] = socket_count_by_version.get(socket_version, 0) + 1
    
    return {
        "data": {
            "accountSnapshotTimestamp": response["data"]["accountSnapshot"]["timestamp"],
            "sites": all_sites,
            "sitesCount": len(all_sites),
            "socketCountByVersion": socket_count_by_version,
        }
    }

