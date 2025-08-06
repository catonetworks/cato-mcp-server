import {McpToolDefContext} from "../common/catoMcpTool.js";
import {buildSiteNetworkHealthTool} from "./siteNetworkHealthTool.js";
import {buildTopSiteBandwidthConsumersTool} from "./topSiteBandwidthConsumersTool.js";
import {buildSiteMetricsTimeseriesTool} from "./SiteMetricsTimeseriesTool.js";
import {buildSiteMetricsTool} from "./SiteMetricsTool.js";
import {buildSiteMetricsSummaryTool} from "./SiteMetricsSummaryTool.js";
import {buildAnnotationEventCounterTool} from "./annotationEventCounterTool.js";

export function buildAccountMetricsTools(ctx: McpToolDefContext) {
    return [
        buildSiteNetworkHealthTool(ctx),
        buildTopSiteBandwidthConsumersTool(ctx),
        buildSiteMetricsTool(ctx),
        buildSiteMetricsTimeseriesTool(ctx),
        buildSiteMetricsSummaryTool(ctx),
        buildAnnotationEventCounterTool(ctx)
    ];
}
