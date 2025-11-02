"""
Annotation event counter tool
"""
from typing import Any, Dict, List, Set
from datetime import datetime
from ..common.cato_mcp_tool import CatoMcpToolWrapper, McpToolDef, McpToolDefContext
from ...utils.metrics_utils import (
    empty_metrics_response,
    is_valid_site_metric_response,
    standardize_metrics_input,
)

DEFAULT_ANNOTATION_TYPES = ["popChange", "remoteIPChange", "roleChange"]
DEFAULT_GROUP_BY = "site"
DEFAULT_INCLUDE_TIMESTAMPS = False
DEFAULT_MIN_EVENT_COUNT = 1
ANNOTATION_DEFAULT_TIMEFRAME = "last.P30D"


def _get_group_key(site: Dict[str, Any], intf: Dict[str, Any], annotation: Dict[str, Any], group_by: str) -> str:
    """
    Generate a group key based on the grouping strategy.
    
    Args:
        site: Site dictionary
        intf: Interface dictionary
        annotation: Annotation dictionary
        group_by: Grouping strategy
        
    Returns:
        Group key string
    """
    if group_by == 'site':
        return f"{site.get('info', {}).get('name') or site.get('id')}"
    elif group_by == 'interface':
        return f"{site.get('info', {}).get('name') or site.get('id')}:{intf.get('name')}"
    elif group_by == 'annotationType':
        return annotation.get('type', '')
    return ''


def _build_event(site: Dict[str, Any], intf: Dict[str, Any], annotation: Dict[str, Any]) -> Dict[str, Any]:
    """
    Build an event object from site, interface, and annotation data.
    
    Args:
        site: Site dictionary
        intf: Interface dictionary
        annotation: Annotation dictionary
        
    Returns:
        Event dictionary
    """
    return {
        "siteId": site.get("id"),
        "siteName": site.get("info", {}).get("name"),
        "siteType": site.get("info", {}).get("type"),
        "connType": site.get("info", {}).get("connType"),
        "region": site.get("info", {}).get("region"),
        "isHA": site.get("info", {}).get("isHA"),
        "interfaceName": intf.get("name"),
        "annotationType": annotation.get("type"),
        "timestamp": datetime.fromisoformat(annotation.get("time", "").replace("Z", "+00:00")).isoformat() if annotation.get("time") else None,
        "label": annotation.get("label"),
        "shortLabel": annotation.get("shortLabel")
    }


def _filter_event_counts_by_minimum(event_counts: Dict[str, Any], min_event_count: int) -> List[Dict[str, Any]]:
    """
    Filter event counts by minimum event count.
    
    Args:
        event_counts: Event counts dictionary
        min_event_count: Minimum event count threshold
        
    Returns:
        Filtered results list
    """
    return [group for group in event_counts.values() if group.get("totalEvents", 0) >= min_event_count]


