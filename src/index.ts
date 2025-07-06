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
 * Extract default values from tool schema properties
 * @param toolName the name of the tool
 */
function extractToolDefaultValues(toolName: string): Record<string, any> {
    const variables: Record<string, any> = {};

    // Get the tool definition to access default values
    const tool = findMcpTool(toolName);
    const toolProperties = tool.toolDef.inputSchema.properties as Record<string, any>;

    // Apply default values from the schema
    for (const propName in toolProperties) {
        const propDef = toolProperties[propName];
        if (propDef.default !== undefined) {
            variables[propName] = propDef.default;
            log(LoggingLevelSchema.Enum.debug, `Applied default for ${propName}: ${propDef.default}`);
        }
    }

    return variables;
}

/**
 * Override default variables with LLM-provided arguments
 * @param variablesDefaultValues the default variables from tool schema
 * @param toolName the name of the tool (for error reporting)
 * @param mcpToolRequestArguments the mcp tool invocation request arguments
 */
function llmProvidedVariablesOverride(
    variablesDefaultValues: Record<string, any>,
    toolName: string,
    mcpToolRequestArguments: Record<string, unknown> | undefined
): Record<string, any> {
    const variables = { ...variablesDefaultValues };

    // Override with provided arguments
    if (mcpToolRequestArguments) {
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
                log(LoggingLevelSchema.Enum.debug, `Override ${argName} with provided value: ${argValue}`);
            }
        }
    }

    return variables;
}

/**
 * prepare the GraphQL variables for the request
 * @param toolName the name of the tool
 * @param mcpToolRequestArguments the mcp tool invocation request arguments
 * @param inputHandler an optional input handler to modify the variables before sending the request
 */
function prepareGraphqlVariables(toolName: string, mcpToolRequestArguments: Record<string, unknown> | undefined, inputHandler?: ((variables: Record<string, any>) => Record<string, any>) | undefined) {
    const variablesDefaultValues = extractToolDefaultValues(toolName);
    const variablesWithOverrides = llmProvidedVariablesOverride(variablesDefaultValues, toolName, mcpToolRequestArguments);

    if (!inputHandler) {
        return variablesWithOverrides;
    }
    const handledVariables = inputHandler(variablesWithOverrides);
    log(LoggingLevelSchema.Enum.debug, `Variables after inputHandler: ${JSON.stringify(handledVariables)}`);
    return handledVariables;
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
