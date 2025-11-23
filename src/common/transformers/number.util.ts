import { Transform, TransformFnParams } from 'class-transformer';

type ToOptionalIntOptions = {
    /** Treat null-like values as undefined (default: true) */
    nullLikeAsUndefined?: boolean;
    /** If true, truncates floats to int; if false, rejects floats by leaving as-is (default: true) */
    truncate?: boolean;
};

/**
 * Coerces JSON numbers or numeric strings to an integer.
 * '' | null | undefined → undefined (optional field stays omitted)
 * '5' → 5
 *  5  → 5
 * '5.7' → 5 (if truncate=true) else remains '5.7' and will fail @IsInt
 * 'abc' → 'abc' (validation can fail later)
 */
export const ToOptionalInt = (opts: ToOptionalIntOptions = {}) =>
    Transform(({ value }: TransformFnParams) => {
        const { nullLikeAsUndefined = true, truncate = true } = opts;

        if (nullLikeAsUndefined && (value === '' || value === null || value === undefined)) {
            return undefined;
        }

        const n = Number(value);
        if (Number.isNaN(n)) return value;

        // If you only want integers, optionally truncate
        return truncate ? Math.trunc(n) : n;
    });
