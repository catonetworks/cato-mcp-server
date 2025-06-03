import {CatoMcpToolWrapper, McpToolDef, McpToolDefContext} from "../common/catoMcpTool.js";
import {isValidResponse, emptySitesResponse,} from "./siteUtils.js";

export function buildSitesByLocationTool(ctx: McpToolDefContext): CatoMcpToolWrapper {
    const toolDef: McpToolDef = {
        name: "sites_by_location",
        description: `Retrieves a list of all sites with their geographical location information.
            This data can be used to analyze site distribution by country/PoP,
            or identify locations with degraded sites.
            This tool returns a list of all sites from the Account Snapshot, enriched with geographical location data 
            such as \`countryName\`, \`cityName\`, \`region\`, and the \`popName\` they are connected to. It also includes 
            \`connectivityStatus\` and \`operationalStatus\` for each site. This information is primarily used for 
            geographical analysis of site deployment, identifying site concentrations, and assessing the status of 
            sites within specific regions or connected to particular PoPs.
        
            Example questions this tool can help answer:
            - "Which country currently has the most connected sites, and how many are in an 'operational' state?"
            - "Can you list all sites located in 'Germany', along with their \`connectivityStatus\` and connected \`popName\`?"
            - "How many sites are connected to the 'London-PoP', and what is their distribution by \`cityName\`?"
            - "Show me the PoP locations that have the most sites connected to them right now."
        
            Returns:
                A dictionary containing a list of sites with their location information, or an error.`,
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
`

const buildLocationString = (site: any) => {
    if (!site.info || !site.info.countryName) {
        return "Unknown";
    }

    let location = site.info.countryName;
    if (site.info.countryStateName && site.info.countryStateName.length > 0) {
        location += "." + site.info.countryStateName;
    }
    if (site.info.cityName && site.info.cityName.length > 0) {
        location += "." + site.info.cityName;
    }
    return location;
}

function handleResponse(variables: Record<string, any>, response: any): any {
    if (!isValidResponse(variables.accountID, response)) {
        return emptySitesResponse(response.data?.accountSnapshot?.timestamp)
    }

    const allSites = response.data.accountSnapshot.sites;
    const sitesCountByPopName: Record<string, number> = {};
    const sitesCountByLocation: Record<string, number> = {};


    for (const site of allSites) {
        const popName = site.popName || "Unknown";
        sitesCountByPopName[popName] = (sitesCountByPopName[popName] || 0) + 1;
        const location = buildLocationString(site);
        sitesCountByLocation[location] = (sitesCountByPopName[location] || 0) + 1;
    }

    return {
        data: {
            accountSnapshotTimestamp: response.data.accountSnapshot.timestamp,
            totalSitesCount: allSites.length,
            sitesCountByPopName: sitesCountByPopName,
            sitesCountByLocation: sitesCountByLocation
        }
    };

}
