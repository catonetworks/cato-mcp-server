
/**
 * a context for defining the mcp-tools
 */
export type McpToolDefContext = {
    // the default accountId to use when the user doesn't provide one
    accountId: string
}

/**
 * a typed class helper to define the inputSchema of the mcp-tools
 */
export type McpToolDefInputSchema = {
    type: string
    properties: object
    required: string[]
    additionalProperties: boolean
    $schema: string
}

/**
 * a typed class helper to define an mcp tool
 */
export type McpToolDef = {
    name: string
    description: string
    inputSchema: McpToolDefInputSchema,
    outputSchema?: any // optional, if the tool returns a specific output schema
}

/**
 * a Cato mcp-tool wrapper class that also holds the tool's GraphQL query
 */
export type CatoMcpToolWrapper = {
    toolDef: McpToolDef
    gqlQuery: string
    inputHandler?: (variables: Record<string, any>) => Record<string, any>
    responseHandler?: (variables: Record<string, any>, response: any) => any
}
