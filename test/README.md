# JIRA Ticket Lifecycle Tests

This directory contains Jest tests for JIRA integration functionality.

## Running the Tests

### Run all tests
```bash
npx jest
```

### Run a specific test file
```bash
npx jest test/jira-ticket-lifecycle.test.ts
```

### Run tests in watch mode
```bash
npm run test:watch
```

### Run tests with coverage
```bash
npm run test:coverage
```

## Test Structure

### `jira-ticket-lifecycle.test.ts`
Tests the complete lifecycle of JIRA tickets:
- **Create Ticket**: Tests creating new tickets in the TT project
- **Update Ticket**: Tests updating existing tickets (placeholder for future implementation)
- **Delete Ticket**: Tests deleting tickets (placeholder for future implementation)
- **List Tickets**: Tests finding tickets assigned to the current user
- **Full Lifecycle**: Integration test for create → update → delete flow

## Key Features

- **Mocked JIRA API**: All JIRA API calls are mocked to avoid hitting real endpoints
- **Environment Variables**: Test environment variables are set up in `beforeEach`
- **Local Storage**: File system operations are mocked for ticket persistence
- **Duplicate Detection**: Tests verify that duplicate tickets are not created

## Notes

- Update and Delete operations are currently not implemented in the JIRA tools
- The tests include placeholders showing expected behavior once these features are added
- All tests use proper TypeScript types and avoid `any` types
- Tests are isolated and can run in any order

## Environment Variables Used in Tests

- `JIRA_BASE_URL`: https://test.atlassian.net
- `JIRA_USER_EMAIL`: test@example.com  
- `JIRA_API_TOKEN`: test-token
- `DATA_DIR`: /tmp/test-data 