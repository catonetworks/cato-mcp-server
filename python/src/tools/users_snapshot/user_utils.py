"""
User utilities
"""
from typing import Any, Dict
from ...utils.mcp_logger import log
from mcp import LoggingLevel  # type: ignore[import-untyped]


def is_valid_response(account_id: str, response: Dict[str, Any]) -> bool:
    """
    Validate response for user snapshot queries.
    
    Args:
        account_id: Account ID
        response: Response dictionary
        
    Returns:
        True if valid, False otherwise
    """
    if response.get("data", {}).get("accountSnapshot", {}).get("users"):
        return True
    
    log("debug", f"No users found in account snapshot for remote_users_details account ID: {account_id}")
    return False


def empty_users_response(timestamp: str) -> Dict[str, Any]:
    """
    Create empty users response.
    
    Args:
        timestamp: Timestamp string
        
    Returns:
        Empty users response
    """
    return {
        "data": {
            "accountSnapshotTimestamp": timestamp,
            "users": []
        },
    }

