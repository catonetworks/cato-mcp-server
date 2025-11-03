/**
 * Unit tests for environment utilities
 * Tests the actual implementation, not mocks
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getEnvVariable } from '../../utils/env.js';

describe('Environment Utilities', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Clear env before each test
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    // Restore original env
    process.env = originalEnv;
  });

  it('should return environment variable when set', () => {
    process.env['TEST_VAR'] = 'test-value';
    expect(getEnvVariable('TEST_VAR')).toBe('test-value');
  });

  it('should return default value when environment variable is not set', () => {
    delete process.env['TEST_VAR'];
    expect(getEnvVariable('TEST_VAR', 'default-value')).toBe('default-value');
  });

  it('should throw error when environment variable is not set and no default provided', () => {
    delete process.env['REQUIRED_VAR'];
    expect(() => getEnvVariable('REQUIRED_VAR')).toThrow('Environment variable REQUIRED_VAR is not set');
  });

  it('should prefer environment variable over default value', () => {
    process.env['TEST_VAR'] = 'env-value';
    expect(getEnvVariable('TEST_VAR', 'default-value')).toBe('env-value');
  });

  it('should handle empty string as a valid value', () => {
    process.env['EMPTY_VAR'] = '';
    expect(getEnvVariable('EMPTY_VAR', 'default')).toBe('');
  });

  it('should handle numeric strings', () => {
    process.env['NUM_VAR'] = '12345';
    expect(getEnvVariable('NUM_VAR')).toBe('12345');
  });

  it('should handle boolean-like strings', () => {
    process.env['BOOL_VAR'] = 'true';
    expect(getEnvVariable('BOOL_VAR')).toBe('true');
  });
});
