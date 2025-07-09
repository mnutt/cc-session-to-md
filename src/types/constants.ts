import { LanguageMapping } from './index.js';

export const LANGUAGE_BY_EXTENSION: LanguageMapping = {
  'js': 'javascript',
  'jsx': 'javascript',
  'ts': 'typescript',
  'tsx': 'typescript',
  'rb': 'ruby',
  'ruby': 'ruby',
  'py': 'python',
  'python': 'python',
  'cpp': 'cpp',
  'cc': 'cpp',
  'cxx': 'cpp',
  'c++': 'cpp',
  'hpp': 'cpp',
  'h': 'cpp',
  'c': 'c',
  'java': 'java',
  'go': 'go',
  'rs': 'rust',
  'php': 'php',
  'sh': 'bash',
  'bash': 'bash',
  'sql': 'sql',
  'json': 'json',
  'yaml': 'yaml',
  'yml': 'yaml',
  'xml': 'xml',
  'html': 'html',
  'css': 'css',
  'md': 'markdown',
  'markdown': 'markdown'
};

export const SPECIAL_FILE_LANGUAGES: LanguageMapping = {
  'CMakeLists.txt': 'cmake',
  'Makefile': 'makefile',
  'Dockerfile': 'dockerfile',
  'docker-compose.yml': 'yaml',
  'docker-compose.yaml': 'yaml',
  '.gitignore': 'gitignore',
  '.env': 'dotenv',
  'package.json': 'json',
  'tsconfig.json': 'json',
  'cargo.toml': 'toml',
  'pyproject.toml': 'toml'
};

export const DEFAULT_FORMATTING_OPTIONS = {
  relativizePaths: true,
  syntaxHighlighting: true,
  truncateLongOutput: true,
  maxLines: 50
};

export const CLAUDE_PROJECTS_DIR = '~/.claude/projects';

export const SUPPORTED_EXTENSIONS = ['.jsonl'];

export const TIME_FORMATS = {
  TIMESTAMP_REGEX: /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/,
  DATE_REGEX: /^\d{4}-\d{2}-\d{2}/,
  UNIX_TIMESTAMP_REGEX: /^\d{10}$/,
  UNIX_TIMESTAMP_MS_REGEX: /^\d{13}$/,
  UUID_REGEX: /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i
};

export const COMMAND_PATTERNS = {
  COMMAND_NAME: /<command-name>([^<]+)<\/command-name>/,
  COMMAND_ARGS: /<command-args>([^<]*)<\/command-args>/,
  COMMAND_STDOUT: /<local-command-stdout><\/local-command-stdout>/
};

export const CONTENT_PATTERNS = {
  LINE_NUMBERS: /^\s*\d+→/,
  CODE_CONTENT: /^(Found \d+ files|\/.*\..*$)/,
  IMPORT_STATEMENT: /^\s*(import|export|function|const|let|var|class|interface|type)/
};

export const TOOL_RESULT_PATTERNS = {
  FILE_READ: /^\s*\d+→/,
  SEARCH_RESULT: /^Found \d+ files/,
  FILE_PATH: /^\/.*\..*$/,
  SUCCESS_MESSAGE: /^(.*has been updated|.*created successfully|.*deleted successfully)/,
  COMMAND_OUTPUT: /^(Tool ran without output|Command completed)/,
  FETCH_RESULT: /^Received \d+/
};

export const UI_CONSTANTS = {
  TERMINAL_WIDTH_FALLBACK: 80,
  MAX_DISPLAY_ITEMS: 100,
  FILTER_DEBOUNCE_MS: 300,
  SELECTION_INDICATOR: '❯',
  TRUNCATE_SUFFIX: '...'
};

export const ASCII_TITLE = `
   ██████╗ ██████╗ ██████╗███╗   ███╗██████╗ 
  ██╔════╝██╔════╝╚════██╗████╗ ████║██╔══██╗
  ██║     ██║      █████╔╝██╔████╔██║██║  ██║
  ██║     ██║     ██╔═══╝ ██║╚██╔╝██║██║  ██║
  ╚██████╗╚██████╗███████╗██║ ╚═╝ ██║██████╔╝
   ╚═════╝ ╚═════╝╚══════╝╚═╝     ╚═╝╚═════╝ 
`;

export const COLORS = {
  CYAN: '\x1b[36m',
  YELLOW: '\x1b[33m',
  RED: '\x1b[31m',
  GREEN: '\x1b[32m',
  BLUE: '\x1b[34m',
  MAGENTA: '\x1b[35m',
  DIM: '\x1b[2m',
  BOLD: '\x1b[1m',
  RESET: '\x1b[0m',
  BG_CYAN: '\x1b[46m',
  FG_BLACK: '\x1b[30m'
};