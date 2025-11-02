"""
Sites by location tool
"""
from typing import Any, Dict
from ..common.cato_mcp_tool import CatoMcpToolWrapper, McpToolDef, McpToolDefContext
from .site_utils import is_valid_response, empty_sites_response


def build_sites_by_location_tool(ctx: McpToolDefContext) -> CatoMcpToolWrapper:
    """
    Build the sites by location tool.
    
    Args:
        ctx: The tool definition context
        
    Returns:
        The tool wrapper
    """
    tool_def: McpToolDef = {
        "name": "sites_by_location",
        "description": """Retrieves a list of all sites with their geographical location information.
            This data can be used to analyze site distribution by country/PoP,
            or identify locations with degraded sites.
            This tool returns a list of all sites from the Account Snapshot, enriched with geographical location data 
            such as `countryName`, `cityName`, `region`, and the `popName` they are connected to. It also includes 
            `connectivityStatus` and `operationalStatus` for each site. This information is primarily used for 
            geographical analysis of site deployment, identifying site concentrations, and assessing the status of 
            sites within specific regions or connected to particular PoPs.
        
            Example questions this tool can help answer:
            - "Which country currently has the most connected sites, and how many are in an 'operational' state?"
            - "Can you list all sites located in 'Germany', along with their `connectivityStatus` and connected `popName`?"
            - "How many sites are connected to the 'London-PoP', and what is their distribution by `cityName`?"
            - "Show me the PoP locations that have the most sites connected to them right now."
        
            Returns:
                A dictionary containing a list of sites with their location information, or an error.""",
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
query sitesByLocation($accountID: ID!) {
  accountSnapshot(accountID: $accountID) {
    id
    timestamp
    sites {
      id
      connectivityStatus
      operationalStatus
      popName
      haStatus {
        readiness
      }
      info {
        name
        type
        countryName
        countryStateName
        cityName
        region
      }
      devices {
        connected
        interfaces {
          popName
          tunnelRemoteIP
          connected
        }
      }
    }
  }
}
"""


def _build_location_string(site: Dict[str, Any]) -> str:
    """
    Build location string from site info.
    
    Args:
        site: Site dictionary
        
    Returns:
        Location string
    """
    info = site.get("info", {})
    if not info or not info.get("countryName"):
        return "Unknown"
    
    location = info["countryName"]
    if info.get("countryStateName"):
        location += "." + info["countryStateName"]
    if info.get("cityName"):
        location += "." + info["cityName"]
    return location


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
    sites_count_by_pop_name: Dict[str, int] = {}
    sites_count_by_location: Dict[str, int] = {}
    
    for site in all_sites:
        pop_name = site.get("popName") or "Unknown"
        sites_count_by_pop_name[pop_name] = sites_count_by_pop_name.get(pop_name, 0) + 1
        location = _build_location_string(site)
        sites_count_by_location[location] = sites_count_by_location.get(location, 0) + 1
    
    return {
        "data": {
            "accountSnapshotTimestamp": response["data"]["accountSnapshot"]["timestamp"],
            "totalSitesCount": len(all_sites),
            "sitesCountByPopName": sites_count_by_pop_name,
            "sitesCountByLocation": sites_count_by_location
        }
    }

