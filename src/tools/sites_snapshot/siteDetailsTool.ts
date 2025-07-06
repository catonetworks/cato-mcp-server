import {CatoMcpToolWrapper, McpToolDef, McpToolDefContext} from "../common/catoMcpTool.js";

export function buildSiteDetailsTool(ctx: McpToolDefContext): CatoMcpToolWrapper {
    const toolDef: McpToolDef = {
        name: "site_details",
        description: `Retrieves comprehensive site details from the Account Snapshot.
            This tool fetches a comprehensive list of all sites within an account from the latest Account Snapshot. 
            It provides detailed information for each site, including its \`operationalStatus\`, \`connectivityStatus\`, 
            High Availability (\`haStatus\`), \`popName\`, \`hostCount\`, \`altWanStatus\`, and specific device interface statuses. 

            Example questions this tool can help answer:
            - "Which sites are currently in a degraded state, and what is the reason for their degradation (e.g., HA not ready, port disconnected, tunnel down)?"
            - "Why is site 'SiteNameX' in a degraded state according to the latest snapshot?"
            - "Which country or PoP location has the most sites experiencing connectivity issues or HA problems?"
            - "Show me all sites that have a \`hostCount\` greater than 100 but their \`altWanStatus\` is not 'active'."
            - "List sites where High Availability is configured but 'not ready', and specify the component causing this (e.g., WAN connectivity, keepalive, or socket version)."
            
            Returns:
            A dictionary containing the full list of sites with their details from the snapshot, or an error.`,
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
        gqlQuery: gqlQuery
    }
}


const gqlQuery = `
query siteDetails($accountID: ID!) {
  accountSnapshot(accountID: $accountID) {
    id
    timestamp
    sites {
      id
      connectivityStatus
      operationalStatus
      lastConnected
      connectedSince
      popName
      hostCount
      altWanStatus
      haStatus {
        readiness
        wanConnectivity
        keepalive
        socketVersion
      }
      info {
        name
        type
        countryName
      }
      devices {
        id
        connected
        version
        haRole
        interfaces {
          id
          name
          connected
          type
        }
      }
    }
  }
}
`