def build_annotation_event_counter_tool(ctx: McpToolDefContext) -> CatoMcpToolWrapper:
    """
    Build the annotation event counter tool.
    
    Args:
        ctx: The tool definition context
        
    Returns:
        The tool wrapper
    """
    tool_def: McpToolDef = {
        "name": "annotation_event_counter",
        "description": """Analyzes infrastructure change events and annotations to track stability and identify sites with frequent changes or issues.
        
        IMPORTANT: Carefully review the timeFrame parameter description and examples below to ensure correct usage (in-day, cross-day, cross-month, cross-year absolute UTC formats).
        
        Example questions this tool can help answer:
        - "List interfaces where remoteIP changed during the past month."
        - "How many times did any site's HA role change in the previous quarter?"
        - "Which sites had PoP changes in the last 30 days?"
        - "Identify sites with frequent tunnel disconnections or reconnections."
        - "Show me all role change events for HA sites last week."
""",
        "inputSchema": {
            "type": "object",
            "properties": {
                "accountID": {
                    "type": "string",
                    "description": "Tenant account ID.",
                    "default": ctx["accountId"]
                },
                "timeFrame": {
                    "type": "string",
                    "description": "Time frame for the data (required). Format '<type>.<value>'.\n1) Relative: 'last.<ISO-8601 duration>' – examples: last.PT5M (5 min), last.PT2H (2 h), last.P1D (1 day), last.P3M (3 months), last.P1Y (1 year).\n2) Absolute UTC range: 'utc.<range>'. The curly braces {} group the time components that vary; constant parts like the year remain outside. Note the difference in brace placement for cross-year vs. same-year queries. Correct examples: in-day → utc.2024-05-11/{00:00:00--12:00:00}, utc.2025-04-22/{09:15:00--17:45:00}; full-day → utc.2024-05-12/{00:00:00--23:59:59}, utc.2025-04-22/{00:00:00--23:59:59}; cross-day (same month) → utc.2024-05-{01/00:00:00--07/23:59:59}, utc.2025-04-{15/08:00:00--16/18:00:00}; full-month → utc.2024-05-{01/00:00:00--31/23:59:59}, utc.2025-02-{01/00:00:00--28/23:59:59}; cross-month (same year) → utc.2024-{05-01/00:00:00--06-01/00:00:00}, utc.2025-{03-15/12:00:00--04-10/06:30:00}; cross-year → utc.{2023-12-31/22:00:00--2024-01-01/02:00:00}, utc.{2024-12-30/00:00:00--2025-01-05/23:59:59}.",
                    "default": ANNOTATION_DEFAULT_TIMEFRAME
                },
                "annotationTypes": {
                    "type": "array",
                    "items": {
                        "type": "string",
                        "enum": ["popChange", "remoteIPChange", "roleChange", "generic"]
                    },
                    "description": "Types of annotations to analyze: 'popChange' (site connects to different PoP), 'remoteIPChange' (ISP IP address changed), 'roleChange' (HA status role change), 'generic' (other events).",
                    "default": DEFAULT_ANNOTATION_TYPES
                },
                "siteIDs": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Optional list of site IDs to filter by. If omitted, analyzes all sites."
                },
                "groupBy": {
                    "type": "string",
                    "enum": ["site", "interface", "annotationType"],
                    "description": "How to group the results: 'site' (by site), 'interface' (by interface), 'annotationType' (by type of event).",
                    "default": DEFAULT_GROUP_BY
                },
                "includeTimestamps": {
                    "type": "boolean",
                    "description": "Whether to include detailed timestamps for each event occurrence.",
                    "default": DEFAULT_INCLUDE_TIMESTAMPS
                },
                "minEventCount": {
                    "type": "integer",
                    "description": "Minimum number of events required to include a site/interface in results (helps filter out noise).",
                    "default": DEFAULT_MIN_EVENT_COUNT,
                    "minimum": 1
                }
            },
            "required": ["accountID", "timeFrame"],
            "additionalProperties": False,
            "schema": "http://json-schema.org/draft-07/schema#"
        }
    }
    
    return {
        "toolDef": tool_def,
        "gqlQuery": GQL_QUERY,
        "inputHandler": _handle_input,
        "responseHandler": _handle_response,
    }


def _handle_input(variables: Dict[str, Any]) -> Dict[str, Any]:
    """
    Handle input variables.
    
    Args:
        variables: The input variables
        
    Returns:
        Processed variables
    """
    return standardize_metrics_input(variables)


GQL_QUERY = """
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
"""


