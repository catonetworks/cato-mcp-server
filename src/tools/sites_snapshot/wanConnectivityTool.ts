import {CatoMcpToolWrapper, McpToolDef, McpToolDefContext} from "../common/catoMcpTool.js";

export function buildWanConnectivityTool(ctx: McpToolDefContext): CatoMcpToolWrapper {
    const toolDef: McpToolDef = {
        name: "wan_connectivity",
        description: `Retrieves detailed information about WAN connectivity for all sites including
            interface status, alternative WAN connections, and port configurations.
            This data can be used to identify sites with specific connectivity patterns like
            sites with only one active WAN port, sites using last resort links, or sites
            using MPLS/alternative WAN connections. Includes previous PoP name for interface flap analysis.
            This tool delivers extensive WAN connectivity details for all sites from the Account Snapshot. Key data points include 
            \`interface.connected\` status, \`interface.type\` (e.g., WAN, LAN), \`altWanStatus\`, \`tunnelUptime\`, 
            \`tunnelConnectionReason\`, \`popName\`, and \`previousPopName\` for each interface. This allows for in-depth analysis 
            of WAN link health, redundancy, failover events (by comparing current and previous PoP), and usage of alternative WANs.
        
            Example questions this tool can help answer:
            - "Which sites are currently connected using only a single active WAN interface?"
            - "Are there any sites where an interface's current \`popName\` is different from its \`previousPopName\`, indicating a recent PoP change?"
            - "List sites that have an \`altWanStatus\` reported as 'active' or 'standby'."
            - "Identify sites with WAN interfaces that reconnected specifically because the 'Socket restarted' (\`tunnelConnectionReason\`)."
            - "Which sites have WAN interfaces that are physically connected (\`mediaIn\` is true - *Note: mediaIn not directly available, infer from 'connected'*) but have no active data tunnel (\`interface.connected\` is false)?"
        
            Returns:
                A dictionary containing site WAN connectivity details, or an error.`,
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
query wanConnectivity($accountID: ID!) {
  accountSnapshot(accountID: $accountID) {
    id
    timestamp
    sites {
      id
      connectivityStatus
      operationalStatus
      altWanStatus
      info {
        name
        type
        countryName
      }
      devices {
        id
        connected
        haRole
        interfaces {
          id
          name
          connected
          type
          tunnelUptime
          tunnelConnectionReason
          tunnelRemoteIP
          popName
          previousPopName 
        }
      }
    }
  }
}
`
