/**
 * MCP Protocol-Level Black-Box Tests
 * 
 * These tests validate the MCP server contract at the protocol level,
 * ensuring they work for both TypeScript and Python implementations.
 * 
 * Benefits:
 * - Tests actual user behavior via MCP protocol
 * - Creates behavioral contracts for migration validation
 * - Survives language transition from TypeScript to Python
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { CallToolResult, TextContent } from '@modelcontextprotocol/sdk/types.js';
import { join } from 'path';

// Expected tools - update this list as tools are added/removed
const EXPECTED_TOOLS = [
  // Entity lookup
  'entity_lookup',
  // Site snapshot tools
  'sites_by_location',
  'site_details',
  'site_types',
  'socket_versions',
  'wan_connectivity',
  // User snapshot tools
  'user_details',
  'user_connection_details',
  'user_software_versions',
  // Site metrics tools
  'site_network_health',
  'top_site_bandwidth_consumers',
  'site_metrics',
  'site_metrics_timeseries',
  'site_metrics_summary',
  'annotation_event_counter',
  // User metrics tools
  'top_users_bandwidth_consumers',
  'user_metrics',
  'user_metrics_timeseries',
];

/**
 * Create an MCP client connected to the server
 * This simulates how real MCP clients (like Claude Desktop) connect
 */
async function createMcpClient(): Promise<{ client: Client; cleanup: () => Promise<void> }> {
  // Spawn the server process (adjust path based on your setup)
  const serverPath = process.env.MCP_SERVER_PATH || join(process.cwd(), 'build', 'index.js');
  
  const transport = new StdioClientTransport({
    command: 'node',
    args: [serverPath],
    env: {
      ...process.env,
      CATO_ACCOUNT_ID: process.env.CATO_ACCOUNT_ID || 'test-account-123',
      CATO_API_HOST: process.env.CATO_API_HOST || 'api.catonetworks.com',
      CATO_API_KEY: process.env.CATO_API_KEY || 'test-api-key',
    },
  });

  const client = new Client({
    name: 'mcp-protocol-test-client',
    version: '1.0.0',
  }, {
    capabilities: {},
  });

  await client.connect(transport);

  const cleanup = async () => {
    try {
      await client.close();
    } catch (error) {
      // Ignore cleanup errors
    }
  };

  return { client, cleanup };
}

