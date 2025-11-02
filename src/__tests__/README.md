# Testing Guide

This directory contains the test suite for the Cato MCP Server.

## Test Structure

```
src/__tests__/
├── setup.ts                 # Vitest setup configuration
├── __mocks__/               # Mock implementations
│   └── graphql.ts          # GraphQL client mocks
├── utils/                   # Test utilities and helpers
│   └── testHelpers.ts      # Common test helper functions
├── unit/                    # Unit tests
│   ├── basic.test.ts       # Basic functionality tests
│   ├── utils.test.ts       # Utility function tests
│   └── env.test.ts         # Environment utilities tests
└── integration/             # Integration tests (to be added)
    └── mcpServer.test.ts   # MCP server integration tests
```

## Running Tests

### All Tests
```bash
yarn test
```

### Watch Mode (for development)
```bash
yarn test:watch
```

### Coverage Report
```bash
yarn test:coverage
```

### UI Mode (interactive test runner)
```bash
yarn test:ui
```

### CI Mode (no watch, with coverage)
```bash
yarn test:ci
```

## Test Configuration

The tests are configured in `vitest.config.ts` with the following settings:

- **Framework**: Vitest for modern ES module support
- **Environment**: Node.js
- **TypeScript**: Native support with ES modules
- **Test Pattern**: `**/__tests__/**/*.test.ts` and `**/?(*.)+(spec|test).ts`
- **Coverage**: V8 provider with HTML, LCOV, and text reports
- **Setup**: `src/__tests__/setup.ts` runs before each test

## Writing Tests

### Unit Tests
Unit tests should focus on testing individual functions and modules in isolation. Use mocks for external dependencies.

Example:
```typescript
import { describe, it, expect, vi } from 'vitest';

describe('MyModule', () => {
  it('should do something', () => {
    expect(true).toBe(true);
  });
});
```

### Integration Tests
Integration tests should test the interaction between multiple modules or the full MCP server functionality.

### Mocking
- Use `__mocks__` directory for reusable mocks
- Mock external dependencies like GraphQL client, environment variables
- Use `vi.fn()` for function mocks
- Use `vi.mock()` for module mocks

### Test Helpers
Use the `testHelpers.ts` file for common test utilities:
- `createMockToolWrapper()` - Creates mock MCP tool wrappers
- `createMockVariables()` - Creates mock GraphQL variables
- `createMockMcpRequest()` - Creates mock MCP requests

## Environment Variables

Tests use mock environment variables defined in `setup.ts`:
- `CATO_API_HOST`: test-api.catonetworks.com
- `CATO_ACCOUNT_ID`: test-account-123
- `CATO_API_KEY`: test-api-key-456
- `CATO_LOG_LEVEL`: error

## Coverage

The test suite aims for good coverage of:
- Core functionality (tools, GraphQL client, MCP server)
- Error handling
- Edge cases
- Integration scenarios

Coverage reports are generated in the `coverage/` directory with HTML, LCOV, and text formats.

## Vitest Features

This project uses Vitest, which provides:
- **Fast execution** with Vite's build system
- **Native ES module support** without complex configuration
- **TypeScript support** out of the box
- **Watch mode** for development
- **UI mode** for interactive testing
- **Coverage reporting** with V8 provider
- **Mocking** with `vi` utilities
