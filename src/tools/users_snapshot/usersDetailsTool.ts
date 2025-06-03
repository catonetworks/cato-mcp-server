import {CatoMcpToolWrapper, McpToolDef, McpToolDefContext} from "../common/catoMcpTool.js";
import {emptyUsersResponse, isValidResponse} from "./userUtils.js";

export function buildUsersDetailsTool(ctx: McpToolDefContext): CatoMcpToolWrapper {
    const toolDef: McpToolDef = {
        name: "user_details",
        description: `Retrieves two comprehensive lists from the Account Snapshot: 'remoteUsers' which returns all connected remote users and 'inOfficeUsers' that returns all connected users in office. 
            When asked about all the users in the account, consider the users from both lists.
            For each user in the snapshot, it returns: name, popName, connectedInOffice, osType and client version. 
            If the connectedInOffice parameters is true the user is in-office and when False it is considered a remote user. 
            
            In addition to individual user data, this tool also calculates and returns the following aggregate metrics:
            totalUsersCount: Total number of connected users in the snapshot
            remoteUsersCount: Number of users currently connected not in an office (connectedInOffice: false)
            inOfficeUsersCount: Number of users currently connected from an office (connectedInOffice: true)
            
            This makes the tool ideal for both granular user inspection and high-level analysis of connectivity trends across the organization.
            Whether you need to investigate current remote activity, identify the most commonly used operating systems, or understand user distribution across PoPs, this tool provides all the necessary data in one unified response.
            
            Example questions this tool can help answer:
            
            How many total users are connected?
            Show a full list of users and whether they are connected in office or remotely
            List all remote users along with their PoP and OS details
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
query remoteUsersDetails($accountID: ID!) {
  accountSnapshot(accountID: $accountID) {
    id
    timestamp
    users {
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

    const connectedUsers = response.data.accountSnapshot.users;
    const remoteUsers = connectedUsers.filter((user: any) => !user.connectedInOffice);
    const inOfficeUsers = connectedUsers.filter((user: any) => user.connectedInOffice);

    const usersCountPerPopName: Record<string, number> = {};
    const devicesCountPerPopName: Record<string, number> = {};

    for (const user of connectedUsers) {
        const popName = user.popName || "Unknown";
        usersCountPerPopName[popName] = (usersCountPerPopName[popName] || 0) + 1;
        devicesCountPerPopName[popName] = (devicesCountPerPopName[popName] || 0) + 1;
    }

    return {
        data: {
            accountSnapshotTimestamp: response.data.accountSnapshot.timestamp,
            totalUsersCount: connectedUsers.length,
            remoteUsers: remoteUsers,
            remoteUsersCount: remoteUsers.length,
            inOfficeUsers: inOfficeUsers,
            inOfficeUsersCount: inOfficeUsers.length,
            usersCountPerPopName: usersCountPerPopName,
            devicesCountPerPopName: devicesCountPerPopName
        }
    };

}
