# Cato MCP CMA

A Model Context Protocol (MCP) server implementation that integrates with Cato CMA Public API.

## Overview

This server implements the Model Context Protocol to allow AI assistants to interact with Cato's GraphQL API.  
It provides tools that enable AI models to query and retrieve information from Cato systems in a standardized way.

The provided MCP server has been tested for compatibility with popular MCP clients (non-free tier) - such as Cursor and Claude Desktop using the Claude Sonnet 4 model, and is recommended for use with these clients.

The server is available as a docker image at ghcr.io/catonetworks/cato-mcp-server


## Add the following to Claude-Desktop config file:\
MacOS: `~/Library/Application\ Support/Claude/claude_desktop_config.json`\
Windows: `%APPDATA%\Claude\claude_desktop_config.json` 
```json
{
  "mcpServers": {
    "cato": {
      "command": "docker",
      "args": [
          "run",
          "--rm",
          "--pull",
          "always",
          "-i",
          "-e", "CATO_API_HOST=<your Cato API Host>",
          "-e", "CATO_ACCOUNT_ID=<your Cato Account ID>",
          "-e", "CATO_API_KEY=<your Cato API Key>",
          "ghcr.io/catonetworks/cato-mcp-server:latest"
      ],
      "disabled": false,
      "autoApprove": []
    }
  }
}
```

### Notes:
- The `--pull always` option ensures that the AI Agent application (e.g. Claude-Desktop) uses cato-mcp-server's most updated version.\
The AI Agent application running cato-mcp-server might open a popup asking for permissions to access data from other apps.\
![img.png](img.png)
  - If you don't wish to allow this, you can remove the `--pull always` option, but then you will need to manually update the image when a new version is released by executing:
  ```bash
  docker pull ghcr.io/catonetworks/cato-mcp-server:latest
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
`yarn install`  
`yarn build`


### Claude-Desktop configuration example:
add the following to: `~/Library/Application\ Support/Claude/claude_desktop_config.json`
```json
{
    "mcpServers": {
        "cato": {
            "command": "node",
            "args": ["/path/to/cato-mcp-cma/build/index.js"],
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

### Building the Docker image:
at the root of the project, run:
```bash
docker build -t catonetworks/cato-mcp-server .
```
## Claude-Desktop mcp-server configuration example:
add the following to: `~/Library/Application\ Support/Claude/claude_desktop_config.json`
```json
{
  "mcpServers": {
    "cato": {
      "command": "docker",
      "args": [
          "run",
          "--rm",
          "-i",
          "-e", "CATO_API_HOST=api.catonetworks.com",
          "-e", "CATO_ACCOUNT_ID=<your Cato Account ID>",
          "-e", "CATO_API_KEY=<your Cato API Key>",
          "catonetworks/cato-mcp-server"
      ],
      "disabled": false,
      "autoApprove": []
    }
  }
}
```
