import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MarkdownFormatter } from './formatters/MarkdownFormatter.js';
import { SessionParser } from './parsers/SessionParser.js';
import * as fs from 'fs';

// Mock fs for unit tests
vi.mock('fs');

describe('CLI Integration', () => {
  const mockedFs = vi.mocked(fs);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('convert command functionality', () => {
    it('should process valid JSONL input from file', () => {
      const mockInput = `{"type": "user", "sessionId": "test", "message": {"role": "user", "content": "Hello"}, "timestamp": "2024-01-01T00:00:00.000Z"}
{"type": "assistant", "sessionId": "test", "message": {"role": "assistant", "content": "Hi there!"}, "timestamp": "2024-01-01T00:01:00.000Z"}`;

      const formatter = new MarkdownFormatter();
      const result = formatter.convertInput(mockInput);

      expect(result).toContain('User');
      expect(result).toContain('Hello');
      expect(result).toContain('Assistant');
      expect(result).toContain('Hi there!');
    });

    it('should handle file read errors gracefully', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      const formatter = new MarkdownFormatter();
      
      expect(() => {
        formatter.convertInput('invalid json');
      }).not.toThrow();
      
      consoleSpy.mockRestore();
    });
  });

  describe('validation command functionality', () => {
    it('should validate correct JSONL format', () => {
      const validInput = `{"type": "user", "sessionId": "test", "message": {"role": "user", "content": "Hello"}, "timestamp": "2024-01-01T00:00:00.000Z"}`;
      
      const formatter = new MarkdownFormatter();
      const validation = formatter.validateInput(validInput);

      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it('should detect invalid JSONL format', () => {
      const invalidInput = `{"type": "user", "content": "Hello"
invalid json line`;
      
      const formatter = new MarkdownFormatter();
      const validation = formatter.validateInput(invalidInput);

      expect(validation.valid).toBe(false);
      expect(validation.errors.length).toBeGreaterThan(0);
    });
  });

  describe('stats command functionality', () => {
    it('should calculate statistics for valid input', () => {
      const input = `{"type": "user", "sessionId": "test1", "message": {"role": "user", "content": "Hello"}, "timestamp": "2024-01-01T00:00:00.000Z"}
{"type": "assistant", "sessionId": "test1", "message": {"role": "assistant", "content": "Hi"}, "timestamp": "2024-01-01T00:01:00.000Z"}
{"type": "summary", "summary": "Brief chat", "timestamp": "2024-01-01T00:02:00.000Z"}`;

      const formatter = new MarkdownFormatter();
      const stats = formatter.getInputStats(input);

      expect(stats.totalLines).toBe(3);
      expect(stats.totalMessages).toBe(3);
      expect(stats.messagesByType.user).toBe(1);
      expect(stats.messagesByType.assistant).toBe(1);
      expect(stats.messagesByType.summary).toBe(1);
    });
  });

  describe('error handling', () => {
    it('should handle malformed JSON gracefully', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      const formatter = new MarkdownFormatter();
      
      expect(() => {
        formatter.convertInput('not json at all');
      }).not.toThrow();
      
      consoleSpy.mockRestore();
    });

    it('should handle empty input', () => {
      const formatter = new MarkdownFormatter();
      
      const result = formatter.convertInput('');
      expect(result).toBe('');
    });

    it('should handle missing sessionId gracefully', () => {
      const formatter = new MarkdownFormatter();
      const input = `{"type": "user", "message": {"role": "user", "content": "Hello"}, "timestamp": "2024-01-01T00:00:00.000Z"}`;
      
      expect(() => {
        formatter.convertInput(input);
      }).not.toThrow();
    });
  });

  describe('session parsing integration', () => {
    it('should parse multiple sessions correctly', () => {
      const parser = new SessionParser();
      const input = `{"type": "user", "sessionId": "session1", "message": {"role": "user", "content": "Hello"}, "timestamp": "2024-01-01T00:00:00.000Z"}
{"type": "assistant", "sessionId": "session1", "message": {"role": "assistant", "content": "Hi"}, "timestamp": "2024-01-01T00:01:00.000Z"}
{"type": "user", "sessionId": "session2", "message": {"role": "user", "content": "New session"}, "timestamp": "2024-01-01T01:00:00.000Z"}`;

      const sessions = parser.parseInput(input);
      
      expect(sessions.size).toBe(2);
      expect(sessions.has('session1')).toBe(true);
      expect(sessions.has('session2')).toBe(true);
    });

    it('should handle session with summaries', () => {
      const parser = new SessionParser();
      const input = `{"type": "user", "sessionId": "test", "message": {"role": "user", "content": "Hello"}, "timestamp": "2024-01-01T00:00:00.000Z", "uuid": "test-uuid"}
{"type": "summary", "summary": "User greeted", "leafUuid": "test-uuid", "timestamp": "2024-01-01T00:02:00.000Z"}`;

      const sessions = parser.parseInput(input);
      
      expect(sessions.size).toBe(1);
      const session = sessions.get('test')!;
      expect(session.summary).toBe('User greeted');
    });
  });

  describe('end-to-end conversion', () => {
    it('should convert complete session with tool use', () => {
      const formatter = new MarkdownFormatter();
      const input = `{"type": "user", "sessionId": "test", "message": {"role": "user", "content": "List files"}, "timestamp": "2024-01-01T00:00:00.000Z"}
{"type": "assistant", "sessionId": "test", "message": {"role": "assistant", "content": [{"type": "text", "text": "I'll list the files for you."}, {"type": "tool_use", "id": "tool-1", "name": "ls", "input": {"path": "."}}]}, "timestamp": "2024-01-01T00:01:00.000Z"}
{"type": "user", "sessionId": "test", "message": {"role": "user", "content": [{"type": "tool_result", "tool_use_id": "tool-1", "content": "file1.txt\\nfile2.txt"}]}, "timestamp": "2024-01-01T00:02:00.000Z"}`;

      const result = formatter.convertInput(input);
      
      expect(result).toContain('User');
      expect(result).toContain('List files');
      expect(result).toContain('Assistant');
      expect(result).toContain("I'll list the files for you.");
    });

    it('should handle real-world session data structure', () => {
      const formatter = new MarkdownFormatter();
      const realWorldInput = `{"type": "user", "sessionId": "real-session", "message": {"role": "user", "content": "Can you help me debug this code?"}, "timestamp": "2024-01-01T10:00:00.000Z"}
{"type": "assistant", "sessionId": "real-session", "message": {"role": "assistant", "content": "I'd be happy to help you debug your code. Could you please share the code you're having trouble with?"}, "timestamp": "2024-01-01T10:00:30.000Z"}`;

      const result = formatter.convertInput(realWorldInput);
      
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
      expect(result).toContain('debug');
    });
  });
});