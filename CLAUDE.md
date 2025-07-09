# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Ruby utility that converts Claude Code session logs (JSONL format) to readable Markdown documentation. The script processes conversation data between users and assistants, including tool calls and their results, and formats them into collapsible HTML details sections for easy reading.

## Usage

```bash
# Convert session data from STDIN
cat session.jsonl | ruby session_to_md.rb > output.md

# Or pipe directly from a file
ruby session_to_md.rb < session.jsonl > output.md
```

## Architecture

The main `SessionToMarkdown` class processes JSONL input line by line:

- **Message Processing**: Handles three message types: `summary`, `user`, and `assistant`
- **Tool Call Coalescing**: Groups related tool calls and their results together for better readability
- **Path Relativization**: Converts absolute file paths to relative paths based on current working directory
- **Content Detection**: Automatically detects file types and applies appropriate syntax highlighting
- **HTML Generation**: Creates collapsible `<details>` sections for tool results with descriptive summaries

## Key Components

- `process_message()`: Main message router based on message type
- `flush_pending_tool_results()`: Groups and displays tool results with appropriate formatting
- `create_tool_result_list_summary()`: Generates meaningful summaries for tool calls
- `detect_language()`: Infers syntax highlighting language from file paths
- `make_relative_path()`: Converts absolute paths to relative paths when possible

## Tool Result Formatting

The script recognizes and formats different types of tool results:
- File reads (with line numbers) → Syntax-highlighted code blocks
- Search results → Plain text blocks
- Command execution → Command output blocks
- File operations → Success/failure messages