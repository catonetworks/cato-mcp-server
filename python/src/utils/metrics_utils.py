"""
Metrics utilities
"""
from typing import Any, Callable, Dict, List, Optional
from .mcp_logger import log
from mcp import LoggingLevel  # type: ignore[import-untyped]


# Constants
DEFAULT_TIMEFRAME = "last.P1D"
DEFAULT_BUCKETS = 24
DEFAULT_TOP_N = 5

HEALTH_THRESHOLDS = {
    "RTT": 150,
    "PACKET_LOSS": 2,
    "JITTER": 30
}

# Fallback values for grouping when data is missing or undefined
FALLBACK_VALUES = {
    "UNKNOWN": 'Unknown',
    "NONE": 'NONE',
    "PRIMARY": 'PRIMARY',
    "SECONDARY": 'SECONDARY',
    "IN_OFFICE": 'In-Office',
    "REMOTE": 'Remote'
}

# Common aggregation functions
def _sum(values: List[float]) -> float:
    return sum(values)

def _avg(values: List[float]) -> float:
    return sum(values) / len(values) if len(values) > 0 else 0

def _max(values: List[float]) -> float:
    return max(values) if len(values) > 0 else 0

def _min(values: List[float]) -> float:
    return min(values) if len(values) > 0 else 0

AGGREGATION_FUNCTIONS: Dict[str, Callable[[List[float]], float]] = {
    "sum": _sum,
    "avg": _avg,
    "max": _max,
    "min": _min
}


def standardize_metrics_input(variables: Dict[str, Any]) -> Dict[str, Any]:
    """
    Standardize metrics input variables.
    
    Args:
        variables: The input variables
        
    Returns:
        Standardized variables
    """
    if "siteIDs" not in variables or variables["siteIDs"] is None:
        variables["siteIDs"] = []
    if "userIDs" not in variables or variables["userIDs"] is None:
        variables["userIDs"] = []
    if "annotationTypes" not in variables or variables["annotationTypes"] is None:
        variables["annotationTypes"] = None
    return variables


def calculate_bytes_total(bytes_upstream: float, bytes_downstream: float) -> float:
    """
    Calculate total bytes.
    
    Args:
        bytes_upstream: Bytes upstream
        bytes_downstream: Bytes downstream
        
    Returns:
        Total bytes
    """
    return (bytes_upstream or 0) + (bytes_downstream or 0)


def calculate_host_utilization(host_count: float, host_limit: float) -> float:
    """
    Calculate host utilization percentage.
    
    Args:
        host_count: Current host count
        host_limit: Host limit
        
    Returns:
        Utilization percentage
    """
    return (host_count / host_limit * 100) if host_limit > 0 else 0


def calculate_upstream_downstream_ratio(bytes_upstream: float, bytes_downstream: float) -> float:
    """
    Calculate upstream/downstream ratio.
    
    Args:
        bytes_upstream: Bytes upstream
        bytes_downstream: Bytes downstream
        
    Returns:
        Ratio
    """
    return (bytes_upstream / bytes_downstream) if bytes_downstream > 0 else 0


def aggregate_values(values: List[float], aggregation_fn: str) -> float:
    """
    Aggregate values using the specified function.
    
    Args:
        values: List of values to aggregate
        aggregation_fn: Aggregation function name (sum, avg, max, min)
        
    Returns:
        Aggregated value
    """
    valid_values = [v for v in values if v is not None and not (isinstance(v, float) and (v != v or v == float('inf') or v == float('-inf')))]
    if len(valid_values) == 0:
        return 0
    
    fn = AGGREGATION_FUNCTIONS.get(aggregation_fn)
    return fn(valid_values) if fn else _avg(valid_values)


