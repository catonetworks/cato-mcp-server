"""
MCP Logger utilities
"""
from typing import Optional
from mcp.server import Server  # type: ignore[import-untyped]
from mcp import LoggingLevel  # type: ignore[import-untyped]
from .env import get_env_variable


# the mcp server
_mcp_server: Optional[Server] = None

# logging level
_log_level: LoggingLevel = "info"


# Logging level options in order of severity
LOGGING_LEVEL_OPTIONS = [
    "debug",
    "info",
    "notice",
    "warning",
    "error",
    "critical",
    "alert",
    "emergency",
]


def init_mcp_logger(mcp_server_instance: Server) -> None:
    """
    Initialize the MCP logger.
    
    Args:
        mcp_server_instance: The MCP server instance
    """
    global _mcp_server
    _mcp_server = mcp_server_instance
    _initialize_log_level()


def _initialize_log_level() -> None:
    """
    Initialize the logging level from environment variable.
    """
    global _log_level
    
    env_log_level = get_env_variable("CATO_LOG_LEVEL", "info")
    
    # LoggingLevel is a Literal type, so we validate the string value
    valid_levels = ["debug", "info", "notice", "warning", "error", "critical", "alert", "emergency"]
    _log_level = env_log_level.lower() if env_log_level.lower() in valid_levels else "info"


def log(level: LoggingLevel, message: str) -> None:
    """
    Log a message with the given log level to the mcp-client.
    
    Args:
        level: The log level
        message: The message to log
    """
    if not _is_log_level_enabled(level):
        return
    
    if _mcp_server is None:
        return
    
    from datetime import datetime
    
    # Send logging message to MCP server
    try:
        _mcp_server.send_logging_message(
            level=level,
            data={
                "time": datetime.utcnow().isoformat(),
                "message": f"{message}\n",
            }
        )
    except AttributeError:
        # Fallback if send_logging_message doesn't exist on Server
        # In Python MCP SDK, logging might be handled differently
        pass


def _is_log_level_enabled(level: LoggingLevel) -> bool:
    """
    Check if the given log level is enabled.
    
    Args:
        level: The log level to check
        
    Returns:
        True if the log level is enabled, False otherwise
    """
    global _log_level
    
    try:
        level_index = LOGGING_LEVEL_OPTIONS.index(level)
        log_level_index = LOGGING_LEVEL_OPTIONS.index(_log_level)
        return level_index >= log_level_index
    except ValueError:
        return False

