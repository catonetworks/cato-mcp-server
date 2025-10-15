/**
 * Integration tests for MCP Server end-to-end functionality
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch as any;

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

// Mock the logger
vi.mock('../../utils/mcpLogger.js', () => ({
  initMcpLogger: vi.fn(),
  log: vi.fn()
}));

// Mock the env module
vi.mock('../../utils/env.js', () => ({
  getEnvVariable: vi.fn((key: string, defaultValue?: string) => {
    if (key === 'CATO_API_HOST') return 'api.catonetworks.com';
    if (key === 'CATO_ACCOUNT_ID') return 'test-account-123';
    if (key === 'CATO_API_KEY') return 'test-api-key-456';
    if (key === 'CATO_LOG_LEVEL') return 'info';
    return defaultValue || 'test-value';
  })
}));

describe('MCP Server Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Module Integration', () => {
    it('should integrate all modules successfully', async () => {
      // Test that all modules can be imported and work together
      const { getCatoMcpTools } = await import('../../tools/tools.js');
      const { initializeGraphqlClient, executeGraphqlRequest } = await import('../../graphql/graphql.js');
      const { initMcpLogger, log } = await import('../../utils/mcpLogger.js');
      const { getEnvVariable } = await import('../../utils/env.js');
      
      // Test tools module
      const tools = getCatoMcpTools();
      expect(Array.isArray(tools)).toBe(true);
      
      // Test GraphQL client
      expect(() => initializeGraphqlClient()).not.toThrow();
      
      // Test logger
      expect(() => initMcpLogger(mockServer as any)).not.toThrow();
      expect(() => log('info', 'Test message')).not.toThrow();
      
      // Test environment variables
      const accountId = getEnvVariable('CATO_ACCOUNT_ID');
      expect(accountId).toBe('test-account-123');
    });

    it('should handle GraphQL requests', async () => {
      // Mock successful GraphQL response
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          data: { result: 'success' }
        }),
        headers: {
          get: vi.fn().mockReturnValue(null)
        }
      };
      
      mockFetch.mockResolvedValue(mockResponse);
      
      const { executeGraphqlRequest } = await import('../../graphql/graphql.js');
      
      const result = await executeGraphqlRequest('query TestQuery { test }', {}, undefined);
      expect(result).toContain('success');
    });

    it('should handle GraphQL errors', async () => {
      // Mock GraphQL error
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          errors: [{ message: 'GraphQL error' }]
        }),
        headers: {
          get: vi.fn().mockReturnValue(null)
        }
      };
      
      mockFetch.mockResolvedValue(mockResponse);
      
      const { executeGraphqlRequest } = await import('../../graphql/graphql.js');
      
      await expect(executeGraphqlRequest('query TestQuery { test }', {}, undefined))
        .rejects.toThrow('GraphQL errors: GraphQL error');
    });

    it('should handle network errors', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));
      
      const { executeGraphqlRequest } = await import('../../graphql/graphql.js');
      
      await expect(executeGraphqlRequest('query TestQuery { test }', {}, undefined))
        .rejects.toThrow('Network error');
    });
  });

  describe('Environment Configuration', () => {
    it('should use environment variables for configuration', async () => {
      const { getEnvVariable } = await import('../../utils/env.js');
      
      expect(getEnvVariable('CATO_API_HOST')).toBe('api.catonetworks.com');
      expect(getEnvVariable('CATO_ACCOUNT_ID')).toBe('test-account-123');
      expect(getEnvVariable('CATO_API_KEY')).toBe('test-api-key-456');
    });

    it('should initialize GraphQL client with environment variables', async () => {
      const { initializeGraphqlClient } = await import('../../graphql/graphql.js');
      
      expect(() => initializeGraphqlClient()).not.toThrow();
    });
  });

  describe('Tool System', () => {
    it('should provide tool discovery', async () => {
      const { getCatoMcpTools, findMcpTool, initCatoMcpToolWrappers } = await import('../../tools/tools.js');
      
      // Initialize tools first
      initCatoMcpToolWrappers('test-account-123');
      
      const tools = getCatoMcpTools();
      expect(tools.length).toBeGreaterThan(0);
      
      // Test finding a specific tool
      const tool = findMcpTool('entity_lookup');
      expect(tool).toBeDefined();
      expect(tool.toolDef.name).toBe('entity_lookup');
    });

    it('should handle unknown tools', async () => {
      const { findMcpTool } = await import('../../tools/tools.js');
      
      expect(() => findMcpTool('unknown_tool')).toThrow('Tool unknown_tool not found');
    });
  });

  describe('Error Handling', () => {
    it('should handle environment variable configuration', async () => {
      const { getEnvVariable } = await import('../../utils/env.js');
      
      // Test that environment variables are properly configured
      expect(getEnvVariable('CATO_API_HOST')).toBe('api.catonetworks.com');
      expect(getEnvVariable('CATO_ACCOUNT_ID')).toBe('test-account-123');
      expect(getEnvVariable('CATO_API_KEY')).toBe('test-api-key-456');
    });

    it('should handle HTTP errors from GraphQL', async () => {
      const mockResponse = {
        ok: false,
        status: 401,
        text: vi.fn().mockResolvedValue('Unauthorized'),
        headers: {
          get: vi.fn().mockReturnValue(null)
        }
      };
      
      mockFetch.mockResolvedValue(mockResponse);
      
      const { executeGraphqlRequest } = await import('../../graphql/graphql.js');
      
      await expect(executeGraphqlRequest('query TestQuery { test }', {}, undefined))
        .rejects.toThrow('GraphQL request failed with status: 401');
    });
  });
});