def calculate_summary(data_points: List[List[Any]], aggregation_fn: str) -> Dict[str, Any]:
    """
    Calculate summary for timeseries data.
    
    Args:
        data_points: List of [timestamp, value] pairs
        aggregation_fn: Aggregation function name
        
    Returns:
        Summary dictionary with min, max, avg, and peak
    """
    if not data_points or len(data_points) == 0:
        return {"min": 0, "max": 0, "avg": 0, "peak": {"value": 0, "timestamp": None}}
    
    values = [point[1] for point in data_points if point[1] is not None and point[1] >= 0]
    
    if len(values) == 0:
        return {"min": 0, "max": 0, "avg": 0, "peak": {"value": 0, "timestamp": None}}
    
    min_val = min(values)
    max_val = max(values)
    avg_val = sum(values) / len(values)
    
    # Find peak value and its timestamp
    max_index = next((i for i, point in enumerate(data_points) if point[1] == max_val), -1)
    peak_timestamp = data_points[max_index][0].isoformat() if max_index >= 0 and hasattr(data_points[max_index][0], 'isoformat') else None
    
    return {
        "min": min_val,
        "max": max_val,
        "avg": avg_val,
        "peak": {
            "value": max_val,
            "timestamp": peak_timestamp
        }
    }


def generate_health_flags(metrics: Dict[str, Any], thresholds: Dict[str, Any]) -> List[str]:
    """
    Generate health flags based on thresholds.
    
    Args:
        metrics: Metrics dictionary
        thresholds: Thresholds dictionary
        
    Returns:
        List of health flag messages
    """
    flags = []
    
    if thresholds.get("rtt") and metrics.get("rtt", 0) > thresholds["rtt"]:
        flags.append(f"High RTT ({metrics['rtt']:.1f}ms > {thresholds['rtt']}ms)")
    
    if thresholds.get("packetLoss"):
        if metrics.get("lostUpstreamPcnt", 0) > thresholds["packetLoss"]:
            flags.append(f"High upstream packet loss ({metrics['lostUpstreamPcnt']:.1f}% > {thresholds['packetLoss']}%)")
        if metrics.get("lostDownstreamPcnt", 0) > thresholds["packetLoss"]:
            flags.append(f"High downstream packet loss ({metrics['lostDownstreamPcnt']:.1f}% > {thresholds['packetLoss']}%)")
    
    if thresholds.get("jitter"):
        if metrics.get("jitterUpstream", 0) > thresholds["jitter"]:
            flags.append(f"High upstream jitter ({metrics['jitterUpstream']:.1f}ms > {thresholds['jitter']}ms)")
        if metrics.get("jitterDownstream", 0) > thresholds["jitter"]:
            flags.append(f"High downstream jitter ({metrics['jitterDownstream']:.1f}ms > {thresholds['jitter']}ms)")
    
    if thresholds.get("hostUtilization") and metrics.get("hostUtilizationPct", 0) > thresholds["hostUtilization"]:
        flags.append(f"High capacity utilization ({metrics['hostUtilizationPct']:.1f}% > {thresholds['hostUtilization']}%)")
    
    return flags


# Group key generators
def _group_key_site(site: Dict[str, Any]) -> str:
    return f"{site.get('info', {}).get('name') or site.get('id')}"

def _group_key_site_type(site: Dict[str, Any]) -> str:
    return site.get('info', {}).get('type') or FALLBACK_VALUES["UNKNOWN"]

def _group_key_conn_type(site: Dict[str, Any]) -> str:
    return site.get('info', {}).get('connType') or FALLBACK_VALUES["UNKNOWN"]

def _group_key_region(site: Dict[str, Any]) -> str:
    return site.get('info', {}).get('region') or FALLBACK_VALUES["UNKNOWN"]

def _group_key_interface_role(intf: Dict[str, Any]) -> str:
    return intf.get('interfaceInfo', {}).get('wanRole') or FALLBACK_VALUES["NONE"]

def _group_key_interface_name(intf: Dict[str, Any]) -> str:
    return intf.get('name') or FALLBACK_VALUES["UNKNOWN"]

def _group_key_socket_ha(intf: Dict[str, Any]) -> str:
    return FALLBACK_VALUES["PRIMARY"] if intf.get('socketInfo', {}).get('isPrimary') else FALLBACK_VALUES["SECONDARY"]

def _group_key_user(user: Dict[str, Any]) -> str:
    return f"{user.get('info', {}).get('name') or user.get('name') or user.get('id')}"

