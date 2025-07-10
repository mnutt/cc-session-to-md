import * as path from 'path';
import * as os from 'os';

/**
 * Make a path relative to the current working directory
 */
export function makeRelativePath(filePath: string, currentCwd?: string): string {
  if (!filePath || filePath === null || filePath === undefined) {
    return filePath || '';
  }

  // Convert to string if not already
  const pathStr = String(filePath);

  // Use current working directory if not provided
  const cwd = currentCwd || process.cwd();

  try {
    const normalizedPath = path.resolve(pathStr);
    const normalizedCwd = path.resolve(cwd);
    
    // Check if the file is under the current directory
    if (normalizedPath.startsWith(normalizedCwd)) {
      const relativePath = path.relative(normalizedCwd, normalizedPath);
      // Normalize path separators to forward slashes
      return (relativePath || '.').replace(/\\/g, '/');
    }
    
    // If not under current directory, calculate relative path anyway
    const relativePath = path.relative(normalizedCwd, normalizedPath);
    return relativePath.replace(/\\/g, '/');
  } catch (error) {
    // If there's any error, return the original path
    return pathStr;
  }
}

/**
 * Normalize a file path
 */
export function normalizePath(filePath: string): string {
  if (!filePath) {
    return filePath;
  }

  // Replace ~ with home directory
  if (filePath.startsWith('~/')) {
    return path.join(os.homedir(), filePath.slice(2));
  }

  return path.normalize(filePath);
}

/**
 * Make a path relative to HOME directory
 */
export function makeRelativeToHome(filePath: string): string {
  if (!filePath) {
    return filePath;
  }

  try {
    const homeDir = os.homedir();
    const normalizedPath = path.resolve(filePath);
    const normalizedHome = path.resolve(homeDir);
    
    // Check if the path is under the home directory
    if (normalizedPath.startsWith(normalizedHome)) {
      const relativePath = path.relative(normalizedHome, normalizedPath);
      // Return with ~ prefix
      return relativePath ? `~/${relativePath.replace(/\\/g, '/')}` : '~';
    }
    
    // If not under home directory, return the original path
    return filePath;
  } catch (error) {
    // If there's any error, return the original path
    return filePath;
  }
}

/**
 * Get the directory name from a file path
 */
export function getDirectoryName(filePath: string): string {
  return path.dirname(filePath);
}

/**
 * Get the base name from a file path
 */
export function getBaseName(filePath: string): string {
  return path.basename(filePath);
}

/**
 * Get the file extension from a file path
 */
export function getExtension(filePath: string): string {
  return path.extname(filePath);
}

/**
 * Join multiple path segments
 */
export function joinPaths(...segments: string[]): string {
  return path.join(...segments);
}

/**
 * Resolve a path to an absolute path
 */
export function resolvePath(filePath: string): string {
  return path.resolve(filePath);
}

/**
 * Check if a path is absolute
 */
export function isAbsolutePath(filePath: string): boolean {
  return path.isAbsolute(filePath);
}

/**
 * Get the relative path from one location to another
 */
export function getRelativePath(from: string, to: string): string {
  return path.relative(from, to);
}

/**
 * Truncate a path for display
 */
export function truncatePath(filePath: string, maxLength: number = 50): string {
  if (!filePath || filePath.length <= maxLength) {
    return filePath;
  }

  const parts = filePath.split(path.sep);
  if (parts.length <= 2) {
    return filePath;
  }

  // Try to keep the filename and some parent directories
  const filename = parts[parts.length - 1];
  const parentDir = parts[parts.length - 2];
  
  let truncated = `...${path.sep}${parentDir}${path.sep}${filename}`;
  
  if (truncated.length <= maxLength) {
    return truncated;
  }

  // If still too long, just show the filename
  return `...${path.sep}${filename}`;
}

/**
 * Check if a path represents a directory (based on common patterns)
 */
export function looksLikeDirectory(filePath: string): boolean {
  if (!filePath) {
    return false;
  }

  // If it ends with a separator, it's likely a directory
  if (filePath.endsWith(path.sep) || filePath.endsWith('/')) {
    return true;
  }

  // If it has no extension and doesn't look like a special file, it might be a directory
  const basename = path.basename(filePath);
  const hasExtension = basename.includes('.') && !basename.startsWith('.');
  
  return !hasExtension;
}

/**
 * Get the common base path from multiple paths
 */
export function getCommonBasePath(paths: string[]): string {
  if (!paths || paths.length === 0) {
    return '';
  }

  if (paths.length === 1) {
    return path.dirname(paths[0]);
  }

  const normalizedPaths = paths.map(p => path.resolve(p));
  const segments = normalizedPaths.map(p => p.split(path.sep));
  
  if (segments.length === 0) {
    return '';
  }

  const commonSegments: string[] = [];
  const minLength = Math.min(...segments.map(s => s.length));

  for (let i = 0; i < minLength; i++) {
    const segment = segments[0][i];
    if (segments.every(s => s[i] === segment)) {
      commonSegments.push(segment);
    } else {
      break;
    }
  }

  return commonSegments.join(path.sep) || path.sep;
}

/**
 * Convert Windows paths to Unix-style paths
 */
export function toUnixPath(filePath: string): string {
  return filePath.replace(/\\/g, '/');
}

/**
 * Convert Unix paths to Windows-style paths
 */
export function toWindowsPath(filePath: string): string {
  return filePath.replace(/\//g, '\\');
}

/**
 * Get the platform-appropriate path separator
 */
export function getPathSeparator(): string {
  return path.sep;
}

/**
 * Check if two paths are the same
 */
export function pathsEqual(path1: string, path2: string): boolean {
  try {
    return path.resolve(path1) === path.resolve(path2);
  } catch {
    return path1 === path2;
  }
}