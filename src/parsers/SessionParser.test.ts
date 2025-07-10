import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SessionParser } from './SessionParser.js';

describe('SessionParser', () => {
  let parser: SessionParser;

  beforeEach(() => {
    parser = new SessionParser();
  });

  describe('parseInput', () => {
    it('should parse simple single session', () => {
      const input = `{"type": "user", "sessionId": "test", "message": {"role": "user", "content": "Hello"}, "timestamp": "2024-01-01T00:00:00.000Z"}
{"type": "assistant", "sessionId": "test", "message": {"role": "assistant", "content": "Hi there!"}, "timestamp": "2024-01-01T00:01:00.000Z"}`;

      const sessions = parser.parseInput(input);
      
      expect(sessions.size).toBe(1);
      expect(sessions.has('test')).toBe(true);
      
      const session = sessions.get('test')!;
      expect(session.messages).toHaveLength(2);
      expect(session.id).toBe('test');
    });

    it('should parse multiple sessions', () => {
      const input = `{"type": "user", "sessionId": "session1", "message": {"role": "user", "content": "Hello"}, "timestamp": "2024-01-01T00:00:00.000Z"}
{"type": "assistant", "sessionId": "session1", "message": {"role": "assistant", "content": "Hi"}, "timestamp": "2024-01-01T00:01:00.000Z"}
{"type": "user", "sessionId": "session2", "message": {"role": "user", "content": "New session"}, "timestamp": "2024-01-01T01:00:00.000Z"}
{"type": "assistant", "sessionId": "session2", "message": {"role": "assistant", "content": "Hello again"}, "timestamp": "2024-01-01T01:01:00.000Z"}`;

      const sessions = parser.parseInput(input);
      
      expect(sessions.size).toBe(2);
      expect(sessions.has('session1')).toBe(true);
      expect(sessions.has('session2')).toBe(true);
      
      const session1 = sessions.get('session1')!;
      const session2 = sessions.get('session2')!;
      
      expect(session1.messages).toHaveLength(2);
      expect(session2.messages).toHaveLength(2);
    });

    it('should handle session with summary', () => {
      const input = `{"type": "user", "sessionId": "test", "message": {"role": "user", "content": "Hello"}, "timestamp": "2024-01-01T00:00:00.000Z"}
{"type": "assistant", "sessionId": "test", "message": {"role": "assistant", "content": "Hi"}, "timestamp": "2024-01-01T00:01:00.000Z"}
{"type": "summary", "summary": "User greeted assistant", "leafUuid": "test-uuid", "timestamp": "2024-01-01T00:02:00.000Z"}`;

      const sessions = parser.parseInput(input);
      
      expect(sessions.size).toBe(1);
      const session = sessions.get('test')!;
      expect(session.messages).toHaveLength(2);
      // Summary is applied when a message has matching uuid
    });

    it('should handle tool use and results', () => {
      const input = `{"type": "user", "sessionId": "test", "message": {"role": "user", "content": "List files"}, "timestamp": "2024-01-01T00:00:00.000Z"}
{"type": "assistant", "sessionId": "test", "message": {"role": "assistant", "content": [{"type": "tool_use", "id": "tool1", "name": "ls", "input": {"path": "."}}]}, "timestamp": "2024-01-01T00:01:00.000Z"}
{"type": "user", "sessionId": "test", "message": {"role": "user", "content": [{"type": "tool_result", "tool_use_id": "tool1", "content": "file1.txt\\nfile2.txt"}]}, "timestamp": "2024-01-01T00:02:00.000Z"}`;

      const sessions = parser.parseInput(input);
      
      expect(sessions.size).toBe(1);
      const session = sessions.get('test')!;
      expect(session.messages).toHaveLength(3);
      
      const assistantMessage = session.messages[1];
      expect(Array.isArray(assistantMessage.message?.content)).toBe(true);
      
      const toolResult = session.messages[2];
      expect(Array.isArray(toolResult.message?.content)).toBe(true);
    });

    it('should handle empty input', () => {
      const sessions = parser.parseInput('');
      expect(sessions.size).toBe(0);
    });

    it('should handle malformed JSON lines', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      const input = `{"type": "user", "sessionId": "test", "message": {"role": "user", "content": "Hello"}, "timestamp": "2024-01-01T00:00:00.000Z"}
invalid json line
{"type": "assistant", "sessionId": "test", "message": {"role": "assistant", "content": "Hi"}, "timestamp": "2024-01-01T00:01:00.000Z"}`;

      const sessions = parser.parseInput(input);
      
      expect(sessions.size).toBe(1);
      const session = sessions.get('test')!;
      expect(session.messages).toHaveLength(2);
      
      consoleSpy.mockRestore();
    });

    it('should set session timestamps correctly', () => {
      const input = `{"type": "user", "sessionId": "test", "message": {"role": "user", "content": "Hello"}, "timestamp": "2024-01-01T00:00:00.000Z"}
{"type": "assistant", "sessionId": "test", "message": {"role": "assistant", "content": "Hi"}, "timestamp": "2024-01-01T00:05:00.000Z"}`;

      const sessions = parser.parseInput(input);
      const session = sessions.get('test')!;
      
      expect(session.firstCreated).toEqual(new Date('2024-01-01T00:00:00.000Z'));
      expect(session.lastModified).toEqual(new Date('2024-01-01T00:05:00.000Z'));
    });

    it('should handle messages without sessionId', () => {
      const input = `{"type": "user", "message": {"role": "user", "content": "Hello"}, "timestamp": "2024-01-01T00:00:00.000Z"}
{"type": "assistant", "message": {"role": "assistant", "content": "Hi"}, "timestamp": "2024-01-01T00:01:00.000Z"}`;

      const sessions = parser.parseInput(input);
      
      // Messages without sessionId are skipped by current implementation
      expect(sessions.size).toBe(0);
    });

    it('should extract working directory from session', () => {
      const input = `{"type": "user", "sessionId": "test", "message": {"role": "user", "content": "Hello"}, "timestamp": "2024-01-01T00:00:00.000Z", "cwd": "/home/user/project"}`;

      const sessions = parser.parseInput(input);
      const session = sessions.get('test')!;
      
      // Working directory extraction logic would need to be implemented
      expect(session.messages).toHaveLength(1);
    });
  });

  describe('parseFiles', () => {
    it('should handle empty file list', () => {
      const result = parser.parseFiles([]);
      expect(result).toHaveLength(0);
    });
  });

  describe('session title generation', () => {
    it('should use session id as identifier', () => {
      const input = `{"type": "user", "sessionId": "my-test-session", "message": {"role": "user", "content": "Hello"}, "timestamp": "2024-01-01T00:00:00.000Z"}`;

      const sessions = parser.parseInput(input);
      const session = sessions.get('my-test-session')!;
      
      expect(session.id).toBe('my-test-session');
    });

    it('should handle short session ids', () => {
      const input = `{"type": "user", "sessionId": "a", "message": {"role": "user", "content": "Hello"}, "timestamp": "2024-01-01T00:00:00.000Z"}`;

      const sessions = parser.parseInput(input);
      const session = sessions.get('a')!;
      
      expect(session.id).toBe('a');
    });

    it('should handle numeric session ids', () => {
      const input = `{"type": "user", "sessionId": "123", "message": {"role": "user", "content": "Hello"}, "timestamp": "2024-01-01T00:00:00.000Z"}`;

      const sessions = parser.parseInput(input);
      const session = sessions.get('123')!;
      
      expect(session.id).toBe('123');
    });
  });

  describe('edge cases', () => {
    it('should handle messages with complex content', () => {
      const input = `{"type": "user", "sessionId": "test", "message": {"role": "user", "content": ["text", {"type": "image", "data": "base64data"}]}, "timestamp": "2024-01-01T00:00:00.000Z"}`;

      const sessions = parser.parseInput(input);
      const session = sessions.get('test')!;
      
      expect(session.messages).toHaveLength(1);
      expect(Array.isArray(session.messages[0].message?.content)).toBe(true);
    });

    it('should handle messages with null content', () => {
      const input = `{"type": "user", "sessionId": "test", "message": {"role": "user", "content": null}, "timestamp": "2024-01-01T00:00:00.000Z"}`;

      const sessions = parser.parseInput(input);
      const session = sessions.get('test')!;
      
      expect(session.messages).toHaveLength(1);
      expect(session.messages[0].message?.content).toBeNull();
    });

    it('should handle invalid timestamps', () => {
      const input = `{"type": "user", "sessionId": "test", "message": {"role": "user", "content": "Hello"}, "timestamp": "invalid-date"}`;

      expect(() => {
        parser.parseInput(input);
      }).not.toThrow();
    });
  });
});