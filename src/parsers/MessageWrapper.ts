import { MessageData, ContentItem, ToolUseResult } from '../types/index.js';
import { COMMAND_PATTERNS } from '../types/constants.js';

export class MessageWrapper {
  public readonly data: MessageData;
  public readonly type: string;
  public readonly content: string | ContentItem[];
  public readonly isMeta: boolean;
  public readonly toolUseResult?: ToolUseResult;

  constructor(data: MessageData) {
    this.data = data;
    this.type = data.type;
    this.isMeta = data.isMeta || false;
    this.toolUseResult = data.toolUseResult;
    
    const message = data.message || { content: '' };
    this.content = message.content || '';
  }

  /**
   * Check if content is an array of ContentItems
   */
  public isContentArray(): boolean {
    return Array.isArray(this.content);
  }

  /**
   * Get text content from message
   */
  public getTextContent(): string {
    if (!this.isContentArray()) {
      return this.content as string;
    }
    
    const contentArray = this.content as ContentItem[];
    return contentArray
      .filter(item => item.type === 'text')
      .map(item => item.text || '')
      .join('\n');
  }

  /**
   * Get tool results from message content
   */
  public getToolResults(): ContentItem[] {
    if (!this.isContentArray()) {
      return [];
    }
    
    const contentArray = this.content as ContentItem[];
    return contentArray.filter(item => item.type === 'tool_result');
  }

  /**
   * Get tool uses from message content
   */
  public getToolUses(): ContentItem[] {
    if (!this.isContentArray()) {
      return [];
    }
    
    const contentArray = this.content as ContentItem[];
    return contentArray.filter(item => item.type === 'tool_use');
  }

  /**
   * Get regular content (excluding tool results)
   */
  public getRegularContent(): ContentItem[] {
    if (!this.isContentArray()) {
      return [];
    }
    
    const contentArray = this.content as ContentItem[];
    return contentArray.filter(item => item.type !== 'tool_result');
  }

  /**
   * Check if this is a caveat message
   */
  public isCaveatMessage(): boolean {
    if (!this.isMeta) {
      return false;
    }
    
    if (typeof this.content === 'string') {
      return this.content.startsWith('Caveat:');
    }
    
    if (this.isContentArray()) {
      const textItems = (this.content as ContentItem[]).filter(item => item.type === 'text');
      return textItems.some(item => item.text?.startsWith('Caveat:'));
    }
    
    return false;
  }

  /**
   * Check if this is a command message
   */
  public isCommand(): boolean {
    if (typeof this.content !== 'string') {
      return false;
    }
    
    return COMMAND_PATTERNS.COMMAND_NAME.test(this.content);
  }

  /**
   * Extract command information from message
   */
  public extractCommand(): { name: string; args: string } | null {
    if (!this.isCommand()) {
      return null;
    }
    
    const content = this.content as string;
    const nameMatch = content.match(COMMAND_PATTERNS.COMMAND_NAME);
    const argsMatch = content.match(COMMAND_PATTERNS.COMMAND_ARGS);
    
    if (!nameMatch) {
      return null;
    }
    
    return {
      name: nameMatch[1],
      args: argsMatch ? argsMatch[1] : ''
    };
  }

  /**
   * Check if this is an API error message
   */
  public isApiError(): boolean {
    return this.data.isApiErrorMessage || false;
  }

  /**
   * Check if this is an empty command output
   */
  public isEmptyCommandOutput(): boolean {
    if (typeof this.content !== 'string') {
      return false;
    }
    
    return COMMAND_PATTERNS.COMMAND_STDOUT.test(this.content);
  }

  /**
   * Check if this is an interruption message
   */
  public isInterruptionMessage(): boolean {
    return this.content === '[Request interrupted by user for tool use]';
  }

  /**
   * Check if this message has tool results with errors
   */
  public hasErrorToolResults(): boolean {
    const toolResults = this.getToolResults();
    return toolResults.some(result => result.is_error);
  }

  /**
   * Get text content from a content item
   */
  public static extractTextFromContentItem(contentItem: ContentItem): string {
    if (contentItem.type === 'text') {
      return contentItem.text || '';
    }
    
    if (typeof contentItem.content === 'string') {
      return contentItem.content;
    }
    
    if (Array.isArray(contentItem.content)) {
      return contentItem.content
        .map(item => MessageWrapper.extractTextFromContentItem(item))
        .join('\n');
    }
    
    return JSON.stringify(contentItem);
  }

  /**
   * Check if content looks like code
   */
  public isCodeContent(content: string): boolean {
    const codePatterns = [
      /^(Found \d+ files|\/.*\..*$)/,
      /^\s*(import|export|function|const|let|var|class|interface|type)/
    ];
    
    return codePatterns.some(pattern => pattern.test(content));
  }

  /**
   * Check if content has line numbers
   */
  public hasLineNumbers(content: string): boolean {
    return /^\s*\d+→/.test(content);
  }

  /**
   * Strip line numbers from content
   */
  public static stripLineNumbers(content: string): string {
    return content
      .split('\n')
      .map(line => line.replace(/^\s*\d+→/, ''))
      .join('\n');
  }
}