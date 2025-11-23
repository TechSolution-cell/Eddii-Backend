import { Transform } from 'class-transformer';

/**
 * Trim value; if result is empty string, return undefined.
 * Works with non-strings by coercing to string first.
 */
export function TrimOrUndefined() {
    return Transform(({ value }) => {
        if (value == null) return undefined;            // null or undefined
        const v = String(value).trim();
        return v.length ? v : undefined;
    });
}

/**
 * Trim value; if result is empty string, return null.
 */
export function TrimOrNull() {
    return Transform(({ value }) => {
        if (value == null) return null;
        const v = String(value).trim();
        return v.length ? v : null;
    });
}

/**
 * Just trim (never converts to undefined/null).
 */
export function Trim() {
    return Transform(({ value }) => {
        if (value == null) return value;
        return String(value).trim();
    });
}

/**
 * Optional: trim + collapse internal whitespace (e.g., "  a   b \n c " -> "a b c").
 * If result empty, returns undefined.
 */
export function TrimCollapseOrUndefined() {
    return Transform(({ value }) => {
        if (value == null) return undefined;
        let v = String(value).trim().replace(/\s+/g, ' ');
        return v.length ? v : undefined;
    });
}

/**
 * Trim + collapse internal whitespace (e.g., "  a   b \n c " -> "a b c").
 * If result empty, returns "" (empty string), not undefined — useful for updates.
 */
export function TrimCollapseKeepEmpty() {
    return Transform(({ value }) => {
        if (value == null) return undefined; // keep 'no value' semantics the same
        const v = String(value).trim().replace(/\s+/g, ' ');
        return v; // returns "" if empty after trimming
    });
}

