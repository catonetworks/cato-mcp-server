/**
 * Basic test to verify Jest setup
 */

import { describe, it, expect } from 'vitest';

describe('Basic Test Suite', () => {
  it('should pass a basic test', () => {
    expect(1 + 1).toBe(2);
  });

  it('should handle environment variables', () => {
    expect(process.env.CATO_API_HOST).toBe('test-api.catonetworks.com');
    expect(process.env.CATO_ACCOUNT_ID).toBe('test-account-123');
    expect(process.env.CATO_API_KEY).toBe('test-api-key-456');
  });

  it('should handle async operations', async () => {
    const promise = Promise.resolve('test');
    const result = await promise;
    expect(result).toBe('test');
  });
});
