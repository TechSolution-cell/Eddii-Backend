import { Transform } from 'class-transformer';

/**
 * Convert to lowercase (does not trim).
 * - If value is null/undefined, returns it as-is.
 * - Coerces non-strings to string first.
 */
export function ToLower() {
    return Transform(({ value }) => {
        if (value == null) return value;
        return String(value).toLowerCase();
    });
}

export * from './number.util';
export * from './trim.util';