def _group_key_os_type(user: Dict[str, Any]) -> str:
    return user.get('info', {}).get('osType') or FALLBACK_VALUES["UNKNOWN"]

def _group_key_client_version(user: Dict[str, Any]) -> str:
    return user.get('info', {}).get('version') or FALLBACK_VALUES["UNKNOWN"]

def _group_key_pop_name(user: Dict[str, Any]) -> str:
    return user.get('info', {}).get('popName') or FALLBACK_VALUES["UNKNOWN"]

def _group_key_connection_status(user: Dict[str, Any]) -> str:
    return user.get('info', {}).get('connectivityStatus') or FALLBACK_VALUES["UNKNOWN"]

def _group_key_in_office(user: Dict[str, Any]) -> str:
    return FALLBACK_VALUES["IN_OFFICE"] if user.get('info', {}).get('connectedInOffice') else FALLBACK_VALUES["REMOTE"]

GROUP_KEY_GENERATORS: Dict[str, Callable[[Dict[str, Any]], str]] = {
    "site": _group_key_site,
    "siteType": _group_key_site_type,
    "connType": _group_key_conn_type,
    "region": _group_key_region,
    "interfaceRole": _group_key_interface_role,
    "interfaceName": _group_key_interface_name,
    "socketHA": _group_key_socket_ha,
    "user": _group_key_user,
    "osType": _group_key_os_type,
    "clientVersion": _group_key_client_version,
    "popName": _group_key_pop_name,
    "connectionStatus": _group_key_connection_status,
    "inOffice": _group_key_in_office,
}


def sort_results(results: List[Dict[str, Any]], sort_by: str, sort_order: str = 'desc') -> List[Dict[str, Any]]:
    """
    Sort results by a field.
    
    Args:
        results: List of result dictionaries
        sort_by: Field to sort by
        sort_order: Sort order ('asc' or 'desc')
        
    Returns:
        Sorted results
    """
    if not sort_by or len(results) == 0 or sort_by not in results[0]:
        return results
    
    reverse = sort_order == 'desc'
    return sorted(results, key=lambda x: x.get(sort_by, 0), reverse=reverse)


def is_valid_site_metric_response(account_id: str, response: Dict[str, Any]) -> bool:
    """
    Validate site metric response.
    
    Args:
        account_id: Account ID
        response: Response dictionary
        
    Returns:
        True if valid, False otherwise
    """
    if response.get("data", {}).get("accountMetrics", {}).get("sites"):
        return True
    
    log("debug", f"No site metrics found in account metrics for account ID: {account_id}")
    return False


def is_valid_user_metric_response(account_id: str, response: Dict[str, Any]) -> bool:
    """
    Validate user metric response.
    
    Args:
        account_id: Account ID
        response: Response dictionary
        
    Returns:
        True if valid, False otherwise
    """
    if response.get("data", {}).get("accountMetrics", {}).get("users"):
        return True
    
    log("debug", f"No user metrics found in account metrics for account ID: {account_id}")
    return False


def empty_metrics_response(account_metrics: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Create empty metrics response.
    
    Args:
        account_metrics: Account metrics dictionary
        
    Returns:
        Empty metrics response
    """
    return {
        "data": {
            "timeFrame": {
                "from": account_metrics.get("from") if account_metrics else None,
                "to": account_metrics.get("to") if account_metrics else None,
            },
            "sites": []
        },
    }


def format_bytes(bytes: float, decimals: int = 2) -> str:
    """
    Format bytes to human-readable string.
    
    Args:
        bytes: Number of bytes
        decimals: Number of decimal places
        
    Returns:
        Formatted string
    """
    if bytes == 0:
        return '0 Bytes'
    
    k = 1024
    dm = max(0, decimals)
    sizes = ['Bytes', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB']
    i = 0 if bytes == 0 else int(__import__('math').floor(__import__('math').log(bytes) / __import__('math').log(k)))
    i = min(i, len(sizes) - 1)
    
    converted = bytes / (k ** i)
    return f'{converted:.{dm}f} {sizes[i]}'

