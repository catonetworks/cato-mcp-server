"""
Site types tool
"""
from typing import Any, Dict
from ..common.cato_mcp_tool import CatoMcpToolWrapper, McpToolDef, McpToolDefContext
from .site_utils import is_valid_response, empty_sites_response


def build_site_types_tool(ctx: McpToolDefContext) -> CatoMcpToolWrapper:
    """
    Build the site types tool.
    
    Args:
        ctx: The tool definition context
        
    Returns:
        The tool wrapper
    """
    tool_def: McpToolDef = {
        "name": "site_types",
        "description": """Retrieves detailed information about all sites including their connection types.
            This data can be used to answer questions about how many sites use different
            connection methods (IPsec, Socket, vSocket, etc.), and to group sites by type.
            Also includes site creation time and device uptime for broader analysis.
            This tool gathers comprehensive data on all sites from the Account Snapshot, focusing on their `connType` 
            (e.g., SOCKET_X1500, IPSEC_V2), `info.type` (e.g., BRANCH, DATACENTER), `creationTime`, and `deviceUptime` 
            for primary HA devices. It also includes `hostCount` per site. This enables analysis of site infrastructure, 
            deployment age, operational stability of HA primary devices, and site capacity in terms of hosts.
        
            Example questions this tool can help answer:
            - "Can you provide a list of all sites, grouped by their connection type (e.g., IPsec, Socket, vSocket)?"
            - "How many sites of type 'BRANCH' are currently connected using 'SOCKET_X1700' connection type?"
            - "Which sites were created in the last 90 days and what is their current `operationalStatus`?"
            - "What is the average `deviceUptime` for 'PRIMARY' sockets in HA-enabled sites that are currently connected?"
            - "List all unique `socketInfo.platform` types present across all sites and the number of sites using each platform type."
        
            Returns:
                A dictionary containing a list of sites with their type information, or an error.""",
        "inputSchema": {
            "type": "object",
            "properties": {
                "accountID": {
                    "type": "string",
                    "description": "Unique identifier for the customer account.",
                    "default": ctx["accountId"]
                },
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
query siteTypes($accountID: ID!) {
  accountSnapshot(accountID: $accountID) {
    id
    timestamp
    sites {
      id
      connectivityStatus
      operationalStatus
      popName
      hostCount
      info {
        name
        type
        description
        countryName
        connType
        isHA
        creationTime 
      }
      devices {
        id
        connected
        version
        haRole
        deviceUptime 
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
    sites_count_by_type: Dict[str, int] = {}
    
    for site in all_sites:
        site_type = site.get("info", {}).get("type") or "Unknown"
        sites_count_by_type[site_type] = sites_count_by_type.get(site_type, 0) + 1
    
    return {
        "data": {
            "accountSnapshotTimestamp": response["data"]["accountSnapshot"]["timestamp"],
            "sites": all_sites,
            "sitesCount": len(all_sites),
            "sitesCountPerType": sites_count_by_type,
        }
    }

