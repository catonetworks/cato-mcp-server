import {LoggingLevel, LoggingLevelSchema} from "@modelcontextprotocol/sdk/types.js";
import {Server} from "@modelcontextprotocol/sdk/server/index.js";
import {getEnvVariable} from "./env.js";

// the mcp server
let mcpServer : Server;

// logging level
let logLevel : LoggingLevel;


export function initMcpLogger(
    mcpServerInstance: Server
) {
    mcpServer = mcpServerInstance;
    initializeLogLevel();
}

/**
 * initialize the logging level
 */
function initializeLogLevel() {

    const envLogLevel = getEnvVariable("CATO_LOG_LEVEL", LoggingLevelSchema.Enum.info);

    const parsed = LoggingLevelSchema.safeParse(envLogLevel.toLowerCase());

    if (parsed.success) {
        logLevel = parsed.data;
    } else {
        // Fallback to info level if env var is invalid
        logLevel = LoggingLevelSchema.Enum.info;
    }
}

/**
 * log a message with the given log level to the mcp-client
 * @param logLevel
 * @param message
 */
export function log(logLevel: LoggingLevel, message: string) {
    if (!isLogLevelEnabled(logLevel)) {
        return;
    }

    mcpServer.sendLoggingMessage({
        level: logLevel,
        data: {
            time: `${new Date().toISOString()}`,
            message: `${message}\n`,
        }
    });
}

/**
 * check if the given log level is enabled
 * @param level the log level to check
 */
function isLogLevelEnabled(level: LoggingLevel) {
    return LoggingLevelSchema.options.indexOf(level) >= LoggingLevelSchema.options.indexOf(logLevel);
}

