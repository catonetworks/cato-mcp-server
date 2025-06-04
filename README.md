# Cato MCP CMA

A Model Context Protocol (MCP) server implementation that integrates with Cato CMA Public API.

## Overview

This server implements the Model Context Protocol to allow AI assistants to interact with Cato's GraphQL API. It provides tools that enable AI models to query and retrieve information from Cato systems in a standardized way.

The provided MCP server has been tested for compatibility with popular MCP clients (non-free tier) - such as Cursor and Claude Desktop using the Claude Sonnet 3.7 model, and is recommended for use with these clients.

## Deployment using Docker (recommended)

Start by building the Docker image:
In this folder, execute:
```bash
docker build -t catonetworks/mcp-server .
```

Then, configure your MCP client (e.g. Claude) like this:

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
          "catonetworks/mcp-server"
      ],
      "disabled": false,
      "autoApprove": []
    }
  }
}
```

## Development
Building from source:
`yarn install`
`yarn build`

## Configuration
The server requires the following environment variables:
```properties
# The hostname of the Cato API (without protocol). e.g.: api.catonetworks.com
CATO_API_HOST: "api.catonetworks.com"
# The Cato account-id
CATO_ACCOUNT_ID: "1234567"
# The Cato API-KEY for authentication
CATO_API_KEY: "123abc"
CATO_LOG_LEVEL="debug"|"info"|"error" (optional env var to set log level. default: "info")
```

## Available Tools

| Category          | Tool                    | Description                                                                                                                                               |
|-------------------|-------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------|
| Entity Lookup     | entity_lookup           | Retrieve a list of entities of a specific type (e.g., users, sites, services),with optional filtering (e.g., by name) and pagination support.             |
| Sites             | site_types              | Provides details for all configured sites, including connection methods (e.g., Socket, IPSEC, vSocket).                                                   |
|                   | sites_by_location       | Returns site data enriched with geographic location and associated PoP connectivity information.                                                          |
|                   | socket_versions         | Lists version information for all deployed Sockets, including site association.                                                                           |
|                   | degraded_sites          | Identifies sites experiencing connectivity degradation (e.g., latency, packet loss) or High Availability (HA) issues such as socket redundancy failures.  |
|                   | wan_connectivity        | Provides real-time metrics for WAN links at each site, including traffic volume, packet loss, latency, and jitter, to assess link performance and health. |
| Users and Clients | user_details            | Provides profile and status information for connected remote users, including device name, operating system, and connection status.                       |
|                   | user_connection_details | Offers session-specific data for connected remote users, such as uptime, connection duration, and associated PoP details.                                 |
|                   | user_software_versions  | Lists operating system and Cato Client version information for connected remote users.                                                                    |


## Registration in Claude-Desktop
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
