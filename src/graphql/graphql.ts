import {log} from "../utils/mcpLogger.js";
import {LoggingLevelSchema} from "@modelcontextprotocol/sdk/types.js";
import {getEnvVariable} from "../utils/env.js";

const DEFAULT_MAX_RESPONSE_LENGTH = 200_000;
const MAX_RESPONSE_LENGTH_EXCEEDED_MESSAGE = `You should answer the user's question as best as you can based on this truncated data. 
In your final answer, you have to tell that: the answer may be partial because the data returned exceeded the context window. Here is the truncated data: `;

// Cato GraphQL API endpoint
let graphqlUrl : string

// Cato API key
let apiKey  : string;

// max response length
let maxResponseLength : number;


/**
 * initialize Cato max response length
 */
export function initializeGraphqlClient() {
    initializeGraphqlUrl();
    initializeApiKey();
    initializeMaxResponseLength();
}

/**
 * initialize the GraphQL API endpoint
 */
function initializeGraphqlUrl() {
    graphqlUrl = `https://${getEnvVariable("CATO_API_HOST")}/api/v1/graphql2`;
}

/**
 * initialize the Cato API key
 */
function initializeApiKey() {
    apiKey = getEnvVariable("CATO_API_KEY");
}

function initializeMaxResponseLength() {
    maxResponseLength = parseInt(getEnvVariable("CATO_MAX_RESPONSE_LENGTH", `${DEFAULT_MAX_RESPONSE_LENGTH}`), 10);
    if (!maxResponseLength || isNaN(maxResponseLength) || maxResponseLength <= 0) {
        maxResponseLength = DEFAULT_MAX_RESPONSE_LENGTH;
    }
}

export async function executeGraphqlRequest(gqlQuery: string, variables: Record<string, any>, responseHandler: ((variables: Record<string, any>, response: any) => any) | undefined) {
    // execute the GraphQL request
    let gqlRRequest = buildGraphqlRequest(gqlQuery, variables);

    const response = await fetch(graphqlUrl, gqlRRequest);

    return handleGraphqlResponse(variables, response, responseHandler);
}


/**
 * build the GraphQL request
 * @param gqlQuery the graphql query
 * @param variables the graphql request variables
 */
export function buildGraphqlRequest(gqlQuery: string, variables: Record<string, any>) {
    let gqlRRequest = {
        method: 'POST',
        headers: {
            'User-Agent': 'Cato MCP Server',
            'Content-Type': 'application/json',
            'x-api-key': apiKey
        },
        body: JSON.stringify({
            query: gqlQuery,
            variables: variables
        })
    };

    // log request json, obfuscate x-api-key secret
    log(LoggingLevelSchema.Enum.debug,`GraphQL request: ${JSON.stringify(gqlRRequest).replace(apiKey, '***')}`);
    return gqlRRequest;
}

export async function handleGraphqlResponse(variables: Record<string, any>, response: Response, responseHandler: ((variables: Record<string, any>, response: any) => any) | undefined) {
    // log trace-id if present
    const traceId = response.headers.get('Trace_id');
    if (traceId) {
        log(LoggingLevelSchema.Enum.info, `trace-id: ${traceId}`);
    }

    if (!response.ok) {
        throw new Error(`GraphQL request failed with status: ${response.status}. Response: ${await response.text()}`);
    }

    let result = await response.json();

    validateGraphqlResponseBody(result);

    if (responseHandler) {
        result = responseHandler(variables, result);
    }

    let responseText = JSON.stringify(result, null, 0);
    if (responseText.length > maxResponseLength) {
        responseText = MAX_RESPONSE_LENGTH_EXCEEDED_MESSAGE + responseText.substring(0, maxResponseLength);
    }

    return responseText;
}

function validateGraphqlResponseBody(result: any) {

    // log all errors
    if (result.errors && result.errors.length > 0) {
        log(LoggingLevelSchema.Enum.error, `GraphQL response errors: ${JSON.stringify(result.errors)}`);
    }

    // throw an error if no data, or all data fields are null
    if (!result.data || result.data.length === 0 || Object.values(result.data).every(value => value === null)) {
        const errorMessage = result.errors.map((e: any) => e.message).join(', ');
        throw new Error(`GraphQL errors: ${errorMessage}`);
    }

}
