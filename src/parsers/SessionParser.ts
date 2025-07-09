import { MessageData, Session, SessionInfo } from '../types/index.js';
import { TIME_FORMATS } from '../types/constants.js';
import { cleanSummary, isValidTimestamp, parseTimestamp } from '../utils/time.js';
import { MessageWrapper } from './MessageWrapper.js';
import * as fs from 'fs';
import * as path from 'path';

export class SessionParser {
  private sessions: Map<string, Session> = new Map();
  private summaryLeafs: Map<string, string> = new Map();

  /**
   * Parse JSONL input and group into sessions
   */
  public parseInput(input: string): Map<string, Session> {
    this.sessions.clear();
    this.summaryLeafs.clear();

    const lines = input.trim().split('\n').filter(line => line.trim());
    
    // First pass - collect all summaries
    this.collectSummaries(lines);
    
    // Second pass - process messages and apply summaries
    this.processMessages(lines);
    
    return new Map(this.sessions);
  }

  /**
   * Parse multiple JSONL files and build session list
   */
  public parseFiles(files: string[]): SessionInfo[] {
    this.sessions.clear();
    this.summaryLeafs.clear();

    // Read all files and collect all lines
    const allLines: string[] = [];
    const fileMetadata = new Map<string, fs.Stats>();
    
    for (const file of files) {
      try {
        const content = fs.readFileSync(file, 'utf8');
        const lines = content.trim().split('\n').filter(line => line.trim());
        allLines.push(...lines);
        
        const fileStats = fs.statSync(file);
        fileMetadata.set(file, fileStats);
      } catch (error) {
        console.error(`Error reading file ${file}:`, error);
      }
    }
    
    // Process all lines together to get all summaries and sessions
    const allSessionsMap = this.parseInput(allLines.join('\n'));
    
    // Update file metadata for sessions
    for (const [sessionId, session] of allSessionsMap) {
      // Find which files this session appears in
      session.files = [];
      
      for (const file of files) {
        try {
          const content = fs.readFileSync(file, 'utf8');
          if (content.includes(sessionId)) {
            session.files.push(file);
          }
        } catch (error) {
          console.error(`Error checking file ${file} for session ${sessionId}:`, error);
        }
      }
      
      // If timestamps weren't properly set from messages, fall back to file metadata
      if (session.firstCreated.getTime() === 0 || session.lastModified.getTime() === 0) {
        let firstFileTime = new Date();
        let lastFileTime = new Date(0);
        
        for (const file of session.files) {
          const fileStats = fileMetadata.get(file);
          if (fileStats) {
            if (fileStats.mtime < firstFileTime) {
              firstFileTime = fileStats.mtime;
            }
            if (fileStats.mtime > lastFileTime) {
              lastFileTime = fileStats.mtime;
            }
          }
        }
        
        if (session.firstCreated.getTime() === 0) {
          session.firstCreated = firstFileTime;
        }
        if (session.lastModified.getTime() === 0) {
          session.lastModified = lastFileTime;
        }
      }
    }

    // Convert to SessionInfo array
    return Array.from(allSessionsMap.values())
      .map(session => this.sessionToInfo(session))
      .filter(info => info.messageCount > 0)
      .sort((a, b) => b.modified.getTime() - a.modified.getTime());
  }

  /**
   * Get session data for a specific session ID from multiple files
   */
  public getSessionData(sessionId: string, files: string[]): string {
    const lines: string[] = [];
    
    for (const file of files) {
      try {
        const content = fs.readFileSync(file, 'utf8');
        const fileLines = content.trim().split('\n');
        
        for (const line of fileLines) {
          if (!line.trim()) continue;
          
          try {
            const data = JSON.parse(line);
            
            // Include all summary messages
            if (data.type === 'summary') {
              lines.push(line);
            }
            // Include messages from the selected session
            else if (data.sessionId === sessionId) {
              lines.push(line);
            }
          } catch (parseError) {
            console.error(`Error parsing line: ${line}`, parseError);
          }
        }
      } catch (fileError) {
        console.error(`Error reading file ${file}:`, fileError);
      }
    }
    
    return lines.join('\n');
  }

  private collectSummaries(lines: string[]): void {
    for (const line of lines) {
      try {
        const data: MessageData = JSON.parse(line);
        
        if (data.type === 'summary' && data.leafUuid && data.summary) {
          this.summaryLeafs.set(data.leafUuid, data.summary);
        }
      } catch (error) {
        console.error(`Error parsing summary line: ${line}`, error);
      }
    }
  }

  private processMessages(lines: string[]): void {
    // Group messages by sessionId first
    const sessionGroups = new Map<string, MessageData[]>();
    
    for (const line of lines) {
      try {
        const data: MessageData = JSON.parse(line);
        
        if (data.sessionId) {
          if (!sessionGroups.has(data.sessionId)) {
            sessionGroups.set(data.sessionId, []);
          }
          sessionGroups.get(data.sessionId)!.push(data);
        }
      } catch (error) {
        console.error(`Error parsing message line: ${line}`, error);
      }
    }
    
    // Process each session group and split by summary boundaries
    for (const [sessionId, messages] of sessionGroups) {
      this.splitSessionBySummaries(sessionId, messages);
    }
  }

