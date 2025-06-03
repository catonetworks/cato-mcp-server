import {CatoMcpToolWrapper, McpToolDef, McpToolDefContext} from "../common/catoMcpTool.js";
import {emptySitesResponse, isValidResponse} from "./siteUtils.js";

export function buildSiteTypesTool(ctx: McpToolDefContext): CatoMcpToolWrapper {
    const toolDef: McpToolDef = {
        name: "site_types",
        description: `Retrieves detailed information about all sites including their connection types.
            This data can be used to answer questions about how many sites use different
            connection methods (IPsec, Socket, vSocket, etc.), and to group sites by type.
            Also includes site creation time and device uptime for broader analysis.
            This tool gathers comprehensive data on all sites from the Account Snapshot, focusing on their \`connType\` 
            (e.g., SOCKET_X1500, IPSEC_V2), \`info.type\` (e.g., BRANCH, DATACENTER), \`creationTime\`, and \`deviceUptime\` 
            for primary HA devices. It also includes \`hostCount\` per site. This enables analysis of site infrastructure, 
            deployment age, operational stability of HA primary devices, and site capacity in terms of hosts.
        
            Example questions this tool can help answer:
            - "Can you provide a list of all sites, grouped by their connection type (e.g., IPsec, Socket, vSocket)?"
            - "How many sites of type 'BRANCH' are currently connected using 'SOCKET_X1700' connection type?"
            - "Which sites were created in the last 90 days and what is their current \`operationalStatus\`?"
            - "What is the average \`deviceUptime\` for 'PRIMARY' sockets in HA-enabled sites that are currently connected?"
            - "List all unique \`socketInfo.platform\` types present across all sites and the number of sites using each platform type."
        
            Returns:
                A dictionary containing a list of sites with their type information, or an error.`,
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
`

function handleResponse(variables: Record<string, any>, response: any): any {
    if (!isValidResponse(variables.accountID, response)) {
        return emptySitesResponse(response.data?.accountSnapshot?.timestamp)
    }

    const allSites = response.data.accountSnapshot.sites;
    const sitesCountByType: Record<string, number> = {};


    for (const site of allSites) {
        const type = site.info?.type || "Unknown";
        sitesCountByType[type] = (sitesCountByType[type] || 0) + 1;
    }

    return {
        data: {
            accountSnapshotTimestamp: response.data.accountSnapshot.timestamp,
            sites: allSites,
            sitesCount: allSites.length,
            sitesCountPerType: sitesCountByType,
        }
    };

}
