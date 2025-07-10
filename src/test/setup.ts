import { beforeEach } from 'vitest';

// Mock process.cwd() for consistent path testing
const originalCwd = process.cwd();

beforeEach(() => {
  // Reset working directory for each test
  if (process.cwd() !== originalCwd) {
    process.chdir(originalCwd);
  }
});

// Helper function to create test data
export const createMockMessage = (overrides: any = {}) => ({
  type: 'user',
  content: 'test message',
  timestamp: '2024-01-01T00:00:00.000Z',
  session_id: 'test-session',
  ...overrides
});

export const createMockSession = (overrides: any = {}) => ({
  id: 'test-session',
  title: 'Test Session',
  messages: [],
  startTime: new Date('2024-01-01T00:00:00.000Z'),
  endTime: new Date('2024-01-01T01:00:00.000Z'),
  workingDirectory: '/test/dir',
  ...overrides
});

export const createMockToolResult = (overrides: any = {}) => ({
  type: 'tool_result',
  tool_use_id: 'test-tool-id',
  content: 'Test tool result',
  is_error: false,
  ...overrides
});

export const createMockToolUse = (overrides: any = {}) => ({
  type: 'tool_use',
  id: 'test-tool-id',
  name: 'test_tool',
  input: { test: 'input' },
  ...overrides
});