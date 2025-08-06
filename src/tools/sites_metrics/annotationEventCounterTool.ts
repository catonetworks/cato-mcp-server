import {CatoMcpToolWrapper, McpToolDef, McpToolDefContext} from "../common/catoMcpTool.js";
import {
    emptyMetricsResponse, 
    isValidSiteMetricResponse, 
    standardizeMetricsInput
} from "../../utils/metricsUtils.js";

// Default values for annotation event counter tool
const ANNOTATION_DEFAULT_TIMEFRAME = "last.P30D";
const DEFAULT_ANNOTATION_TYPES = ["popChange", "remoteIPChange", "roleChange"];
const DEFAULT_GROUP_BY = "site";
const DEFAULT_INCLUDE_TIMESTAMPS = false;
const DEFAULT_MIN_EVENT_COUNT = 1;

/**
 * Generates a group key based on the grouping strategy
 */
function getGroupKey(site: any, intf: any, annotation: any, groupBy: string): string {
    if (groupBy === 'site') {
        return `${site.info?.name || site.id}`;
    } else if (groupBy === 'interface') {
        return `${site.info?.name || site.id}:${intf.name}`;
    } else if (groupBy === 'annotationType') {
        return annotation.type;
    }
    return '';
}

/**
 * Builds an event object from site, interface, and annotation data
 */
function buildEvent(site: any, intf: any, annotation: any): any {
    return {
        siteId: site.id,
        siteName: site.info?.name,
        siteType: site.info?.type,
        connType: site.info?.connType,
        region: site.info?.region,
        isHA: site.info?.isHA,
        interfaceName: intf.name,
        annotationType: annotation.type,
        timestamp: new Date(annotation.time).toISOString(),
        label: annotation.label,
        shortLabel: annotation.shortLabel
    };
}

/**
 * Filters event counts by minimum event count and returns sorted results
 */
function filterEventCountsByMinimum(eventCounts: Record<string, any>, minEventCount: number): any[] {
    return Object.values(eventCounts)
        .filter((group: any) => group.totalEvents >= minEventCount);
}

export function buildAnnotationEventCounterTool(ctx: McpToolDefContext): CatoMcpToolWrapper {
    const toolDef: McpToolDef = {
        name: "annotation_event_counter",
        description: `Analyzes infrastructure change events and annotations to track stability and identify sites with frequent changes or issues.
        
        Example questions this tool can help answer:
        - "List interfaces where remoteIP changed during the past month."
        - "How many times did any site's HA role change in the previous quarter?"
        - "Which sites had PoP changes in the last 30 days?"
        - "Identify sites with frequent tunnel disconnections or reconnections."
        - "Show me all role change events for HA sites last week."`,
        inputSchema: {
            type: "object",
            properties: {
                accountID: {
                    type: "string",
                    description: "Tenant account ID.",
                    default: ctx.accountId
                },
                timeFrame: {
                    type: "string",
                    description: "Time frame for the data. Format: 'last.P{duration}' (e.g., 'last.P30D' for 30 days) or 'utc.{date/time range}' (e.g., 'utc.2023-01-{01/00:00:00--31/23:59:59}').",
                    default: ANNOTATION_DEFAULT_TIMEFRAME
                },
                annotationTypes: {
                    type: "array",
                    items: {
                        type: "string",
                        enum: ["popChange", "remoteIPChange", "roleChange", "generic"]
                    },
                    description: "Types of annotations to analyze: 'popChange' (site connects to different PoP), 'remoteIPChange' (ISP IP address changed), 'roleChange' (HA status role change), 'generic' (other events).",
                    default: DEFAULT_ANNOTATION_TYPES
                },
                siteIDs: {
                    type: "array",
                    items: {type: "string"},
                    description: "Optional list of site IDs to filter by. If omitted, analyzes all sites."
                },
                groupBy: {
                    type: "string",
                    enum: ["site", "interface", "annotationType"],
                    description: "How to group the results: 'site' (by site), 'interface' (by interface), 'annotationType' (by type of event).",
                    default: DEFAULT_GROUP_BY
                },
                includeTimestamps: {
                    type: "boolean",
                    description: "Whether to include detailed timestamps for each event occurrence.",
                    default: DEFAULT_INCLUDE_TIMESTAMPS
                },
                minEventCount: {
                    type: "integer",
                    description: "Minimum number of events required to include a site/interface in results (helps filter out noise).",
                    default: DEFAULT_MIN_EVENT_COUNT,
                    minimum: 1
                }
            },
            required: ["accountID", "timeFrame"],
            additionalProperties: false,
            $schema: "http://json-schema.org/draft-07/schema#"
        }
    };

    return {
        toolDef: toolDef,
        gqlQuery: gqlQuery,
        inputHandler: handleInput,
        responseHandler: handleResponse,
    }
}

function handleInput(variables: Record<string, any>): Record<string, any> {
    return standardizeMetricsInput(variables);
}

const gqlQuery = `
query annotationEventCounter($accountID: ID!, $timeFrame: TimeFrame!, $siteIDs: [ID!], $annotationTypes: [String!]) {
  accountMetrics(accountID: $accountID, timeFrame: $timeFrame) {
    id
    from
    to
    sites(siteIDs: $siteIDs) {
      id
      info {
        name
        type
        connType
        region
        isHA
      }
      interfaces {
        name
        annotations(types: $annotationTypes) {
          type
          time
          label
          shortLabel
        }
      }
    }
  }
}
`

