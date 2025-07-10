# Test Suite Documentation

This directory contains the comprehensive test suite for the cc-session-to-md project.

## Test Structure

### Unit Tests
- `MessageWrapper.test.ts` - Tests for message wrapper functionality
- `paths.test.ts` - Tests for path utility functions  
- `language.test.ts` - Tests for language detection
- `time.test.ts` - Tests for time formatting utilities
- `SessionParser.test.ts` - Tests for JSONL parsing
- `MessageProcessor.test.ts` - Tests for message processing
- `ToolResultProcessor.test.ts` - Tests for tool result formatting
- `MarkdownFormatter.test.ts` - Tests for main formatter class

### Integration Tests
- `integration.test.ts` - Tests using real Claude Code session data
- `index.test.ts` - CLI integration tests

## Test Fixtures

The `fixtures/` directory contains real Claude Code session data for testing:

### Included Files
- `small-sample.jsonl` - Small sample with summary messages (committed to git)
- `real-session-sample.jsonl` - Sample with real session data (committed to git)

### Large Files (Excluded from Git)
- `*.jsonl` - Full session files copied from `~/.claude/projects/` (excluded from git)

These large files are automatically copied when you run tests but are not committed to version control due to their size.

## Running Tests

```bash
# Run all tests
npm test

# Run with UI
npm run test:ui

# Run with coverage
npm run test:coverage

# Run specific test file
npm test -- MessageWrapper.test.ts

# Run integration tests only
npm test -- integration.test.ts
```

## Test Data Sources

The test fixtures are copies of real Claude Code session files from:
```
~/.claude/projects/-Users-mnutt-p-movableink-webkit/
```

This ensures tests run against realistic data structures and edge cases.

## Adding New Tests

When adding new tests:

1. **Unit tests** should test individual functions/classes in isolation
2. **Integration tests** should test the full workflow with real data
3. Use the existing fixtures or create new minimal fixtures as needed
4. Follow the existing naming conventions and structure

## Coverage

The test suite aims for comprehensive coverage of:
- ✅ Core functionality (message processing, parsing, formatting)
- ✅ Edge cases (malformed input, empty data, error conditions)
- ✅ Real data scenarios (using actual Claude Code session files)
- ✅ Performance (handling large files efficiently)
- ✅ CLI integration (command-line interface testing)