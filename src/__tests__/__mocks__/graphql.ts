/**
 * Mock for GraphQL client
 */

export const mockGraphqlResponse = {
  data: {
    sites: [
      {
        id: 'site-1',
        name: 'Test Site 1',
        location: {
          city: 'New York',
          country: 'US'
        }
      }
    ]
  }
};

export const mockGraphqlError = {
  errors: [
    {
      message: 'Test GraphQL error',
      locations: [{ line: 1, column: 1 }]
    }
  ]
};

export const mockExecuteGraphqlRequest = jest.fn().mockResolvedValue(JSON.stringify(mockGraphqlResponse));

export const mockInitializeGraphqlClient = jest.fn();

export const mockBuildGraphqlRequest = jest.fn().mockReturnValue({
  method: 'POST',
  headers: {
    'User-Agent': 'Cato MCP Server',
    'Content-Type': 'application/json',
    'x-api-key': 'test-api-key-456'
  },
  body: JSON.stringify({
    query: 'test query',
    variables: {}
  })
});

export const mockHandleGraphqlResponse = jest.fn().mockResolvedValue(JSON.stringify(mockGraphqlResponse));
