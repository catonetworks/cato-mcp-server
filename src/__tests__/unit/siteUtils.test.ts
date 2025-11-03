/**
 * Unit tests for site utilities
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isValidResponse, emptySitesResponse } from '../../tools/sites_snapshot/siteUtils.js';
import { log } from '../../utils/mcpLogger.js';

// Mock the logger
vi.mock('../../utils/mcpLogger.js', () => ({
  log: vi.fn()
}));

describe('Site Utils', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('isValidResponse', () => {
    it('should return true for valid response with sites', () => {
      const response = {
        data: {
          accountSnapshot: {
            sites: [
              { id: 'site1', name: 'Site 1' },
              { id: 'site2', name: 'Site 2' }
            ]
          }
        }
      };

      expect(isValidResponse('test-account-123', response)).toBe(true);
      expect(log).not.toHaveBeenCalled();
    });

    it('should return false for response without sites', () => {
      const response = {
        data: {
          accountSnapshot: {}
        }
      };

      expect(isValidResponse('test-account-123', response)).toBe(false);
      expect(log).toHaveBeenCalledWith(
        expect.anything(),
        expect.stringContaining('No sites found in account snapshot')
      );
    });

    it('should return false for response without accountSnapshot', () => {
      const response = {
        data: {}
      };

      expect(isValidResponse('test-account-123', response)).toBe(false);
      expect(log).toHaveBeenCalled();
    });

    it('should return false for response without data', () => {
      const response = {};

      expect(isValidResponse('test-account-123', response)).toBe(false);
      // Early return, no log for missing data
      expect(log).not.toHaveBeenCalled();
    });

    it('should return false for null response', () => {
      expect(isValidResponse('test-account-123', null as any)).toBe(false);
      // Early return, no log for null
      expect(log).not.toHaveBeenCalled();
    });

    it('should return false for undefined response', () => {
      expect(isValidResponse('test-account-123', undefined as any)).toBe(false);
      // Early return, no log for undefined
      expect(log).not.toHaveBeenCalled();
    });

    it('should return true for empty sites array', () => {
      const response = {
        data: {
          accountSnapshot: {
            sites: []
          }
        }
      };

      expect(isValidResponse('test-account-123', response)).toBe(true);
      expect(log).not.toHaveBeenCalled();
    });

    it('should include account ID in log message', () => {
      const response = {
        data: {
          accountSnapshot: {}
        }
      };

      isValidResponse('test-account-456', response);
      expect(log).toHaveBeenCalledWith(
        expect.anything(),
        expect.stringContaining('test-account-456')
      );
    });
  });

  describe('emptySitesResponse', () => {
    it('should return empty response with timestamp', () => {
      const timestamp = '2024-01-01T00:00:00Z';
      const result = emptySitesResponse(timestamp);

      expect(result).toEqual({
        data: {
          accountSnapshotTimestamp: timestamp,
          sites: []
        }
      });
    });

    it('should handle undefined timestamp', () => {
      const result = emptySitesResponse(undefined as any);

      expect(result).toEqual({
        data: {
          accountSnapshotTimestamp: undefined,
          sites: []
        }
      });
    });

    it('should handle null timestamp', () => {
      const result = emptySitesResponse(null as any);

      expect(result).toEqual({
        data: {
          accountSnapshotTimestamp: null,
          sites: []
        }
      });
    });

    it('should always return empty sites array', () => {
      const result = emptySitesResponse('2024-01-01T00:00:00Z');
      
      expect(result.data.sites).toEqual([]);
      expect(Array.isArray(result.data.sites)).toBe(true);
    });
  });
});