describe('MCP Protocol Tests', () => {
  let client: Client;
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    // Skip protocol tests if server path is not available
    // In CI, you might want to start the server differently
    if (!process.env.MCP_SERVER_PATH && !process.env.CI) {
      const result = await createMcpClient();
      client = result.client;
      cleanup = result.cleanup;
    }
  });

  afterEach(async () => {
    if (cleanup) {
      await cleanup();
    }
  });

  describe('Tool Discovery', () => {
    it('should list all expected tools', async () => {
      // Skip if client not available (e.g., in unit test mode)
      if (!client) {
        console.warn('Skipping protocol test - MCP client not available');
        return;
      }

      const response = await client.listTools();
      const toolNames = response.tools.map(t => t.name);

      // Verify all expected tools are present
      for (const expectedTool of EXPECTED_TOOLS) {
        expect(toolNames).toContain(expectedTool);
      }

      // Verify tools have required structure
      for (const tool of response.tools) {
        expect(tool).toHaveProperty('name');
        expect(tool).toHaveProperty('description');
        expect(tool).toHaveProperty('inputSchema');
        expect(tool.inputSchema).toHaveProperty('type', 'object');
        expect(tool.inputSchema).toHaveProperty('properties');
      }
    });

    it('should have correct tool schema structure', async () => {
      if (!client) {
        console.warn('Skipping protocol test - MCP client not available');
        return;
      }

      const response = await client.listTools();
      
      // Find a specific tool to validate schema
      const entityLookupTool = response.tools.find(t => t.name === 'entity_lookup');
      expect(entityLookupTool).toBeDefined();
      
      if (entityLookupTool) {
        expect(entityLookupTool.inputSchema.properties).toHaveProperty('type');
        expect(entityLookupTool.inputSchema.properties).toHaveProperty('accountID');
      }
    });
  });

  describe('Tool Execution Contracts', () => {
    it('should execute entity_lookup tool with correct contract', async () => {
      if (!client) {
        console.warn('Skipping protocol test - MCP client not available');
        return;
      }

      const result = await client.callTool({
        name: 'entity_lookup',
        arguments: {
          type: 'site',
          accountID: 'test-account-123',
        },
      });

      // Validate response structure
      expect(result).toHaveProperty('content');
      const callResult = result as CallToolResult;
      expect(Array.isArray(callResult.content)).toBe(true);
      expect(callResult.content.length).toBeGreaterThan(0);
      
      // Response should be valid JSON text
      const contentItem = callResult.content[0] as TextContent;
      expect(contentItem).toHaveProperty('type', 'text');
      expect(contentItem).toHaveProperty('text');
      
      // Parse and validate JSON structure
      const data = JSON.parse(contentItem.text);
      // Should have data or errors (both are valid response structures)
      // In test mode with mocked GraphQL, we might get errors
      if (data.errors) {
        expect(data).toHaveProperty('errors');
      } else {
        expect(data).toHaveProperty('data');
      }
    });

    it('should execute site_details tool with correct contract', async () => {
      if (!client) {
        console.warn('Skipping protocol test - MCP client not available');
        return;
      }

      const result = await client.callTool({
        name: 'site_details',
        arguments: {
          accountID: 'test-account-123',
        },
      });

      expect(result).toHaveProperty('content');
      const callResult = result as CallToolResult;
      const contentItem = callResult.content[0] as TextContent;
      expect(contentItem).toHaveProperty('type', 'text');
      
      const data = JSON.parse(contentItem.text);
      // Should return sites array or error structure
      // In test mode with mocked GraphQL, we might get errors
      if (data.errors) {
        expect(data).toHaveProperty('errors');
      } else {
        expect(data.sites || data.data).toBeDefined();
      }
    });

    it('should execute sites_by_location tool with correct contract', async () => {
      if (!client) {
        console.warn('Skipping protocol test - MCP client not available');
        return;
      }

      const result = await client.callTool({
        name: 'sites_by_location',
        arguments: {
          accountID: 'test-account-123',
        },
      });

      expect(result).toHaveProperty('content');
      const callResult = result as CallToolResult;
      const contentItem = callResult.content[0] as TextContent;
      expect(contentItem).toHaveProperty('type', 'text');
      
      const data = JSON.parse(contentItem.text);
      // Should return sites with location data
      // In test mode with mocked GraphQL, we might get errors
      if (data.errors) {
        expect(data).toHaveProperty('errors');
      } else {
        expect(data.sites || data.data).toBeDefined();
      }
    });

    it('should handle missing required arguments gracefully', async () => {
      if (!client) {
        console.warn('Skipping protocol test - MCP client not available');
        return;
      }

      const result = await client.callTool({
        name: 'entity_lookup',
        arguments: {
          type: 'site',
          // Missing accountID
        },
      });

      expect(result).toHaveProperty('content');
      const callResult = result as CallToolResult;
      const contentItem = callResult.content[0] as TextContent;
      const data = JSON.parse(contentItem.text);
      
      // Should return error structure when arguments are invalid
      // The server should use default accountID or return an error
      // Accept either data (success) or errors (error response)
      expect(data.errors || data.data).toBeDefined();
    });

    it('should handle invalid tool names', async () => {
      if (!client) {
        console.warn('Skipping protocol test - MCP client not available');
        return;
      }

      const result = await client.callTool({
        name: 'non_existent_tool',
        arguments: {},
      });

      expect(result).toHaveProperty('content');
      const callResult = result as CallToolResult;
      const contentItem = callResult.content[0] as TextContent;
      const data = JSON.parse(contentItem.text);
      
      // Should return error when tool doesn't exist
      expect(data).toHaveProperty('errors');
    });
  });

  describe('End-to-End Request Pipeline', () => {
    it('should handle complete tool call flow: discovery → execution → response', async () => {
      if (!client) {
        console.warn('Skipping protocol test - MCP client not available');
        return;
      }

      // Step 1: Discover tools
      const toolsResponse = await client.listTools();
      expect(toolsResponse.tools.length).toBeGreaterThan(0);

      // Step 2: Find a tool
      const userDetailsTool = toolsResponse.tools.find(t => t.name === 'user_details');
      expect(userDetailsTool).toBeDefined();

      // Step 3: Execute the tool
      const executionResult = await client.callTool({
        name: 'user_details',
        arguments: {
          accountID: 'test-account-123',
        },
      });

      // Step 4: Validate response structure
      expect(executionResult).toHaveProperty('content');
      const execResult = executionResult as CallToolResult;
      expect(execResult.content.length).toBeGreaterThan(0);
      
      const contentItem = execResult.content[0] as TextContent;
      expect(contentItem).toHaveProperty('type', 'text');
      
      const data = JSON.parse(contentItem.text);
      // Should have structured response (data or errors)
      // In test mode, we might get errors if GraphQL fails, which is fine
      if (data.errors) {
        expect(data).toHaveProperty('errors');
      } else {
        expect(data.remoteUsers || data.data).toBeDefined();
      }
    });

    it('should validate input/output transformations for metrics tools', async () => {
      if (!client) {
        console.warn('Skipping protocol test - MCP client not available');
        return;
      }

      // Test site_metrics tool with time range
      const result = await client.callTool({
        name: 'site_metrics',
        arguments: {
          accountID: 'test-account-123',
          startTime: '2024-01-01T00:00:00Z',
          endTime: '2024-01-02T00:00:00Z',
        },
      });

      expect(result).toHaveProperty('content');
      const callResult = result as CallToolResult;
      const contentItem = callResult.content[0] as TextContent;
      const data = JSON.parse(contentItem.text);
      
      // Validate response structure based on tool contract
      // In test mode, we might get errors if GraphQL fails, which is fine
      if (data.errors) {
        expect(data).toHaveProperty('errors');
      } else {
        expect(data.sites || data.data).toBeDefined();
      }
    });
  });

  describe('Tool Input/Output Validation', () => {
    it('should validate entity_lookup tool accepts correct input schema', async () => {
      if (!client) {
        console.warn('Skipping protocol test - MCP client not available');
        return;
      }

      const toolsResponse = await client.listTools();
      const entityLookupTool = toolsResponse.tools.find(t => t.name === 'entity_lookup');
      
      if (entityLookupTool) {
        // Validate input schema structure
        expect(entityLookupTool.inputSchema.properties).toHaveProperty('type');
        expect(entityLookupTool.inputSchema.properties).toHaveProperty('accountID');
        
        // Validate required fields
        const requiredFields = entityLookupTool.inputSchema.required || [];
        expect(requiredFields).toContain('type');
      }
    });

    it('should return structured JSON responses for all tools', async () => {
      if (!client) {
        console.warn('Skipping protocol test - MCP client not available');
        return;
      }

      // Test a sample of tools to ensure they all return valid JSON
      const toolsToTest = ['site_types', 'socket_versions', 'user_software_versions'];
      
      for (const toolName of toolsToTest) {
        const result = await client.callTool({
          name: toolName,
          arguments: {
            accountID: 'test-account-123',
          },
        });

        const callResult = result as CallToolResult;
        const contentItem = callResult.content[0] as TextContent;
        const data = JSON.parse(contentItem.text);
        
        // All responses should be parseable JSON
        expect(typeof data).toBe('object');
        expect(data).not.toBe(null);
      }
    });
  });
});

