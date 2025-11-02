# Cato MCP Server (Python)

A Model Context Protocol (MCP) server implementation in Python that integrates with Cato CMA Public API.

## Overview

This is the Python port of the Cato MCP Server, providing equivalent functionality to the TypeScript version. This server implements the Model Context Protocol to allow AI assistants to interact with Cato's GraphQL API. It provides tools that enable AI models to query and retrieve information from Cato systems in a standardized way.

The provided MCP server has been tested for compatibility with popular MCP clients (non-free tier) - such as Cursor and Claude Desktop using the Claude Sonnet 4 model, and is recommended for use with these clients.

## Installation

### Prerequisites

- Python 3.10 or higher
- pip or poetry for package management

### Setup

1. Install dependencies:

```bash
pip install -r requirements.txt
```

For development:

```bash
pip install -r requirements-dev.txt
```

### Using with Python

You can run the Python MCP server directly:

```bash
python -m src
```

Or set up as an executable:

```bash
pip install -e .
cato-mcp-server
```

## Configuration

The server requires the following environment variables:

```properties
# The hostname of the Cato API (without protocol). e.g.: api.catonetworks.com
# For details about your Cato API hostname, please see: https://support.catonetworks.com/hc/en-us/articles/20564679978397-What-is-the-Cato-API
CATO_API_HOST: "api.catonetworks.com"

# The Cato account-id
CATO_ACCOUNT_ID: "1234567"

# The Cato API-KEY for authentication
CATO_API_KEY: "123abc"

# Optional: Maximum response length (default: 200000)
CATO_MAX_RESPONSE_LENGTH: "200000"

# Optional: Logging level (default: info)
# Options: debug, info, warning, error
CATO_LOG_LEVEL: "info"
```

## Available Tools

| Category          | Tool                          | Description                                                                                                                                                                           |
|-------------------|-------------------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Entity Lookup     | entity_lookup                 | Retrieve a list of entities of a specific type (e.g., users, sites, services),with optional filtering (e.g., by name) and pagination support.                                         |
| Sites             | sites_by_location             | Returns site data enriched with geographic location and associated PoP connectivity information.                                                                                      |
|                   | site_details                  | Retrieves comprehensive site details including operational status, connectivity status, High Availability (HA) information, and device interface statuses.                            |
|                   | site_types                    | Provides details for all configured sites, including connection methods (e.g., Socket, IPSEC, vSocket).                                                                               |
|                   | socket_versions               | Lists version information for all deployed Sockets, including site association.                                                                                                       |
|                   | wan_connectivity              | Provides real-time metrics for WAN links at each site, including traffic volume, packet loss, latency, and jitter, to assess link performance and health.                             |
| Users and Clients | user_details                  | Provides profile and status information for connected remote users, including device name, operating system, and connection status.                                                   |
|                   | user_connection_details       | Offers session-specific data for connected remote users, such as uptime, connection duration, and associated PoP details.                                                             |
|                   | user_software_versions        | Lists operating system and Cato Client version information for connected remote users.                                                                                                |
| Site Metrics      | site_network_health           | Retrieves a summary of network health for sites over a specified time frame, identifying sites with poor network quality (high packet loss, latency, jitter).                         |
|                   | top_site_bandwidth_consumers  | Ranks sites by total traffic (bytesUpstream + bytesDownstream) in a given time frame for capacity planning and traffic analysis.                                                      |
|                   | site_metrics_timeseries       | Retrieves time-bucketed metrics data for sites, enabling trend analysis, peak detection, and traffic pattern identification.                                                          |
|                   | site_metrics                  | Returns aggregated metrics for sites (no timeseries data).                                                                                                                            |
|                   | site_metrics_summary          | Provides aggregated metrics analysis for sites grouped by various dimensions like site type, connection type, region, or interface role.                                              |
|                   | annotation_event_counter      | Analyzes infrastructure change events and annotations to track stability and identify sites with frequent changes or issues.                                                          |
| User Metrics      | top_users_bandwidth_consumers | Ranks VPN-connected users by total traffic (bytesUpstream + bytesDownstream) in a given time frame for bandwidth monitoring, cost management, and identifying unusual usage patterns. |
|                   | user_metrics_timeseries       | Retrieves time-bucketed metrics data for VPN-connected users, enabling trend analysis and performance monitoring over time.                                                           |
|                   | user_metrics                  | Returns aggregated metrics for VPN-connected users (no timeseries data).                                                                                                              |

