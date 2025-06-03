import {CatoMcpToolWrapper, McpToolDef, McpToolDefContext} from "../common/catoMcpTool.js";
import {emptySitesResponse, isValidResponse} from "./siteUtils.js";

export function buildSocketVersionsTool(ctx: McpToolDefContext): CatoMcpToolWrapper {
    const toolDef: McpToolDef = {
        name: "socket_versions",
        description: `Retrieves information about socket/device versions across all sites.
            This data can be used to identify sites that need socket upgrades, sites with socket versions below a threshold.
            For sites, it includes \`device.version\` and \`socketInfo.version\` for individual sockets, along with \`haStatus.socketVersion\` for HA pairs. 
        
            Example questions this tool can help answer:
            - "Which sites have sockets whose software (\`socketInfo.version\`) was last updated before '2023-06-01T00:00:00Z'?"
            - "Are there any sites where the HA \`socketVersion\` indicates a mismatch between primary and secondary sockets?"
        
            Returns:
                A dictionary containing site version information, or an error.`,
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
`

function handleResponse(variables: Record<string, any>, response: any): any {
    if (!isValidResponse(variables.accountID, response)) {
        return emptySitesResponse(response.data?.accountSnapshot?.timestamp)
    }

    const allSites = response.data.accountSnapshot.sites;
    const socketCountByVersion: Record<string, number> = {};


    for (const site of allSites) {
        for (const device of site.devices || []) {
            if (device.socketInfo?.version) {
                const socketVersion = device.socketInfo.version;
                socketCountByVersion[socketVersion] = (socketCountByVersion[socketVersion] || 0) + 1;
            }
        }
    }

    return {
        data: {
            accountSnapshotTimestamp: response.data.accountSnapshot.timestamp,
            sites: allSites,
            sitesCount: allSites.length,
            socketCountByVersion: socketCountByVersion,
        }
    };
}
