# Claude Code Session to Markdown

A Node.js utility that converts Claude Code session logs (JSONL format) to readable Markdown documentation. This is a TypeScript/Node.js port of the original Ruby script with improved architecture and additional features.

## Features

- ✅ **Multi-format support**: Convert JSONL input to markdown via CLI or interactive TUI
- ✅ **Session browsing**: Interactive terminal UI for browsing and selecting sessions
- ✅ **Tool result formatting**: Properly formats tool calls and results with syntax highlighting
- ✅ **Path relativization**: Converts absolute paths to relative paths for better readability
- ✅ **Language detection**: Automatic syntax highlighting for various programming languages
- ✅ **Clipboard integration**: Automatically copies output to clipboard (macOS/Linux)
- ✅ **Validation**: Validate JSONL input for correctness
- ✅ **Statistics**: Show detailed stats about sessions and messages

## Installation

```bash
npm install
npm run build
```

## Usage

### Command Line Interface

```bash
# Convert JSONL from stdin to markdown
cat session.jsonl | npm run dev

# Or using the convert command
cat session.jsonl | npm run dev -- convert

# Convert with options
npm run dev -- convert -i session.jsonl -o output.md --no-syntax-highlighting

# Interactive session browser
npm run dev -- browse

# Validate JSONL input
cat session.jsonl | npm run dev -- validate

# Show statistics
cat session.jsonl | npm run dev -- stats
```

### Available Commands

- `convert` - Convert JSONL input to markdown
- `browse` - Interactive session browser with TUI
- `validate` - Validate JSONL input format
- `stats` - Show session statistics

### Convert Command Options

- `-i, --input <file>` - Input JSONL file (default: stdin)
- `-o, --output <file>` - Output markdown file (default: stdout)
- `--no-syntax-highlighting` - Disable syntax highlighting
- `--no-relative-paths` - Disable path relativization
- `--no-truncate` - Disable truncation of long output
- `--max-lines <number>` - Maximum lines for truncation (default: 50)

### Browse Command Options

- `-p, --projects-dir <dir>` - Claude projects directory (default: ~/.claude/projects)

## Architecture

The application follows a clean, modular architecture:

```
src/
├── types/           # TypeScript type definitions
├── parsers/         # JSONL parsing and session grouping
├── processors/      # Message and tool result processing
├── formatters/      # Markdown conversion
├── ui/              # Interactive TUI components (Ink-based)
├── utils/           # Utility functions
└── index.ts         # CLI entry point
```

### Key Components

- **SessionParser**: Parses JSONL input and groups messages into sessions
- **MessageProcessor**: Handles different message types (user, assistant, summary)
- **ToolResultProcessor**: Formats tool calls and results with proper syntax highlighting
- **MarkdownFormatter**: Converts sessions to markdown with formatting options
- **SessionBrowser**: Interactive TUI for browsing and selecting sessions

## Message Processing

The tool processes three types of messages:

1. **Summary messages**: Session metadata and titles
2. **User messages**: User input, commands, and tool results
3. **Assistant messages**: Claude's responses and tool calls

### Tool Result Formatting

Tool results are formatted with collapsible details sections:

- **File reads**: Syntax-highlighted code blocks with language detection
- **Search results**: Properly formatted search output
- **Command execution**: Formatted command output
- **File operations**: Success/failure messages with file paths

## Language Detection

Automatic syntax highlighting supports:

- JavaScript/TypeScript
- Python
- Java
- C/C++
- Go
- Rust
- Ruby
- PHP
- SQL
- JSON/YAML
- HTML/CSS
- Bash scripts
- And many more...

## Interactive TUI

The interactive browser provides:

- **Project selection**: Browse Claude Code projects
- **Session filtering**: Filter sessions by summary text
- **Session details**: View session metadata (modified time, message count)
- **Keyboard navigation**: Arrow keys, Enter, Escape, and text filtering
- **Automatic clipboard**: Selected sessions are copied to clipboard

### TUI Controls

- `↑/↓` - Navigate items
- `Enter` - Select item
- `Esc` - Go back / quit
- `Type` - Filter items
- `Ctrl+C` - Force quit

## Path Relativization

The tool automatically converts absolute paths to relative paths when possible:

- `/Users/mnutt/p/project/src/file.ts` → `src/file.ts`
- Keeps original paths when they're outside the working directory
- Maintains readability while reducing path length

## Clipboard Integration

Automatic clipboard copying works on:

- **macOS**: Uses `pbcopy`
- **Linux**: Uses `xclip`
- **Fallback**: Uses `clipboardy` package
- **Graceful degradation**: Falls back to stdout if clipboard unavailable

## Examples

### Basic Usage

```bash
# Convert session to markdown
cat ~/.claude/projects/my-project/session.jsonl | npm run dev > output.md

# Interactive browsing
npm run dev -- browse

# Validate session file
npm run dev -- validate -i session.jsonl
```

### Advanced Usage

```bash
# Convert with custom settings
npm run dev -- convert \
  --input session.jsonl \
  --output documentation.md \
  --max-lines 100 \
  --no-relative-paths

# Browse specific projects directory
npm run dev -- browse --projects-dir ~/custom/claude/projects
```

## Development

### Building

```bash
npm run build          # Build TypeScript
npm run type-check     # Type checking only
npm run dev            # Run with tsx (development)
```

### Project Structure

- **Types**: Comprehensive TypeScript definitions for all data structures
- **Parsers**: Handle JSONL parsing and session organization
- **Processors**: Transform messages and tool results
- **Formatters**: Convert to markdown with various options
- **UI**: React-based terminal interface using Ink
- **Utils**: Helper functions for language detection, paths, time formatting

## Requirements

- Node.js 20+
- TypeScript 5.3+
- Terminal with color support (for TUI)

## Comparison with Ruby Version

| Feature | Ruby Version | Node.js Version |
|---------|-------------|-----------------|
| JSONL parsing | ✅ | ✅ |
| Session grouping | ✅ | ✅ |
| Tool formatting | ✅ | ✅ |
| Interactive TUI | ✅ | ✅ (Ink-based) |
| Language detection | ✅ | ✅ (Enhanced) |
| Path relativization | ✅ | ✅ |
| Clipboard integration | ✅ | ✅ |
| CLI commands | Basic | ✅ (Enhanced) |
| Validation | ❌ | ✅ |
| Statistics | ❌ | ✅ |
| TypeScript support | ❌ | ✅ |
| Modular architecture | ❌ | ✅ |

## License

MIT