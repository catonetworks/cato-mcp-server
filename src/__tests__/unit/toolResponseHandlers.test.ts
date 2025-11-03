/**
 * Unit tests for tool response handlers
 * Tests response transformation logic for individual tools
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { emptySitesResponse, isValidResponse } from '../../tools/sites_snapshot/siteUtils.js';
import { emptyUsersResponse, isValidResponse as isValidUserResponse } from '../../tools/users_snapshot/userUtils.js';
import { initCatoMcpToolWrappers, findMcpTool } from '../../tools/tools.js';

// Mock dependencies
vi.mock('../../tools/sites_snapshot/siteUtils.js', () => ({
  emptySitesResponse: vi.fn((timestamp?: string) => ({
    data: {
      accountSnapshotTimestamp: timestamp || null,
      sites: []
    }
  })),
  isValidResponse: vi.fn()
}));

vi.mock('../../tools/users_snapshot/userUtils.js', () => ({
  emptyUsersResponse: vi.fn((timestamp?: string) => ({
    data: {
      accountSnapshotTimestamp: timestamp || null,
      users: []
    }
  })),
  isValidResponse: vi.fn()
}));

describe('Tool Response Handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    initCatoMcpToolWrappers('test-account-123');
    vi.mocked(isValidResponse).mockReturnValue(true);
    vi.mocked(isValidUserResponse).mockReturnValue(true);
  });

  describe('sites_by_location handler', () => {
    it('should process valid response and count sites by PoP and location', () => {
      const tool = findMcpTool('sites_by_location');
      expect(tool.responseHandler).toBeDefined();

      const variables = { accountID: 'test-account-123' };
      const response = {
        data: {
          accountSnapshot: {
            timestamp: '2024-01-01T00:00:00Z',
            sites: [
              {
                id: 'site1',
                popName: 'NYC-PoP',
                info: { countryName: 'US', countryStateName: 'NY', cityName: 'New York' }
              },
              {
                id: 'site2',
                popName: 'NYC-PoP',
                info: { countryName: 'US', countryStateName: 'NY', cityName: 'New York' }
              },
              {
                id: 'site3',
                popName: 'LON-PoP',
                info: { countryName: 'UK', cityName: 'London' }
              }
            ]
          }
        }
      };

      const result = tool.responseHandler!(variables, response);

      expect(result.data.totalSitesCount).toBe(3);
      expect(result.data.sitesCountByPopName['NYC-PoP']).toBe(2);
      expect(result.data.sitesCountByPopName['LON-PoP']).toBe(1);
      expect(result.data.sitesCountByLocation).toBeDefined();
      expect(result.data.sitesCountByLocation['US.NY.New York']).toBe(2);
      expect(result.data.sitesCountByLocation['UK.London']).toBe(1);
    });

    it('should handle missing location data', () => {
      const tool = findMcpTool('sites_by_location');
      const variables = { accountID: 'test-account-123' };
      const response = {
        data: {
          accountSnapshot: {
            timestamp: '2024-01-01T00:00:00Z',
            sites: [
              { id: 'site1', popName: null, info: null },
              { id: 'site2', popName: undefined }
            ]
          }
        }
      };

      const result = tool.responseHandler!(variables, response);

      expect(result.data.sitesCountByPopName['Unknown']).toBe(2);
      expect(result.data.sitesCountByLocation['Unknown']).toBe(2);
    });

    it('should return empty response for invalid data', () => {
      vi.mocked(isValidResponse).mockReturnValue(false);
      const tool = findMcpTool('sites_by_location');
      const variables = { accountID: 'test-account-123' };
      const response = { data: { accountSnapshot: { timestamp: '2024-01-01T00:00:00Z' } } };

      const result = tool.responseHandler!(variables, response);

      expect(emptySitesResponse).toHaveBeenCalled();
      expect(result.data.sites).toEqual([]);
    });
  });

  describe('site_types handler', () => {
    it('should process valid response and count sites by type', () => {
      const tool = findMcpTool('site_types');
      expect(tool.responseHandler).toBeDefined();

      const variables = { accountID: 'test-account-123' };
      const response = {
        data: {
          accountSnapshot: {
            timestamp: '2024-01-01T00:00:00Z',
            sites: [
              { id: 'site1', info: { type: 'BRANCH' } },
              { id: 'site2', info: { type: 'BRANCH' } },
              { id: 'site3', info: { type: 'DATACENTER' } },
              { id: 'site4', info: {} }
            ]
          }
        }
      };

      const result = tool.responseHandler!(variables, response);

      expect(result.data.sitesCount).toBe(4);
      expect(result.data.sitesCountPerType['BRANCH']).toBe(2);
      expect(result.data.sitesCountPerType['DATACENTER']).toBe(1);
      expect(result.data.sitesCountPerType['Unknown']).toBe(1);
      expect(result.data.sites).toHaveLength(4);
    });

    it('should handle sites without type info', () => {
      const tool = findMcpTool('site_types');
      const variables = { accountID: 'test-account-123' };
      const response = {
        data: {
          accountSnapshot: {
            timestamp: '2024-01-01T00:00:00Z',
            sites: [
              { id: 'site1', info: null },
              { id: 'site2' }
            ]
          }
        }
      };

      const result = tool.responseHandler!(variables, response);

      expect(result.data.sitesCountPerType['Unknown']).toBe(2);
    });
  });

  describe('users_details handler', () => {
    it('should categorize users by connection status', () => {
      const tool = findMcpTool('user_details');
      expect(tool.responseHandler).toBeDefined();

      const variables = { accountID: 'test-account-123' };
      const response = {
        data: {
          accountSnapshot: {
            timestamp: '2024-01-01T00:00:00Z',
            users: [
              {
                id: 'user1',
                connectivityStatus: 'connected',
                connectedInOffice: false,
                popName: 'NYC-PoP'
              },
              {
                id: 'user2',
                connectivityStatus: 'connected',
                connectedInOffice: true,
                popName: 'NYC-PoP'
              },
              {
                id: 'user3',
                connectivityStatus: 'disconnected',
                connectedInOffice: false
              }
            ]
          }
        }
      };

      const result = tool.responseHandler!(variables, response);

      expect(result.data.totalUsersCount).toBe(2); // Only connected
      expect(result.data.remoteUsersCount).toBe(1);
      expect(result.data.inOfficeUsersCount).toBe(1);
      expect(result.data.remoteUsers).toHaveLength(1);
      expect(result.data.inOfficeUsers).toHaveLength(1);
      expect(result.data.usersCountPerPopName['NYC-PoP']).toBe(2);
    });

    it('should handle userIDs filter', () => {
      const tool = findMcpTool('user_details');
      const variables = {
        accountID: 'test-account-123',
        userIDs: ['user1', 'user2']
      };
      const response = {
        data: {
          accountSnapshot: {
            timestamp: '2024-01-01T00:00:00Z',
            users: [
              {
                id: 'user1',
                connectivityStatus: 'connected',
                connectedInOffice: false
              },
              {
                id: 'user2',
                connectivityStatus: 'connected',
                connectedInOffice: true
              }
            ]
          }
        }
      };

      const result = tool.responseHandler!(variables, response);

      expect(result.data.userIDs_filter_applied).toEqual(['user1', 'user2']);
      expect(result.data.note).toContain('Filtered results for 2 specific user ID(s)');
    });

    it('should handle all connected users without filter', () => {
      const tool = findMcpTool('user_details');
      const variables = { accountID: 'test-account-123' };
      const response = {
        data: {
          accountSnapshot: {
            timestamp: '2024-01-01T00:00:00Z',
            users: [
              {
                id: 'user1',
                connectivityStatus: 'connected',
                connectedInOffice: false
              }
            ]
          }
        }
      };

      const result = tool.responseHandler!(variables, response);

      expect(result.data.userIDs_filter_applied).toBeNull();
      expect(result.data.note).toContain('Showing all connected users only');
    });
  });

  describe('user_connection_details handler', () => {
    it('should add filter metadata when userIDs provided', () => {
      const tool = findMcpTool('user_connection_details');
      expect(tool.responseHandler).toBeDefined();

      const variables = {
        accountID: 'test-account-123',
        userIDs: ['user1', 'user2']
      };
      const response = {
        data: {
          accountSnapshot: {
            timestamp: '2024-01-01T00:00:00Z',
            users: []
          }
        }
      };

      const result = tool.responseHandler!(variables, response);

      expect(result.data.userIDs_filter_applied).toEqual(['user1', 'user2']);
      expect(result.data.note).toContain('Filtered results for 2 specific user ID(s)');
    });

    it('should add default note when no userIDs filter', () => {
      const tool = findMcpTool('user_connection_details');
      const variables = { accountID: 'test-account-123' };
      const response = {
        data: {
          accountSnapshot: {
            timestamp: '2024-01-01T00:00:00Z',
            users: []
          }
        }
      };

      const result = tool.responseHandler!(variables, response);

      expect(result.data.userIDs_filter_applied).toBeUndefined();
      expect(result.data.note).toContain('Showing all connected users only');
    });

    it('should add user_name_filter when provided', () => {
      const tool = findMcpTool('user_connection_details');
      const variables = {
        accountID: 'test-account-123',
        user_name_or_id: 'John Doe'
      };
      const response = {
        data: {
          accountSnapshot: {
            timestamp: '2024-01-01T00:00:00Z',
            users: []
          }
        }
      };

      const result = tool.responseHandler!(variables, response);

      expect(result.data.user_name_filter).toBe('John Doe');
    });
  });

  describe('entity_lookup handler', () => {
    it('should add error message when results are limited', () => {
      const tool = findMcpTool('entity_lookup');
      expect(tool.responseHandler).toBeDefined();

      // MAX_LIMIT is 1000 for entity lookup
      const MAX_LIMIT = 1000;
      const variables = {
        type: 'site',
        accountID: 'test-account-123',
        from: 0,
        limit: MAX_LIMIT
      };
      const response = {
        data: {
          entityLookup: {
            total: 2000,
            items: Array(MAX_LIMIT).fill({ id: 'site' })
          }
        }
      };

      const result = tool.responseHandler!(variables, response);

      expect(result.errors).toBeDefined();
      expect(Array.isArray(result.errors)).toBe(true);
      expect(result.errors[0].message).toContain('limited to');
      expect(result.errors[0].message).toContain('out of 2000 items');
    });

    it('should not add error when all items returned', () => {
      const tool = findMcpTool('entity_lookup');
      const MAX_LIMIT = 1000;
      const variables = {
        type: 'site',
        accountID: 'test-account-123',
        from: 0,
        limit: MAX_LIMIT
      };
      const response = {
        data: {
          entityLookup: {
            total: 500,
            items: Array(500).fill({ id: 'site' })
          }
        }
      };

      const result = tool.responseHandler!(variables, response);

      // When all items are returned, no error should be added
      expect(result.errors).toBeUndefined();
    });

    it('should not add error when paging is used', () => {
      const tool = findMcpTool('entity_lookup');
      const MAX_LIMIT = 1000;
      const variables = {
        type: 'site',
        accountID: 'test-account-123',
        from: 1000, // Paging used
        limit: MAX_LIMIT
      };
      const response = {
        data: {
          entityLookup: {
            total: 2000,
            items: Array(MAX_LIMIT).fill({ id: 'site' })
          }
        }
      };

      const result = tool.responseHandler!(variables, response);

      // When paging is used, no error should be added
      expect(result.errors).toBeUndefined();
    });

    it('should handle response without entityLookup data', () => {
      const tool = findMcpTool('entity_lookup');
      const variables = {
        type: 'site',
        accountID: 'test-account-123'
      };
      const response = {
        data: {}
      };

      const result = tool.responseHandler!(variables, response);

      expect(result).toEqual(response);
      expect(result.errors).toBeUndefined();
    });
  });

  describe('socket_versions handler', () => {
    it('should count socket versions across sites', () => {
      const tool = findMcpTool('socket_versions');
      expect(tool.responseHandler).toBeDefined();

      const variables = { accountID: 'test-account-123' };
      const response = {
        data: {
          accountSnapshot: {
            timestamp: '2024-01-01T00:00:00Z',
            sites: [
              {
                id: 'site1',
                devices: [
                  {
                    id: 'device1',
                    socketInfo: { version: '1.0.0' }
                  },
                  {
                    id: 'device2',
                    socketInfo: { version: '1.0.0' }
                  }
                ]
              },
              {
                id: 'site2',
                devices: [
                  {
                    id: 'device3',
                    socketInfo: { version: '2.0.0' }
                  }
                ]
              }
            ]
          }
        }
      };

      const result = tool.responseHandler!(variables, response);

      expect(result.data.sitesCount).toBe(2);
      expect(result.data.socketCountByVersion['1.0.0']).toBe(2);
      expect(result.data.socketCountByVersion['2.0.0']).toBe(1);
    });

    it('should handle sites without devices', () => {
      const tool = findMcpTool('socket_versions');
      const variables = { accountID: 'test-account-123' };
      const response = {
        data: {
          accountSnapshot: {
            timestamp: '2024-01-01T00:00:00Z',
            sites: [
              { id: 'site1', devices: [] },
              { id: 'site2', devices: null }
            ]
          }
        }
      };

      const result = tool.responseHandler!(variables, response);

      expect(result.data.sitesCount).toBe(2);
      expect(Object.keys(result.data.socketCountByVersion)).toHaveLength(0);
    });
  });

  describe('user_software_versions handler', () => {
    it('should count users by client version', () => {
      const tool = findMcpTool('user_software_versions');
      expect(tool.responseHandler).toBeDefined();

      const variables = { accountID: 'test-account-123' };
      const response = {
        data: {
          accountSnapshot: {
            timestamp: '2024-01-01T00:00:00Z',
            users: [
              { id: 'user1', version: '1.0.0' },
              { id: 'user2', version: '1.0.0' },
              { id: 'user3', version: '2.0.0' },
              { id: 'user4', version: null }
            ]
          }
        }
      };

      const result = tool.responseHandler!(variables, response);

      expect(result.data.usersCount).toBe(4);
      expect(result.data.userCountByVersion['1.0.0']).toBe(2);
      expect(result.data.userCountByVersion['2.0.0']).toBe(1);
    });

    it('should handle users without version', () => {
      const tool = findMcpTool('user_software_versions');
      const variables = { accountID: 'test-account-123' };
      const response = {
        data: {
          accountSnapshot: {
            timestamp: '2024-01-01T00:00:00Z',
            users: [
              { id: 'user1', version: null },
              { id: 'user2', version: undefined }
            ]
          }
        }
      };

      const result = tool.responseHandler!(variables, response);

      expect(result.data.usersCount).toBe(2);
      expect(Object.keys(result.data.userCountByVersion)).toHaveLength(0);
    });
  });
});

