import { Injectable, Logger } from '@nestjs/common';
import { createClient, DeepgramClient } from '@deepgram/sdk';
import { ConfigService } from 'src/config/config.service';
// import { TranscriptionSummary, Turn, Role } from './transcription.types';

// Minimal types for storing and processing transcripts
export type Role = 'salesperson' | 'client' | 'unknown';

export interface Turn {
    role: Role;            // filled after role assignment
    speakerId: string;     // "0" | "1" | "unknown" (Deepgram diarization id)
    start: number;         // seconds
    end: number;           // seconds
    text: string;          // transcript text for this turn
}

export interface TranscriptionSummary {
    turns: Turn[];
    fullText: string;
    language?: string | null;
    durationSec?: number | null;
}


@Injectable()
export class TranscriptionService {
    private readonly logger = new Logger(TranscriptionService.name);
    private readonly dg: DeepgramClient;

    constructor(private readonly cfg: ConfigService) {
        const key = this.cfg.deepgramApiKey;
        if (!key) throw new Error('DEEPGRAM_API_KEY is not set');
        this.dg = createClient(key);
    }

    /** Convert Deepgram utterances to minimal "turns" with role=unknown */
    private toTurns(
        utterances: Array<{ start: number; end: number; transcript: string; speaker?: number }>,
        opts?: { maxSilenceGapSec?: number; maxTurnChars?: number }
    ): Turn[] {
        const maxSilenceGapSec = opts?.maxSilenceGapSec ?? 1.5; // merge if gap <= 1.5s
        const maxTurnChars = opts?.maxTurnChars ?? 800;         // prevent giant turns

        if (!utterances?.length) return [];

        // Normalize
        const items = [...utterances]
            .filter(u => u && typeof u.start === 'number' && u.transcript)

        const turns: Turn[] = [];

        const normText = (s: string) =>
            s.replace(/\s+/g, ' ').trim();

        const speakerOf = (u: { speaker?: number }) =>
            (typeof u.speaker === 'number' ? String(u.speaker) : 'unknown');

        for (const u of items) {
            const text = normText(u.transcript || '');
            if (!text) continue;

            const sid = speakerOf(u);
            const start = u.start;
            const end = typeof u.end === 'number' ? u.end : u.start;

            const lastTurn = turns[turns.length - 1];

            const canMerge =
                !!lastTurn &&
                lastTurn.speakerId === sid &&
                isFinite(lastTurn.end) &&
                isFinite(start) &&
                (start - lastTurn.end) <= maxSilenceGapSec &&
                (lastTurn.text.length + 1 + text.length) <= maxTurnChars;

            if (canMerge) {
                lastTurn.text = `${lastTurn.text}${needsSpace(lastTurn.text, text) ? ' ' : ''}${text}`;
                lastTurn.end = Math.max(lastTurn.end, end);
            } else {
                // Start a new turn
                turns.push({
                    role: 'unknown',
                    speakerId: sid,
                    start,
                    end,
                    text,
                });
            }
        }

        return turns;

        function needsSpace(a: string, b: string) {
            // Add a space when joining unless `a` already ends with punctuation or `b` starts with punctuation
            const aEnd = a.slice(-1);
            const bStart = b.slice(0, 1);
            const endPunct = /[.,;:!?]/.test(aEnd);
            const startPunct = /[.,;:!?]/.test(bStart);
            return !(endPunct || startPunct);
        }
    }

    /**
     * Summarize Deepgram-style utterances into a compact transcript.
     * - Merges adjacent utterances into speaker turns (`toTurns`).
     * - Joins turn texts into `fullText`.
     * - Adds optional `language` and rounded `durationSec`.
     * 
     * @param utterances Deepgram utterances ({ start, end, transcript, speaker }).
     * @param meta Optional { language, duration } in seconds.
     * @returns {TranscriptionSummary} { turns, fullText, language, durationSec }.
     */
    private summarize(
        utterances: Array<{
            start: number;
            end: number;
            transcript: string;
            speaker?: number
        }>,
        meta?: {
            language?: string | null;
            duration?: number | null
        }
    ): TranscriptionSummary {
        const turns = this.toTurns(utterances);
        const fullText = turns.map(t => t.text).join(' ').trim();
        return {
            turns,
            fullText,
            language: meta?.language ?? null,
            durationSec: typeof meta?.duration === 'number' ? Math.round(meta.duration) : null,
        };
    }

    /**
     * Transcribe by URL (e.g., S3 presigned) → minimal structure.
     */
    async transcribeUrl(url: string, opts?: { phonecall?: boolean }): Promise<TranscriptionSummary | undefined> {
        try {
            const { result: dgResp } = await this.dg.listen.prerecorded.transcribeUrl(
                { url },
                {
                    model: opts?.phonecall ? 'nova-2-phonecall' : 'nova-3',
                    smart_format: true,
                    diarize: true,
                    punctuate: true,
                    utterances: true,
                }
            );

            const utterances = dgResp?.results?.utterances ?? [];
            return this.summarize(utterances as any, {
                language: 'en',
                duration: dgResp?.metadata?.duration ?? null,
            });
        } catch (err) {
            this.logger.error(`Deepgram URL transcription failed: ${err}`);
            return undefined;
        }
    }

    /**
     * Transcribe a buffer using Deepgram prerecorded API → minimal structure.
     * (Diarization + utterances required; multichannel optional)
     */
    async transcribeBuffer(audio: Buffer, mimeType: string): Promise<TranscriptionSummary | undefined> {
        try {
            const { result: dgResp } = await this.dg.listen.prerecorded.transcribeFile(audio, {
                mimetype: mimeType,
                model: 'nova-2-phonecall',
                smart_format: true,
                diarize: true,
                punctuate: true,
                utterances: true,
            });

            const utterances = dgResp?.results?.utterances ?? [];
            return this.summarize(utterances as any, {
                language: 'en',
                duration: dgResp?.metadata?.duration ?? null,
            });
        } catch (err) {
            this.logger.error(`Deepgram transcription failed: ${err}`);
            return undefined;
        }
    }
}
