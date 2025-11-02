"""
Entity lookup tool
"""
from typing import Any, Dict
from ..common.cato_mcp_tool import CatoMcpToolWrapper, McpToolDef, McpToolDefContext


MAX_LIMIT = 1000


class EntityType:
    """Entity types enum"""
    # A reference to a configured Account under reseller
    Account = 'account'
    # An account administrator (user in Cato Console)
    Admin = 'admin'
    # An external IP address in a specific PoP reserved for the account
    AllocatedIP = 'allocatedIP'
    # Any entity (matches everything)
    Any = 'any'
    # Pooled licenses available for use
    AvailablePooledUsage = 'availablePooledUsage'
    # Site licenses available for use
    AvailableSiteUsage = 'availableSiteUsage'
    # A settlement with over 1K population
    City = 'city'
    # Geographical and political entity recognized internationally
    Country = 'country'
    # Represents a state or territory within a country. It is a sub-division of the country
    CountryState = 'countryState'
    # A reference to DHCP Relay Group within account
    DhcpRelayGroup = 'dhcpRelayGroup'
    GroupSubscription = 'groupSubscription'
    # A reference to the configured Host within Site
    Host = 'host'
    # A reference to LAN Firewall Rule within Site
    LanFirewall = 'lanFirewall'
    # A reference to Local Routing Rule within Site
    LocalRouting = 'localRouting'
    Location = 'location'
    MailingListSubscription = 'mailingListSubscription'
    # A reference to the configured Network Interface within Site
    NetworkInterface = 'networkInterface'
    # Combination of protocol (TCP, UDP, TCP/UDP, ICMP) and port number
    PortProtocol = 'portProtocol'
    # l4 services for LAN firewall rules
    SimpleService = 'simpleService'
    # A reference to a configured Site within Account
    Site = 'site'
    # Union of the globalRange and a Subnet
    SiteRange = 'siteRange'
    # Time zone, which is a geographical region where clocks are set to the same time
    Timezone = 'timezone'
    # A reference to the configured VPN User within Account
    VpnUser = 'vpnUser'
    WebhookSubscription = 'webhookSubscription'


LOOKUP_FILTER_TYPES = [
    'filterByConnectionTypeFamily', 'filterByConnectionType', 'filterByAltWan',
    'filterByBackhaulingGW', 'filterByOffCloudTransportEnabled', 'country', 'state',
]


GQL_QUERY = f"""
query entityLookup(
    $accountID: ID!
    $type: EntityType!
    $limit: Int = {MAX_LIMIT}
    $from: Int = 0
    $parent: EntityInput
    $search: String = ""
    $sort: [SortInput]
    $entityIDs: [ID!]
    $filters: [LookupFilterInput]
    $helperFields: [String!]
    ) {{
        entityLookup(
            accountID: $accountID
            type: $type
            limit: $limit
            from: $from
            parent: $parent
            search: $search
            sort: $sort
            entityIDs: $entityIDs
            filters: $filters
            helperFields: $helperFields
        ) {{
            items {{
                entity {{
                    id
                    type
                    name
                }}
                description
                helperFields
            }}
            total
        }}
    }}
"""


