import { ContentItem, ToolCallMap, ToolUseResult, ProcessingContext } from '../types/index.js';
import { MessageWrapper } from '../parsers/MessageWrapper.js';
import { detectLanguageFromPath, detectCodeLanguage } from '../utils/language.js';
import { makeRelativePath } from '../utils/paths.js';
import Debug from 'debug';

const debug = Debug('session-to-md:tool-processor');

export class ToolResultProcessor {
  private context: ProcessingContext;

  constructor(context: ProcessingContext) {
    this.context = context;
  }

  /**
   * Format tool results and return markdown output
   */
  public formatToolResults(toolResults: ContentItem[]): string[] {
    debug(`Formatting ${toolResults.length} tool results`);
    const result: string[] = [];
    
    toolResults.forEach(toolResult => {
      debug(`Processing tool result for ID: ${toolResult.tool_use_id}`);
      result.push(...this.formatToolResult(toolResult));
    });

    debug(`Generated ${result.length} lines of formatted output`);
    return result;
  }

  /**
   * Format a single tool result
   */
  private formatToolResult(toolResult: ContentItem): string[] {
    let content: string;
    if (Array.isArray(toolResult.content)) {
      // Extract text from array of content items
      content = toolResult.content
        .filter(item => item.type === 'text')
        .map(item => item.text || '')
        .join('\n');
    } else {
      content = toolResult.content as string || '';
    }
    
    const toolUseId = toolResult.tool_use_id;
    const toolCall = toolUseId ? this.context.toolCallMap[toolUseId] : undefined;

    // Check for structured patch
    if (this.context.currentToolUseResult?.structuredPatch) {
      return this.formatStructuredPatch();
    }

    // Special handling for TodoWrite
    if (toolCall?.name === 'TodoWrite') {
      return this.formatTodoWrite(toolCall);
    }

    // Regular tool result
    return this.formatRegularToolResult(content, toolUseId);
  }

  /**
   * Format structured patch
   */
  private formatStructuredPatch(): string[] {
    const filePath = this.context.currentToolUseResult?.filePath;
    const structuredPatch = this.context.currentToolUseResult?.structuredPatch;
    
    if (!filePath || !structuredPatch) {
      return [];
    }

    const relativePath = makeRelativePath(filePath, this.context.currentCwd);
    const result = [
      `**Edit:** \`${relativePath}\``,
      '',
      '```diff'
    ];

    structuredPatch.forEach(hunk => {
      hunk.lines.forEach(line => {
        result.push(line);
      });
    });

    result.push('```', '');
    return result;
  }

  /**
   * Format TodoWrite tool result
   */
  private formatTodoWrite(toolCall: ContentItem): string[] {
    const result = [
      '**Updated task list**',
      '',
      ...this.formatTodoList(toolCall.input),
      ''
    ];

    return result;
  }

  /**
   * Format regular tool result
   */
  private formatRegularToolResult(content: string, toolUseId?: string): string[] {
    const toolSummary = this.createToolResultSummary(content, toolUseId);
    
    const result = [
      `<details><summary>${toolSummary}</summary>`,
      ''
    ];

    result.push(...this.formatToolContent(content, toolUseId));
    result.push('</details>', '');

    return result;
  }

  /**
   * Format tool content based on type
   */
  private formatToolContent(content: string, toolUseId?: string): string[] {
    const toolCall = toolUseId ? this.context.toolCallMap[toolUseId] : undefined;
    
    if (Array.isArray(content)) {
      return this.formatArrayContent(content);
    }

    if (this.shouldTruncateLS(toolCall)) {
      return this.formatTruncatedContent(content);
    }

    if (this.hasLineNumbers(content)) {
      return this.formatFileContent(content, toolCall);
    }

    if (this.isCodeContent(content)) {
      return this.formatCodeContent(content);
    }

    return this.formatPlainContent(content);
  }

  /**
   * Check if LS output should be truncated
   */
  private shouldTruncateLS(toolCall?: ContentItem): boolean {
    if (!toolCall) return false;
    
    return toolCall.name === 'LS' || 
           (toolCall.name === 'Bash' && 
            toolCall.input?.command?.match(/^(ls|LS)(\s|$)/));
  }

  /**
   * Format array content
   */
  private formatArrayContent(content: any[]): string[] {
    const result: string[] = [];
    
    content.forEach(item => {
      if (item.type === 'text') {
        result.push(item.text, '');
      }
    });

    return result;
  }

  /**
   * Format truncated content
   */
  private formatTruncatedContent(content: string): string[] {
    const result = ['```'];
    const lines = content.split('\n');
    
    if (lines.length > 50) {
      result.push(...lines.slice(0, 50));
      result.push(`\n... (${lines.length - 50} more lines)`);
    } else {
      result.push(content);
    }
    
    result.push('```');
    return result;
  }

  /**
   * Format file content with syntax highlighting
   */
  private formatFileContent(content: string, toolCall?: ContentItem): string[] {
    const filePath = toolCall?.input?.file_path;
    const language = filePath ? detectLanguageFromPath(filePath) : '';
    
    return [
      `\`\`\`${language}`,
      MessageWrapper.stripLineNumbers(content),
      '```'
    ];
  }

  /**
   * Format code content
   */
  private formatCodeContent(content: string): string[] {
    const language = detectCodeLanguage(content);
    
    return [
      `\`\`\`${language}`,
      content,
      '```'
    ];
  }

