/**
 * Unit tests for user utilities
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isValidResponse, emptyUsersResponse } from '../../tools/users_snapshot/userUtils.js';
import { log } from '../../utils/mcpLogger.js';

// Mock the logger
vi.mock('../../utils/mcpLogger.js', () => ({
  log: vi.fn()
}));

describe('User Utils', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('isValidResponse', () => {
    it('should return true for valid response with users', () => {
      const response = {
        data: {
          accountSnapshot: {
            users: [
              { id: 'user1', name: 'User 1' },
              { id: 'user2', name: 'User 2' }
            ]
          }
        }
      };

      expect(isValidResponse('test-account-123', response)).toBe(true);
      expect(log).not.toHaveBeenCalled();
    });

    it('should return false for response without users', () => {
      const response = {
        data: {
          accountSnapshot: {}
        }
      };

      expect(isValidResponse('test-account-123', response)).toBe(false);
      expect(log).toHaveBeenCalledWith(
        expect.anything(),
        expect.stringContaining('No users found in account snapshot')
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

    it('should return true for empty users array', () => {
      const response = {
        data: {
          accountSnapshot: {
            users: []
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

      isValidResponse('test-account-789', response);
      expect(log).toHaveBeenCalledWith(
        expect.anything(),
        expect.stringContaining('test-account-789')
      );
    });
  });

  describe('emptyUsersResponse', () => {
    it('should return empty response with timestamp', () => {
      const timestamp = '2024-01-01T00:00:00Z';
      const result = emptyUsersResponse(timestamp);

      expect(result).toEqual({
        data: {
          accountSnapshotTimestamp: timestamp,
          users: []
        }
      });
    });

    it('should handle undefined timestamp', () => {
      const result = emptyUsersResponse(undefined as any);

      expect(result).toEqual({
        data: {
          accountSnapshotTimestamp: undefined,
          users: []
        }
      });
    });

    it('should handle null timestamp', () => {
      const result = emptyUsersResponse(null as any);

      expect(result).toEqual({
        data: {
          accountSnapshotTimestamp: null,
          users: []
        }
      });
    });

    it('should always return empty users array', () => {
      const result = emptyUsersResponse('2024-01-01T00:00:00Z');
      
      expect(result.data.users).toEqual([]);
      expect(Array.isArray(result.data.users)).toBe(true);
    });
  });
});

