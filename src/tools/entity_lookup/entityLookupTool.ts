import {CatoMcpToolWrapper, McpToolDef, McpToolDefContext} from "../common/catoMcpTool.js";

const MAX_LIMIT = 1000;

export function buildEntityLookupTool(ctx: McpToolDefContext): CatoMcpToolWrapper {

    const toolDef: McpToolDef = {
        name: "entity_lookup",
        description: "Lookup entities with a specific type, potentially filtered and paged.",
        inputSchema: {
            type: "object",
            properties: {
                accountID: {
                    type: "string",
                    description: "The account ID (or 0 for non-authenticated requests)",
                    default: ctx.accountId
                },
                type: {
                    type: "string",
                    enum: Object.values(EntityType),
                    description: "Type of entity to lookup for"
                },
                parent: {
                    type: "object",
                    properties: {
                        id: {
                            type: "string",
                            description: "ID of the parent entity (Required)"
                        },
                        name: {
                            type: "string",
                            description: "Name of the parent entity (Required)"
                        },
                        type: {
                            type: "string",
                            enum: Object.values(EntityType),
                            description: "Type of the parent entity (Required)"
                        }
                    },
                    description: `Return items under a parent entity (can be site, vpn user, etc),
                    used to filter for networks that belong to a specific site for example`,
                    required: ["id", "name", "type"]
                },
                entityIDs: {
                    type: "array",
                    items: { type: "string" },
                    description: `Adds additional search criteria to fetch by the selected list of entity IDs. This option is not
		            universally available, and may not be applicable specific Entity types. If used on non applicable entity
		            type, an error will be generated.. when using this parameter, pass the value as json array, examples: [\"12345\"], [\"12345\", \"98765\"]`
                },
                search: {
                    type: "string",
                    description: `Adds additional search parameters for the lookup.
                        Available options: country lookup: "removeExcluded" to return only allowed countries
                        countryState lookup: country code ("US", "CN", etc) to get country's states`
                },
                filters: {
                    type: "array",
                    items: {
                        type: "object",
                        properties: {
                            filter: {
                                type: "string",
                                enum: lookupFilterTypes,
                                description: "entityLookup filter type"
                            },
                            value: {
                                type: "string",
                                description: "Value to filter by"
                            }
                        },
                        required: ["filter", "value"],
                    },
                },
                sort: {
                    type: "array",
                    items: {
                        type: "object",
                        properties: {
                            field: {
                                type: "string",
                                description: "Field to sort by"
                            },
                            order: {
                                type: "string",
                                enum: ["asc", "desc"],
                                description: "Sort order"
                            }
                        },
                        required: ["field", "order"],
                    },
                    description: `Adds additional sort criteria(s) for the lookup.
                        This option is not universally available, and may not be applicable specific Entity types.`
                },
                from: {
                    type: "number",
                    description: "Sets the offset number of items (for paging)"
                },
                limit: {
                    type: "number",
                    description: "Sets the maximum number of items to retrieve"
                },
                helperFields: {
                    type: "array",
                    items: {
                        type: "string"
                    },
                    description: "Additional helper fields"
                }
            },
            required: ["accountID", "type"],
            additionalProperties: false,
            $schema: "http://json-schema.org/draft-07/schema#"
        }
    };

    return {
        toolDef:toolDef,
        gqlQuery: gqlQuery,
        inputHandler: handleVariables,
        responseHandler: handleResponse,
    };
}

function handleVariables(variables: Record<string, any>): Record<string, any> {
    if (variables.limit === undefined || variables.limit > MAX_LIMIT) {
        variables.limit = MAX_LIMIT;
    }
    return variables;
}

function handleResponse(variables: Record<string, any>, response: any): any {
    if (response.data.entityLookup) {
        const from = variables.from as number || 0;
        const total = response.data.entityLookup.total;
        const itemsCount = response.data.entityLookup.items.length

        // notify the user - if didn't use paging, and asked for MAX_LIMIT (or more) items, and didn't get all items
        if (from === 0 && variables.limit === MAX_LIMIT && itemsCount < total) {
            response.errors = [{
                message: `Clearly and politely notify the user that in order to comply with the models context window, the amount of entities was limited to ${variables.limit} out of ${total} items`,
                path: ["entityLookup"]
            }]
        }
    }
    return response;
}

enum EntityType {
    // A reference to a configured Account under reseller
    Account = 'account',
    // An account administrator (user in Cato Console)
    Admin = 'admin',
    // An external IP address in a specific PoP reserved for the account
    AllocatedIP = 'allocatedIP',
    // Any entity (matches everything)
    Any = 'any',
    // Pooled licenses available for use
    AvailablePooledUsage = 'availablePooledUsage',
    // Site licenses available for use
    AvailableSiteUsage = 'availableSiteUsage',
    // A settlement with over 1K population
    City = 'city',
    // Geographical and political entity recognized internationally
    Country = 'country',
    // Represents a state or territory within a country. It is a sub-division of the country
    CountryState = 'countryState',
    // A reference to DHCP Relay Group within account
    DhcpRelayGroup = 'dhcpRelayGroup',
    GroupSubscription = 'groupSubscription',
    // A reference to the configured Host within Site
    Host = 'host',
    // A reference to LAN Firewall Rule within Site
    LanFirewall = 'lanFirewall',
    // A reference to Local Routing Rule within Site
    LocalRouting = 'localRouting',
    Location = 'location',
    MailingListSubscription = 'mailingListSubscription',
    // A reference to the configured Network Interface within Site
    NetworkInterface = 'networkInterface',
    // Combination of protocol (TCP, UDP, TCP/UDP, ICMP) and port number
    PortProtocol = 'portProtocol',
    // l4 services for LAN firewall rules
    SimpleService = 'simpleService',
    // A reference to a configured Site within Account
    Site = 'site',
    // Union of the globalRange and a Subnet
    SiteRange = 'siteRange',
    // Time zone, which is a geographical region where clocks are set to the same time
    Timezone = 'timezone',
    // A reference to the configured VPN User within Account
    VpnUser = 'vpnUser',
    WebhookSubscription = 'webhookSubscription'
}

const lookupFilterTypes = [
    'filterByConnectionTypeFamily', 'filterByConnectionType', 'filterByAltWan',
    'filterByBackhaulingGW', 'filterByOffCloudTransportEnabled', 'country', 'state',
]

const gqlQuery = `
query entityLookup(
    $accountID: ID!
    $type: EntityType!
    $limit: Int = ${MAX_LIMIT}
    $from: Int = 0
    $parent: EntityInput
    $search: String = ""
    $sort: [SortInput]
    $entityIDs: [ID!]
    $filters: [LookupFilterInput]
    $helperFields: [String!]
    ) {
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
        ) {
            items {
                entity {
                    id
                    type
                    name
                }
                description
                helperFields
            }
            total
        }
    }
`