  /**
   * Format plain content
   */
  private formatPlainContent(content: string): string[] {
    return [
      '```',
      content,
      '```'
    ];
  }

  /**
   * Create tool result summary
   */
  public createToolResultSummary(content: string, toolUseId?: string): string {
    const toolCall = toolUseId ? this.context.toolCallMap[toolUseId] : undefined;
    
    if (!toolCall) {
      return this.createContentBasedSummary(content);
    }

    const toolName = toolCall.name;
    const toolInput = toolCall.input;

    switch (toolName) {
      case 'TodoWrite':
        return '<b>TodoWrite:</b> Updated task list';
      case 'Read':
        return this.formatReadSummary(toolInput);
      case 'Grep':
        return this.formatGrepSummary(toolInput);
      case 'Edit':
        return `<b>Edit:</b> <code>${makeRelativePath(toolInput?.file_path, this.context.currentCwd)}</code>`;
      case 'Bash':
        return this.formatBashSummary(toolInput);
      case 'Write':
        return `<b>Write:</b> <code>${makeRelativePath(toolInput?.file_path, this.context.currentCwd)}</code>`;
      case 'LS':
        return this.formatLSSummary(toolInput);
      default:
        return `<b>${toolName}:</b> ${this.formatToolInputHtml(toolInput)}`;
    }
  }

  /**
   * Format Read tool summary
   */
  private formatReadSummary(input: any): string {
    const filePath = makeRelativePath(input?.file_path, this.context.currentCwd) || 'unknown file';
    const limit = input?.limit;
    
    if (limit) {
      return `<b>Read:</b> <code>${filePath}, limit: ${limit}</code>`;
    }
    
    return `<b>Read:</b> <code>${filePath}</code>`;
  }

  /**
   * Format Grep tool summary
   */
  private formatGrepSummary(input: any): string {
    const pattern = input?.pattern;
    const path = input?.path ? makeRelativePath(input.path, this.context.currentCwd) : 'current directory';
    const includeFilter = input?.include;
    
    if (includeFilter) {
      return `<b>Grep:</b> pattern <code>${pattern}</code> in <code>${path}</code> (${includeFilter})`;
    }
    
    return `<b>Grep:</b> pattern <code>${pattern}</code> in <code>${path}</code>`;
  }

  /**
   * Format Bash tool summary
   */
  private formatBashSummary(input: any): string {
    let command = input?.command;
    const displayCommand = command.startsWith('LS ') ? command.replace(/^LS /, 'ls ') : command;
    const finalCommand = displayCommand === 'LS' ? 'ls' : displayCommand;
    
    return `<b>Bash:</b> <code>${finalCommand}</code>`;
  }

  /**
   * Format LS tool summary
   */
  private formatLSSummary(input: any): string {
    const path = input?.path ? makeRelativePath(input.path, this.context.currentCwd) : 'current directory';
    return `<b>ls:</b> <code>${path}</code>`;
  }

  /**
   * Create content-based summary
   */
  private createContentBasedSummary(content: string): string {
    // Ensure content is a string
    if (typeof content !== 'string') {
      return '<b>Tool result:</b> non-text content';
    }
    if (this.hasLineNumbers(content)) {
      const lines = content.split('\n');
      return `<b>Read:</b> file content (${lines.length} lines)`;
    }
    
    if (content.match(/^Found \d+ files/)) {
      return `<b>Search:</b> ${content.split('\n')[0]}`;
    }
    
    if (content.match(/^\/.*\..*$/)) {
      return `<b>Search:</b> found ${content.split('\n').length} file(s)`;
    }
    
    if (content.match(/^(.*has been updated|.*created successfully|.*deleted successfully)/)) {
      return `<b>Edit:</b> ${content.split('\n')[0]}`;
    }
    
    if (content.match(/^(Tool ran without output|Command completed)/)) {
      return '<b>Command:</b> executed successfully';
    }
    
    if (content.match(/^Received \d+/)) {
      return `<b>Fetch:</b> ${content.split('\n')[0]}`;
    }
    
    return `<b>Tool result:</b> ${content.length} characters`;
  }

  /**
   * Format tool input for HTML display
   */
  private formatToolInputHtml(input: any): string {
    if (!input || typeof input !== 'object') {
      return `<code>${input}</code>`;
    }

    const keys = Object.keys(input);
    if (keys.length === 1) {
      const value = input[keys[0]];
      return `<code>${value}</code>`;
    }

    const pairs = keys.map(key => `${key}: ${input[key]}`);
    return `<code>${pairs.join(', ')}</code>`;
  }

  /**
   * Format todo list
   */
  private formatTodoList(input: any): string[] {
    if (!input?.todos) {
      return [];
    }

    return input.todos.map((todo: any) => {
      const checkbox = todo.status === 'completed' ? '[x]' : '[ ]';
      const statusIndicator = todo.status === 'in_progress' ? ' (in progress)' : '';
      return `- ${checkbox} ${todo.content}${statusIndicator}`;
    });
  }

  /**
   * Helper methods
   */
  private hasLineNumbers(content: string): boolean {
    return /^\s*\d+→/.test(content);
  }

  private isCodeContent(content: string): boolean {
    return /^(Found \d+ files|\/.*\..*$)/.test(content) ||
           /^\s*(import|export|function|const|let|var|class|interface|type)/.test(content);
  }
}