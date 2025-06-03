import {CatoMcpToolWrapper, McpToolDefContext} from "./common/catoMcpTool.js";
import {buildEntityLookupTool} from "./entity_lookup/entityLookupTool.js";
import {buildSitesByLocationTool} from "./sites_snapshot/sitesByLocationTool.js";
import {buildDegradedSitesTool} from "./sites_snapshot/degradedSitesTool.js";
import {buildSiteTypesTool} from "./sites_snapshot/siteTypesTool.js";
import {buildWanConnectivityTool} from "./sites_snapshot/wanConnectivityTool.js";
import {buildUsersDetailsTool} from "./users_snapshot/usersDetailsTool.js";
import {buildUserConnectionDetailsTool} from "./users_snapshot/userConnectionDetailsTool.js";
import {buildSocketVersionsTool} from "./sites_snapshot/socketVersionsTool.js";
import {buildClientVersionsTool} from "./users_snapshot/clientVersionsTool.js";

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
        buildSitesByLocationTool(ctx), buildDegradedSitesTool(ctx), buildSiteTypesTool(ctx), buildSocketVersionsTool(ctx), buildWanConnectivityTool(ctx),
        buildUsersDetailsTool(ctx), buildUserConnectionDetailsTool(ctx), buildClientVersionsTool(ctx)
    ];
    tools.forEach(tool => catoMcpToolWrappers.set(tool.toolDef.name, tool));
}
