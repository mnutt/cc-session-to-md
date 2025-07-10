import { describe, it, expect } from 'vitest';
import { formatTimestamp, parseTimestamp, isValidTimestamp } from './time.js';

describe('time utilities', () => {
  describe('formatTimestamp', () => {
    it('should format ISO timestamp to readable format', () => {
      const timestamp = '2024-01-01T12:30:45.123Z';
      const result = formatTimestamp(timestamp);
      
      // formatTimestamp uses toLocaleString() which varies by locale
      expect(result).toContain('2024');
    });

    it('should handle timestamps with timezone offset', () => {
      const timestamp = '2024-01-01T12:30:45-05:00';
      const result = formatTimestamp(timestamp);
      
      expect(result).toContain('2024');
    });

    it('should handle Date objects by converting to string first', () => {
      const date = new Date('2024-01-01T15:45:30.000Z');
      const result = formatTimestamp(date.toISOString());
      
      expect(result).toContain('2024');
    });

    it('should handle invalid timestamps gracefully', () => {
      const result = formatTimestamp('invalid-timestamp');
      
      expect(result).toBe('Unknown');
    });

    it('should handle null and undefined', () => {
      expect(formatTimestamp('')).toBe('Unknown');
      expect(formatTimestamp(null as any)).toBe('Unknown');
    });
  });

  describe('parseTimestamp', () => {
    it('should parse ISO timestamp strings', () => {
      const timestamp = '2024-01-01T12:30:45.123Z';
      const result = parseTimestamp(timestamp);
      
      expect(result).toEqual(new Date(timestamp));
    });

    it('should parse timestamp with timezone offset', () => {
      const timestamp = '2024-01-01T12:30:45-05:00';
      const result = parseTimestamp(timestamp);
      
      expect(result).toBeInstanceOf(Date);
      expect(result.getTime()).toBe(new Date(timestamp).getTime());
    });

    it('should handle Date object by converting to ISO string', () => {
      const date = new Date('2024-01-01T12:30:45.123Z');
      const result = parseTimestamp(date.toISOString());
      
      expect(result.getTime()).toBe(date.getTime());
    });

    it('should handle Unix timestamps as strings (milliseconds)', () => {
      const unixMs = '1704110445123';
      const result = parseTimestamp(unixMs);
      
      expect(result).toEqual(new Date(parseInt(unixMs)));
    });

    it('should handle Unix timestamps as strings (seconds)', () => {
      const unixSec = '1704110445';
      const result = parseTimestamp(unixSec);
      
      expect(result).toEqual(new Date(parseInt(unixSec) * 1000));
    });

    it('should handle invalid timestamps', () => {
      const result = parseTimestamp('invalid-timestamp');
      
      expect(result).toBeInstanceOf(Date);
      expect(result.getTime()).toBe(0); // Returns new Date(0) for invalid input
    });

    it('should handle null and undefined', () => {
      expect(parseTimestamp('')).toEqual(new Date(0));
      expect(parseTimestamp(null as any)).toEqual(new Date(0));
    });
  });

  describe('isValidTimestamp', () => {
    it('should validate ISO timestamp strings', () => {
      expect(isValidTimestamp('2024-01-01T12:30:45.123Z')).toBe(true);
      expect(isValidTimestamp('2024-01-01T12:30:45Z')).toBe(true);
    });

    it('should validate date-only strings', () => {
      expect(isValidTimestamp('2024-01-01')).toBe(true);
      expect(isValidTimestamp('2023-12-25')).toBe(true);
    });

    it('should validate Unix timestamps', () => {
      expect(isValidTimestamp('1704110445')).toBe(true);     // seconds
      expect(isValidTimestamp('1704110445123')).toBe(true);  // milliseconds
    });

    it('should reject invalid formats', () => {
      expect(isValidTimestamp('invalid-date')).toBe(false);
      expect(isValidTimestamp('not-a-timestamp')).toBe(false);
      expect(isValidTimestamp('')).toBe(false);
    });

    it('should reject UUIDs', () => {
      expect(isValidTimestamp('123e4567-e89b-12d3-a456-426614174000')).toBe(false);
    });

    it('should handle null and undefined', () => {
      expect(isValidTimestamp(null as any)).toBe(false);
      expect(isValidTimestamp(undefined as any)).toBe(false);
    });
  });

  describe('edge cases and integration', () => {
    it('should handle various timestamp formats consistently', () => {
      const isoString = '2024-01-01T12:30:45.123Z';
      const parsedFromISO = parseTimestamp(isoString);
      const formattedFromISO = formatTimestamp(isoString);
      
      expect(parsedFromISO).toBeInstanceOf(Date);
      expect(formattedFromISO).toContain('2024');
    });

    it('should format parsed timestamps consistently', () => {
      const timestamp = '2024-01-01T12:30:45.123Z';
      const parsed = parseTimestamp(timestamp);
      const formatted = formatTimestamp(parsed.toISOString());
      
      expect(formatted).toContain('2024');
    });

    it('should validate before parsing', () => {
      const validTimestamp = '2024-01-01T12:30:45.123Z';
      const invalidTimestamp = 'not-a-date';
      
      expect(isValidTimestamp(validTimestamp)).toBe(true);
      expect(isValidTimestamp(invalidTimestamp)).toBe(false);
      
      const parsedValid = parseTimestamp(validTimestamp);
      const parsedInvalid = parseTimestamp(invalidTimestamp);
      
      expect(parsedValid.getTime()).toBeGreaterThan(0);
      expect(parsedInvalid.getTime()).toBe(0);
    });

    it('should handle leap seconds and unusual dates', () => {
      const leapYear = '2024-02-29T12:00:00.000Z';
      const result = parseTimestamp(leapYear);
      
      expect(result).toBeInstanceOf(Date);
      expect(result.getMonth()).toBe(1); // February (0-indexed)
      expect(result.getDate()).toBe(29);
    });

    it('should handle daylight saving time transitions', () => {
      // Spring forward transition
      const springForward = '2024-03-10T07:00:00.000Z';
      const fallBack = '2024-11-03T06:00:00.000Z';
      
      expect(parseTimestamp(springForward)).toBeInstanceOf(Date);
      expect(parseTimestamp(fallBack)).toBeInstanceOf(Date);
    });

    it('should handle very old and very new dates', () => {
      const oldDate = '1970-01-01T00:00:00.000Z';
      const futureDate = '2099-12-31T23:59:59.999Z';
      
      const parsedOld = parseTimestamp(oldDate);
      const parsedFuture = parseTimestamp(futureDate);
      
      // Account for timezone offset - might be 1969 in local time
      expect(parsedOld.getFullYear()).toBeGreaterThanOrEqual(1969);
      expect(parsedOld.getFullYear()).toBeLessThanOrEqual(1970);
      expect(parsedFuture.getFullYear()).toBe(2099);
    });

    it('should handle microseconds precision loss gracefully', () => {
      const highPrecision = '2024-01-01T12:30:45.123456Z';
      const result = parseTimestamp(highPrecision);
      
      expect(result).toBeInstanceOf(Date);
      expect(result.getMilliseconds()).toBe(123); // JavaScript only supports milliseconds
    });
  });

  describe('performance and memory', () => {
    it('should handle large numbers of timestamp operations', () => {
      const timestamps = Array(100).fill(0).map((_, i) => 
        `2024-01-01T${String(i % 24).padStart(2, '0')}:30:45.123Z`
      );
      
      const startTime = Date.now();
      
      timestamps.forEach(timestamp => {
        const parsed = parseTimestamp(timestamp);
        const formatted = formatTimestamp(timestamp);
        const valid = isValidTimestamp(timestamp);
        
        expect(parsed).toBeInstanceOf(Date);
        expect(typeof formatted).toBe('string');
        expect(valid).toBe(true);
      });
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      // Should complete within reasonable time (less than 1 second)
      expect(duration).toBeLessThan(1000);
    });
  });
});