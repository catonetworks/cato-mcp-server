/**
 * Unit tests for metrics utilities
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  standardizeMetricsInput,
  calculateBytesTotal,
  calculateHostUtilization,
  calculateUpstreamDownstreamRatio,
  aggregateValues,
  calculateSummary,
  generateHealthFlags,
  sortResults,
  isValidSiteMetricResponse,
  isValidUserMetricResponse,
  emptyMetricsResponse,
  formatBytes,
  GROUP_KEY_GENERATORS,
  HEALTH_THRESHOLDS,
  FALLBACK_VALUES,
  AGGREGATION_FUNCTIONS
} from '../../utils/metricsUtils.js';
import { log } from '../../utils/mcpLogger.js';

// Mock the logger
vi.mock('../../utils/mcpLogger.js', () => ({
  log: vi.fn()
}));

describe('Metrics Utils', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('standardizeMetricsInput', () => {
    it('should initialize missing arrays', () => {
      const input = {};
      const result = standardizeMetricsInput(input);
      expect(result.siteIDs).toEqual([]);
      expect(result.userIDs).toEqual([]);
      expect(result.annotationTypes).toBeNull();
    });

    it('should preserve existing values', () => {
      const input = {
        siteIDs: ['site1', 'site2'],
        userIDs: ['user1'],
        annotationTypes: ['type1']
      };
      const result = standardizeMetricsInput(input);
      expect(result.siteIDs).toEqual(['site1', 'site2']);
      expect(result.userIDs).toEqual(['user1']);
      expect(result.annotationTypes).toEqual(['type1']);
    });

    it('should set annotationTypes to null if not provided', () => {
      const input = { siteIDs: [] };
      const result = standardizeMetricsInput(input);
      expect(result.annotationTypes).toBeNull();
    });
  });

  describe('calculateBytesTotal', () => {
    it('should sum upstream and downstream bytes', () => {
      expect(calculateBytesTotal(100, 200)).toBe(300);
    });

    it('should handle zero values', () => {
      expect(calculateBytesTotal(0, 0)).toBe(0);
    });

    it('should handle null/undefined as zero', () => {
      expect(calculateBytesTotal(null as any, undefined as any)).toBe(0);
      expect(calculateBytesTotal(100, null as any)).toBe(100);
      expect(calculateBytesTotal(undefined as any, 200)).toBe(200);
    });
  });

  describe('calculateHostUtilization', () => {
    it('should calculate percentage correctly', () => {
      expect(calculateHostUtilization(50, 100)).toBe(50);
      expect(calculateHostUtilization(75, 100)).toBe(75);
    });

    it('should return 0 when hostLimit is 0', () => {
      expect(calculateHostUtilization(50, 0)).toBe(0);
    });

    it('should handle zero host count', () => {
      expect(calculateHostUtilization(0, 100)).toBe(0);
    });

    it('should calculate fractional percentages', () => {
      expect(calculateHostUtilization(1, 3)).toBeCloseTo(33.33, 2);
    });
  });

  describe('calculateUpstreamDownstreamRatio', () => {
    it('should calculate ratio correctly', () => {
      expect(calculateUpstreamDownstreamRatio(50, 100)).toBe(0.5);
      expect(calculateUpstreamDownstreamRatio(100, 50)).toBe(2);
    });

    it('should return 0 when downstream is 0', () => {
      expect(calculateUpstreamDownstreamRatio(100, 0)).toBe(0);
    });

    it('should handle zero upstream', () => {
      expect(calculateUpstreamDownstreamRatio(0, 100)).toBe(0);
    });
  });

  describe('aggregateValues', () => {
    it('should sum values', () => {
      expect(aggregateValues([1, 2, 3], 'sum')).toBe(6);
    });

    it('should average values', () => {
      expect(aggregateValues([1, 2, 3], 'avg')).toBe(2);
    });

    it('should find max value', () => {
      expect(aggregateValues([1, 5, 3], 'max')).toBe(5);
    });

    it('should find min value', () => {
      expect(aggregateValues([1, 5, 3], 'min')).toBe(1);
    });

    it('should filter out null/undefined/NaN values', () => {
      expect(aggregateValues([1, null, 3, undefined, NaN] as any[], 'sum')).toBe(4);
    });

    it('should return 0 for empty array', () => {
      expect(aggregateValues([], 'sum')).toBe(0);
    });

    it('should default to avg for unknown function', () => {
      expect(aggregateValues([2, 4], 'unknown')).toBe(3);
    });
  });

  describe('calculateSummary', () => {
    it('should calculate min, max, avg from data points', () => {
      const dataPoints = [
        [1000, 10],
        [2000, 20],
        [3000, 30]
      ];
      const result = calculateSummary(dataPoints, 'sum');
      expect(result.min).toBe(10);
      expect(result.max).toBe(30);
      expect(result.avg).toBe(20);
      expect(result.peak.value).toBe(30);
    });

    it('should return zeros for empty data', () => {
      const result = calculateSummary([], 'sum');
      expect(result.min).toBe(0);
      expect(result.max).toBe(0);
      expect(result.avg).toBe(0);
      expect(result.peak.value).toBe(0);
      expect(result.peak.timestamp).toBeNull();
    });

    it('should filter out negative values', () => {
      const dataPoints = [
        [1000, 10],
        [2000, -5],
        [3000, 30]
      ];
      const result = calculateSummary(dataPoints, 'sum');
      expect(result.min).toBe(10);
      expect(result.max).toBe(30);
    });

    it('should find peak timestamp', () => {
      const dataPoints = [
        [1000, 10],
        [2000, 30],
        [3000, 20]
      ];
      const result = calculateSummary(dataPoints, 'sum');
      expect(result.peak.value).toBe(30);
      expect(result.peak.timestamp).toBeTruthy();
    });
  });

  describe('generateHealthFlags', () => {
    it('should flag high RTT', () => {
      const metrics = { rtt: 200 };
      const thresholds = { rtt: HEALTH_THRESHOLDS.RTT };
      const flags = generateHealthFlags(metrics, thresholds);
      expect(flags.length).toBeGreaterThan(0);
      expect(flags.some(flag => flag.includes('High RTT'))).toBe(true);
    });

    it('should flag high upstream packet loss', () => {
      const metrics = { lostUpstreamPcnt: 5 };
      const thresholds = { packetLoss: HEALTH_THRESHOLDS.PACKET_LOSS };
      const flags = generateHealthFlags(metrics, thresholds);
      expect(flags.length).toBeGreaterThan(0);
      expect(flags.some(flag => flag.includes('High upstream packet loss'))).toBe(true);
    });

    it('should flag high downstream packet loss', () => {
      const metrics = { lostDownstreamPcnt: 5 };
      const thresholds = { packetLoss: HEALTH_THRESHOLDS.PACKET_LOSS };
      const flags = generateHealthFlags(metrics, thresholds);
      expect(flags.length).toBeGreaterThan(0);
      expect(flags.some(flag => flag.includes('High downstream packet loss'))).toBe(true);
    });

    it('should flag high upstream jitter', () => {
      const metrics = { jitterUpstream: 50 };
      const thresholds = { jitter: HEALTH_THRESHOLDS.JITTER };
      const flags = generateHealthFlags(metrics, thresholds);
      expect(flags.length).toBeGreaterThan(0);
      expect(flags.some(flag => flag.includes('High upstream jitter'))).toBe(true);
    });

    it('should flag high downstream jitter', () => {
      const metrics = { jitterDownstream: 50 };
      const thresholds = { jitter: HEALTH_THRESHOLDS.JITTER };
      const flags = generateHealthFlags(metrics, thresholds);
      expect(flags.length).toBeGreaterThan(0);
      expect(flags.some(flag => flag.includes('High downstream jitter'))).toBe(true);
    });

    it('should flag high host utilization', () => {
      const metrics = { hostUtilizationPct: 95 };
      const thresholds = { hostUtilization: 90 };
      const flags = generateHealthFlags(metrics, thresholds);
      expect(flags.length).toBeGreaterThan(0);
      expect(flags.some(flag => flag.includes('High capacity utilization'))).toBe(true);
    });

    it('should return empty array when no thresholds exceeded', () => {
      const metrics = { rtt: 50, lostUpstreamPcnt: 1 };
      const thresholds = { rtt: 150, packetLoss: 2 };
      const flags = generateHealthFlags(metrics, thresholds);
      expect(flags).toEqual([]);
    });

    it('should handle multiple flags', () => {
      const metrics = {
        rtt: 200,
        lostUpstreamPcnt: 5,
        jitterUpstream: 50
      };
      const thresholds = {
        rtt: 150,
        packetLoss: 2,
        jitter: 30
      };
      const flags = generateHealthFlags(metrics, thresholds);
      expect(flags.length).toBeGreaterThan(1);
    });
  });

  describe('sortResults', () => {
    const sampleResults = [
      { name: 'A', value: 10 },
      { name: 'B', value: 30 },
      { name: 'C', value: 20 }
    ];

    it('should sort descending by default', () => {
      const sorted = sortResults([...sampleResults], 'value');
      expect(sorted[0].value).toBe(30);
      expect(sorted[2].value).toBe(10);
    });

    it('should sort ascending when specified', () => {
      const sorted = sortResults([...sampleResults], 'value', 'asc');
      expect(sorted[0].value).toBe(10);
      expect(sorted[2].value).toBe(30);
    });

    it('should return original array if sortBy field missing', () => {
      const sorted = sortResults([...sampleResults], 'missingField');
      expect(sorted).toEqual(sampleResults);
    });

    it('should return original array if empty', () => {
      const sorted = sortResults([], 'value');
      expect(sorted).toEqual([]);
    });

    it('should handle null values as zero', () => {
      const results = [
        { name: 'A', value: null },
        { name: 'B', value: 10 }
      ];
      const sorted = sortResults(results as any[], 'value', 'asc');
      expect(sorted[0].value).toBeNull();
    });
  });

  describe('isValidSiteMetricResponse', () => {
    it('should return true for valid response', () => {
      const response = {
        data: {
          accountMetrics: {
            sites: [{ id: 'site1' }]
          }
        }
      };
      expect(isValidSiteMetricResponse('account123', response)).toBe(true);
    });

    it('should return false for missing sites', () => {
      const response = {
        data: {
          accountMetrics: {}
        }
      };
      expect(isValidSiteMetricResponse('account123', response)).toBe(false);
      expect(log).toHaveBeenCalledWith(expect.anything(), expect.stringContaining('No site metrics found'));
    });

    it('should return false for null response', () => {
      expect(isValidSiteMetricResponse('account123', null as any)).toBe(false);
    });
  });

  describe('isValidUserMetricResponse', () => {
    it('should return true for valid response', () => {
      const response = {
        data: {
          accountMetrics: {
            users: [{ id: 'user1' }]
          }
        }
      };
      expect(isValidUserMetricResponse('account123', response)).toBe(true);
    });

    it('should return false for missing users', () => {
      const response = {
        data: {
          accountMetrics: {}
        }
      };
      expect(isValidUserMetricResponse('account123', response)).toBe(false);
      expect(log).toHaveBeenCalledWith(expect.anything(), expect.stringContaining('No user metrics found'));
    });
  });

  describe('emptyMetricsResponse', () => {
    it('should return empty response with timeframe', () => {
      const accountMetrics = {
        from: '2024-01-01T00:00:00Z',
        to: '2024-01-02T00:00:00Z'
      };
      const result = emptyMetricsResponse(accountMetrics);
      expect(result.data.sites).toEqual([]);
      expect(result.data.timeFrame.from).toBe('2024-01-01T00:00:00Z');
      expect(result.data.timeFrame.to).toBe('2024-01-02T00:00:00Z');
    });

    it('should handle null accountMetrics', () => {
      const result = emptyMetricsResponse(null);
      expect(result.data.sites).toEqual([]);
      expect(result.data.timeFrame.from).toBeUndefined();
    });
  });

  describe('formatBytes', () => {
    it('should format bytes', () => {
      expect(formatBytes(0)).toBe('0 Bytes');
      expect(formatBytes(1024)).toBe('1 KiB');
      expect(formatBytes(1024 * 1024)).toBe('1 MiB');
      expect(formatBytes(1024 * 1024 * 1024)).toBe('1 GiB');
    });

    it('should handle custom decimals', () => {
      expect(formatBytes(1536, 1)).toBe('1.5 KiB');
      expect(formatBytes(1024, 0)).toBe('1 KiB');
    });

    it('should handle large values', () => {
      expect(formatBytes(1024 * 1024 * 1024 * 1024)).toBe('1 TiB');
    });

    it('should handle fractional values', () => {
      expect(formatBytes(512)).toBe('512 Bytes');
      expect(formatBytes(1500)).toBe('1.46 KiB');
    });
  });

  describe('GROUP_KEY_GENERATORS', () => {
    it('should generate site key', () => {
      const site = { info: { name: 'Test Site' }, id: 'site1' };
      expect(GROUP_KEY_GENERATORS.site(site)).toBe('Test Site');
      expect(GROUP_KEY_GENERATORS.site({ id: 'site1' })).toBe('site1');
    });

    it('should generate siteType key', () => {
      const site = { info: { type: 'BRANCH' } };
      expect(GROUP_KEY_GENERATORS.siteType(site)).toBe('BRANCH');
      expect(GROUP_KEY_GENERATORS.siteType({})).toBe(FALLBACK_VALUES.UNKNOWN);
    });

    it('should generate user key', () => {
      const user = { info: { name: 'Test User' }, id: 'user1' };
      expect(GROUP_KEY_GENERATORS.user(user)).toBe('Test User');
      expect(GROUP_KEY_GENERATORS.user({ name: 'User', id: 'user1' })).toBe('User');
      expect(GROUP_KEY_GENERATORS.user({ id: 'user1' })).toBe('user1');
    });

    it('should generate inOffice key', () => {
      expect(GROUP_KEY_GENERATORS.inOffice({ info: { connectedInOffice: true } })).toBe(FALLBACK_VALUES.IN_OFFICE);
      expect(GROUP_KEY_GENERATORS.inOffice({ info: { connectedInOffice: false } })).toBe(FALLBACK_VALUES.REMOTE);
    });
  });

  describe('AGGREGATION_FUNCTIONS', () => {
    it('should sum values', () => {
      expect(AGGREGATION_FUNCTIONS.sum([1, 2, 3])).toBe(6);
    });

    it('should average values', () => {
      expect(AGGREGATION_FUNCTIONS.avg([2, 4, 6])).toBe(4);
    });

    it('should find max', () => {
      expect(AGGREGATION_FUNCTIONS.max([1, 5, 3])).toBe(5);
    });

    it('should find min', () => {
      expect(AGGREGATION_FUNCTIONS.min([1, 5, 3])).toBe(1);
    });
  });
});

