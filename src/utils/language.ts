import { LANGUAGE_BY_EXTENSION, SPECIAL_FILE_LANGUAGES } from '../types/constants.js';
import * as path from 'path';

/**
 * Detect programming language from file path
 */
export function detectLanguageFromPath(filePath: string): string {
  if (!filePath) {
    return '';
  }

  // Check special files first
  const basename = path.basename(filePath);
  if (SPECIAL_FILE_LANGUAGES[basename]) {
    return SPECIAL_FILE_LANGUAGES[basename];
  }

  // Check extension
  const extension = path.extname(filePath).slice(1).toLowerCase();
  return LANGUAGE_BY_EXTENSION[extension] || '';
}

/**
 * Detect programming language from code content
 */
export function detectCodeLanguage(content: string): string {
  if (!content) {
    return '';
  }

  // Check for common programming language patterns
  const patterns = [
    { pattern: /^\s*(import|export|function|const|let|var|class|interface|type)/, language: 'typescript' },
    { pattern: /^\s*(def|class|import|from|if __name__)/m, language: 'python' },
    { pattern: /^\s*(public|private|protected|class|interface|package)/m, language: 'java' },
    { pattern: /^\s*(#include|int main|using namespace)/m, language: 'cpp' },
    { pattern: /^\s*(func|package|import|var|const)/m, language: 'go' },
    { pattern: /^\s*(fn|let|mut|use|impl|struct)/m, language: 'rust' },
    { pattern: /^\s*(class|def|module|require|include)/m, language: 'ruby' },
    { pattern: /^\s*(<\?php|namespace|use|class|function)/m, language: 'php' },
    { pattern: /^\s*(SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP)/mi, language: 'sql' },
    { pattern: /^\s*(\{|\[).*(\}|\])$/s, language: 'json' },
    { pattern: /^\s*(---|[a-zA-Z_][\w]*\s*:)/m, language: 'yaml' },
    { pattern: /^\s*(<[^>]+>|<!DOCTYPE)/m, language: 'html' },
    { pattern: /^\s*(\.|#)[a-zA-Z_][\w-]*\s*\{/m, language: 'css' },
    { pattern: /^\s*(#!\/bin\/bash|#!\/bin\/sh)/m, language: 'bash' }
  ];

  for (const { pattern, language } of patterns) {
    if (pattern.test(content)) {
      return language;
    }
  }

  return '';
}

/**
 * Detect if content is likely code
 */
export function isCodeContent(content: string): boolean {
  if (!content) {
    return false;
  }

  // Check for common code patterns
  const codePatterns = [
    /^(Found \d+ files|\/.*\..*$)/,
    /^\s*(import|export|function|const|let|var|class|interface|type)/,
    /^\s*(def|class|import|from|if __name__)/,
    /^\s*(public|private|protected|class|interface|package)/,
    /^\s*(#include|int main|using namespace)/,
    /^\s*(func|package|import|var|const)/,
    /^\s*(fn|let|mut|use|impl|struct)/,
    /^\s*(class|def|module|require|include)/,
    /^\s*(<\?php|namespace|use|class|function)/,
    /^\s*(\{|\[).*(\}|\])$/s,
    /^\s*(---|[a-zA-Z_][\w]*\s*:)/,
    /^\s*(<[^>]+>|<!DOCTYPE)/,
    /^\s*(\.|#)[a-zA-Z_][\w-]*\s*\{/,
    /^\s*(#!\/bin\/bash|#!\/bin\/sh)/
  ];

  return codePatterns.some(pattern => pattern.test(content));
}

/**
 * Check if content has line numbers
 */
export function hasLineNumbers(content: string): boolean {
  return /^\s*\d+→/.test(content);
}

/**
 * Strip line numbers from content
 */
export function stripLineNumbers(content: string): string {
  return content
    .split('\n')
    .map(line => line.replace(/^\s*\d+→/, ''))
    .join('\n');
}

/**
 * Get file extension from path
 */
export function getFileExtension(filePath: string): string {
  return path.extname(filePath).slice(1).toLowerCase();
}

/**
 * Get all supported languages
 */
export function getSupportedLanguages(): string[] {
  const languages = new Set<string>();
  
  Object.values(LANGUAGE_BY_EXTENSION).forEach(lang => languages.add(lang));
  Object.values(SPECIAL_FILE_LANGUAGES).forEach(lang => languages.add(lang));
  
  return Array.from(languages).sort();
}

/**
 * Check if a language is supported
 */
export function isLanguageSupported(language: string): boolean {
  const supported = getSupportedLanguages();
  return supported.includes(language.toLowerCase());
}

/**
 * Get language display name
 */
export function getLanguageDisplayName(language: string): string {
  const displayNames: { [key: string]: string } = {
    'javascript': 'JavaScript',
    'typescript': 'TypeScript',
    'python': 'Python',
    'java': 'Java',
    'cpp': 'C++',
    'c': 'C',
    'go': 'Go',
    'rust': 'Rust',
    'ruby': 'Ruby',
    'php': 'PHP',
    'sql': 'SQL',
    'json': 'JSON',
    'yaml': 'YAML',
    'xml': 'XML',
    'html': 'HTML',
    'css': 'CSS',
    'markdown': 'Markdown',
    'bash': 'Bash',
    'cmake': 'CMake',
    'makefile': 'Makefile',
    'dockerfile': 'Dockerfile',
    'gitignore': 'Git Ignore',
    'dotenv': 'Environment',
    'toml': 'TOML'
  };

  return displayNames[language.toLowerCase()] || language;
}