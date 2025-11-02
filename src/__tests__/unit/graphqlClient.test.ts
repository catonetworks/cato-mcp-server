/**
 * Unit tests for GraphQL client functionality
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch as any;

// Mock the logger
vi.mock('../../utils/mcpLogger.js', () => ({
  log: vi.fn()
}));

// Mock the env module
vi.mock('../../utils/env.js', () => ({
  getEnvVariable: vi.fn((key: string, defaultValue?: string) => {
    if (key === 'CATO_API_HOST') return 'api.catonetworks.com';
    if (key === 'CATO_API_KEY') return 'test-api-key-123';
    if (key === 'CATO_MAX_RESPONSE_LENGTH') return '200000';
    return defaultValue || 'test-value';
  })
}));

describe('GraphQL Client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Client Initialization', () => {
    it('should initialize GraphQL client with environment variables', async () => {
      const { initializeGraphqlClient } = await import('../../graphql/graphql.js');
      
      expect(() => initializeGraphqlClient()).not.toThrow();
    });
  });

  describe('Request Building', () => {
    it('should build correct GraphQL request', async () => {
      const { buildGraphqlRequest } = await import('../../graphql/graphql.js');
      
      const query = 'query TestQuery($param: String!) { test(param: $param) }';
      const variables = { param: 'test-value' };
      
      const request = buildGraphqlRequest(query, variables);
      
      expect(request.method).toBe('POST');
      expect(request.headers['Content-Type']).toBe('application/json');
      expect(request.headers['x-api-key']).toBe('test-api-key-123');
      expect(request.headers['User-Agent']).toBe('Cato MCP Server');
      
      const body = JSON.parse(request.body);
      expect(body.query).toBe(query);
      expect(body.variables).toEqual(variables);
    });
  });

  describe('Request Execution', () => {
    it('should execute GraphQL request successfully', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          data: { result: 'success' }
        }),
        headers: {
          get: vi.fn().mockReturnValue('trace-123')
        }
      };
      
      mockFetch.mockResolvedValue(mockResponse);
      
      const { executeGraphqlRequest } = await import('../../graphql/graphql.js');
      
      const result = await executeGraphqlRequest('query TestQuery { test }', {}, undefined);
      
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.catonetworks.com/api/v1/graphql2',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'x-api-key': 'test-api-key-123'
          })
        })
      );
      expect(result).toContain('success');
    });

    it('should handle GraphQL errors', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          errors: [{ message: 'GraphQL error', locations: [{ line: 1, column: 1 }] }]
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

    it('should handle HTTP errors', async () => {
      const mockResponse = {
        ok: false,
        status: 500,
        text: vi.fn().mockResolvedValue('Internal Server Error'),
        headers: {
          get: vi.fn().mockReturnValue(null)
        }
      };
      
      mockFetch.mockResolvedValue(mockResponse);
      
      const { executeGraphqlRequest } = await import('../../graphql/graphql.js');
      
      await expect(executeGraphqlRequest('query TestQuery { test }', {}, undefined))
        .rejects.toThrow('GraphQL request failed with status: 500');
    });

    it('should handle network errors', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));
      
      const { executeGraphqlRequest } = await import('../../graphql/graphql.js');
      
      await expect(executeGraphqlRequest('query TestQuery { test }', {}, undefined))
        .rejects.toThrow('Network error');
    });

    it('should truncate large responses', async () => {
      const largeData = 'x'.repeat(300000); // Larger than default max response length
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          data: { result: largeData }
        }),
        headers: {
          get: vi.fn().mockReturnValue(null)
        }
      };
      
      mockFetch.mockResolvedValue(mockResponse);
      
      const { executeGraphqlRequest } = await import('../../graphql/graphql.js');
      
      const result = await executeGraphqlRequest('query TestQuery { test }', {}, undefined);
      
      expect(result).toContain('You should answer the user\'s question as best as you can based on this truncated data');
      expect(result.length).toBeLessThan(300000);
    });

    it('should handle empty data responses', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          data: null,
          errors: [{ message: 'No data returned' }]
        }),
        headers: {
          get: vi.fn().mockReturnValue(null)
        }
      };
      
      mockFetch.mockResolvedValue(mockResponse);
      
      const { executeGraphqlRequest } = await import('../../graphql/graphql.js');
      
      await expect(executeGraphqlRequest('query TestQuery { test }', {}, undefined))
        .rejects.toThrow('GraphQL errors: No data returned');
    });

    it('should handle responses with trace IDs', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          data: { result: 'success' }
        }),
        headers: {
          get: vi.fn().mockReturnValue('trace-abc-123')
        }
      };
      
      mockFetch.mockResolvedValue(mockResponse);
      
      const { executeGraphqlRequest } = await import('../../graphql/graphql.js');
      const { log } = await import('../../utils/mcpLogger.js');
      
      await executeGraphqlRequest('query TestQuery { test }', {}, undefined);
      
      expect(log).toHaveBeenCalledWith(
        expect.any(String),
        'trace-id: trace-abc-123'
      );
    });
  });

  describe('Response Handling', () => {
    it('should apply response handler when provided', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          data: { result: 'original' }
        }),
        headers: {
          get: vi.fn().mockReturnValue(null)
        }
      };
      
      mockFetch.mockResolvedValue(mockResponse);
      
      const { executeGraphqlRequest } = await import('../../graphql/graphql.js');
      
      const responseHandler = vi.fn((variables, response) => ({
        ...response,
        data: { result: 'modified' }
      }));
      
      const result = await executeGraphqlRequest(
        'query TestQuery { test }',
        {},
        responseHandler
      );
      
      expect(responseHandler).toHaveBeenCalledWith(
        {},
        { data: { result: 'original' } }
      );
      expect(result).toContain('modified');
    });

    it('should handle input processing', async () => {
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
      
      const result = await executeGraphqlRequest(
        'query TestQuery { test }',
        { original: true },
        undefined
      );
      
      expect(result).toContain('success');
    });
  });
});
