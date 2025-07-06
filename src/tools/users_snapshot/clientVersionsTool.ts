import {CatoMcpToolWrapper, McpToolDef, McpToolDefContext} from "../common/catoMcpTool.js";
import {emptyUsersResponse, isValidResponse} from "./userUtils.js";

export function buildClientVersionsTool(ctx: McpToolDefContext): CatoMcpToolWrapper {
    const toolDef: McpToolDef = {
        name: "user_software_versions",
        description: `Retrieves information about client software versions for all currently connected VPN users (both remote and in-office).
            This data can be used to identify users running older client versions.
            This tool provides data on users' software and client versions from the Account Snapshot. It returns the 'version' (client version string), 'versionNumber' (numeric client version), and 'osType' for each connected user.
            This tool does not return information for disconnected users.
        
            Example questions this tool can help answer:
            - "Which users are running a client \`versionNumber\` less than 80000000, and what is their \`deviceName\` and \`osType\`?"
            - "Could you provide a list of all connected users grouped by their \`osType\` and then by client \`version\`?"
        
            Returns:
                A dictionary containing user version information, or an error.`,
        inputSchema: {
            type: "object",
            properties: {
                accountID: {
                    type: "string",
                    description: "Unique identifier for the customer account.",
                    default: ctx.accountId
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
`
function handleResponse(variables: Record<string, any>, response: any): any {
    if (!isValidResponse(variables.accountID, response)) {
        return emptyUsersResponse(response.data?.accountSnapshot?.timestamp)
    }

    const allUsers = response.data.accountSnapshot.users;
    const userCountByVersion: Record<string, number> = {};


    for (const user of allUsers) {
        const version = user.version;
        if (version) {
            userCountByVersion[version] = (userCountByVersion[version] || 0) + 1;
        }
    }

    return {
        data: {
            accountSnapshotTimestamp: response.data.accountSnapshot.timestamp,
            users: allUsers,
            usersCount: allUsers.length,
            userCountByVersion: userCountByVersion,
        }
    };
}
