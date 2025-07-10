import { describe, it, expect } from 'vitest';
import { detectLanguageFromPath } from './language.js';

describe('detectLanguageFromPath', () => {
  describe('JavaScript and TypeScript', () => {
    it('should detect JavaScript files', () => {
      expect(detectLanguageFromPath('/test/file.js')).toBe('javascript');
      expect(detectLanguageFromPath('/test/file.jsx')).toBe('javascript');
      expect(detectLanguageFromPath('file.js')).toBe('javascript');
    });

    it('should detect TypeScript files', () => {
      expect(detectLanguageFromPath('/test/file.ts')).toBe('typescript');
      expect(detectLanguageFromPath('/test/file.tsx')).toBe('typescript');
      expect(detectLanguageFromPath('component.tsx')).toBe('typescript');
    });
  });

  describe('Other languages', () => {
    it('should detect Python files', () => {
      expect(detectLanguageFromPath('/test/script.py')).toBe('python');
      expect(detectLanguageFromPath('script.py')).toBe('python');
    });

    it('should detect Ruby files', () => {
      expect(detectLanguageFromPath('/test/script.rb')).toBe('ruby');
    });

    it('should detect C/C++ files', () => {
      expect(detectLanguageFromPath('/test/program.c')).toBe('c');
      expect(detectLanguageFromPath('/test/program.cpp')).toBe('cpp');
      expect(detectLanguageFromPath('/test/header.h')).toBe('cpp');
    });

    it('should detect other common languages', () => {
      expect(detectLanguageFromPath('/test/main.go')).toBe('go');
      expect(detectLanguageFromPath('/test/main.rs')).toBe('rust');
      expect(detectLanguageFromPath('/test/Main.java')).toBe('java');
      expect(detectLanguageFromPath('/test/index.php')).toBe('php');
    });
  });

  describe('Data formats', () => {
    it('should detect JSON files', () => {
      expect(detectLanguageFromPath('/test/data.json')).toBe('json');
      expect(detectLanguageFromPath('package.json')).toBe('json');
    });

    it('should detect YAML files', () => {
      expect(detectLanguageFromPath('/test/config.yaml')).toBe('yaml');
      expect(detectLanguageFromPath('/test/config.yml')).toBe('yaml');
    });

    it('should detect other formats', () => {
      expect(detectLanguageFromPath('/test/config.xml')).toBe('xml');
      expect(detectLanguageFromPath('/test/index.html')).toBe('html');
      expect(detectLanguageFromPath('/test/styles.css')).toBe('css');
      expect(detectLanguageFromPath('/test/README.md')).toBe('markdown');
    });
  });

  describe('Special files', () => {
    it('should detect special files', () => {
      expect(detectLanguageFromPath('Dockerfile')).toBe('dockerfile');
      expect(detectLanguageFromPath('Makefile')).toBe('makefile');
      expect(detectLanguageFromPath('.gitignore')).toBe('gitignore');
      expect(detectLanguageFromPath('.env')).toBe('dotenv');
    });
  });

  describe('Shell scripts', () => {
    it('should detect shell scripts', () => {
      expect(detectLanguageFromPath('/test/script.sh')).toBe('bash');
      expect(detectLanguageFromPath('/test/script.bash')).toBe('bash');
    });
  });

  describe('Unknown files', () => {
    it('should return empty string for unknown extensions', () => {
      expect(detectLanguageFromPath('/test/file.unknown')).toBe('');
      expect(detectLanguageFromPath('/test/file.xyz')).toBe('');
      expect(detectLanguageFromPath('/test/file')).toBe('');
    });

    it('should handle files without extensions', () => {
      expect(detectLanguageFromPath('/test/README')).toBe('');
      expect(detectLanguageFromPath('LICENSE')).toBe('');
    });

    it('should handle empty or invalid paths', () => {
      expect(detectLanguageFromPath('')).toBe('');
      expect(detectLanguageFromPath('.')).toBe('');
      expect(detectLanguageFromPath('..')).toBe('');
    });
  });

  describe('Edge cases', () => {
    it('should handle paths with multiple dots', () => {
      expect(detectLanguageFromPath('/test/file.min.js')).toBe('javascript');
      expect(detectLanguageFromPath('/test/file.d.ts')).toBe('typescript');
      expect(detectLanguageFromPath('/test/config.local.json')).toBe('json');
    });

    it('should handle paths with spaces', () => {
      expect(detectLanguageFromPath('/test/my file.js')).toBe('javascript');
      expect(detectLanguageFromPath('my script.py')).toBe('python');
    });

    it('should be case insensitive for extensions', () => {
      expect(detectLanguageFromPath('/test/file.JS')).toBe('javascript');
      expect(detectLanguageFromPath('/test/file.PY')).toBe('python');
      expect(detectLanguageFromPath('/test/file.HTML')).toBe('html');
    });
  });
});