import {
    BadRequestException,
    ConflictException,
} from '@nestjs/common';
import { QueryFailedError } from 'typeorm';

// Narrow type for Postgres errors
export type PgQueryError = QueryFailedError & {
    code?: string;        // e.g. '23505'
    detail?: string;
    constraint?: string;
};

/**
 * Translate TypeORM/Postgres errors into Nest HTTP exceptions
 * and throw them. Call in a `catch` block.
 */
export function handleDbError(err: unknown, fallbackMsg = 'Database error'): never {
    const e = err as PgQueryError;

    // Postgres error codes: https://www.postgresql.org/docs/current/errcodes-appendix.html
    switch (e?.code) {
        case '23505': // unique_violation
            throw new ConflictException('Duplicate value');
        case '23503': // foreign_key_violation
            throw new BadRequestException('Operation blocked by related records');
        case '23502': // not_null_violation
            throw new BadRequestException('Missing required fields');
        case '22P02': // invalid_text_representation (e.g., bad UUID)
            throw new BadRequestException('Invalid identifier');
        default:
            if (e instanceof QueryFailedError) {
                throw new BadRequestException(fallbackMsg);
            }
            // Not a DB error — rethrow to preserve original stack/type
            throw e;
    }
}

export function isRetryablePgError(err: any): boolean {
    // 40001: serialization_failure
    // 40P01: deadlock_detected
    // 23505: unique_violation (we may re-read & retry)
    const pgCode = err?.code;
    return pgCode === '40001' || pgCode === '40P01' || pgCode === '23505';
}
