import { describe, it, expect, beforeEach } from 'vitest';
import { makeRelativePath } from './paths.js';
import * as path from 'path';

describe('makeRelativePath', () => {
  const originalCwd = process.cwd();

  beforeEach(() => {
    // Reset to original working directory
    process.chdir(originalCwd);
  });

  describe('basic relativization', () => {
    it('should make absolute paths relative to cwd', () => {
      const cwd = process.cwd();
      const absolutePath = path.join(cwd, 'src', 'test.js');
      
      const result = makeRelativePath(absolutePath);
      
      expect(result).toBe('src/test.js');
    });

    it('should return relative paths unchanged', () => {
      const relativePath = 'src/test.js';
      
      const result = makeRelativePath(relativePath);
      
      expect(result).toBe('src/test.js');
    });

    it('should handle paths starting with ./', () => {
      const relativePath = './src/test.js';
      
      const result = makeRelativePath(relativePath);
      
      // The function normalizes ./ to just the relative path
      expect(result).toBe('src/test.js');
    });

    it('should handle paths starting with ../', () => {
      const relativePath = '../parent/test.js';
      
      const result = makeRelativePath(relativePath);
      
      expect(result).toBe('../parent/test.js');
    });
  });

  describe('nested directory handling', () => {
    it('should handle deeply nested paths', () => {
      const cwd = process.cwd();
      const deepPath = path.join(cwd, 'src', 'components', 'ui', 'Button.tsx');
      
      const result = makeRelativePath(deepPath);
      
      expect(result).toBe('src/components/ui/Button.tsx');
    });

    it('should handle paths outside of cwd', () => {
      const cwd = process.cwd();
      const parentPath = path.join(path.dirname(cwd), 'other-project', 'file.js');
      
      const result = makeRelativePath(parentPath);
      
      expect(result).toContain('../');
      expect(result).toContain('other-project/file.js');
    });
  });

  describe('platform-specific paths', () => {
    it('should normalize path separators', () => {
      const cwd = process.cwd();
      // Create a path with backslashes (simulating Windows path on Unix)
      const pathWithBackslashes = cwd + '/src\\test\\file.js';
      
      const result = makeRelativePath(pathWithBackslashes);
      
      // The function normalizes backslashes to forward slashes
      expect(result).toBe('src/test/file.js');
    });

    it('should handle Windows-style absolute paths on Unix', () => {
      if (process.platform !== 'win32') {
        const windowsPath = 'C:\\Users\\test\\project\\file.js';
        
        const result = makeRelativePath(windowsPath);
        
        // The function converts backslashes to forward slashes
        expect(result).toBe('C:/Users/test/project/file.js');
      }
    });
  });

  describe('special cases', () => {
    it('should handle empty strings', () => {
      const result = makeRelativePath('');
      expect(result).toBe('');
    });

    it('should handle single filenames', () => {
      const cwd = process.cwd();
      const filePath = path.join(cwd, 'package.json');
      
      const result = makeRelativePath(filePath);
      
      expect(result).toBe('package.json');
    });

    it('should handle current directory path', () => {
      const cwd = process.cwd();
      
      const result = makeRelativePath(cwd);
      
      expect(result).toBe('.');
    });

    it('should handle paths with spaces', () => {
      const cwd = process.cwd();
      const pathWithSpaces = path.join(cwd, 'my folder', 'my file.txt');
      
      const result = makeRelativePath(pathWithSpaces);
      
      expect(result).toBe('my folder/my file.txt');
    });

    it('should handle paths with special characters', () => {
      const cwd = process.cwd();
      const pathWithSpecialChars = path.join(cwd, 'file-name_with.special@chars.txt');
      
      const result = makeRelativePath(pathWithSpecialChars);
      
      expect(result).toBe('file-name_with.special@chars.txt');
    });
  });

  describe('symlinks and resolved paths', () => {
    it('should handle already resolved absolute paths', () => {
      const cwd = process.cwd();
      const absolutePath = path.resolve(cwd, 'src', 'test.js');
      
      const result = makeRelativePath(absolutePath);
      
      expect(result).toBe('src/test.js');
    });

    it('should handle paths with redundant segments', () => {
      const cwd = process.cwd();
      const redundantPath = path.join(cwd, 'src', '..', 'src', 'test.js');
      
      const result = makeRelativePath(redundantPath);
      
      expect(result).toBe('src/test.js');
    });
  });

  describe('edge cases', () => {
    it('should handle null and undefined', () => {
      expect(makeRelativePath(null as any)).toBe('');
      expect(makeRelativePath(undefined as any)).toBe('');
    });

    it('should handle non-string inputs gracefully', () => {
      expect(makeRelativePath(123 as any)).toBe('123');
      expect(makeRelativePath({} as any)).toBe('[object Object]');
    });

    it('should handle very long paths', () => {
      const cwd = process.cwd();
      const longSegment = 'a'.repeat(100);
      const longPath = path.join(cwd, longSegment, 'file.txt');
      
      const result = makeRelativePath(longPath);
      
      expect(result).toBe(`${longSegment}/file.txt`);
    });
  });

  describe('root directory handling', () => {
    it('should handle root directory paths', () => {
      if (process.platform === 'win32') {
        const rootPath = 'C:\\file.txt';
        const result = makeRelativePath(rootPath);
        expect(result).toBe(rootPath);
      } else {
        const rootPath = '/file.txt';
        const result = makeRelativePath(rootPath);
        expect(result).toContain('../');
      }
    });

    it('should handle home directory paths', () => {
      const homePath = '~/Documents/file.txt';
      const result = makeRelativePath(homePath);
      expect(result).toBe(homePath);
    });
  });

  describe('different working directories', () => {
    it('should respect current working directory changes', () => {
      const tempDir = path.join(process.cwd(), 'src');
      
      try {
        // Change to src directory
        process.chdir('src');
        
        const absolutePath = path.join(tempDir, 'test.js');
        const result = makeRelativePath(absolutePath);
        
        expect(result).toBe('test.js');
      } finally {
        // Always restore original directory
        process.chdir(originalCwd);
      }
    });
  });
});