/**
 * Vitest setup file for Cato MCP Server tests
 */

import { vi } from 'vitest';

// Mock environment variables for testing
process.env.CATO_API_HOST = 'test-api.catonetworks.com';
process.env.CATO_ACCOUNT_ID = 'test-account-123';
process.env.CATO_API_KEY = 'test-api-key-456';
process.env.CATO_LOG_LEVEL = 'error'; // Reduce log noise during tests

// Global test timeout
// Vitest handles timeouts differently, configured in vitest.config.ts

// Mock console methods to reduce noise during tests
global.console = {
  ...console,
  // Uncomment to suppress console.log during tests
  // log: vi.fn(),
  // debug: vi.fn(),
  // info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};
