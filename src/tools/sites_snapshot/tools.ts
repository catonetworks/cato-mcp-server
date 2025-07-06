import {buildSitesByLocationTool} from "./sitesByLocationTool.js";
import {buildSiteTypesTool} from "./siteTypesTool.js";
import {buildSocketVersionsTool} from "./socketVersionsTool.js";
import {buildWanConnectivityTool} from "./wanConnectivityTool.js";
import {McpToolDefContext} from "../common/catoMcpTool.js";
import {buildSiteDetailsTool} from "./siteDetailsTool.js";

export function buildSiteSnapshotTools(ctx: McpToolDefContext) {
    return [
        buildSitesByLocationTool(ctx), buildSiteDetailsTool(ctx), buildSiteTypesTool(ctx), buildSocketVersionsTool(ctx), buildWanConnectivityTool(ctx)
    ];
}
