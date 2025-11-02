"""
Site utilities
"""
from typing import Any, Dict
from ...utils.mcp_logger import log
from mcp import LoggingLevel  # type: ignore[import-untyped]


def is_valid_response(account_id: str, response: Dict[str, Any]) -> bool:
    """
    Validate response for site snapshot queries.
    
    Args:
        account_id: Account ID
        response: Response dictionary
        
    Returns:
        True if valid, False otherwise
    """
    if response.get("data", {}).get("accountSnapshot", {}).get("sites"):
        return True
    
    log("debug", f"No sites found in account snapshot for account ID: {account_id}")
    return False


def empty_sites_response(timestamp: str) -> Dict[str, Any]:
    """
    Create empty sites response.
    
    Args:
        timestamp: Timestamp string
        
    Returns:
        Empty sites response
    """
    return {
        "data": {
            "accountSnapshotTimestamp": timestamp,
            "sites": []
        },
    }

