import { MessageData, ContentItem, ProcessingContext, ToolCallMap } from '../types/index.js';
import { MessageWrapper } from '../parsers/MessageWrapper.js';

export class MessageProcessor {
  private output: string[] = [];
  private context: ProcessingContext;

  constructor() {
    this.context = {
      pendingTools: [],
      pendingToolResults: [],
      toolCallMap: {}
    };
  }

  /**
   * Process a single message and return markdown output
   */
  public processMessage(
    data: MessageData, 
    messages: MessageData[], 
    index: number
  ): string[] {
    // Update current working directory
    if (data.cwd) {
      this.context.currentCwd = data.cwd;
    }

    const result: string[] = [];
    
    switch (data.type) {
      case 'summary':
        // Summaries are handled at session level
        break;
      case 'user':
        result.push(...this.processUserMessage(data, messages, index));
        break;
      case 'assistant':
        result.push(...this.processAssistantMessage(data, messages, index));
        break;
    }

    return result;
  }

  /**
   * Process user message
   */
  private processUserMessage(
    data: MessageData, 
    messages: MessageData[], 
    index: number
  ): string[] {
    const message = new MessageWrapper(data);
    
    // Early returns for special cases
    if (message.isCaveatMessage() || message.isApiError()) {
      return [];
    }

    // Handle meta messages
    if (message.isMeta) {
      return this.handleMetaMessage(message);
    }

    // Store tool use result if present
    this.context.currentToolUseResult = message.toolUseResult;

    // Handle different message types
    if (message.isContentArray()) {
      return this.handleArrayMessage(message, messages, index);
    } else {
      return this.handleStringMessage(message);
    }
  }

  /**
   * Process assistant message
   */
  private processAssistantMessage(
    data: MessageData, 
    messages: MessageData[], 
    index: number
  ): string[] {
    const message = new MessageWrapper(data);
    
    if (message.isApiError()) {
      return [];
    }

    if (message.isContentArray()) {
      return this.handleAssistantArrayContent(message, messages, index);
    } else {
      return this.outputAssistantText(message.content as string);
    }
  }

  /**
   * Handle meta message
   */
  private handleMetaMessage(message: MessageWrapper): string[] {
    const contentText = message.getTextContent();
    if (!contentText) {
      return [];
    }

    const summaryText = contentText.split('\n')[0] || contentText;
    const truncatedSummary = summaryText.length > 50 
      ? summaryText.substring(0, 50) + '...' 
      : summaryText;

    const result = [
      `<details><summary>${truncatedSummary}</summary>`,
      ''
    ];

    // Add quoted content
    contentText.split('\n').forEach(line => {
      result.push(`> ${line}`);
    });

    result.push('', '</details>', '');
    return result;
  }

  /**
   * Handle array message (with tool results)
   */
  private handleArrayMessage(
    message: MessageWrapper, 
    messages: MessageData[], 
    index: number
  ): string[] {
    const result: string[] = [];
    const toolResults = message.getToolResults();
    const regularContent = message.getRegularContent();

    if (toolResults.length > 0) {
      result.push(...this.handleToolResults(toolResults, messages, index));
    }

    if (regularContent.length > 0 && !message.isInterruptionMessage()) {
      result.push(...this.outputUserContent(regularContent));
    }

    return result;
  }

  /**
   * Handle tool results
   */
  private handleToolResults(
    toolResults: ContentItem[], 
    messages: MessageData[], 
    index: number
  ): string[] {
    const errorResults = toolResults.filter(result => result.is_error);
    
    if (errorResults.length > 0) {
      return ['**❌ User cancelled tool execution**', ''];
    }

    // Add to pending results
    this.context.pendingToolResults.push(...toolResults);

    // Check if next message continues tool results
    const nextMessage = messages[index + 1];
    const isContinuing = nextMessage && 
      nextMessage.type === 'user' && 
      new MessageWrapper(nextMessage).getToolResults().length > 0;

    if (!isContinuing) {
      return this.flushPendingToolResults();
    }

    return [];
  }

  /**
   * Handle string message
   */
  private handleStringMessage(message: MessageWrapper): string[] {
    if (message.isEmptyCommandOutput()) {
      return [];
    }

    const command = message.extractCommand();
    if (command) {
      return this.handleCommandMessage(command);
    }

    return this.outputUserContent([{ type: 'text', text: message.content as string }]);
  }

  /**
   * Handle command message
   */
  private handleCommandMessage(command: { name: string; args: string }): string[] {
    if (command.name === '/clear') {
      return ['**🧹 User cleared the session**', ''];
    }

    const result = ['### User', ''];
    
    if (command.args) {
      result.push(`> ${command.name} "${command.args}"`);
    } else {
      result.push(`> ${command.name}`);
    }
    
    result.push('');
    return result;
  }

  /**
   * Output user content
   */
  private outputUserContent(contentItems: ContentItem[]): string[] {
    const result = ['### User', ''];
    
    contentItems.forEach(item => {
      const text = MessageWrapper.extractTextFromContentItem(item);
      text.split('\n').forEach(line => {
        result.push(`> ${line}`);
      });
    });
    
    result.push('');
    return result;
  }

  /**
   * Handle assistant array content
   */
  private handleAssistantArrayContent(
    message: MessageWrapper, 
    messages: MessageData[], 
    index: number
  ): string[] {
    const content = message.content as ContentItem[];
    const textContent = content.filter(item => item.type === 'text');
    const toolUses = message.getToolUses();
    
    let result: string[] = [];

    if (toolUses.length > 0) {
      // Output text if present
      if (textContent.length > 0) {
        result.push('### Assistant', '');
        textContent.forEach(item => {
          result.push(item.text || '', '');
        });
      }

      // Store tool uses for later display with results
      toolUses.forEach(toolUse => {
        this.context.pendingTools.push(toolUse);
        if (toolUse.id) {
          this.context.toolCallMap[toolUse.id] = toolUse;
        }
      });
    } else if (textContent.length > 0) {
      result.push(...this.outputAssistantTextItems(textContent));
    }

    return result;
  }

  /**
   * Output assistant text
   */
  private outputAssistantText(text: string): string[] {
    return ['### Assistant', '', text, ''];
  }

  /**
   * Output assistant text items
   */
  private outputAssistantTextItems(textItems: ContentItem[]): string[] {
    const result = ['### Assistant', ''];
    
    textItems.forEach(item => {
      result.push(item.text || '', '');
    });
    
    return result;
  }

  /**
   * Flush pending tool results
   */
  private flushPendingToolResults(): string[] {
    if (this.context.pendingToolResults.length === 0) {
      return [];
    }

    const result: string[] = [];
    
    // This will be handled by ToolResultProcessor
    // For now, just clear the pending results
    this.context.pendingToolResults = [];
    this.context.pendingTools = [];
    this.context.currentToolUseResult = undefined;

    return result;
  }

  /**
   * Get current processing context
   */
  public getContext(): ProcessingContext {
    return this.context;
  }

  /**
   * Reset processing context
   */
  public resetContext(): void {
    this.context = {
      pendingTools: [],
      pendingToolResults: [],
      toolCallMap: {}
    };
  }

  /**
   * Set current working directory
   */
  public setCurrentCwd(cwd: string): void {
    this.context.currentCwd = cwd;
  }
}