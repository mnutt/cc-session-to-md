import { Session, MessageData, ConversionResult, ProcessingContext, FormattingOptions } from '../types/index.js';
import { DEFAULT_FORMATTING_OPTIONS } from '../types/constants.js';
import { MessageProcessor } from '../processors/MessageProcessor.js';
import { ToolResultProcessor } from '../processors/ToolResultProcessor.js';
import { SessionParser } from '../parsers/SessionParser.js';
import Debug from 'debug';

const debug = Debug('session-to-md:formatter');

export class MarkdownFormatter {
  private messageProcessor: MessageProcessor;
  private toolResultProcessor!: ToolResultProcessor;
  private options: FormattingOptions;

  constructor(options: FormattingOptions = DEFAULT_FORMATTING_OPTIONS) {
    this.options = { ...DEFAULT_FORMATTING_OPTIONS, ...options };
    this.messageProcessor = new MessageProcessor();
    // Don't create ToolResultProcessor here - create it fresh for each session
  }

  /**
   * Convert JSONL input to markdown
   */
  public convertInput(input: string): string {
    const parser = new SessionParser();
    const sessions = parser.parseInput(input);
    
    const results: string[] = [];
    
    for (const [sessionId, session] of sessions) {
      const sessionResult = this.convertSession(session);
      results.push(sessionResult.markdown);
    }
    
    return results.join('\n\n---\n\n');
  }

  /**
   * Convert multiple sessions to markdown
   */
  public convertSessions(sessions: Session[]): ConversionResult[] {
    return sessions.map(session => this.convertSession(session));
  }

  /**
   * Convert a single session to markdown
   */
  public convertSession(session: Session): ConversionResult {
    const summary = session.summary || session.generatedSummary || 'Untitled';
    
    // Reset processor state for each session
    this.messageProcessor.resetContext();
    
    // Create fresh ToolResultProcessor with current context after reset
    this.toolResultProcessor = new ToolResultProcessor(this.messageProcessor.getContext());
    
    const output: string[] = [];
    output.push(`# ${summary}`, '');
    
    // Process each message
    session.messages.forEach((message, index) => {
      try {
        const messageOutput = this.processMessage(message, session.messages, index);
        output.push(...messageOutput);
      } catch (error) {
        console.error(`Error processing message at index ${index}:`, error);
        console.error('Message data:', JSON.stringify(message, null, 2));
        throw error;
      }
    });
    
    // Flush any remaining tool results
    const remainingResults = this.flushPendingToolResults();
    output.push(...remainingResults);
    
    return {
      markdown: output.join('\n'),
      sessionId: session.id,
      summary,
      messageCount: session.messageCount
    };
  }

  /**
   * Process a single message
   */
  private processMessage(
    message: MessageData, 
    messages: MessageData[], 
    index: number
  ): string[] {
    debug(`Processing message ${index}, type: ${message.type}`);
    const result = this.messageProcessor.processMessage(message, messages, index);
    const context = this.messageProcessor.getContext();
    
    debug(`After processing message ${index}: ${context.pendingToolResults.length} pending tool results, ${Object.keys(context.toolCallMap).length} tools in map`);
    
    // Check if we need to flush tool results after processing this message
    if (context.pendingToolResults.length > 0) {
      // Check if next message continues tool results
      const nextMessage = messages[index + 1];
      const hasNextToolResults = nextMessage && 
        nextMessage.type === 'user' && 
        (nextMessage.message?.content as any)?.some?.((item: any) => item.type === 'tool_result');
      
      // Debug logging
      debug(`Message ${index}: Has ${context.pendingToolResults.length} pending tool results`);
      debug(`Next message has tool results: ${hasNextToolResults}`);
      
      if (!hasNextToolResults) {
        // No more tool results coming, flush now
        debug(`Flushing tool results for message ${index}`);
        const toolResults = this.toolResultProcessor.formatToolResults(context.pendingToolResults);
        
        // Clear pending results but keep toolCallMap for future tool results
        context.pendingToolResults = [];
        context.pendingTools = [];
        context.currentToolUseResult = undefined;
        
        return [...result, ...toolResults];
      }
    }
    
    return result;
  }

