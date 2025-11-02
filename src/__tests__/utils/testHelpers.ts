/**
 * Test helper utilities
 */

import { CatoMcpToolWrapper } from '../../tools/common/catoMcpTool.js';

/**
 * Creates a mock MCP tool wrapper for testing
 */
export function createMockToolWrapper(
  name: string,
  description: string = 'Test tool description'
): CatoMcpToolWrapper {
  return {
    toolDef: {
      name,
      description,
      inputSchema: {
        type: 'object',
        properties: {
          testParam: {
            type: 'string',
            description: 'Test parameter'
          }
        },
        required: ['testParam'],
        additionalProperties: false,
        $schema: 'http://json-schema.org/draft-07/schema#'
      }
    },
    gqlQuery: 'query TestQuery($testParam: String!) { test(testParam: $testParam) }',
    inputHandler: (variables) => variables,
    responseHandler: (variables, response) => response
  };
}

/**
 * Creates mock GraphQL variables for testing
 */
export function createMockVariables(overrides: Record<string, any> = {}) {
  return {
    accountId: 'test-account-123',
    ...overrides
  };
}

/**
 * Creates a mock MCP request for testing
 */
export function createMockMcpRequest(toolName: string, arguments_: Record<string, any> = {}) {
  return {
    params: {
      name: toolName,
      arguments: arguments_
    }
  };
}

/**
 * Waits for a specified number of milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
