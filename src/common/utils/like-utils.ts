// like-utils.ts
/**
 * Utilities for safely building SQL LIKE/ILIKE patterns.
 * Defaults to backslash (`\`) as the escape character, which is what TypeORM uses.
 */

/** Escape special regex chars (internal helper). */
function escapeRegExp(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Escapes %, _ and the escape character itself so they are treated as literals in LIKE.
 *
 * @example
 * escapeLike('50%_done') => '50\%\_done'
 * escapeLike('C:\path\file') => 'C:\\path\\file'
 *
 * @param input       Any value; will be coerced to string.
 * @param escapeChar  The SQL LIKE escape character. Defaults to "\".
 */
export function escapeLike(input: unknown, escapeChar = '\\'): string {
    const s = String(input);
    const rx = new RegExp(`[${escapeRegExp(escapeChar)}%_]`, 'g');
    return s.replace(rx, (m) => escapeChar + m);
}

/**
 * Wraps a string for SQL LIKE/ILIKE '%value%'.
 */
export function likeContains(input: unknown, escapeChar = '\\'): string {
    return `%${escapeLike(input, escapeChar)}%`;
}

/**
 * Wraps a string for SQL LIKE/ILIKE 'value%'.
 */
export function likeStartsWith(input: unknown, escapeChar = '\\'): string {
    return `${escapeLike(input, escapeChar)}%`;
}

/**
 * Wraps a string for SQL LIKE/ILIKE '%value'.
 */
export function likeEndsWith(input: unknown, escapeChar = '\\'): string {
    return `%${escapeLike(input, escapeChar)}`;
}
