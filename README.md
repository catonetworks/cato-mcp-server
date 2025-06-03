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
### sites_snapshot
Description: Returns information about connected sites for a specified account.

Parameters:
```properties
accountID: (Optional) Unique identifier of the account
siteIDs: (Optional) List of site IDs to filter results. Pass as JSON array, e.g. ["12345"]
```

### users_snapshot
Description: Returns information about connected users for a specified account.

Parameters:
```properties
accountID: (Optional) Unique identifier of the account
userIDs: (Optional) Specific user IDs to include in results. Pass as JSON array, e.g. ["12345"]
```

### entity_lookup
Description: Lookup an entity in the specified account.

Parameters:
```properties
accountID: (Optional) Unique identifier of the account
type: (Required) The entity type
limit: (Optional) Max number of results
search: a search string for the entity name
```



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
