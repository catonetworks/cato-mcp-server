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
└── integration/             # Integration tests
    ├── mcpServer.test.ts   # MCP server integration tests
    └── mcpProtocol.test.ts # Protocol-level black-box tests
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

### Protocol-Level Black-Box Tests

**Location:** `src/__tests__/integration/mcpProtocol.test.ts`

These tests validate the MCP server contract at the protocol level, ensuring behavioral contracts that survive language transitions (TypeScript → Python).

**Benefits:**
- ✅ Tests actual user behavior via MCP protocol
- ✅ Creates behavioral contracts for migration validation  
- ✅ Survives language transition from TypeScript to Python
- ✅ Tests the complete request pipeline: discovery → execution → response

**Test Coverage:**
1. **Tool Discovery** - Validates all expected tools are listed with correct schemas
2. **Tool Execution Contracts** - Validates input/output transformations
3. **End-to-End Pipeline** - Tests complete flow from tool discovery to response
4. **Input/Output Validation** - Ensures tools accept correct inputs and return structured JSON

**Running Protocol Tests:**
```bash
# Run protocol tests (requires built server)
yarn build && yarn test src/__tests__/integration/mcpProtocol.test.ts
```

**Migration-Friendly Testing:**
When implementing Python version, these protocol tests should continue to work with minimal changes:
- The MCP protocol contract remains the same
- Only the test setup (client connection) needs to be adapted to Python's MCP client SDK
- Behavioral contracts ensure Python implementation matches TypeScript behavior

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
- **Protocol-level contracts** (MCP protocol compliance)

**Missing Critical Coverage:**
- Individual tool implementations - None of the 15+ MCP tools have unit tests
- MCP request pipeline - End-to-end flow from tool call to GraphQL response (partially covered by protocol tests)
- Tool input/output transformations - Domain-specific business logic validation (partially covered by protocol tests)

**Recommendation:** Consider protocol-level black-box tests (already implemented) that survive the language transition. These tests validate behavioral contracts rather than implementation details, making them ideal for migration validation.

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
