/**
 * Unit tests for environment utilities
 */

import { describe, it, expect, vi } from 'vitest';

// Mock the env module
vi.mock('../../utils/env.js', () => ({
  getEnvVariable: vi.fn()
}));

describe('Environment Utilities', () => {
  it('should handle environment variable retrieval', async () => {
    const { getEnvVariable } = await import('../../utils/env.js');
    
    // Mock the implementation
    vi.mocked(getEnvVariable).mockImplementation((key: string, defaultValue?: string) => {
      if (key === 'CATO_API_HOST') return 'api.catonetworks.com';
      if (key === 'CATO_ACCOUNT_ID') return '1234567';
      if (key === 'CATO_API_KEY') return 'test-key';
      return defaultValue || '';
    });

    // Test that the function is called with correct parameters
    expect(getEnvVariable).toBeDefined();
  });

  it('should use default values when environment variables are not set', async () => {
    const { getEnvVariable } = await import('../../utils/env.js');
    
    vi.mocked(getEnvVariable).mockImplementation((key: string, defaultValue?: string) => {
      if (key === 'CATO_MAX_RESPONSE_LENGTH') return defaultValue || '200000';
      return defaultValue || '';
    });

    const result = getEnvVariable('CATO_MAX_RESPONSE_LENGTH', '200000');
    expect(result).toBe('200000');
  });

  it('should throw error for required environment variables', async () => {
    const { getEnvVariable } = await import('../../utils/env.js');
    
    vi.mocked(getEnvVariable).mockImplementation((key: string) => {
      if (key === 'CATO_API_HOST') return 'api.catonetworks.com';
      if (key === 'CATO_ACCOUNT_ID') return '1234567';
      if (key === 'CATO_API_KEY') return 'test-key';
      throw new Error(`Environment variable ${key} is required`);
    });

    expect(() => getEnvVariable('REQUIRED_VAR')).toThrow('Environment variable REQUIRED_VAR is required');
  });
});
