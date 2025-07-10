import { describe, it, expect } from 'vitest';
import { MessageWrapper } from './MessageWrapper.js';
import { MessageData, ContentItem } from '../types/index.js';

describe('MessageWrapper', () => {
  describe('constructor and basic properties', () => {
    it('should wrap a basic message', () => {
      const message: MessageData = {
        type: 'user',
        message: {
          role: 'user',
          content: 'Hello world'
        },
        timestamp: '2024-01-01T00:00:00.000Z',
        sessionId: 'test-session'
      };

      const wrapper = new MessageWrapper(message);

      expect(wrapper.type).toBe('user');
      expect(wrapper.content).toBe('Hello world');
    });

    it('should handle message without content', () => {
      const message: MessageData = {
        type: 'user'
      };

      const wrapper = new MessageWrapper(message);

      expect(wrapper.type).toBe('user');
      expect(wrapper.content).toBe('');
    });

    it('should handle isMeta flag', () => {
      const message: MessageData = {
        type: 'user',
        isMeta: true,
        message: {
          role: 'user',
          content: 'Meta message content'
        }
      };

      const wrapper = new MessageWrapper(message);

      expect(wrapper.isMeta).toBe(true);
    });
  });

  describe('content type detection', () => {
    it('should detect string content', () => {
      const message: MessageData = {
        type: 'user',
        message: {
          role: 'user',
          content: 'Simple string content'
        }
      };
      const wrapper = new MessageWrapper(message);

      expect(wrapper.isContentArray()).toBe(false);
    });

    it('should detect array content', () => {
      const message: MessageData = {
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [
            { type: 'text', text: 'Hello' },
            { type: 'text', text: 'World' }
          ]
        }
      };
      const wrapper = new MessageWrapper(message);

      expect(wrapper.isContentArray()).toBe(true);
    });
  });

  describe('content extraction', () => {
    it('should extract string content directly', () => {
      const message: MessageData = {
        type: 'user',
        message: {
          role: 'user',
          content: 'Direct string content'
        }
      };
      const wrapper = new MessageWrapper(message);

      expect(wrapper.getTextContent()).toBe('Direct string content');
    });

    it('should extract text from array content', () => {
      const message: MessageData = {
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [
            { type: 'text', text: 'First part' },
            { type: 'text', text: 'Second part' }
          ]
        }
      };
      const wrapper = new MessageWrapper(message);

      expect(wrapper.getTextContent()).toBe('First part\nSecond part');
    });

    it('should handle mixed content types in array', () => {
      const content: ContentItem[] = [
        { type: 'text', text: 'Text content' },
        { type: 'tool_use', id: 'tool-1', name: 'test_tool', input: {} },
        { type: 'text', text: 'More text' }
      ];

      const message: MessageData = {
        type: 'assistant',
        message: {
          role: 'assistant',
          content
        }
      };
      const wrapper = new MessageWrapper(message);

      expect(wrapper.getTextContent()).toBe('Text content\nMore text');
    });

    it('should return empty string for non-text content', () => {
      const message: MessageData = {
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [
            { type: 'tool_use', id: 'tool-1', name: 'test_tool', input: {} }
          ]
        }
      };
      const wrapper = new MessageWrapper(message);

      expect(wrapper.getTextContent()).toBe('');
    });
  });

  describe('tool use detection', () => {
    it('should detect tool uses in array content', () => {
      const content: ContentItem[] = [
        { type: 'text', text: 'I will help you' },
        {
          type: 'tool_use',
          id: 'tool-1',
          name: 'read_file',
          input: { file_path: '/test/file.txt' }
        }
      ];

      const message: MessageData = {
        type: 'assistant',
        message: {
          role: 'assistant',
          content
        }
      };
      const wrapper = new MessageWrapper(message);

      const toolUses = wrapper.getToolUses();
      expect(toolUses).toHaveLength(1);
      expect(toolUses[0].id).toBe('tool-1');
      expect(toolUses[0].name).toBe('read_file');
    });

    it('should handle multiple tool uses', () => {
      const content: ContentItem[] = [
        { type: 'tool_use', id: 'tool-1', name: 'ls', input: {} },
        { type: 'tool_use', id: 'tool-2', name: 'read_file', input: {} },
        { type: 'tool_use', id: 'tool-3', name: 'write_file', input: {} }
      ];

      const message: MessageData = {
        type: 'assistant',
        message: {
          role: 'assistant',
          content
        }
      };
      const wrapper = new MessageWrapper(message);

      expect(wrapper.getToolUses()).toHaveLength(3);
    });

    it('should return empty array when no tool uses', () => {
      const message: MessageData = {
        type: 'user',
        message: {
          role: 'user',
          content: 'Just text content'
        }
      };
      const wrapper = new MessageWrapper(message);

      expect(wrapper.getToolUses()).toHaveLength(0);
    });
  });

  describe('tool result detection', () => {
    it('should detect tool results in array content', () => {
      const content: ContentItem[] = [
        { type: 'text', text: 'Look at this result:' },
        {
          type: 'tool_result',
          tool_use_id: 'tool-123',
          content: 'Tool execution result'
        }
      ];

      const message: MessageData = {
        type: 'user',
        message: {
          role: 'user',
          content
        }
      };
      const wrapper = new MessageWrapper(message);

      const toolResults = wrapper.getToolResults();
      expect(toolResults).toHaveLength(1);
      expect(toolResults[0].tool_use_id).toBe('tool-123');
      expect(toolResults[0].content).toBe('Tool execution result');
    });

    it('should return empty array when no tool results', () => {
      const message: MessageData = {
        type: 'user',
        message: {
          role: 'user',
          content: 'Just text content'
        }
      };
      const wrapper = new MessageWrapper(message);

      expect(wrapper.getToolResults()).toHaveLength(0);
    });
  });

  describe('caveat message detection', () => {
    it('should detect caveat messages', () => {
      const message: MessageData = {
        type: 'user',
        isMeta: true,
        message: {
          role: 'user',
          content: 'Caveat: This is a warning message'
        }
      };
      const wrapper = new MessageWrapper(message);

      expect(wrapper.isCaveatMessage()).toBe(true);
    });

    it('should not detect non-caveat meta messages', () => {
      const message: MessageData = {
        type: 'user',
        isMeta: true,
        message: {
          role: 'user',
          content: 'Regular meta message'
        }
      };
      const wrapper = new MessageWrapper(message);

      expect(wrapper.isCaveatMessage()).toBe(false);
    });

    it('should not detect caveat in non-meta messages', () => {
      const message: MessageData = {
        type: 'user',
        isMeta: false,
        message: {
          role: 'user',
          content: 'Caveat: This should not be detected'
        }
      };
      const wrapper = new MessageWrapper(message);

      expect(wrapper.isCaveatMessage()).toBe(false);
    });
  });

  describe('regular content extraction', () => {
    it('should get regular content excluding tool results', () => {
      const content: ContentItem[] = [
        { type: 'text', text: 'Text content' },
        { type: 'tool_result', tool_use_id: 'tool-1', content: 'Result' },
        { type: 'tool_use', id: 'tool-2', name: 'test', input: {} }
      ];

      const message: MessageData = {
        type: 'user',
        message: {
          role: 'user',
          content
        }
      };
      const wrapper = new MessageWrapper(message);

      const regularContent = wrapper.getRegularContent();
      expect(regularContent).toHaveLength(2);
      expect(regularContent[0].type).toBe('text');
      expect(regularContent[1].type).toBe('tool_use');
    });
  });

  describe('edge cases', () => {
    it('should handle empty message object', () => {
      const message = {} as MessageData;
      const wrapper = new MessageWrapper(message);

      expect(wrapper.type).toBeUndefined();
      expect(wrapper.content).toBe('');
      expect(wrapper.isMeta).toBe(false);
    });

    it('should handle message without message property', () => {
      const message: MessageData = {
        type: 'user'
      };
      const wrapper = new MessageWrapper(message);

      expect(wrapper.content).toBe('');
    });

    it('should handle null/undefined content gracefully', () => {
      const message: MessageData = {
        type: 'user',
        message: {
          role: 'user',
          content: null as any
        }
      };
      const wrapper = new MessageWrapper(message);

      expect(wrapper.content).toBe('');
    });
  });
});