import { describe, it, expect, beforeEach } from 'vitest';
import { ToolResultProcessor } from './ToolResultProcessor.js';
import { ProcessingContext } from '../types/index.js';

describe('ToolResultProcessor', () => {
  let processor: ToolResultProcessor;
  let context: ProcessingContext;

  beforeEach(() => {
    context = {
      pendingTools: [],
      pendingToolResults: [],
      toolCallMap: {
        'tool-1': {
          type: 'tool_use',
          id: 'tool-1',
          name: 'Read',
          input: { file_path: '/test/file.js' }
        },
        'tool-2': {
          type: 'tool_use',
          id: 'tool-2',
          name: 'Bash',
          input: { command: 'ls -la' }
        }
      }
    };
    processor = new ToolResultProcessor(context);
  });

  describe('formatToolResults', () => {
    it('should format simple tool results', () => {
      const toolResults = [
        {
          type: 'tool_result' as const,
          tool_use_id: 'tool-1',
          content: 'Simple result content',
          is_error: false
        }
      ];

      const result = processor.formatToolResults(toolResults);

      expect(result.join(' ')).toContain('<details>');
      expect(result.join(' ')).toContain('<summary>');
      expect(result.join(' ')).toContain('Simple result content');
      expect(result.join(' ')).toContain('</details>');
    });

    it('should handle error results', () => {
      const toolResults = [
        {
          type: 'tool_result' as const,
          tool_use_id: 'tool-1',
          content: 'Error message',
          is_error: true
        }
      ];

      const result = processor.formatToolResults(toolResults);

      expect(result.join(' ')).toContain('Error message');
      expect(result.join(' ')).toContain('<details>');
    });

    it('should handle file read results', () => {
      const toolResults = [
        {
          type: 'tool_result' as const,
          tool_use_id: 'tool-1',
          content: '     1→function hello() {\n     2→  console.log("Hello world!");\n     3→}',
          is_error: false
        }
      ];

      const result = processor.formatToolResults(toolResults);

      expect(result.join(' ')).toContain('```javascript');
      expect(result.join(' ')).toContain('function hello()');
      expect(result.join(' ')).toContain('console.log("Hello world!")');
    });

    it('should handle bash command results', () => {
      const toolResults = [
        {
          type: 'tool_result' as const,
          tool_use_id: 'tool-2',
          content: 'file1.txt\nfile2.txt\nfolder1/',
          is_error: false
        }
      ];

      const result = processor.formatToolResults(toolResults);

      expect(result.join(' ')).toContain('<b>Bash:</b>');
      expect(result.join(' ')).toContain('ls -la');
      expect(result.join(' ')).toContain('file1.txt');
    });

    it('should handle multiple tool results', () => {
      const toolResults = [
        {
          type: 'tool_result' as const,
          tool_use_id: 'tool-1',
          content: 'Result 1'
        },
        {
          type: 'tool_result' as const,
          tool_use_id: 'tool-2',
          content: 'Result 2'
        }
      ];

      const result = processor.formatToolResults(toolResults);

      expect(result.join(' ')).toContain('Result 1');
      expect(result.join(' ')).toContain('Result 2');
      expect(result.join(' ')).toContain('<details>');
    });

    it('should truncate long results when enabled', () => {
      const longContent = Array(60).fill('line content').join('\n');
      const toolResults = [
        {
          type: 'tool_result' as const,
          tool_use_id: 'tool-ls',
          content: longContent
        }
      ];

      // Add LS tool to context
      context.toolCallMap['tool-ls'] = {
        type: 'tool_use',
        id: 'tool-ls',
        name: 'LS',
        input: { path: '.' }
      };

      const result = processor.formatToolResults(toolResults);

      expect(result.join(' ')).toContain('more lines');
    });
  });

  describe('formatStructuredPatch', () => {
    it('should format file patches correctly', () => {
      context.currentToolUseResult = {
        filePath: '/test/file.js',
        structuredPatch: [
          {
            oldStart: 1,
            oldLines: 1,
            newStart: 1,
            newLines: 1,
            lines: ['- old code', '+ new code']
          }
        ]
      };

      const result = (processor as any).formatStructuredPatch();

      expect(result.join(' ')).toContain('file.js');
      expect(result.join(' ')).toContain('- old code');
      expect(result.join(' ')).toContain('+ new code');
    });

    it('should handle patches with line context', () => {
      context.currentToolUseResult = {
        filePath: '/test/script.py',
        structuredPatch: [
          {
            oldStart: 5,
            oldLines: 3,
            newStart: 5,
            newLines: 3,
            lines: ['  unchanged line', '- function old()', '+ function new()']
          }
        ]
      };

      const result = (processor as any).formatStructuredPatch();

      expect(result.join(' ')).toContain('```diff');
      expect(result.join(' ')).toContain('- function old()');
      expect(result.join(' ')).toContain('+ function new()');
    });
  });

  describe('createToolResultSummary', () => {
    it('should create summary for single tool', () => {
      const summary = (processor as any).createToolResultSummary('file content', 'tool-1');

      expect(summary).toContain('<b>Read:</b>');
      expect(summary).toContain('file.js');
    });

    it('should create summary for multiple tools', () => {
      const summary = (processor as any).createToolResultSummary('command output', 'tool-2');

      expect(summary).toContain('<b>Bash:</b>');
      expect(summary).toContain('ls -la');
    });

    it('should handle bash commands in summary', () => {
      context.toolCallMap['bash-tool'] = {
        type: 'tool_use',
        id: 'bash-tool',
        name: 'Bash',
        input: { command: 'npm install' }
      };

      const summary = (processor as any).createToolResultSummary('Installation complete', 'bash-tool');

      expect(summary).toContain('<b>Bash:</b>');
      expect(summary).toContain('npm install');
    });

    it('should handle file operations in summary', () => {
      context.toolCallMap['edit-tool'] = {
        type: 'tool_use',
        id: 'edit-tool',
        name: 'Edit',
        input: { file_path: '/src/app.js' }
      };

      const summary = (processor as any).createToolResultSummary('File updated', 'edit-tool');

      expect(summary).toContain('<b>Edit:</b>');
      expect(summary).toContain('app.js');
    });
  });

  describe('formatFileContent', () => {
    it('should apply syntax highlighting for known extensions', () => {
      const content = '     1→function test() { return true; }';
      const result = (processor as any).formatFileContent(content, context.toolCallMap['tool-1']);

      expect(result.join(' ')).toContain('```javascript');
      expect(result.join(' ')).toContain('function test()');
    });

    it('should use plain text for unknown extensions', () => {
      context.toolCallMap['tool-1'].input!.file_path = '/test/file.unknown';
      const content = '     1→some content';
      const result = (processor as any).formatFileContent(content, context.toolCallMap['tool-1']);

      expect(result[0]).toBe('```');
      expect(result.join(' ')).toContain('some content');
    });

    it('should handle empty content', () => {
      const content = '';
      const result = (processor as any).formatFileContent(content, context.toolCallMap['tool-1']);

      expect(result).toEqual(['```javascript', '', '```']);
    });

    it('should respect syntax highlighting setting', () => {
      const content = '     1→console.log("test");';
      const result = (processor as any).formatFileContent(content, context.toolCallMap['tool-1']);

      expect(result[0]).toContain('```');
    });
  });

  describe('formatTodoWrite', () => {
    it('should format todo write results', () => {
      const toolCall = {
        type: 'tool_use' as const,
        id: 'todo-1',
        name: 'TodoWrite',
        input: {
          todos: [
            { content: 'Task 1', status: 'pending', priority: 'high', id: '1' },
            { content: 'Task 2', status: 'completed', priority: 'medium', id: '2' }
          ]
        }
      };

      const result = (processor as any).formatTodoWrite(toolCall);

      expect(result.join(' ')).toContain('**Updated task list**');
      expect(result.join(' ')).toContain('Task 1');
      expect(result.join(' ')).toContain('Task 2');
    });

    it('should handle empty todo list', () => {
      const toolCall = {
        type: 'tool_use' as const,
        id: 'todo-1',
        name: 'TodoWrite',
        input: { todos: [] }
      };

      const result = (processor as any).formatTodoWrite(toolCall);

      expect(result.join(' ')).toContain('**Updated task list**');
    });
  });

  describe('edge cases', () => {
    it('should handle tool results without tool_name', () => {
      const toolResults = [
        {
          type: 'tool_result' as const,
          tool_use_id: 'unknown-tool',
          content: 'Some content'
        }
      ];

      expect(() => {
        processor.formatToolResults(toolResults);
      }).not.toThrow();
    });

    it('should handle tool results with null content', () => {
      const toolResults = [
        {
          type: 'tool_result' as const,
          tool_use_id: 'tool-1',
          content: null as any
        }
      ];

      expect(() => {
        processor.formatToolResults(toolResults);
      }).not.toThrow();
    });

    it('should handle empty tool results array', () => {
      const result = processor.formatToolResults([]);
      expect(result).toEqual([]);
    });

    it('should handle malformed input objects', () => {
      const toolResults = [
        {
          type: 'tool_result' as const,
          tool_use_id: 'tool-1',
          content: 'content'
        } as any
      ];

      expect(() => {
        processor.formatToolResults(toolResults);
      }).not.toThrow();
    });
  });

  describe('path relativization', () => {
    it('should relativize paths when enabled', () => {
      const fullPath = process.cwd() + '/src/test.js';
      context.toolCallMap['tool-path'] = {
        type: 'tool_use',
        id: 'tool-path',
        name: 'Read',
        input: { file_path: fullPath }
      };

      const toolResults = [
        {
          type: 'tool_result' as const,
          tool_use_id: 'tool-path',
          content: 'file content'
        }
      ];

      const result = processor.formatToolResults(toolResults);

      expect(result.join(' ')).toContain('src/test.js');
      expect(result.join(' ')).not.toContain(process.cwd());
    });

    it('should handle relative paths correctly', () => {
      context.toolCallMap['tool-rel'] = {
        type: 'tool_use',
        id: 'tool-rel',
        name: 'Read',
        input: { file_path: './relative/path.js' }
      };

      const toolResults = [
        {
          type: 'tool_result' as const,
          tool_use_id: 'tool-rel',
          content: 'file content'
        }
      ];

      const result = processor.formatToolResults(toolResults);

      expect(result.join(' ')).toContain('relative/path.js');
    });
  });
});