function handleResponse(variables: Record<string, any>, response: any): any {
    if (!isValidSiteMetricResponse(variables.accountID, response)) {
        return emptyMetricsResponse(response.data?.accountMetrics)
    }
    const accountMetrics = response.data.accountMetrics;
    const groupBy = variables.groupBy || DEFAULT_GROUP_BY;
    const annotationTypes = variables.annotationTypes || DEFAULT_ANNOTATION_TYPES;
    const includeTimestamps = variables.includeTimestamps || DEFAULT_INCLUDE_TIMESTAMPS;
    const minEventCount = variables.minEventCount || DEFAULT_MIN_EVENT_COUNT;

    // Collect all events
    const events: any[] = [];
    const eventCounts: Record<string, any> = {};

    for (const site of accountMetrics.sites || []) {
        for (const intf of site.interfaces || []) {
            for (const annotation of intf.annotations || []) {
                if (annotationTypes.includes(annotation.type)) {
                    const event = buildEvent(site, intf, annotation);
                    events.push(event);

                    // Count events based on groupBy
                    const groupKey = getGroupKey(site, intf, annotation, groupBy);

                    if (!eventCounts[groupKey]) {
                        eventCounts[groupKey] = {
                            groupKey: groupKey,
                            groupType: groupBy,
                            totalEvents: 0,
                            eventsByType: {},
                            events: []
                        };

                        // Add context based on groupBy
                        if (groupBy === 'site' || groupBy === 'interface') {
                            eventCounts[groupKey].siteId = site.id;
                            eventCounts[groupKey].siteName = site.info?.name;
                            eventCounts[groupKey].siteType = site.info?.type;
                            eventCounts[groupKey].connType = site.info?.connType;
                            eventCounts[groupKey].region = site.info?.region;
                            eventCounts[groupKey].isHA = site.info?.isHA;
                        }
                        if (groupBy === 'interface') {
                            eventCounts[groupKey].interfaceName = intf.name;
                        }
                        if (groupBy === 'annotationType') {
                            eventCounts[groupKey].annotationType = annotation.type;
                            eventCounts[groupKey].affectedSites = new Set();
                            eventCounts[groupKey].affectedInterfaces = new Set();
                        }
                    }

                    eventCounts[groupKey].totalEvents++;
                    
                    // Count by annotation type
                    if (!eventCounts[groupKey].eventsByType[annotation.type]) {
                        eventCounts[groupKey].eventsByType[annotation.type] = 0;
                    }
                    eventCounts[groupKey].eventsByType[annotation.type]++;

                    // Track affected sites/interfaces for annotationType grouping
                    if (groupBy === 'annotationType') {
                        eventCounts[groupKey].affectedSites.add(site.info?.name || site.id);
                        eventCounts[groupKey].affectedInterfaces.add(`${site.info?.name || site.id}:${intf.name}`);
                    }

                    // Store individual events if timestamps are requested
                    if (includeTimestamps) {
                        eventCounts[groupKey].events.push(event);
                    }
                }
            }
        }
    }

    // Filter by minimum event count and prepare results
    const results = filterEventCountsByMinimum(eventCounts, minEventCount)
        .map((group: any) => {
            const result: any = {
                group: group.groupKey,
                groupType: group.groupType,
                totalEvents: group.totalEvents,
                eventsByType: group.eventsByType
            };

            // Add context based on groupBy
            if (group.groupType === 'site' || group.groupType === 'interface') {
                result.siteId = group.siteId;
                result.siteName = group.siteName;
                result.siteType = group.siteType;
                result.connType = group.connType;
                result.region = group.region;
                result.isHA = group.isHA;
            }
            if (group.groupType === 'interface') {
                result.interfaceName = group.interfaceName;
            }
            if (group.groupType === 'annotationType') {
                result.annotationType = group.annotationType;
                result.affectedSitesCount = group.affectedSites.size;
                result.affectedInterfacesCount = group.affectedInterfaces.size;
                result.affectedSites = Array.from(group.affectedSites);
            }

            // Add individual events if requested
            if (includeTimestamps && group.events.length > 0) {
                result.events = group.events.sort((a: any, b: any) => 
                    new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
                );
            }

            return result;
        })
        .sort((a: any, b: any) => b.totalEvents - a.totalEvents); // Sort by event count descending

    // Calculate summary statistics
    const totalEvents = events.length;
    const eventTypeDistribution: Record<string, number> = {};
    for (const event of events) {
        eventTypeDistribution[event.annotationType] = (eventTypeDistribution[event.annotationType] || 0) + 1;
    }

    const uniqueSitesAffected = new Set(events.map(e => e.siteName || e.siteId)).size;
    const uniqueInterfacesAffected = new Set(events.map(e => `${e.siteName || e.siteId}:${e.interfaceName}`)).size;

    return {
        data: {
            timeFrame: {
                from: accountMetrics.from,
                to: accountMetrics.to,
            },
            summary: {
                totalEvents: totalEvents,
                groupBy: groupBy,
                annotationTypesAnalyzed: annotationTypes,
                uniqueSitesAffected: uniqueSitesAffected,
                uniqueInterfacesAffected: uniqueInterfacesAffected,
                eventTypeDistribution: eventTypeDistribution,
                resultsReturned: results.length
            },
            results: results
        }
    };
} 