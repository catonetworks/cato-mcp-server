import {CatoMcpToolWrapper, McpToolDef, McpToolDefContext} from "../common/catoMcpTool.js";

export function buildUserConnectionDetailsTool(ctx: McpToolDefContext): CatoMcpToolWrapper {
    const toolDef: McpToolDef = {
        name: "user_connection_details",
        description: `Retrieves detailed connection information for VPN users, including
            connection duration, status, device details, and operational status.
            Can be used to answer questions about how long specific users have been
            connected and their account status.
            This tool provides specific details about user connections from the Account Snapshot. For each user, it returns
            \`connectivityStatus\`, \`operationalStatus\` (e.g., active, pending_mfa_configuration), \`deviceName\`, \`uptime\` (current session),
            \`lastConnected\` timestamp, client \`version\`, \`osType\`, \`popName\`, and \`connectedInOffice\` status. 
            The \`user_name_or_id\` parameter is a hint for the client-side LLM if analysis needs to focus on a particular user, 
            but the tool itself returns data for all users. This is useful for investigating individual user connectivity, 
            session durations, and account provisioning states.
        
            Example questions this tool can help answer:
            - "How long has the user 'John Doe' been connected in their current session (\`uptime\`)?"
            - "Which users have an \`operationalStatus\` of 'pending_mfa_configuration' or 'pending_user_configuration'?"
            - "List all users who have been connected for more than 24 hours (\`uptime\`) and the \`popName\` they are connected to."
            - "What was the \`lastConnected\` time for users who are currently disconnected?"
        
                : Optional user name or ID to focus on. This is a hint for the
                                 client-side LLM, not used for filtering within the tool.
            Returns:
                A dictionary containing user connection details, or an error.`,
        inputSchema: {
            type: "object",
            properties: {
                accountID: {
                    type: "string",
                    description: "Unique identifier for the customer account.",
                    default: ctx.accountId
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
query userConnectionDetails($accountID: ID!) {
  accountSnapshot(accountID: $accountID) {
    id
    timestamp
    users {
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
    return response
}
