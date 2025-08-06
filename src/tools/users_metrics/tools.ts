import {McpToolDefContext} from "../common/catoMcpTool.js";
import {buildTopUsersBandwidthConsumersTool} from "./topUsersBandwidthConsumersTool.js";
import {buildUserMetricsTool} from "./UserMetricsTool.js";
import {buildUserMetricsTimeseriesTool} from "./UserMetricsTimeseriesTool.js";

export function buildUserAccountMetricsTools(ctx: McpToolDefContext) {
    return [
        buildTopUsersBandwidthConsumersTool(ctx),
        buildUserMetricsTool(ctx),
        buildUserMetricsTimeseriesTool(ctx)
    ];
} 