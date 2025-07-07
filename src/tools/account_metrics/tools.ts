import {McpToolDefContext} from "../common/catoMcpTool.js";
import {buildSiteNetworkHealthTool} from "./siteNetworkHealthTool.js";
import {buildTopBandwidthConsumersTool} from "./topBandwidthConsumersTool.js";
import {buildMetricsTimeseriesQueryTool} from "./metricsTimeseriesQueryTool.js";
import {buildMetricsSiteSummaryTool} from "./metricsSiteSummaryTool.js";
import {buildAnnotationEventCounterTool} from "./annotationEventCounterTool.js";

export function buildAccountMetricsTools(ctx: McpToolDefContext) {
    return [
        buildSiteNetworkHealthTool(ctx), buildTopBandwidthConsumersTool(ctx),
        buildMetricsTimeseriesQueryTool(ctx), buildMetricsSiteSummaryTool(ctx), buildAnnotationEventCounterTool(ctx)
    ];
}
