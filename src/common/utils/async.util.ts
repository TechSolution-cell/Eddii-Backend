/**
 * Sleep for `ms`. If an AbortSignal is provided, rejects on abort.
 */
export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
        if (signal?.aborted) return reject(new DOMException('Aborted', 'AbortError'));
        const t = setTimeout(resolve, Math.max(0, ms));
        signal?.addEventListener('abort', () => {
            clearTimeout(t);
            reject(new DOMException('Aborted', 'AbortError'));
        }, { once: true });
    });
}

// src/common/utils/async.util.ts
// export function sleep(ms: number) {
//     return new Promise((r) => setTimeout(r, Math.max(0, ms)));
// }


export type RetryOptions = {
    retries?: number;          // default 0 (try once, no retries)
    minDelayMs?: number;       // starting backoff, default 300
    maxDelayMs?: number;       // cap backoff, default 10_000
    factor?: number;           // exponential factor, default 2
    jitter?: boolean;          // add +/- 30% jitter, default true
    signal?: AbortSignal;      // optional cancel
    onRetry?: (err: unknown, attempt: number, delayMs: number) => void;
    shouldRetry?: (err: unknown, attempt: number) => boolean; // default: true
};

/**
 * Retries an async fn with exponential backoff (and optional jitter).
 * Throws the last error if all retries fail.
 */
export async function retry<T>(
    fn: () => Promise<T>,
    {
        retries = 0,
        minDelayMs = 300,
        maxDelayMs = 10_000,
        factor = 2,
        jitter = true,
        signal,
        onRetry,
        shouldRetry = () => true,
    }: RetryOptions = {}
): Promise<T> {
    let attempt = 0;
    // attempt = 0 => first call (no delay), then wait, then next calls
    while (true) {
        try {
            if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
            return await fn();
        } catch (err) {
            if (attempt >= retries || !shouldRetry(err, attempt)) {
                throw err;
            }
            const base = Math.min(maxDelayMs, minDelayMs * Math.pow(factor, attempt));
            // +/- 30% jitter to avoid sync retries
            const delay = jitter ? Math.round(base * (0.7 + Math.random() * 0.6)) : base;
            onRetry?.(err, attempt + 1, delay);
            await sleep(delay, signal);
            attempt += 1;
        }
    }
}

/**
 * Wrap a promise with a timeout.
 */
export async function withTimeout<T>(
    promise: Promise<T>,
    ms: number,
    message = 'Operation timed out',
    signal?: AbortSignal
): Promise<T> {
    const timeout = new Promise<never>((_, reject) => {
        const t = setTimeout(() => reject(new Error(message)), Math.max(0, ms));
        signal?.addEventListener('abort', () => {
            clearTimeout(t);
            reject(new DOMException('Aborted', 'AbortError'));
        }, { once: true });
    });
    return Promise.race([promise, timeout]);
}