def _handle_response(variables: Dict[str, Any], response: Dict[str, Any]) -> Dict[str, Any]:
    """
    Handle response.
    
    Args:
        variables: The input variables
        response: The GraphQL response
        
    Returns:
        Processed response
    """
    if not is_valid_site_metric_response(variables.get("accountID", ""), response):
        return empty_metrics_response(response.get("data", {}).get("accountMetrics"))
    
    account_metrics = response["data"]["accountMetrics"]
    group_by = variables.get("groupBy") or DEFAULT_GROUP_BY
    annotation_types = variables.get("annotationTypes") or DEFAULT_ANNOTATION_TYPES
    include_timestamps = variables.get("includeTimestamps") or DEFAULT_INCLUDE_TIMESTAMPS
    min_event_count = variables.get("minEventCount") or DEFAULT_MIN_EVENT_COUNT
    
    # Collect all events
    events = []
    event_counts: Dict[str, Any] = {}
    
    for site in account_metrics.get("sites", []):
        for intf in site.get("interfaces", []):
            for annotation in intf.get("annotations", []):
                if annotation.get("type") in annotation_types:
                    event = _build_event(site, intf, annotation)
                    events.append(event)
                    
                    # Count events based on groupBy
                    group_key = _get_group_key(site, intf, annotation, group_by)
                    
                    if group_key not in event_counts:
                        event_counts[group_key] = {
                            "groupKey": group_key,
                            "groupType": group_by,
                            "totalEvents": 0,
                            "eventsByType": {},
                            "events": []
                        }
                        
                        # Add context based on groupBy
                        if group_by in ['site', 'interface']:
                            event_counts[group_key]["siteId"] = site.get("id")
                            event_counts[group_key]["siteName"] = site.get("info", {}).get("name")
                            event_counts[group_key]["siteType"] = site.get("info", {}).get("type")
                            event_counts[group_key]["connType"] = site.get("info", {}).get("connType")
                            event_counts[group_key]["region"] = site.get("info", {}).get("region")
                            event_counts[group_key]["isHA"] = site.get("info", {}).get("isHA")
                        
                        if group_by == 'interface':
                            event_counts[group_key]["interfaceName"] = intf.get("name")
                        
                        if group_by == 'annotationType':
                            event_counts[group_key]["annotationType"] = annotation.get("type")
                            event_counts[group_key]["affectedSites"] = set()
                            event_counts[group_key]["affectedInterfaces"] = set()
                    
                    event_counts[group_key]["totalEvents"] += 1
                    
                    # Count by annotation type
                    annotation_type = annotation.get("type")
                    if annotation_type not in event_counts[group_key]["eventsByType"]:
                        event_counts[group_key]["eventsByType"][annotation_type] = 0
                    event_counts[group_key]["eventsByType"][annotation_type] += 1
                    
                    # Track affected sites/interfaces for annotationType grouping
                    if group_by == 'annotationType':
                        event_counts[group_key]["affectedSites"].add(site.get("info", {}).get("name") or site.get("id"))
                        event_counts[group_key]["affectedInterfaces"].add(f"{site.get('info', {}).get('name') or site.get('id')}:{intf.get('name')}")
                    
                    # Store individual events if timestamps are requested
                    if include_timestamps:
                        event_counts[group_key]["events"].append(event)
    
    # Filter by minimum event count and prepare results
    filtered_groups = _filter_event_counts_by_minimum(event_counts, min_event_count)
    
    results = []
    for group in filtered_groups:
        result: Dict[str, Any] = {
            "group": group["groupKey"],
            "groupType": group["groupType"],
            "totalEvents": group["totalEvents"],
            "eventsByType": group["eventsByType"]
        }
        
        # Add context based on groupBy
        if group["groupType"] in ['site', 'interface']:
            result["siteId"] = group.get("siteId")
            result["siteName"] = group.get("siteName")
            result["siteType"] = group.get("siteType")
            result["connType"] = group.get("connType")
            result["region"] = group.get("region")
            result["isHA"] = group.get("isHA")
        
        if group["groupType"] == 'interface':
            result["interfaceName"] = group.get("interfaceName")
        
        if group["groupType"] == 'annotationType':
            result["annotationType"] = group.get("annotationType")
            affected_sites = group.get("affectedSites", set())
            result["affectedSitesCount"] = len(affected_sites)
            result["affectedInterfacesCount"] = len(group.get("affectedInterfaces", set()))
            result["affectedSites"] = list(affected_sites) if isinstance(affected_sites, set) else affected_sites
        
        # Add individual events if requested
        if include_timestamps and group.get("events"):
            sorted_events = sorted(group["events"], key=lambda e: e.get("timestamp") or "", reverse=True)
            result["events"] = sorted_events
        
        results.append(result)
    
    # Sort by event count descending
    results.sort(key=lambda x: x["totalEvents"], reverse=True)
    
    # Calculate summary statistics
    total_events = len(events)
    event_type_distribution: Dict[str, int] = {}
    for event in events:
        annotation_type = event.get("annotationType")
        event_type_distribution[annotation_type] = event_type_distribution.get(annotation_type, 0) + 1
    
    unique_sites_affected = len(set(e.get("siteName") or e.get("siteId") for e in events))
    unique_interfaces_affected = len(set(f"{e.get('siteName') or e.get('siteId')}:{e.get('interfaceName')}" for e in events))
    
    return {
        "data": {
            "timeFrame": {
                "from": account_metrics.get("from"),
                "to": account_metrics.get("to"),
            },
            "summary": {
                "totalEvents": total_events,
                "groupBy": group_by,
                "annotationTypesAnalyzed": annotation_types,
                "uniqueSitesAffected": unique_sites_affected,
                "uniqueInterfacesAffected": unique_interfaces_affected,
                "eventTypeDistribution": event_type_distribution,
                "resultsReturned": len(results)
            },
            "results": results
        }
    }

