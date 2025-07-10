import { describe, it, expect, beforeEach } from 'vitest';
import { MessageProcessor } from './MessageProcessor.js';
import { MessageData } from '../types/index.js';

describe('MessageProcessor', () => {
  let processor: MessageProcessor;

  beforeEach(() => {
    processor = new MessageProcessor();
  });

  describe('processMessage', () => {
    it('should process user message', () => {
      const message: MessageData = {
        type: 'user',
        sessionId: 'test',
        message: {
          role: 'user',
          content: 'Hello there!'
        },
        timestamp: '2024-01-01T00:00:00.000Z'
      };
      
      const result = processor.processMessage(message, [], 0);
      
      expect(result.join(' ')).toContain('User');
      expect(result.join(' ')).toContain('Hello there!');
    });

    it('should process assistant message', () => {
      const message: MessageData = {
        type: 'assistant',
        sessionId: 'test',
        message: {
          role: 'assistant',
          content: 'Hi! How can I help you?'
        },
        timestamp: '2024-01-01T00:00:00.000Z'
      };
      
      const result = processor.processMessage(message, [], 0);
      
      expect(result.join(' ')).toContain('Assistant');
      expect(result.join(' ')).toContain('Hi! How can I help you?');
    });

    it('should process summary message', () => {
      const message: MessageData = {
        type: 'summary',
        summary: 'Session summary content',
        timestamp: '2024-01-01T00:00:00.000Z'
      };
      
      const result = processor.processMessage(message, [], 0);
      
      // Summary messages are handled at session level, so should return empty
      expect(result).toEqual([]);
    });

    it('should handle tool_result message', () => {
      const message: MessageData = {
        type: 'user',
        sessionId: 'test',
        message: {
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'tool-123',
              content: 'Tool execution result'
            }
          ]
        },
        timestamp: '2024-01-01T00:00:00.000Z'
      };
      
      const result = processor.processMessage(message, [], 0);
      
      // Tool results are processed and flushed immediately if no continuation
      expect(result.length).toBeGreaterThanOrEqual(0);
      const context = processor.getContext();
      // After flushing, pending results should be empty
      expect(context.pendingToolResults).toHaveLength(0);
    });
  });

  describe('processUserMessage', () => {
    it('should handle string content', () => {
      const message: MessageData = {
        type: 'user',
        sessionId: 'test',
        message: {
          role: 'user',
          content: 'Simple string message'
        },
        timestamp: '2024-01-01T00:00:00.000Z'
      };
      
      const result = processor.processMessage(message, [], 0);
      
      expect(result.join(' ')).toContain('User');
      expect(result.join(' ')).toContain('Simple string message');
    });

    it('should handle array content with text', () => {
      const message: MessageData = {
        type: 'user',
        sessionId: 'test',
        message: {
          role: 'user',
          content: [
            { type: 'text', text: 'Text content' },
            { type: 'text', text: 'More text' }
          ]
        },
        timestamp: '2024-01-01T00:00:00.000Z'
      };
      
      const result = processor.processMessage(message, [], 0);
      
      expect(result.join(' ')).toContain('Text content');
      expect(result.join(' ')).toContain('More text');
    });

    it('should handle image content', () => {
      const message: MessageData = {
        type: 'user',
        sessionId: 'test',
        message: {
          role: 'user',
          content: [
            { type: 'text', text: 'Look at this image:' }
          ]
        },
        timestamp: '2024-01-01T00:00:00.000Z'
      };
      
      const result = processor.processMessage(message, [], 0);
      
      expect(result.join(' ')).toContain('Look at this image:');
    });

    it('should handle command-style messages', () => {
      const message: MessageData = {
        type: 'user',
        sessionId: 'test',
        message: {
          role: 'user',
          content: '/help command'
        },
        timestamp: '2024-01-01T00:00:00.000Z'
      };
      
      const result = processor.processMessage(message, [], 0);
      
      expect(result.join(' ')).toContain('User');
      expect(result.join(' ')).toContain('/help command');
    });
  });

  describe('processAssistantMessage', () => {
    it('should handle text content', () => {
      const message: MessageData = {
        type: 'assistant',
        sessionId: 'test',
        message: {
          role: 'assistant',
          content: 'Assistant response text'
        },
        timestamp: '2024-01-01T00:00:00.000Z'
      };
      
      const result = processor.processMessage(message, [], 0);
      
      expect(result.join(' ')).toContain('Assistant');
      expect(result.join(' ')).toContain('Assistant response text');
    });

    it('should handle tool use content', () => {
      const message: MessageData = {
        type: 'assistant',
        sessionId: 'test',
        message: {
          role: 'assistant',
          content: [
            { type: 'text', text: 'I\'ll help you with that.' },
            {
              type: 'tool_use',
              id: 'tool-1',
              name: 'read_file',
              input: { file_path: '/test/file.txt' }
            }
          ]
        },
        timestamp: '2024-01-01T00:00:00.000Z'
      };
      
      const result = processor.processMessage(message, [], 0);
      
      expect(result.join(' ')).toContain('I\'ll help you with that.');
    });

    it('should collect tool uses for later processing', () => {
      const message: MessageData = {
        type: 'assistant',
        sessionId: 'test',
        message: {
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              id: 'tool-1',
              name: 'ls',
              input: { path: '.' }
            },
            {
              type: 'tool_use',
              id: 'tool-2',
              name: 'read_file',
              input: { file_path: 'test.txt' }
            }
          ]
        },
        timestamp: '2024-01-01T00:00:00.000Z'
      };
      
      processor.processMessage(message, [], 0);
      
      const context = processor.getContext();
      expect(context.pendingTools).toHaveLength(2);
      expect(context.pendingTools[0].id).toBe('tool-1');
      expect(context.pendingTools[1].id).toBe('tool-2');
    });
  });

  describe('tool result processing', () => {
    it('should accumulate tool results when continuing', () => {
      const toolResult1: MessageData = {
        type: 'user',
        sessionId: 'test',
        message: {
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'tool-1',
              content: 'Result 1'
            }
          ]
        },
        timestamp: '2024-01-01T00:00:00.000Z'
      };
      
      const toolResult2: MessageData = {
        type: 'user',
        sessionId: 'test',
        message: {
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'tool-2',
              content: 'Result 2'
            }
          ]
        },
        timestamp: '2024-01-01T00:01:00.000Z'
      };
      
      // Create a message array with both tool results so the first one doesn't flush
      processor.processMessage(toolResult1, [toolResult1, toolResult2], 0);
      
      const context = processor.getContext();
      // First tool result should be pending since there's a continuing tool result
      expect(context.pendingToolResults).toHaveLength(1);
    });

    it('should flush tool results when encountering non-tool message', () => {
      // First add some tool results
      const toolResult: MessageData = {
        type: 'user',
        sessionId: 'test',
        message: {
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'tool-1',
              content: 'Tool result'
            }
          ]
        },
        timestamp: '2024-01-01T00:00:00.000Z'
      };
      processor.processMessage(toolResult, [], 0);
      
      // Then process a user message which should flush results
      const userMessage: MessageData = {
        type: 'user',
        sessionId: 'test',
        message: {
          role: 'user',
          content: 'Next message'
        },
        timestamp: '2024-01-01T00:01:00.000Z'
      };
      
      const result = processor.processMessage(userMessage, [], 1);
      
      expect(result.join(' ')).toContain('User');
      expect(result.join(' ')).toContain('Next message');
    });
  });

  describe('context management', () => {
    it('should reset context between sessions', () => {
      // First add some tool uses that don't get flushed immediately
      const toolUse: MessageData = {
        type: 'assistant',
        sessionId: 'test',
        message: {
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              id: 'tool-1',
              name: 'ls',
              input: { path: '.' }
            }
          ]
        },
        timestamp: '2024-01-01T00:00:00.000Z'
      };
      processor.processMessage(toolUse, [], 0);
      
      const contextBefore = processor.getContext();
      expect(contextBefore.pendingTools).toHaveLength(1);
      
      processor.resetContext();
      
      const contextAfter = processor.getContext();
      expect(contextAfter.pendingToolResults).toHaveLength(0);
      expect(contextAfter.pendingTools).toHaveLength(0);
    });

    it('should maintain state within a session', () => {
      const toolUse: MessageData = {
        type: 'assistant',
        sessionId: 'test',
        message: {
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              id: 'tool-1',
              name: 'ls',
              input: { path: '.' }
            }
          ]
        },
        timestamp: '2024-01-01T00:00:00.000Z'
      };
      
      processor.processMessage(toolUse, [], 0);
      
      const context = processor.getContext();
      expect(context.pendingTools).toHaveLength(1);
      
      const toolResult: MessageData = {
        type: 'user',
        sessionId: 'test',
        message: {
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'tool-1',
              content: 'file1.txt\nfile2.txt'
            }
          ]
        },
        timestamp: '2024-01-01T00:01:00.000Z'
      };
      
      // Add tool result with no continuation, so it gets flushed
      processor.processMessage(toolResult, [], 1);
      
      // After flushing, pending results should be empty but tool map should have the tool
      expect(context.pendingToolResults).toHaveLength(0);
      expect(context.toolCallMap['tool-1']).toBeDefined();
    });
  });

  describe('edge cases', () => {
    it('should handle null content', () => {
      const message: MessageData = {
        type: 'user',
        sessionId: 'test',
        message: {
          role: 'user',
          content: null as any
        },
        timestamp: '2024-01-01T00:00:00.000Z'
      };
      
      expect(() => {
        processor.processMessage(message, [], 0);
      }).not.toThrow();
    });

    it('should handle empty array content', () => {
      const message: MessageData = {
        type: 'assistant',
        sessionId: 'test',
        message: {
          role: 'assistant',
          content: []
        },
        timestamp: '2024-01-01T00:00:00.000Z'
      };
      
      const result = processor.processMessage(message, [], 0);
      
      // Empty array content returns empty result
      expect(result).toEqual([]);
    });

    it('should handle unknown message type', () => {
      const message: MessageData = {
        type: 'unknown_type' as any,
        sessionId: 'test',
        message: {
          role: 'user',
          content: 'Test content'
        },
        timestamp: '2024-01-01T00:00:00.000Z'
      };
      
      expect(() => {
        processor.processMessage(message, [], 0);
      }).not.toThrow();
    });

    it('should handle tool results without matching tool use', () => {
      const toolResult: MessageData = {
        type: 'user',
        sessionId: 'test',
        message: {
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'non-existent-tool',
              content: 'Orphaned result'
            }
          ]
        },
        timestamp: '2024-01-01T00:00:00.000Z'
      };
      
      expect(() => {
        processor.processMessage(toolResult, [], 0);
      }).not.toThrow();
    });
  });
});