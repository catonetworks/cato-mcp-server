/**
 * Unit tests for tools module functionality
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the individual tool builders
vi.mock('../../tools/entity_lookup/entityLookupTool.js', () => ({
  buildEntityLookupTool: vi.fn(() => ({
    toolDef: {
      name: 'entity_lookup',
      description: 'Entity lookup tool',
      inputSchema: {
        type: 'object',
        properties: {
          entityType: { type: 'string' }
        },
        required: ['entityType'],
        additionalProperties: false,
        $schema: 'http://json-schema.org/draft-07/schema#'
      }
    },
    gqlQuery: 'query EntityLookup($entityType: String!) { entities(entityType: $entityType) }',
    inputHandler: (variables: any) => variables,
    responseHandler: (variables: any, response: any) => response
  }))
}));

vi.mock('../../tools/sites_snapshot/tools.js', () => ({
  buildSiteSnapshotTools: vi.fn(() => [
    {
      toolDef: {
        name: 'sites_by_location',
        description: 'Sites by location tool',
        inputSchema: {
          type: 'object',
          properties: {
            location: { type: 'string' }
          },
          required: ['location'],
          additionalProperties: false,
          $schema: 'http://json-schema.org/draft-07/schema#'
        }
      },
      gqlQuery: 'query SitesByLocation($location: String!) { sites(location: $location) }',
      inputHandler: (variables: any) => variables,
      responseHandler: (variables: any, response: any) => response
    },
    {
      toolDef: {
        name: 'site_details',
        description: 'Site details tool',
        inputSchema: {
          type: 'object',
          properties: {
            siteId: { type: 'string' }
          },
          required: ['siteId'],
          additionalProperties: false,
          $schema: 'http://json-schema.org/draft-07/schema#'
        }
      },
      gqlQuery: 'query SiteDetails($siteId: String!) { site(id: $siteId) }',
      inputHandler: (variables: any) => variables,
      responseHandler: (variables: any, response: any) => response
    }
  ])
}));

vi.mock('../../tools/users_snapshot/tools.js', () => ({
  buildUserSnapshotTools: vi.fn(() => [
    {
      toolDef: {
        name: 'user_details',
        description: 'User details tool',
        inputSchema: {
          type: 'object',
          properties: {
            userId: { type: 'string' }
          },
          required: ['userId'],
          additionalProperties: false,
          $schema: 'http://json-schema.org/draft-07/schema#'
        }
      },
      gqlQuery: 'query UserDetails($userId: String!) { user(id: $userId) }',
      inputHandler: (variables: any) => variables,
      responseHandler: (variables: any, response: any) => response
    }
  ])
}));

vi.mock('../../tools/sites_metrics/tools.js', () => ({
  buildAccountMetricsTools: vi.fn(() => [
    {
      toolDef: {
        name: 'site_metrics',
        description: 'Site metrics tool',
        inputSchema: {
          type: 'object',
          properties: {
            siteId: { type: 'string' }
          },
          required: ['siteId'],
          additionalProperties: false,
          $schema: 'http://json-schema.org/draft-07/schema#'
        }
      },
      gqlQuery: 'query SiteMetrics($siteId: String!) { siteMetrics(siteId: $siteId) }',
      inputHandler: (variables: any) => variables,
      responseHandler: (variables: any, response: any) => response
    }
  ])
}));

vi.mock('../../tools/users_metrics/tools.js', () => ({
  buildUserAccountMetricsTools: vi.fn(() => [
    {
      toolDef: {
        name: 'user_metrics',
        description: 'User metrics tool',
        inputSchema: {
          type: 'object',
          properties: {
            userId: { type: 'string' }
          },
          required: ['userId'],
          additionalProperties: false,
          $schema: 'http://json-schema.org/draft-07/schema#'
        }
      },
      gqlQuery: 'query UserMetrics($userId: String!) { userMetrics(userId: $userId) }',
      inputHandler: (variables: any) => variables,
      responseHandler: (variables: any, response: any) => response
    }
  ])
}));

describe('Tools Module', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Tool Initialization', () => {
    it('should initialize all tool wrappers with account ID', async () => {
      const { initCatoMcpToolWrappers } = await import('../../tools/tools.js');
      
      const accountId = 'test-account-123';
      initCatoMcpToolWrappers(accountId);
      
      // Verify all tool builders were called
      const { buildEntityLookupTool } = await import('../../tools/entity_lookup/entityLookupTool.js');
      const { buildSiteSnapshotTools } = await import('../../tools/sites_snapshot/tools.js');
      const { buildUserSnapshotTools } = await import('../../tools/users_snapshot/tools.js');
      const { buildAccountMetricsTools } = await import('../../tools/sites_metrics/tools.js');
      const { buildUserAccountMetricsTools } = await import('../../tools/users_metrics/tools.js');
      
      expect(buildEntityLookupTool).toHaveBeenCalledWith({ accountId });
      expect(buildSiteSnapshotTools).toHaveBeenCalledWith({ accountId });
      expect(buildUserSnapshotTools).toHaveBeenCalledWith({ accountId });
      expect(buildAccountMetricsTools).toHaveBeenCalledWith({ accountId });
      expect(buildUserAccountMetricsTools).toHaveBeenCalledWith({ accountId });
    });

    it('should return tools when initialized', async () => {
      const { getCatoMcpTools } = await import('../../tools/tools.js');
      
      const tools = getCatoMcpTools();
      expect(Array.isArray(tools)).toBe(true);
      expect(tools.length).toBeGreaterThan(0);
    });

    it('should return all initialized tools', async () => {
      const { initCatoMcpToolWrappers, getCatoMcpTools } = await import('../../tools/tools.js');
      
      const accountId = 'test-account-123';
      initCatoMcpToolWrappers(accountId);
      
      const tools = getCatoMcpTools();
      expect(tools).toHaveLength(6); // 1 + 2 + 1 + 1 + 1
      expect(tools.every(tool => tool.name && tool.description && tool.inputSchema)).toBe(true);
      
      // Check specific tools
      const toolNames = tools.map(tool => tool.name);
      expect(toolNames).toContain('entity_lookup');
      expect(toolNames).toContain('sites_by_location');
      expect(toolNames).toContain('site_details');
      expect(toolNames).toContain('user_details');
      expect(toolNames).toContain('site_metrics');
      expect(toolNames).toContain('user_metrics');
    });
  });

  describe('Tool Discovery', () => {
    it('should find existing tool by name', async () => {
      const { initCatoMcpToolWrappers, findMcpTool } = await import('../../tools/tools.js');
      
      const accountId = 'test-account-123';
      initCatoMcpToolWrappers(accountId);
      
      const tool = findMcpTool('entity_lookup');
      expect(tool).toBeDefined();
      expect(tool.toolDef.name).toBe('entity_lookup');
      expect(tool.toolDef.description).toBe('Entity lookup tool');
      expect(tool.gqlQuery).toContain('query EntityLookup');
    });

    it('should throw error for non-existent tool', async () => {
      const { initCatoMcpToolWrappers, findMcpTool } = await import('../../tools/tools.js');
      
      const accountId = 'test-account-123';
      initCatoMcpToolWrappers(accountId);
      
      expect(() => {
        findMcpTool('non_existent_tool');
      }).toThrow('Tool non_existent_tool not found');
    });

    it('should find site snapshot tools', async () => {
      const { initCatoMcpToolWrappers, findMcpTool } = await import('../../tools/tools.js');
      
      const accountId = 'test-account-123';
      initCatoMcpToolWrappers(accountId);
      
      const siteTool = findMcpTool('sites_by_location');
      expect(siteTool.toolDef.name).toBe('sites_by_location');
      
      const siteDetailsTool = findMcpTool('site_details');
      expect(siteDetailsTool.toolDef.name).toBe('site_details');
    });

    it('should find user snapshot tools', async () => {
      const { initCatoMcpToolWrappers, findMcpTool } = await import('../../tools/tools.js');
      
      const accountId = 'test-account-123';
      initCatoMcpToolWrappers(accountId);
      
      const userTool = findMcpTool('user_details');
      expect(userTool.toolDef.name).toBe('user_details');
    });

    it('should find metrics tools', async () => {
      const { initCatoMcpToolWrappers, findMcpTool } = await import('../../tools/tools.js');
      
      const accountId = 'test-account-123';
      initCatoMcpToolWrappers(accountId);
      
      const siteMetricsTool = findMcpTool('site_metrics');
      expect(siteMetricsTool.toolDef.name).toBe('site_metrics');
      
      const userMetricsTool = findMcpTool('user_metrics');
      expect(userMetricsTool.toolDef.name).toBe('user_metrics');
    });
  });

  describe('Tool Structure', () => {
    it('should have correct tool definition structure', async () => {
      const { initCatoMcpToolWrappers, findMcpTool } = await import('../../tools/tools.js');
      
      const accountId = 'test-account-123';
      initCatoMcpToolWrappers(accountId);
      
      const tool = findMcpTool('entity_lookup');
      
      expect(tool.toolDef).toHaveProperty('name');
      expect(tool.toolDef).toHaveProperty('description');
      expect(tool.toolDef).toHaveProperty('inputSchema');
      expect(tool.toolDef.inputSchema).toHaveProperty('type', 'object');
      expect(tool.toolDef.inputSchema).toHaveProperty('properties');
      expect(tool.toolDef.inputSchema).toHaveProperty('required');
      expect(tool.toolDef.inputSchema).toHaveProperty('additionalProperties', false);
      expect(tool.toolDef.inputSchema).toHaveProperty('$schema');
    });

    it('should have GraphQL query and handlers', async () => {
      const { initCatoMcpToolWrappers, findMcpTool } = await import('../../tools/tools.js');
      
      const accountId = 'test-account-123';
      initCatoMcpToolWrappers(accountId);
      
      const tool = findMcpTool('entity_lookup');
      
      expect(tool).toHaveProperty('gqlQuery');
      expect(tool.gqlQuery).toContain('query');
      expect(tool).toHaveProperty('inputHandler');
      expect(tool).toHaveProperty('responseHandler');
      expect(typeof tool.inputHandler).toBe('function');
      expect(typeof tool.responseHandler).toBe('function');
    });
  });
});
