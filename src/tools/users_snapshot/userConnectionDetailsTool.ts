import {CatoMcpToolWrapper, McpToolDef, McpToolDefContext} from "../common/catoMcpTool.js";

export function buildUserConnectionDetailsTool(ctx: McpToolDefContext): CatoMcpToolWrapper {
    const toolDef: McpToolDef = {
        name: "user_connection_details",
        description: `Retrieves detailed connection information for all currently connected VPN users (both remote and in-office).
            This tool can be used to answer questions about how long specific users have been connected, their account status, and other session details.
            This tool provides specific details about user connections from the Account Snapshot. For each connected user, it returns 'connectivityStatus', 'operationalStatus' (e.g., active, pending_mfa_configuration), 'deviceName', 'uptime' (current session), 'lastConnected' timestamp, client 'version', 'osType', 'popName', and 'connectedInOffice' status.
            By default, this tool returns data for all connected VPN users. It does not return information for disconnected users.

            To get information about disconnected users: First use the entity_lookup tool with type 'vpnUser' to retrieve user IDs, then call this tool with the 'userIDs' parameter to get details for those specific users (regardless of connection status).
        
            Example questions this tool can help answer:
            - "How long has the user 'John Doe' been connected in their current session ('uptime')?"
            - "Which users have an 'operationalStatus' of 'pending_mfa_configuration' or 'pending_user_configuration'?"
            - "List all users who have been connected for more than 24 hours ('uptime') and the 'popName' they are connected to."

            Returns:
                A dictionary containing connection details for all connected users (or specified users if userIDs provided), or an error.`,
        inputSchema: {
            type: "object",
            properties: {
                accountID: {
                    type: "string",
                    description: "Unique identifier for the customer account.",
                    default: ctx.accountId
                },
                userIDs: {
                    type: "array",
                    items: { type: "string" },
                    description: "Optional list of specific user IDs to retrieve. If provided, returns details for these users regardless of connection status. If omitted, returns all connected users."
                },
                user_name_or_id: {
                    type: "string",
                    description: "Optional user name or ID to focus on. This is a hint for the client-side LLM, not used for filtering within the tool."
                }
            },
            required: ["accountID"],
            additionalProperties: false,
            $schema: "http://json-schema.org/draft-07/schema#"
        }
    };

    return {
        toolDef: toolDef,
        gqlQuery: gqlQuery,
        responseHandler: handleResponse,
    }
}


const gqlQuery = `
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
`

function handleResponse(variables: Record<string, any>, response: any): any {
    if (variables.user_name_or_id) {
        response.data.user_name_filter = variables.user_name_or_id || null;
    }
    if (variables.userIDs && variables.userIDs.length > 0) {
        response.data.userIDs_filter_applied = variables.userIDs;
        response.data.note = `Filtered results for ${variables.userIDs.length} specific user ID(s). This includes users regardless of connection status.`;
    } else {
        response.data.note = "Showing all connected users only. To see disconnected users, use entity_lookup tool first to get user IDs, then call this tool with userIDs parameter.";
    }
    return response
}
