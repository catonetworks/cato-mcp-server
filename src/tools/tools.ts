import {CatoMcpToolWrapper, McpToolDefContext} from "./common/catoMcpTool.js";
import {buildEntityLookupTool} from "./entity_lookup/entityLookupTool.js";
import {buildSiteSnapshotTools} from "./sites_snapshot/tools.js";
import {buildUserSnapshotTools} from "./users_snapshot/tools.js";
import {buildAccountMetricsTools} from "./account_metrics/tools.js";


// cato mcp tools
let catoMcpToolWrappers: Map<string, CatoMcpToolWrapper> = new Map();



export function getCatoMcpTools() {
    return Array.from(catoMcpToolWrappers.values()).map(tool => tool.toolDef)
}

/**
 * find the mcp tool to execute
 * @param toolName the tool to locate
 */
export function findMcpTool(toolName: string) {
    let tool = catoMcpToolWrappers.get(toolName);
    if (!tool) {
        throw new Error(`Tool ${toolName} not found`);
    }
    return tool;
}

/**
 * build all Cato MCP tool wrappers.
 * returns a map of tool name to CatoMcpToolWrapper
 */
export function initCatoMcpToolWrappers(accountId: string) {
    const ctx: McpToolDefContext = {
        accountId: accountId
    };
    const tools = [buildEntityLookupTool(ctx),
        ...buildSiteSnapshotTools(ctx),
        ...buildUserSnapshotTools(ctx),
        ...buildAccountMetricsTools(ctx)
    ];
    tools.forEach(tool => catoMcpToolWrappers.set(tool.toolDef.name, tool));
}
