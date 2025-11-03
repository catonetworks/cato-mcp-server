/**
 * Unit tests for tool response handlers
 * Tests response transformation logic
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { emptySitesResponse, isValidResponse } from '../../tools/sites_snapshot/siteUtils.js';
import { emptyUsersResponse } from '../../tools/users_snapshot/userUtils.js';
import { emptyMetricsResponse, isValidSiteMetricResponse, isValidUserMetricResponse } from '../../utils/metricsUtils.js';

// Mock utils
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
      remoteUsers: [],
      inOfficeUsers: []
    }
  }))
}));

vi.mock('../../utils/metricsUtils.js', () => ({
  emptyMetricsResponse: vi.fn((accountMetrics?: any) => ({
    data: {
      timeFrame: {
        from: accountMetrics?.from || null,
        to: accountMetrics?.to || null
      },
      sites: []
    }
  })),
  isValidSiteMetricResponse: vi.fn(),
  isValidUserMetricResponse: vi.fn()
}));

// Mock siteDetailsTool response handler
function mockHandleSiteDetailsResponse(variables: Record<string, any>, response: any): any {
  if (!isValidResponse(variables.accountID, response)) {
    return emptySitesResponse(response.data?.accountSnapshot?.timestamp);
  }

  const allSites = response.data.accountSnapshot.sites;
  return {
    data: {
      accountSnapshotTimestamp: response.data.accountSnapshot.timestamp,
      sites: allSites
    }
  };
}

// Mock sitesByLocation response handler
function mockHandleSitesByLocationResponse(variables: Record<string, any>, response: any): any {
  if (!isValidResponse(variables.accountID, response)) {
    return emptySitesResponse(response.data?.accountSnapshot?.timestamp);
  }

  const allSites = response.data.accountSnapshot.sites;
  const sitesCountByPopName: Record<string, number> = {};
  const sitesCountByLocation: Record<string, number> = {};

  for (const site of allSites) {
    const popName = site.popName || "Unknown";
    sitesCountByPopName[popName] = (sitesCountByPopName[popName] || 0) + 1;
    const location = `${site.countryName || 'Unknown'}, ${site.cityName || 'Unknown'}`;
    sitesCountByLocation[location] = (sitesCountByLocation[location] || 0) + 1;
  }

  return {
    data: {
      accountSnapshotTimestamp: response.data.accountSnapshot.timestamp,
      totalSitesCount: allSites.length,
      sitesCountByPopName: sitesCountByPopName,
      sitesCountByLocation: sitesCountByLocation
    }
  };
}

// Mock usersDetails response handler
function mockHandleUsersDetailsResponse(variables: Record<string, any>, response: any): any {
  if (!isValidResponse(variables.accountID, response)) {
    return emptyUsersResponse(response.data?.accountSnapshot?.timestamp);
  }

  const allUsers = response.data.accountSnapshot.users;
  const connectedUsers = allUsers.filter((user: any) => user.connectivityStatus === 'connected');
  const remoteUsers = connectedUsers.filter((user: any) => !user.connectedInOffice);
  const inOfficeUsers = connectedUsers.filter((user: any) => user.connectedInOffice);

  const usersCountPerPopName: Record<string, number> = {};

  for (const user of connectedUsers) {
    const popName = user.popName || "Unknown";
    usersCountPerPopName[popName] = (usersCountPerPopName[popName] || 0) + 1;
  }

  let note = "";
  if (variables.userIDs && variables.userIDs.length > 0) {
    note = `Filtered results for ${variables.userIDs.length} specific user ID(s). This includes users regardless of connection status. Connected users are split into remote/in-office categories.`;
  } else {
    note = "Showing all connected users only. To see disconnected users, use entity_lookup tool first to get user IDs, then call this tool with userIDs parameter.";
  }

  return {
    data: {
      accountSnapshotTimestamp: response.data.accountSnapshot.timestamp,
      totalUsersCount: connectedUsers.length,
      totalRequestedUsers: allUsers.length,
      remoteUsers: remoteUsers,
      remoteUsersCount: remoteUsers.length,
      inOfficeUsers: inOfficeUsers,
      inOfficeUsersCount: inOfficeUsers.length,
      usersCountPerPopName: usersCountPerPopName,
      note: note,
      userIDs_filter_applied: variables.userIDs || null
    }
  };
}

// Mock siteMetrics response handler
function mockHandleSiteMetricsResponse(variables: Record<string, any>, response: any): any {
  if (!isValidSiteMetricResponse(variables.accountID, response)) {
    return emptyMetricsResponse(response.data?.accountMetrics);
  }
  const accountMetrics = response.data.accountMetrics;
  
  // Simple processing - just return sites with their metrics
  const sites = (accountMetrics.sites || []).map((site: any) => ({
    id: site.id,
    name: site.name,
    metrics: site.metrics || {}
  }));
  
  return {
    data: {
      timeFrame: {
        from: accountMetrics.from,
        to: accountMetrics.to,
      },
      granularity: accountMetrics.granularity,
      summary: {
        sitesReturned: sites.length,
        sitesWithMetrics: sites.filter((s: any) => Object.keys(s.metrics || {}).length > 0).length,
        totalInterfaces: 0,
        note: "Returns aggregated metrics only. For timeseries data, use site_metrics_timeseries tool."
      },
      sites: sites
    }
  };
}

describe('Tool Response Handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isValidResponse).mockReturnValue(true);
    vi.mocked(isValidSiteMetricResponse).mockReturnValue(true);
    vi.mocked(isValidUserMetricResponse).mockReturnValue(true);
  });

  describe('Site Details Handler', () => {
    it('should process valid site snapshot response', () => {
      const variables = { accountID: 'test-account' };
      const response = {
        data: {
          accountSnapshot: {
            timestamp: '2024-01-01T00:00:00Z',
            sites: [
              { id: 'site1', name: 'Site 1', popName: 'NYC-PoP' },
              { id: 'site2', name: 'Site 2', popName: 'LON-PoP' }
            ]
          }
        }
      };

      const result = mockHandleSiteDetailsResponse(variables, response);

      expect(result.data.sites).toHaveLength(2);
      expect(result.data.accountSnapshotTimestamp).toBe('2024-01-01T00:00:00Z');
    });

    it('should return empty response for invalid data', () => {
      vi.mocked(isValidResponse).mockReturnValue(false);
      
      const variables = { accountID: 'test-account' };
      const response = { data: { accountSnapshot: { timestamp: '2024-01-01T00:00:00Z' } } };

      const result = mockHandleSiteDetailsResponse(variables, response);

      expect(emptySitesResponse).toHaveBeenCalled();
      expect(result.data.sites).toEqual([]);
    });
  });

  describe('Sites By Location Handler', () => {
    it('should calculate site counts by PoP and location', () => {
      const variables = { accountID: 'test-account' };
      const response = {
        data: {
          accountSnapshot: {
            timestamp: '2024-01-01T00:00:00Z',
            sites: [
              { id: 'site1', popName: 'NYC-PoP', countryName: 'US', cityName: 'New York' },
              { id: 'site2', popName: 'NYC-PoP', countryName: 'US', cityName: 'New York' },
              { id: 'site3', popName: 'LON-PoP', countryName: 'UK', cityName: 'London' }
            ]
          }
        }
      };

      const result = mockHandleSitesByLocationResponse(variables, response);

      expect(result.data.totalSitesCount).toBe(3);
      expect(result.data.sitesCountByPopName['NYC-PoP']).toBe(2);
      expect(result.data.sitesCountByPopName['LON-PoP']).toBe(1);
      expect(result.data.sitesCountByLocation).toBeDefined();
    });

    it('should handle missing location data', () => {
      const variables = { accountID: 'test-account' };
      const response = {
        data: {
          accountSnapshot: {
            timestamp: '2024-01-01T00:00:00Z',
            sites: [
              { id: 'site1', popName: null },
              { id: 'site2', popName: undefined }
            ]
          }
        }
      };

      const result = mockHandleSitesByLocationResponse(variables, response);

      expect(result.data.sitesCountByPopName['Unknown']).toBe(2);
    });
  });

  describe('Users Details Handler', () => {
    it('should categorize users by connection status', () => {
      const variables = { accountID: 'test-account' };
      const response = {
        data: {
          accountSnapshot: {
            timestamp: '2024-01-01T00:00:00Z',
            users: [
              { id: 'user1', connectivityStatus: 'connected', connectedInOffice: false, popName: 'NYC-PoP' },
              { id: 'user2', connectivityStatus: 'connected', connectedInOffice: true, popName: 'NYC-PoP' },
              { id: 'user3', connectivityStatus: 'disconnected', connectedInOffice: false }
            ]
          }
        }
      };

      const result = mockHandleUsersDetailsResponse(variables, response);

      expect(result.data.totalUsersCount).toBe(2); // Only connected
      expect(result.data.remoteUsersCount).toBe(1);
      expect(result.data.inOfficeUsersCount).toBe(1);
      expect(result.data.remoteUsers).toHaveLength(1);
      expect(result.data.inOfficeUsers).toHaveLength(1);
    });

    it('should handle userIDs filter', () => {
      const variables = { accountID: 'test-account', userIDs: ['user1', 'user2'] };
      const response = {
        data: {
          accountSnapshot: {
            timestamp: '2024-01-01T00:00:00Z',
            users: [
              { id: 'user1', connectivityStatus: 'connected', connectedInOffice: false },
              { id: 'user2', connectivityStatus: 'connected', connectedInOffice: true }
            ]
          }
        }
      };

      const result = mockHandleUsersDetailsResponse(variables, response);

      expect(result.data.userIDs_filter_applied).toEqual(['user1', 'user2']);
      expect(result.data.note).toContain('Filtered results for 2 specific user ID(s)');
    });

    it('should handle all connected users without filter', () => {
      const variables = { accountID: 'test-account' };
      const response = {
        data: {
          accountSnapshot: {
            timestamp: '2024-01-01T00:00:00Z',
            users: [
              { id: 'user1', connectivityStatus: 'connected', connectedInOffice: false }
            ]
          }
        }
      };

      const result = mockHandleUsersDetailsResponse(variables, response);

      expect(result.data.userIDs_filter_applied).toBeNull();
      expect(result.data.note).toContain('Showing all connected users only');
    });

    it('should count users per PoP', () => {
      const variables = { accountID: 'test-account' };
      const response = {
        data: {
          accountSnapshot: {
            timestamp: '2024-01-01T00:00:00Z',
            users: [
              { id: 'user1', connectivityStatus: 'connected', popName: 'NYC-PoP' },
              { id: 'user2', connectivityStatus: 'connected', popName: 'NYC-PoP' },
              { id: 'user3', connectivityStatus: 'connected', popName: 'LON-PoP' }
            ]
          }
        }
      };

      const result = mockHandleUsersDetailsResponse(variables, response);

      expect(result.data.usersCountPerPopName['NYC-PoP']).toBe(2);
      expect(result.data.usersCountPerPopName['LON-PoP']).toBe(1);
    });
  });

  describe('Site Metrics Handler', () => {
    it('should process valid metrics response', () => {
      const variables = { accountID: 'test-account' };
      const response = {
        data: {
          accountMetrics: {
            from: '2024-01-01T00:00:00Z',
            to: '2024-01-02T00:00:00Z',
            granularity: '1h',
            sites: [
              { id: 'site1', name: 'Site 1', metrics: { rtt: 50, bytesTotal: 1000 } },
              { id: 'site2', name: 'Site 2', metrics: {} }
            ]
          }
        }
      };

      const result = mockHandleSiteMetricsResponse(variables, response);

      expect(result.data.sites).toHaveLength(2);
      expect(result.data.summary.sitesReturned).toBe(2);
      expect(result.data.summary.sitesWithMetrics).toBe(1);
      expect(result.data.timeFrame.from).toBe('2024-01-01T00:00:00Z');
    });

    it('should return empty response for invalid metrics', () => {
      vi.mocked(isValidSiteMetricResponse).mockReturnValue(false);
      
      const variables = { accountID: 'test-account' };
      const response = {
        data: {
          accountMetrics: {
            from: '2024-01-01T00:00:00Z',
            to: '2024-01-02T00:00:00Z'
          }
        }
      };

      const result = mockHandleSiteMetricsResponse(variables, response);

      expect(emptyMetricsResponse).toHaveBeenCalled();
      expect(result.data.sites).toEqual([]);
    });
  });
});

