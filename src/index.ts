import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {StdioServerTransport} from "@modelcontextprotocol/sdk/server/stdio.js";

import {
    ListToolsRequestSchema,
    CallToolRequestSchema,
    LoggingLevelSchema
} from "@modelcontextprotocol/sdk/types.js";

import {getEnvVariable} from "./utils/env.js";
import {initMcpLogger, log} from "./utils/mcpLogger.js";

import {findMcpTool, getCatoMcpTools, initCatoMcpToolWrappers} from "./tools/tools.js";
import {
    initializeGraphqlClient,
    executeGraphqlRequest,
} from "./graphql/graphql.js";


// the mcp server
let mcpServer : Server;

// cato accountId
let accountId : string



/**
 * Builds the MCP server
 */
function buildMcpServer() {
    return new Server({
        name: "cato-mcp-server",
        version: "1.0.0",
    }, {
        capabilities: {
            logging: {
                defaultLevel: "info",
                format: "json",
            },
            resources: {},
            tools: {},
        },
    });
}

/**
 * registers the Cato MCP tool wrappers with the MCP server
 */
function registerMcpTools() {
    // Register tools
    mcpServer.setRequestHandler(ListToolsRequestSchema, async () => {
        // return all values of the tools map
        return { tools: getCatoMcpTools() };
    });

    // Handle tool call
    mcpServer.setRequestHandler(CallToolRequestSchema, async (request) => {
        let toolName = request.params.name;
        try {
            let toolArguments = request.params.arguments;
            log(LoggingLevelSchema.Enum.info, `Executing ${toolName} query with args: ${JSON.stringify(toolArguments)}`);

            // find the tool to execute
            const tool = findMcpTool(toolName)

            const graphqlVariables = prepareGraphqlVariables(toolName, toolArguments, tool.inputHandler);
            log(LoggingLevelSchema.Enum.debug,`GraphQL request variables: ${JSON.stringify(graphqlVariables)}`);

            const toolResponse = await executeGraphqlRequest(tool.gqlQuery, graphqlVariables, tool.responseHandler);

            // Return the data
            return {
                content: [
                    {
                        type: "text",
                        text: toolResponse
                    }
                ]
            };
        } catch (error) {
            log(LoggingLevelSchema.Enum.error, `Error executing ${toolName} tool: ${error}`);
            return {
                content: [
                    {
                        errors: {
                            message: `Error executing tool: ${error instanceof Error ? error.message : String(error)}`
                        }
                    }
                ]
            };
        }
    });

}

/**
 * prepare the GraphQL variables for the request
 * @param toolName the name of the tool
 * @param mcpToolRequestArguments the mcp tool invocation request arguments
 * @param inputHandler an optional input handler to modify the variables before sending the request
 */
function prepareGraphqlVariables(toolName: string, mcpToolRequestArguments: Record<string, unknown> | undefined, inputHandler?: ((variables: Record<string, any>) => Record<string, any>) | undefined) {
    const variables: Record<string, any> = {};
    for (const argName in mcpToolRequestArguments) {
        if (mcpToolRequestArguments[argName] !== undefined && mcpToolRequestArguments[argName] !== null) {
            let argValue = mcpToolRequestArguments[argName];
            if (typeof argValue === 'string' && (argValue.trim().startsWith('{') || argValue.trim().startsWith('['))) {
                try {
                    argValue = JSON.parse(argValue);
                } catch (e) {
                    throw new Error(`Error parsing ${toolName} tool argument ${argName} with value ${argValue}: ${e}`);
                }
            }
            variables[argName] = argValue;
        }
    }

    if (inputHandler) {
        inputHandler(variables);
    }


    return variables;
}




/**
 * initialize the default accountId
 */
function initializeAccountId() {
    accountId = getEnvVariable("CATO_ACCOUNT_ID");
}


async function main() {

    // initialize cato accountId
    initializeAccountId()

    // initialize cato graphql client
    initializeGraphqlClient();

    // build cato mcp server and tools
    mcpServer = buildMcpServer();
    initMcpLogger(mcpServer);
    initCatoMcpToolWrappers(accountId);
    registerMcpTools();

    // Setup signal handlers
    setupGracefulShutdown();

    // start cato mcp server
    await mcpServer.connect(new StdioServerTransport());
}

main().catch((error) => {
    console.error("Fatal error in main():" + error);
    process.exit(1);
});


// Setup graceful shutdown for the MCP server
function setupGracefulShutdown() {
    const shutdown = async (signal: string) => {
        try {
            log(LoggingLevelSchema.Enum.info, `Received ${signal}. Shutting down MCP server gracefully...`);

            // Exit with success code
            process.exit(0);
        } catch (error) {
            log(LoggingLevelSchema.Enum.error, `Error during shutdown: ${error instanceof Error ? error.message : String(error)}`);
            process.exit(1);
        }
    };

    // Listen for termination signals
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
}
