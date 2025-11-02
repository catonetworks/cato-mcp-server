"""
GraphQL client for Cato API
"""
import json
from typing import Any, Callable, Dict, Optional
import httpx
from ..utils.mcp_logger import log
from ..utils.env import get_env_variable
from mcp import LoggingLevel  # type: ignore[import-untyped]


DEFAULT_MAX_RESPONSE_LENGTH = 200_000
MAX_RESPONSE_LENGTH_EXCEEDED_MESSAGE = """You should answer the user's question as best as you can based on this truncated data. 
In your final answer, you have to tell that: the answer may be partial because the data returned exceeded the context window. Here is the truncated data: """

# Cato GraphQL API endpoint
_graphql_url: Optional[str] = None

# Cato API key
_api_key: Optional[str] = None

# max response length
_max_response_length: int = DEFAULT_MAX_RESPONSE_LENGTH


def initialize_graphql_client() -> None:
    """
    Initialize Cato GraphQL client.
    """
    _initialize_graphql_url()
    _initialize_api_key()
    _initialize_max_response_length()


def _initialize_graphql_url() -> None:
    """
    Initialize the GraphQL API endpoint.
    """
    global _graphql_url
    api_host = get_env_variable("CATO_API_HOST")
    _graphql_url = f"https://{api_host}/api/v1/graphql2"


def _initialize_api_key() -> None:
    """
    Initialize the Cato API key.
    """
    global _api_key
    _api_key = get_env_variable("CATO_API_KEY")


def _initialize_max_response_length() -> None:
    """
    Initialize max response length.
    """
    global _max_response_length
    try:
        max_length_str = get_env_variable("CATO_MAX_RESPONSE_LENGTH", str(DEFAULT_MAX_RESPONSE_LENGTH))
        max_length = int(max_length_str)
        if max_length <= 0:
            max_length = DEFAULT_MAX_RESPONSE_LENGTH
        _max_response_length = max_length
    except ValueError:
        _max_response_length = DEFAULT_MAX_RESPONSE_LENGTH


async def execute_graphql_request(
    gql_query: str,
    variables: Dict[str, Any],
    response_handler: Optional[Callable[[Dict[str, Any], Dict[str, Any]], Dict[str, Any]]] = None
) -> str:
    """
    Execute a GraphQL request.
    
    Args:
        gql_query: The GraphQL query string
        variables: The GraphQL variables
        response_handler: Optional response handler function
        
    Returns:
        JSON string of the response
    """
    gql_request = _build_graphql_request(gql_query, variables)
    
    async with httpx.AsyncClient() as client:
        response = await client.request(**gql_request)
    
    return await _handle_graphql_response(variables, response, response_handler)


def _build_graphql_request(gql_query: str, variables: Dict[str, Any]) -> Dict[str, Any]:
    """
    Build the GraphQL request.
    
    Args:
        gql_query: The GraphQL query string
        variables: The GraphQL variables
        
    Returns:
        Request dictionary for httpx
    """
    global _api_key
    
    request_data = {
        "method": "POST",
        "url": _graphql_url,
        "headers": {
            "User-Agent": "Cato MCP Server",
            "Content-Type": "application/json",
            "x-api-key": _api_key
        },
        "json": {
            "query": gql_query,
            "variables": variables
        }
    }
    
    # log request json, obfuscate x-api-key secret
    request_json = json.dumps({
        "method": "POST",
        "url": _graphql_url,
        "headers": {
            "User-Agent": "Cato MCP Server",
            "Content-Type": "application/json",
            "x-api-key": "***"
        },
        "body": {
            "query": gql_query,
            "variables": variables
        }
    })
    log("debug", f"GraphQL request: {request_json}")
    
    return request_data


async def _handle_graphql_response(
    variables: Dict[str, Any],
    response: httpx.Response,
    response_handler: Optional[Callable[[Dict[str, Any], Dict[str, Any]], Dict[str, Any]]] = None
) -> str:
    """
    Handle GraphQL response.
    
    Args:
        variables: The GraphQL variables
        response: The HTTP response
        response_handler: Optional response handler function
        
    Returns:
        JSON string of the processed response
    """
    # log trace-id if present
    trace_id = response.headers.get("Trace_id")
    if trace_id:
        log("info", f"trace-id: {trace_id}")
    
    if not response.is_success:
        error_text = response.text
        raise ValueError(f"GraphQL request failed with status: {response.status_code}. Response: {error_text}")
    
    result = response.json()
    
    _validate_graphql_response_body(result)
    
    if response_handler:
        result = response_handler(variables, result)
    
    response_text = json.dumps(result, separators=(',', ':'))
    if len(response_text) > _max_response_length:
        response_text = MAX_RESPONSE_LENGTH_EXCEEDED_MESSAGE + response_text[: _max_response_length]
    
    return response_text


def _validate_graphql_response_body(result: Dict[str, Any]) -> None:
    """
    Validate GraphQL response body.
    
    Args:
        result: The response result dictionary
        
    Raises:
        ValueError: If the response is invalid
    """
    # log all errors
    if result.get("errors") and len(result["errors"]) > 0:
        log("error", f"GraphQL response errors: {json.dumps(result['errors'])}")
    
    # throw an error if no data, or all data fields are null
    data = result.get("data")
    if not data or (isinstance(data, list) and len(data) == 0) or (
        isinstance(data, dict) and all(value is None for value in data.values())
    ):
        error_message = ", ".join([e.get("message", "") for e in result.get("errors", [])])
        raise ValueError(f"GraphQL errors: {error_message}")

