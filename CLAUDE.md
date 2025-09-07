# Claude Instructions

## E2E Testing

When you need to run, debug, or troubleshoot end-to-end Electron tests, use the `electron-e2e-test-runner` agent. This specialized agent handles:

- Running e2e tests for the Electron application
- Debugging test failures and process launch errors
- Resolving test timeouts and environment setup issues
- Interpreting test results and providing solutions

### Examples of when to use the electron-e2e-test-runner:

- When running `pnpm test:e2e` or similar e2e test commands
- When encountering "process not launched" errors in e2e tests
- When tests are timing out unexpectedly
- When you need to debug Electron test environment issues

The agent has access to all necessary tools and specialized knowledge for handling Electron e2e testing scenarios.