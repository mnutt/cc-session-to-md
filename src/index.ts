#!/usr/bin/env node

import { Command } from 'commander';
import { MarkdownFormatter } from './formatters/MarkdownFormatter.js';
import { SessionParser } from './parsers/SessionParser.js';
import { DEFAULT_FORMATTING_OPTIONS } from './types/constants.js';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const program = new Command();

program
  .name('cc2md')
  .description('Convert Claude Code session logs to readable Markdown documentation')
  .version('1.0.0');

program
  .command('convert')
  .description('Convert JSONL input to markdown')
  .option('-i, --input <file>', 'Input JSONL file (default: stdin)')
  .option('-o, --output <file>', 'Output markdown file (default: stdout)')
  .option('--no-syntax-highlighting', 'Disable syntax highlighting')
  .option('--no-relative-paths', 'Disable path relativization')
  .option('--no-truncate', 'Disable truncation of long output')
  .option('--max-lines <number>', 'Maximum lines for truncation', '50')
  .action(async (options) => {
    try {
      const input = options.input ? fs.readFileSync(options.input, 'utf8') : await readStdin();
      
      const formatter = new MarkdownFormatter({
        syntaxHighlighting: options.syntaxHighlighting !== false,
        relativizePaths: options.relativePaths !== false,
        truncateLongOutput: options.truncate !== false,
        maxLines: parseInt(options.maxLines, 10)
      });
      
      const markdown = formatter.convertInput(input);
      
      if (options.output) {
        fs.writeFileSync(options.output, markdown);
        console.log(`Converted session to ${options.output}`);
      } else {
        console.log(markdown);
      }
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

program
  .command('browse')
  .description('Browse Claude Code sessions interactively')
  .option('-p, --projects-dir <dir>', 'Claude projects directory', '~/.claude/projects')
  .action(async (options) => {
    try {
      const { SessionBrowser } = await import('./ui/SessionBrowser.js');
      const browser = new SessionBrowser(options.projectsDir);
      await browser.run();
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

program
  .command('validate')
  .description('Validate JSONL input')
  .option('-i, --input <file>', 'Input JSONL file (default: stdin)')
  .action(async (options) => {
    try {
      const input = options.input ? fs.readFileSync(options.input, 'utf8') : await readStdin();
      
      const formatter = new MarkdownFormatter();
      const validation = formatter.validateInput(input);
      
      if (validation.valid) {
        console.log('✅ Input is valid');
        
        const stats = formatter.getInputStats(input);
        console.log(`📊 Stats: ${stats.totalSessions} sessions, ${stats.totalMessages} messages`);
        console.log(`   User: ${stats.messagesByType.user}, Assistant: ${stats.messagesByType.assistant}, Summary: ${stats.messagesByType.summary}`);
      } else {
        console.log('❌ Input has validation errors:');
        validation.errors.forEach(error => {
          console.log(`   ${error}`);
        });
        process.exit(1);
      }
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

program
  .command('stats')
  .description('Show statistics about JSONL input')
  .option('-i, --input <file>', 'Input JSONL file (default: stdin)')
  .action(async (options) => {
    try {
      const input = options.input ? fs.readFileSync(options.input, 'utf8') : await readStdin();
      
      const formatter = new MarkdownFormatter();
      const stats = formatter.getInputStats(input);
      
      console.log('📊 Session Statistics:');
      console.log(`   Total lines: ${stats.totalLines}`);
      console.log(`   Total sessions: ${stats.totalSessions}`);
      console.log(`   Total messages: ${stats.totalMessages}`);
      console.log(`   Messages by type:`);
      console.log(`     User: ${stats.messagesByType.user}`);
      console.log(`     Assistant: ${stats.messagesByType.assistant}`);
      console.log(`     Summary: ${stats.messagesByType.summary}`);
      
      // Show session summaries
      const sessionSummary = formatter.getSessionSummary(input);
      if (sessionSummary) {
        console.log('\n📝 Session Summaries:');
        sessionSummary.split('\n').forEach(line => {
          console.log(`   ${line}`);
        });
      }
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

// Default command (when no subcommand is provided)
program
  .action(async () => {
    try {
      // Check if stdin has data available (is being piped to)
      if (process.stdin.isTTY) {
        // No pipe detected, launch browse mode
        const { SessionBrowser } = await import('./ui/SessionBrowser.js');
        const browser = new SessionBrowser('~/.claude/projects');
        await browser.run();
      } else {
        // Data is being piped, process it as before
        const input = await readStdin();
        
        const formatter = new MarkdownFormatter(DEFAULT_FORMATTING_OPTIONS);
        const markdown = formatter.convertInput(input);
        
        console.log(markdown);
      }
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

// Helper function to read from stdin
async function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    
    process.stdin.setEncoding('utf8');
    
    process.stdin.on('readable', () => {
      let chunk;
      while (null !== (chunk = process.stdin.read())) {
        data += chunk;
      }
    });
    
    process.stdin.on('end', () => {
      resolve(data);
    });
    
    process.stdin.on('error', reject);
  });
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

// Parse command line arguments
program.parse();

// If no arguments provided, show help
if (process.argv.length === 2) {
  program.help();
}