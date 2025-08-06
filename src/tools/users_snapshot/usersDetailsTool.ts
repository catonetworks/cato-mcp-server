import {CatoMcpToolWrapper, McpToolDef, McpToolDefContext} from "../common/catoMcpTool.js";
import {emptyUsersResponse, isValidResponse} from "./userUtils.js";

export function buildUsersDetailsTool(ctx: McpToolDefContext): CatoMcpToolWrapper {
    const toolDef: McpToolDef = {
        name: "user_details",
        description: `Retrieves two comprehensive lists from the Account Snapshot: 'remoteUsers' which returns all connected remote VPN users and 'inOfficeUsers' that returns all connected VPN users in office. 
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
        `,
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
      # Include any other UserSnapshot fields that might be useful for the LLM
    }
  }
}
`


function handleResponse(variables: Record<string, any>, response: any): any {
    if (!isValidResponse(variables.accountID, response)) {
        return emptyUsersResponse(response.data?.accountSnapshot?.timestamp);
    }

    const allUsers = response.data.accountSnapshot.users;
    const connectedUsers = allUsers.filter((user: any) => user.connectivityStatus === 'connected');
    const remoteUsers = connectedUsers.filter((user: any) => !user.connectedInOffice);
    const inOfficeUsers = connectedUsers.filter((user: any) => user.connectedInOffice);

    const usersCountPerPopName: Record<string, number> = {};

    for (const user of connectedUsers) {
        const popName = user.popName || "Unknown";
        usersCountPerPopName[popName] = (usersCountPerPopName[popName] || 0) + 1;
    }

    let note = "";
    if (variables.userIDs && variables.userIDs.length > 0) {
        note = `Filtered results for ${variables.userIDs.length} specific user ID(s). This includes users regardless of connection status. Connected users are split into remote/in-office categories.`;
    } else {
        note = "Showing all connected users only. To see disconnected users, use entity_lookup tool first to get user IDs, then call this tool with userIDs parameter.";
    }

    return {
        data: {
            accountSnapshotTimestamp: response.data.accountSnapshot.timestamp,
            totalUsersCount: connectedUsers.length,
            totalRequestedUsers: allUsers.length,
            remoteUsers: remoteUsers,
            remoteUsersCount: remoteUsers.length,
            inOfficeUsers: inOfficeUsers,
            inOfficeUsersCount: inOfficeUsers.length,
            usersCountPerPopName: usersCountPerPopName,
            note: note,
            userIDs_filter_applied: variables.userIDs || null
        }
    };

}