  /**
   * Flush any remaining tool results
   */
  private flushPendingToolResults(): string[] {
    const context = this.messageProcessor.getContext();
    
    if (context.pendingToolResults.length === 0) {
      return [];
    }
    
    const toolResults = this.toolResultProcessor.formatToolResults(context.pendingToolResults);
    
    // Clear pending results
    context.pendingToolResults = [];
    context.pendingTools = [];
    context.currentToolUseResult = undefined;
    
    return toolResults;
  }

  /**
   * Set formatting options
   */
  public setOptions(options: Partial<FormattingOptions>): void {
    this.options = { ...this.options, ...options };
  }

  /**
   * Get current formatting options
   */
  public getOptions(): FormattingOptions {
    return { ...this.options };
  }

  /**
   * Convert session data directly from JSONL string
   */
  public convertSessionData(sessionData: string): string {
    return this.convertInput(sessionData);
  }

  /**
   * Convert multiple JSONL files to markdown
   */
  public convertFiles(files: string[]): string {
    const parser = new SessionParser();
    const sessionInfos = parser.parseFiles(files);
    
    const results: string[] = [];
    
    for (const sessionInfo of sessionInfos) {
      try {
        const sessionData = parser.getSessionData(sessionInfo.sessionId, files);
        const sessionMarkdown = this.convertInput(sessionData);
        results.push(sessionMarkdown);
      } catch (error) {
        console.error(`Error converting session ${sessionInfo.sessionId}:`, error);
      }
    }
    
    return results.join('\n\n---\n\n');
  }

  /**
   * Convert a specific session by ID from multiple files
   */
  public convertSessionById(sessionId: string, files: string[]): string {
    const parser = new SessionParser();
    const sessionData = parser.getSessionData(sessionId, files);
    return this.convertInput(sessionData);
  }

  /**
   * Get session summary without full conversion
   */
  public getSessionSummary(sessionData: string): string {
    const parser = new SessionParser();
    const sessions = parser.parseInput(sessionData);
    
    const summaries: string[] = [];
    
    for (const [sessionId, session] of sessions) {
      const summary = session.summary || session.generatedSummary || 'Untitled';
      summaries.push(`**${summary}** (${session.messageCount} messages)`);
    }
    
    return summaries.join('\n');
  }

  /**
   * Validate JSONL input
   */
  public validateInput(input: string): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    const lines = input.trim().split('\n').filter(line => line.trim());
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      try {
        const parsed = JSON.parse(line);
        
        // Basic validation
        if (!parsed.type) {
          errors.push(`Line ${i + 1}: Missing 'type' field`);
        }
        
        if (!['user', 'assistant', 'summary', 'system'].includes(parsed.type)) {
          errors.push(`Line ${i + 1}: Invalid type '${parsed.type}'`);
        }
        
        if (parsed.type !== 'summary' && !parsed.sessionId) {
          errors.push(`Line ${i + 1}: Missing 'sessionId' field for ${parsed.type} message`);
        }
        
      } catch (error) {
        errors.push(`Line ${i + 1}: Invalid JSON - ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Get statistics about the input
   */
  public getInputStats(input: string): {
    totalLines: number;
    totalSessions: number;
    totalMessages: number;
    messagesByType: { user: number; assistant: number; summary: number };
  } {
    const parser = new SessionParser();
    const sessions = parser.parseInput(input);
    
    const lines = input.trim().split('\n').filter(line => line.trim());
    let totalMessages = 0;
    const messagesByType = { user: 0, assistant: 0, summary: 0 };
    
    for (const line of lines) {
      try {
        const parsed = JSON.parse(line);
        if (parsed.type in messagesByType) {
          messagesByType[parsed.type as keyof typeof messagesByType]++;
          totalMessages++;
        }
      } catch {
        // Skip invalid lines
      }
    }
    
    return {
      totalLines: lines.length,
      totalSessions: sessions.size,
      totalMessages,
      messagesByType
    };
  }
}