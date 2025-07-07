import {McpToolDefContext} from "../common/catoMcpTool.js";
import {buildUsersDetailsTool} from "./usersDetailsTool.js";
import {buildUserConnectionDetailsTool} from "./userConnectionDetailsTool.js";
import {buildClientVersionsTool} from "./clientVersionsTool.js";

export function buildUserSnapshotTools(ctx: McpToolDefContext) {
    return [
        buildUsersDetailsTool(ctx), buildUserConnectionDetailsTool(ctx), buildClientVersionsTool(ctx)
    ];
}
