import { TIME_FORMATS } from '../types/constants.js';

/**
 * Check if a timestamp is valid
 */
export function isValidTimestamp(timestamp: string): boolean {
  if (!timestamp || timestamp.trim() === '') {
    return false;
  }
  
  // Skip UUIDs
  if (TIME_FORMATS.UUID_REGEX.test(timestamp)) {
    return false;
  }
  
  // Check for standard date formats
  if (TIME_FORMATS.TIMESTAMP_REGEX.test(timestamp)) {
    return true;
  }
  
  if (TIME_FORMATS.DATE_REGEX.test(timestamp)) {
    return true;
  }
  
  // Check for Unix timestamps
  if (TIME_FORMATS.UNIX_TIMESTAMP_REGEX.test(timestamp) || 
      TIME_FORMATS.UNIX_TIMESTAMP_MS_REGEX.test(timestamp)) {
    return true;
  }
  
  // Try to parse as date
  try {
    const parsed = new Date(timestamp);
    return !isNaN(parsed.getTime());
  } catch {
    return false;
  }
}

/**
 * Parse timestamp into Date object
 */
export function parseTimestamp(timestamp: string): Date {
  if (!timestamp || timestamp.trim() === '') {
    return new Date(0);
  }
  
  // ISO timestamp
  if (TIME_FORMATS.TIMESTAMP_REGEX.test(timestamp)) {
    return new Date(timestamp);
  }
  
  // Date only
  if (TIME_FORMATS.DATE_REGEX.test(timestamp)) {
    return new Date(timestamp);
  }
  
  // Unix timestamp (seconds)
  if (TIME_FORMATS.UNIX_TIMESTAMP_REGEX.test(timestamp)) {
    return new Date(parseInt(timestamp, 10) * 1000);
  }
  
  // Unix timestamp (milliseconds)
  if (TIME_FORMATS.UNIX_TIMESTAMP_MS_REGEX.test(timestamp)) {
    return new Date(parseInt(timestamp, 10));
  }
  
  // Try to parse as date
  try {
    const parsed = new Date(timestamp);
    return isNaN(parsed.getTime()) ? new Date(0) : parsed;
  } catch {
    return new Date(0);
  }
}

/**
 * Clean and normalize summary text
 */
export function cleanSummary(text: string): string {
  if (!text) {
    return text;
  }
  
  // Remove line breaks and normalize whitespace
  let cleaned = text.replace(/\s+/g, ' ').trim();
  
  // Remove trailing dots
  cleaned = cleaned.replace(/\.+$/, '');
  
  return cleaned;
}

/**
 * Format relative time (similar to Ruby script)
 */
export function formatRelativeTime(time: Date): string {
  const now = new Date();
  const diff = Math.floor((now.getTime() - time.getTime()) / 1000);
  
  if (diff < 60) {
    return `${diff} second${diff === 1 ? '' : 's'} ago`;
  }
  
  if (diff < 3600) {
    const minutes = Math.floor(diff / 60);
    return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  }
  
  if (diff < 86400) {
    const hours = Math.floor(diff / 3600);
    return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  }
  
  if (diff < 604800) {
    const days = Math.floor(diff / 86400);
    return `${days} day${days === 1 ? '' : 's'} ago`;
  }
  
  if (diff < 2419200) {
    const weeks = Math.floor(diff / 604800);
    return `${weeks} week${weeks === 1 ? '' : 's'} ago`;
  }
  
  const months = Math.floor(diff / 2419200);
  return `${months} month${months === 1 ? '' : 's'} ago`;
}

/**
 * Truncate string to specified length
 */
export function truncate(str: string, length: number): string {
  if (!str || str.length <= length) {
    return str;
  }
  
  return str.substring(0, length - 3) + '...';
}

/**
 * Format timestamp for display
 */
export function formatTimestamp(timestamp: string): string {
  const date = parseTimestamp(timestamp);
  
  if (date.getTime() === 0) {
    return 'Unknown';
  }
  
  return date.toLocaleString();
}

/**
 * Get display time for session list
 */
export function getDisplayTime(timestamp: string): string {
  const date = parseTimestamp(timestamp);
  
  if (date.getTime() === 0) {
    return 'Unknown';
  }
  
  return formatRelativeTime(date);
}