## Development

### Building from source:

```bash
# Install dependencies
pip install -r requirements.txt
pip install -r requirements-dev.txt

# Run the server
python -m src
```

### Testing:

```bash
# Run all tests
pytest

# Run tests with coverage
pytest --cov=src --cov-report=html --cov-report=term

# Run tests in watch mode (if pytest-watch is installed)
ptw

# Run specific test file
pytest tests/unit/test_env.py

# Run integration tests
pytest tests/integration/
```

### Project Structure

```
python/
├── src/
│   ├── __main__.py          # Main entry point
│   ├── graphql/
│   │   └── graphql.py        # GraphQL client
│   ├── tools/
│   │   ├── tools.py          # Tool registry
│   │   ├── common/
│   │   ├── entity_lookup/
│   │   ├── sites_snapshot/
│   │   ├── users_snapshot/
│   │   ├── sites_metrics/
│   │   └── users_metrics/
│   └── utils/
│       ├── env.py            # Environment utilities
│       ├── mcp_logger.py     # MCP logger
│       └── metrics_utils.py   # Metrics utilities
├── tests/
│   ├── conftest.py          # Pytest configuration
│   ├── unit/                # Unit tests
│   └── integration/         # Integration tests
├── pyproject.toml           # Project configuration
├── requirements.txt         # Production dependencies
├── requirements-dev.txt     # Development dependencies
├── pytest.ini              # Pytest configuration
└── README.md               # This file
```

## Claude-Desktop Configuration Example

Add the following to: `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
    "mcpServers": {
        "cato": {
            "command": "python",
            "args": ["-m", "src"],
            "cwd": "/path/to/cato-mcp-server/python",
            "env": {
                "CATO_API_HOST": "api.catonetworks.com",
                "CATO_ACCOUNT_ID": "1234567",
                "CATO_API_KEY": "123abc",
                "CATO_LOG_LEVEL": "debug"
            },
            "disabled": false,
            "autoApprove": []
        }        
    }
}
```

Or if using a virtual environment:

```json
{
    "mcpServers": {
        "cato": {
            "command": "/path/to/venv/bin/python",
            "args": ["-m", "src"],
            "cwd": "/path/to/cato-mcp-server/python",
            "env": {
                "CATO_API_HOST": "api.catonetworks.com",
                "CATO_ACCOUNT_ID": "1234567",
                "CATO_API_KEY": "123abc"
            },
            "disabled": false,
            "autoApprove": []
        }        
    }
}
```

## Docker Usage (Optional)

You can also use the Python server in Docker. Create a `Dockerfile` in the `python/` directory:

```dockerfile
FROM python:3.10-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY src/ ./src/

CMD ["python", "-m", "src"]
```

Then build and run:

```bash
docker build -t cato-mcp-server-python .
docker run --rm -i \
  -e CATO_API_HOST=api.catonetworks.com \
  -e CATO_ACCOUNT_ID=1234567 \
  -e CATO_API_KEY=123abc \
  cato-mcp-server-python
```

## Differences from TypeScript Version

This Python implementation maintains feature parity with the TypeScript version:

- All tools are ported with equivalent functionality
- Same GraphQL queries and response handling
- Equivalent error handling and logging
- Same environment variable configuration
- Equivalent test coverage structure

The main differences are:
- Uses Python's `asyncio` for async operations instead of JavaScript promises
- Uses `httpx` for HTTP requests instead of native `fetch`
- Uses `pytest` for testing instead of `vitest`
- Uses Python's type hints instead of TypeScript types

## Troubleshooting

### Import Errors

If you encounter import errors, ensure you're running from the correct directory:

```bash
cd python
python -m src
```

Or set the PYTHONPATH:

```bash
export PYTHONPATH=/path/to/cato-mcp-server/python:$PYTHONPATH
python -m src
```

### MCP SDK Issues

Make sure you have the correct MCP SDK package installed:

```bash
pip install mcp>=1.0.0
```

### Environment Variables

Ensure all required environment variables are set before running:

```bash
export CATO_API_HOST=api.catonetworks.com
export CATO_ACCOUNT_ID=1234567
export CATO_API_KEY=your-api-key
python -m src
```

## License

ISC

