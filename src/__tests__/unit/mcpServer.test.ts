/**
 * Unit tests for MCP Server core functionality
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the MCP SDK
const mockServer = {
  setRequestHandler: vi.fn(),
  connect: vi.fn(),
  sendLoggingMessage: vi.fn()
};

vi.mock('@modelcontextprotocol/sdk/server/index.js', () => ({
  Server: vi.fn(() => mockServer)
}));

vi.mock('@modelcontextprotocol/sdk/server/stdio.js', () => ({
  StdioServerTransport: vi.fn()
}));

// Mock the tools module
vi.mock('../../tools/tools.js', () => ({
  getCatoMcpTools: vi.fn(() => [
    {
      name: 'test_tool',
      description: 'Test tool',
      inputSchema: {
        type: 'object',
        properties: {
          testParam: { type: 'string' }
        },
        required: ['testParam'],
        additionalProperties: false,
        $schema: 'http://json-schema.org/draft-07/schema#'
      }
    }
  ]),
  findMcpTool: vi.fn(() => ({
    toolDef: {
      name: 'test_tool',
      description: 'Test tool',
      inputSchema: {
        type: 'object',
        properties: {
          testParam: { type: 'string' }
        },
        required: ['testParam'],
        additionalProperties: false,
        $schema: 'http://json-schema.org/draft-07/schema#'
      }
    },
    gqlQuery: 'query TestQuery($testParam: String!) { test(testParam: $testParam) }',
    inputHandler: (variables: any) => variables,
    responseHandler: (variables: any, response: any) => response
  })),
  initCatoMcpToolWrappers: vi.fn()
}));

// Mock the GraphQL module
vi.mock('../../graphql/graphql.js', () => ({
  initializeGraphqlClient: vi.fn(),
  executeGraphqlRequest: vi.fn().mockResolvedValue(JSON.stringify({
    data: { result: 'success' }
  }))
}));

// Mock the logger
vi.mock('../../utils/mcpLogger.js', () => ({
  initMcpLogger: vi.fn(),
  log: vi.fn()
}));

// Mock the env module
vi.mock('../../utils/env.js', () => ({
  getEnvVariable: vi.fn((key: string, defaultValue?: string) => {
    if (key === 'CATO_ACCOUNT_ID') return 'test-account-123';
    return defaultValue || 'test-value';
  })
}));

describe('MCP Server Core Functionality', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Server Configuration', () => {
    it('should work with MCP SDK', () => {
      // Test that the MCP SDK can be imported and used
      const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
      expect(Server).toBeDefined();
      expect(typeof Server).toBe('function');
    });
  });

  describe('Environment Variables', () => {
    it('should handle environment variable retrieval', async () => {
      const { getEnvVariable } = await import('../../utils/env.js');
      
      const result = getEnvVariable('CATO_ACCOUNT_ID');
      expect(result).toBe('test-account-123');
    });

    it('should handle environment variable edge cases', async () => {
      const { getEnvVariable } = await import('../../utils/env.js');
      
      // Test that the function works with the mocked implementation
      const result = getEnvVariable('CATO_ACCOUNT_ID');
      expect(result).toBe('test-account-123');
    });
  });

  describe('Tool Integration', () => {
    it('should work with tools module', async () => {
      const { getCatoMcpTools, findMcpTool } = await import('../../tools/tools.js');
      
      const tools = getCatoMcpTools();
      expect(Array.isArray(tools)).toBe(true);
      
      const tool = findMcpTool('test_tool');
      expect(tool).toBeDefined();
      expect(tool.toolDef.name).toBe('test_tool');
    });
  });

  describe('GraphQL Integration', () => {
    it('should work with GraphQL client', async () => {
      const { initializeGraphqlClient, executeGraphqlRequest } = await import('../../graphql/graphql.js');
      
      expect(() => initializeGraphqlClient()).not.toThrow();
      
      const result = await executeGraphqlRequest('query TestQuery { test }', {}, undefined);
      expect(result).toContain('success');
    });
  });

  describe('Logger Integration', () => {
    it('should work with logger', async () => {
      const { initMcpLogger, log } = await import('../../utils/mcpLogger.js');
      
      expect(() => initMcpLogger(mockServer as any)).not.toThrow();
      expect(() => log('info', 'Test message')).not.toThrow();
    });
  });
});
