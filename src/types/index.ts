export interface MessageData {
  type: 'user' | 'assistant' | 'summary' | 'system';
  sessionId?: string;
  uuid?: string;
  leafUuid?: string;
  parentUuid?: string | null;
  timestamp?: string;
  cwd?: string;
  isMeta?: boolean;
  isApiErrorMessage?: boolean;
  isSidechain?: boolean;
  userType?: string;
  version?: string;
  requestId?: string;
  message?: {
    id?: string;
    role: 'user' | 'assistant';
    content: string | ContentItem[];
    model?: string;
    type?: string;
    stop_reason?: string | null;
    stop_sequence?: string | null;
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
      cache_creation_input_tokens?: number;
      cache_read_input_tokens?: number;
      service_tier?: string;
    };
  };
  summary?: string;
  toolUseResult?: ToolUseResult;
}

export interface ContentItem {
  type: 'text' | 'tool_use' | 'tool_result';
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, any>;
  tool_use_id?: string;
  content?: string | ContentItem[];
  is_error?: boolean;
}

export interface ToolUseResult {
  type?: string;
  structuredPatch?: StructuredPatch[];
  filePath?: string;
  stdout?: string;
  stderr?: string;
  interrupted?: boolean;
  isImage?: boolean;
  file?: {
    filePath: string;
    content: string;
    numLines: number;
    startLine: number;
    totalLines: number;
  };
  filenames?: string[];
  numFiles?: number;
  userModified?: boolean;
  replaceAll?: boolean;
  oldString?: string;
  newString?: string;
  originalFile?: string;
}

export interface StructuredPatch {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: string[];
}

export interface Message {
  data: MessageData;
  type: string;
  content: string | ContentItem[];
  isMeta: boolean;
  toolUseResult?: ToolUseResult;
}

export interface Session {
  id: string;
  messages: MessageData[];
  summary?: string;
  generatedSummary?: string;
  firstTimestamp?: string;
  lastTimestamp?: string;
  firstCreated: Date;
  lastModified: Date;
  messageCount: number;
  files: string[];
}

export interface SessionInfo {
  sessionId: string;
  file: string;
  timestamp: string;
  summary: string;
  messageCount: number;
  modified: Date;
  created: Date;
}

export interface ToolCallMap {
  [toolUseId: string]: ContentItem;
}

export interface LanguageMapping {
  [extension: string]: string;
}

export interface ProcessingContext {
  currentCwd?: string;
  pendingTools: ContentItem[];
  pendingToolResults: ContentItem[];
  toolCallMap: ToolCallMap;
  currentAssistantMessage?: Message;
  currentToolUseResult?: ToolUseResult;
}

export interface FormattingOptions {
  relativizePaths?: boolean;
  syntaxHighlighting?: boolean;
  truncateLongOutput?: boolean;
  maxLines?: number;
}

export interface ConversionResult {
  markdown: string;
  sessionId: string;
  summary: string;
  messageCount: number;
}

export interface ProjectInfo {
  name: string;
  path: string;
  displayName: string;
  sessionCount: number;
  lastModified: Date;
}

export interface FilterOptions {
  query?: string;
  dateRange?: {
    start?: Date;
    end?: Date;
  };
  messageCountRange?: {
    min?: number;
    max?: number;
  };
}

export interface UIState {
  selectedIndex: number;
  filter: string;
  isLoading: boolean;
  error?: string;
}

export interface ClipboardResult {
  success: boolean;
  error?: string;
}