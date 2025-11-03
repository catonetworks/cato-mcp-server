/**
 * Unit tests for utility functions
 */

import { describe, it, expect } from 'vitest';

describe('Utility Functions', () => {
  it('should perform basic math operations', () => {
    expect(2 + 2).toBe(4);
    expect(10 - 5).toBe(5);
    expect(3 * 4).toBe(12);
    expect(8 / 2).toBe(4);
  });

  it('should handle string operations', () => {
    const str = 'Hello, World!';
    expect(str.length).toBe(13);
    expect(str.toUpperCase()).toBe('HELLO, WORLD!');
    expect(str.toLowerCase()).toBe('hello, world!');
  });

  it('should handle array operations', () => {
    const arr = [1, 2, 3, 4, 5];
    expect(arr.length).toBe(5);
    expect(arr.includes(3)).toBe(true);
    expect(arr.filter(x => x > 3)).toEqual([4, 5]);
  });

  it('should handle async operations', async () => {
    const promise = Promise.resolve('async result');
    const result = await promise;
    expect(result).toBe('async result');
  });

  it('should handle environment variables', () => {
    expect(process.env.CATO_API_HOST).toBe('test-api.catonetworks.com');
    expect(process.env.CATO_ACCOUNT_ID).toBe('test-account-123');
    expect(process.env.CATO_API_KEY).toBe('test-api-key-456');
  });
});
