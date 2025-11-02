"""
get an environment variable by name
"""
import os
from typing import Optional


def get_env_variable(name: str, default_value: Optional[str] = None) -> str:
    """
    Get an environment variable by name.
    
    Args:
        name: The environment variable name
        default_value: Optional default value if the env var is not set
        
    Returns:
        The environment variable value
        
    Raises:
        ValueError: If the environment variable is not set and no default is provided
    """
    value = os.getenv(name)
    if value:
        return value
    if default_value is not None:
        return default_value
    raise ValueError(f"Environment variable {name} is not set")