  private splitSessionBySummaries(baseSessionId: string, messages: MessageData[]): void {
    // Find all messages that have summaries
    const summaryMessageIndices = new Set<number>();
    
    messages.forEach((message, index) => {
      if (message.uuid && this.summaryLeafs.has(message.uuid)) {
        summaryMessageIndices.add(index);
      }
    });
    
    if (summaryMessageIndices.size === 0) {
      // No summaries found, treat as single session
      const sessionId = baseSessionId;
      this.createSession(sessionId, messages);
      return;
    }
    
    // Sort summary indices to process in order
    const sortedIndices = Array.from(summaryMessageIndices).sort((a, b) => a - b);
    
    // Split messages into chunks based on summary boundaries
    let currentStart = 0;
    let sessionCounter = 0;
    
    for (const summaryIndex of sortedIndices) {
      // Create a session from currentStart to summaryIndex (inclusive)
      const sessionMessages = messages.slice(currentStart, summaryIndex + 1);
      const sessionId = sessionCounter === 0 ? baseSessionId : `${baseSessionId}_${sessionCounter}`;
      this.createSession(sessionId, sessionMessages);
      
      currentStart = summaryIndex + 1;
      sessionCounter++;
    }
    
    // Handle any remaining messages after the last summary
    if (currentStart < messages.length) {
      const remainingMessages = messages.slice(currentStart);
      const sessionId = `${baseSessionId}_${sessionCounter}`;
      this.createSession(sessionId, remainingMessages);
    }
  }

  private createSession(sessionId: string, messages: MessageData[]): void {
    if (messages.length === 0) return;
    
    // Initialize session
    const session: Session = {
      id: sessionId,
      messages: [],
      firstCreated: new Date(0), // Will be set from message timestamps
      lastModified: new Date(0), // Will be set from message timestamps
      messageCount: 0,
      files: []
    };
    
    // Process each message
    for (const message of messages) {
      this.processSessionMessage(message, session);
    }
    
    // Only add session if it has messages
    if (session.messageCount > 0) {
      this.sessions.set(sessionId, session);
    }
  }

  private processSessionMessage(data: MessageData, session?: Session): void {
    // If no session provided, use the old logic (for backward compatibility)
    if (!session) {
      const sessionId = data.sessionId!;
      
      // Initialize session if it doesn't exist
      if (!this.sessions.has(sessionId)) {
        this.sessions.set(sessionId, {
          id: sessionId,
          messages: [],
          firstCreated: new Date(),
          lastModified: new Date(),
          messageCount: 0,
          files: []
        });
      }
      
      session = this.sessions.get(sessionId)!;
    }
    
    session.messages.push(data);
    
    // Check if this message's uuid matches a summary leafUuid
    if (data.uuid && this.summaryLeafs.has(data.uuid)) {
      session.summary = this.summaryLeafs.get(data.uuid);
    }
    
    // Update timestamps
    if (data.timestamp && isValidTimestamp(data.timestamp)) {
      if (!session.firstTimestamp) {
        session.firstTimestamp = data.timestamp;
      }
      session.lastTimestamp = data.timestamp;
      
      // Also update Date objects for UI display
      const messageDate = parseTimestamp(data.timestamp);
      if (messageDate.getTime() !== 0) {
        if (session.firstCreated.getTime() === 0 || messageDate < session.firstCreated) {
          session.firstCreated = messageDate;
        }
        if (session.lastModified.getTime() === 0 || messageDate > session.lastModified) {
          session.lastModified = messageDate;
        }
      }
    }
    
    // Generate summary from first user message if needed
    if (!session.generatedSummary && data.type === 'user' && !data.isMeta) {
      const message = new MessageWrapper(data);
      const summary = this.extractSummaryFromMessage(message);
      if (summary && summary !== 'Untitled') {
        session.generatedSummary = summary;
      }
    }
    
    // Update message count
    if (data.type === 'user' || data.type === 'assistant') {
      session.messageCount++;
    }
  }

  private extractSummaryFromMessage(message: MessageWrapper): string | undefined {
    if (message.isCommand() || message.isInterruptionMessage() || message.isEmptyCommandOutput()) {
      return undefined;
    }
    
    const textContent = message.getTextContent();
    if (!textContent || textContent.trim() === '') {
      return undefined;
    }
    
    return cleanSummary(textContent);
  }

  private sessionToInfo(session: Session): SessionInfo {
    const summary = session.summary || session.generatedSummary || 'Untitled';
    const timestamp = session.lastTimestamp || session.firstTimestamp || session.id;
    
    return {
      sessionId: session.id,
      file: session.files[session.files.length - 1] || '',
      timestamp,
      summary,
      messageCount: session.messageCount,
      modified: session.lastModified,
      created: session.firstCreated
    };
  }
}