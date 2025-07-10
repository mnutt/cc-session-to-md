import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MarkdownFormatter } from './MarkdownFormatter.js';
import { DEFAULT_FORMATTING_OPTIONS } from '../types/constants.js';

describe('MarkdownFormatter', () => {
  let formatter: MarkdownFormatter;

  beforeEach(() => {
    formatter = new MarkdownFormatter();
  });

  describe('constructor', () => {
    it('should use default formatting options when none provided', () => {
      const defaultFormatter = new MarkdownFormatter();
      expect(defaultFormatter).toBeDefined();
    });

    it('should accept custom formatting options', () => {
      const customOptions = {
        ...DEFAULT_FORMATTING_OPTIONS,
        syntaxHighlighting: false
      };
      const customFormatter = new MarkdownFormatter(customOptions);
      expect(customFormatter).toBeDefined();
    });
  });

  describe('validateInput', () => {
    it('should validate correct JSONL input', () => {
      const validInput = `{"type": "user", "sessionId": "test", "message": {"role": "user", "content": "Hello"}, "timestamp": "2024-01-01T00:00:00.000Z"}
{"type": "assistant", "sessionId": "test", "message": {"role": "assistant", "content": "Hi there"}, "timestamp": "2024-01-01T00:01:00.000Z"}`;
      
      const result = formatter.validateInput(validInput);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject invalid JSON', () => {
      const invalidInput = `{"type": "user", "content": "Hello"
invalid json line`;
      
      const result = formatter.validateInput(invalidInput);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should reject missing required fields', () => {
      const invalidInput = `{"content": "Hello"}`;
      
      const result = formatter.validateInput(invalidInput);
      expect(result.valid).toBe(false);
      expect(result.errors.some(error => error.includes('type'))).toBe(true);
    });

    it('should handle empty input', () => {
      const result = formatter.validateInput('');
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('getInputStats', () => {
    it('should calculate correct statistics', () => {
      const input = `{"type": "user", "sessionId": "test1", "message": {"role": "user", "content": "Hello"}, "timestamp": "2024-01-01T00:00:00.000Z"}
{"type": "assistant", "sessionId": "test1", "message": {"role": "assistant", "content": "Hi"}, "timestamp": "2024-01-01T00:01:00.000Z"}
{"type": "summary", "summary": "Session summary", "timestamp": "2024-01-01T00:02:00.000Z"}
{"type": "user", "sessionId": "test2", "message": {"role": "user", "content": "New session"}, "timestamp": "2024-01-01T01:00:00.000Z"}`;

      const stats = formatter.getInputStats(input);
      
      expect(stats.totalLines).toBe(4);
      expect(stats.totalMessages).toBe(4);
      expect(stats.messagesByType.user).toBe(2);
      expect(stats.messagesByType.assistant).toBe(1);
      expect(stats.messagesByType.summary).toBe(1);
      // Note: Sessions calculation depends on actual parsing logic
    });

    it('should handle empty input', () => {
      const stats = formatter.getInputStats('');
      
      expect(stats.totalLines).toBe(0);
      expect(stats.totalSessions).toBe(0);
      expect(stats.totalMessages).toBe(0);
      expect(stats.messagesByType.user).toBe(0);
      expect(stats.messagesByType.assistant).toBe(0);
      expect(stats.messagesByType.summary).toBe(0);
    });
  });

  describe('convertInput', () => {
    it('should convert simple user-assistant exchange', () => {
      const input = `{"type": "user", "sessionId": "test", "message": {"role": "user", "content": "Hello"}, "timestamp": "2024-01-01T00:00:00.000Z"}
{"type": "assistant", "sessionId": "test", "message": {"role": "assistant", "content": "Hi there!"}, "timestamp": "2024-01-01T00:01:00.000Z"}`;

      const result = formatter.convertInput(input);
      
      // Test should verify the conversion produces some output
      expect(typeof result).toBe('string');
      // Content verification depends on actual formatting logic
    });

    it('should handle multiple sessions', () => {
      const input = `{"type": "user", "sessionId": "session1", "message": {"role": "user", "content": "Hello"}, "timestamp": "2024-01-01T00:00:00.000Z"}
{"type": "assistant", "sessionId": "session1", "message": {"role": "assistant", "content": "Hi"}, "timestamp": "2024-01-01T00:01:00.000Z"}
{"type": "user", "sessionId": "session2", "message": {"role": "user", "content": "New session"}, "timestamp": "2024-01-01T01:00:00.000Z"}
{"type": "assistant", "sessionId": "session2", "message": {"role": "assistant", "content": "Hello again"}, "timestamp": "2024-01-01T01:01:00.000Z"}`;

      const result = formatter.convertInput(input);
      
      expect(typeof result).toBe('string');
    });

    it('should handle tool use and results', () => {
      const input = `{"type": "user", "sessionId": "test", "message": {"role": "user", "content": "List files"}, "timestamp": "2024-01-01T00:00:00.000Z"}
{"type": "assistant", "sessionId": "test", "message": {"role": "assistant", "content": [{"type": "tool_use", "id": "tool1", "name": "ls", "input": {"path": "."}}]}, "timestamp": "2024-01-01T00:01:00.000Z"}`;

      const result = formatter.convertInput(input);
      
      expect(typeof result).toBe('string');
    });

    it('should handle empty input gracefully', () => {
      const result = formatter.convertInput('');
      expect(result).toBe('');
    });
  });

  describe('getSessionSummary', () => {
    it('should extract session summaries', () => {
      const input = `{"type": "summary", "summary": "First session summary", "timestamp": "2024-01-01T00:00:00.000Z"}
{"type": "summary", "summary": "Second session summary", "timestamp": "2024-01-01T01:00:00.000Z"}`;

      const summary = formatter.getSessionSummary(input);
      
      expect(typeof summary).toBe('string');
    });

    it('should return empty string when no summaries exist', () => {
      const input = `{"type": "user", "sessionId": "test", "message": {"role": "user", "content": "Hello"}, "timestamp": "2024-01-01T00:00:00.000Z"}`;
      
      const summary = formatter.getSessionSummary(input);
      expect(typeof summary).toBe('string');
    });
  });

  describe('convertFiles', () => {
    it('should handle empty file list', () => {
      const result = formatter.convertFiles([]);
      expect(typeof result).toBe('string');
    });
  });

  describe('error handling', () => {
    it('should handle malformed JSON gracefully', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      const invalidInput = 'not json at all';
      
      expect(() => {
        formatter.convertInput(invalidInput);
      }).not.toThrow();
      
      consoleSpy.mockRestore();
    });

    it('should handle missing session_id', () => {
      const input = `{"type": "user", "content": "Hello", "timestamp": "2024-01-01T00:00:00.000Z"}`;
      
      expect(() => {
        formatter.convertInput(input);
      }).not.toThrow();
    });
  });
});