def build_entity_lookup_tool(ctx: McpToolDefContext) -> CatoMcpToolWrapper:
    """
    Build the entity lookup tool.
    
    Args:
        ctx: The tool definition context
        
    Returns:
        The tool wrapper
    """
    tool_def: McpToolDef = {
        "name": "entity_lookup",
        "description": "Lookup entities with a specific type, potentially filtered and paged. This tool can be used as a helper tool to get the IDs of entities that are relevant to the user's request.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "accountID": {
                    "type": "string",
                    "description": "The account ID (or 0 for non-authenticated requests)",
                    "default": ctx["accountId"]
                },
                "type": {
                    "type": "string",
                    "enum": [v for k, v in EntityType.__dict__.items() if not k.startswith('_') and isinstance(v, str)],
                    "description": "Type of entity to lookup for"
                },
                "parent": {
                    "type": "object",
                    "properties": {
                        "id": {
                            "type": "string",
                            "description": "ID of the parent entity (Required)"
                        },
                        "name": {
                            "type": "string",
                            "description": "Name of the parent entity (Required)"
                        },
                        "type": {
                            "type": "string",
                            "enum": [v for k, v in EntityType.__dict__.items() if not k.startswith('_') and isinstance(v, str)],
                            "description": "Type of the parent entity (Required)"
                        }
                    },
                    "description": """Return items under a parent entity (can be site, vpn user, etc),
                    used to filter for networks that belong to a specific site for example""",
                    "required": ["id", "name", "type"]
                },
                "entityIDs": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": """Adds additional search criteria to fetch by the selected list of entity IDs. This option is not
		            universally available, and may not be applicable specific Entity types. If used on non applicable entity
		            type, an error will be generated.. when using this parameter, pass the value as json array, examples: ["12345"], ["12345", "98765"]"""
                },
                "search": {
                    "type": "string",
                    "description": """Adds additional search parameters for the lookup.
                        Available options: country lookup: "removeExcluded" to return only allowed countries
                        countryState lookup: country code ("US", "CN", etc) to get country's states"""
                },
                "filters": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "filter": {
                                "type": "string",
                                "enum": LOOKUP_FILTER_TYPES,
                                "description": "entityLookup filter type"
                            },
                            "value": {
                                "type": "string",
                                "description": "Value to filter by"
                            }
                        },
                        "required": ["filter", "value"],
                    },
                },
                "sort": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "field": {
                                "type": "string",
                                "description": "Field to sort by"
                            },
                            "order": {
                                "type": "string",
                                "enum": ["asc", "desc"],
                                "description": "Sort order"
                            }
                        },
                        "required": ["field", "order"],
                    },
                    "description": """Adds additional sort criteria(s) for the lookup.
                        This option is not universally available, and may not be applicable specific Entity types."""
                },
                "from": {
                    "type": "number",
                    "description": "Sets the offset number of items (for paging), needs to be in jumps of 1000 (in case the first page is 0, the next page is 1000, etc)",
                },
                "limit": {
                    "type": "number",
                    "description": "Sets the maximum number of items to retrieve",
                    "default": 1000
                },
                "helperFields": {
                    "type": "array",
                    "items": {
                        "type": "string"
                    },
                    "description": "Additional helper fields"
                }
            },
            "required": ["accountID", "type"],
            "additionalProperties": False,
            "schema": "http://json-schema.org/draft-07/schema#"
        }
    }
    
    return {
        "toolDef": tool_def,
        "gqlQuery": GQL_QUERY,
        "inputHandler": _handle_variables,
        "responseHandler": _handle_response,
    }


def _handle_variables(variables: Dict[str, Any]) -> Dict[str, Any]:
    """
    Handle input variables.
    
    Args:
        variables: The input variables
        
    Returns:
        Processed variables
    """
    if variables.get("limit") is None or variables.get("limit") > MAX_LIMIT:
        variables["limit"] = MAX_LIMIT
    return variables


def _handle_response(variables: Dict[str, Any], response: Dict[str, Any]) -> Dict[str, Any]:
    """
    Handle response.
    
    Args:
        variables: The input variables
        response: The GraphQL response
        
    Returns:
        Processed response
    """
    entity_lookup = response.get("data", {}).get("entityLookup")
    if entity_lookup:
        from_val = variables.get("from", 0) or 0
        total = entity_lookup.get("total", 0)
        items_count = len(entity_lookup.get("items", []))
        
        # notify the user - if didn't use paging, and asked for MAX_LIMIT (or more) items, and didn't get all items
        if from_val == 0 and variables.get("limit") == MAX_LIMIT and items_count < total:
            if "errors" not in response:
                response["errors"] = []
            response["errors"].append({
                "message": f"Clearly and politely notify the user that in order to comply with the models context window, the amount of entities was limited to {variables.get('limit')} out of {total} items",
                "path": ["entityLookup"]
            })
    
    return response

