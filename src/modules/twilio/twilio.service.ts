import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { retry } from 'src/common/utils';
import { ConfigService } from '../../config/config.service';
import twilio, { twiml, validateRequest, Twilio } from 'twilio';
import { AvailableNumberResponseDto } from '../call-tracking/dto/available-number-response.dto';

interface BuyNumberOpts {
    phoneNumber?: string;
    country?: string;   // default US
    areaCode?: number;
    voiceUrlPath: string;
    statusCallbackPath: string;
}

type ReleaseResult =
    | { released: true; sid: string; phoneNumber?: string }
    | { released: false; reason: 'not_found' | 'multiple_matches' | 'no_input' | 'lookup_failed' | 'twilio_error'; detail?: any };

@Injectable()
export class TwilioService {
    private client: Twilio;
    private readonly logger = new Logger(TwilioService.name);
    constructor(private readonly cfg: ConfigService) {
        this.client = twilio(this.cfg.twilioAccountSid, this.cfg.twilioAuthToken);
    }

    /**
     * Verify X-Twilio-Signature header. Provide absolute URL from config base + path.
     */
    verifyOrThrow(
        path: string,
        params?: Record<string, string | string[]> | null,
        signature?: string,
    ): void {
        try {
            const url = `${this.cfg.twilioWebhookBase}${path}`;
            const token = this.cfg.twilioAuthToken;

            if (!token) {
                throw new UnauthorizedException('Missing Twilio auth token');
            }

            if (!signature) {
                throw new UnauthorizedException('Missing X-Twilio-Signature header');
            }

            // Normalize params so validateRequest never sees null/undefined
            const safeParams = params ?? {};

            const ok = validateRequest(token, signature, url, safeParams);

            if (!ok) {
                throw new UnauthorizedException('Invalid Twilio signature');
            }
        } catch (err: any) {
            throw new UnauthorizedException('Invalid Twilio signature');
        }
    }

    async listAvailableNumbers({ country = 'US', areaCode, region, limit = 10 }:
        {
            country?: string;
            areaCode?: string | number;
            region?: string;
            limit?: number
        } = {}
    ): Promise<AvailableNumberResponseDto[]> {
        // Normalize area code & counrty
        const normalizedCountry = country.toUpperCase();
        const parsedAreaCode = typeof areaCode === 'string'
            ? parseInt(areaCode, 10)
            : areaCode;

        // Normalize region (e.g., "CA", "NY")
        const normalizedRegion = region?.toUpperCase();

        // Build query options dynamically
        const queryOptions: any = {
            voiceEnabled: true,
            limit,
        };

        if (parsedAreaCode) {
            queryOptions.areaCode = parsedAreaCode;
        }
        if (normalizedRegion) {
            queryOptions.inRegion = normalizedRegion;
        }
        const list = await this.client.availablePhoneNumbers(normalizedCountry).local.list(queryOptions);

        return list.map((n: any): AvailableNumberResponseDto => ({
            phoneNumber: n.phoneNumber,      // E.164
            friendlyName: n.friendlyName,    // e.g., "(415) 555-0123"
            locality: n.locality,            // city
            region: n.region,                // state
            isoCountry: n.isoCountry,        // "US"
            lata: (n as any).lata,
            rateCenter: (n as any).rateCenter,
            beta: (n as any).beta,
            capabilities: {
                voice: (n as any).capabilities.voice,
                sms: (n as any).capabilities.SMS,
                mms: (n as any).capabilities.MMS,
            },
        }));
    }

    async buyIncomingNumber(opts: BuyNumberOpts) {
        const voiceUrl = `${this.cfg.twilioWebhookBase}${opts.voiceUrlPath}`;
        const statusCallback = `${this.cfg.twilioWebhookBase}${opts.statusCallbackPath}`;

        let phoneNumber = opts?.phoneNumber;

        try {
            if (!phoneNumber) {
                const country = opts.country ?? 'US';
                const params: any = {
                    voiceEnabled: true,
                    limit: 1,
                };

                if (opts.areaCode != null) {
                    // typically a 3-digit string for US/CA like "415"
                    params.areaCode = String(opts.areaCode);
                }

                const list = await this.client.availablePhoneNumbers(country).local.list(params);
                if (!list.length) {
                    throw new Error('No available phone numbers found with the specified filters');
                }
                phoneNumber = list[0].phoneNumber!;
            }

            const incoming = await this.client.incomingPhoneNumbers.create({
                phoneNumber,
                voiceUrl,
                voiceMethod: 'POST',
                statusCallback,
                statusCallbackMethod: 'POST',
            });

            return {
                trackingNumber: incoming.phoneNumber!,
                phoneSid: incoming.sid
            };
        } catch (e: any) {
            // Twilio uses 400/409 for unavailable numbers
            if (opts.phoneNumber) {
                throw new Error('Selected number is no longer available. Please refresh the list and try again.');
            }
            throw e;
        }
    }

    async releaseIncomingNumber({
        phoneSid,
        phoneNumber,
        retries = 1,
        strictNumberMatch = true, // if true, require exact number match when resolving SID
    }: {
        phoneSid?: string;
        phoneNumber?: string;
        retries?: number;       // number of retry attempts on Twilio errors
        retryDelayMs?: number;  // initial backoff (will double each retry)
        strictNumberMatch?: boolean;
    }): Promise<ReleaseResult> {
        let sid = phoneSid?.trim();
        const inputNumber = phoneNumber?.trim();

        if (!sid && !inputNumber) {
            return { released: false, reason: 'no_input' };
        }

        // 1) Resolve SID from number if not provided
        if (!sid && inputNumber) {
            try {
                // Twilio API: list by phoneNumber returns at most 1 match when using exact E.164;
                // some accounts may return none if formatting differs.
                // We'll query a few and exact-match filter if strictNumberMatch=true.
                const matches = await this.client.incomingPhoneNumbers.list({
                    phoneNumber: inputNumber,
                    limit: 5,
                });

                // If strict, enforce exact phoneNumber match (E.164)
                let match = matches[0];
                if (strictNumberMatch && matches.length > 0) {
                    match = matches.find((m) => m.phoneNumber === inputNumber) ?? matches[0];
                }

                if (!match) {
                    this.logger.warn?.(`[releaseIncomingNumber] No number found for ${inputNumber}`);
                    return { released: false, reason: 'not_found' };
                }

                // If more than 1 and strict requested, warn caller (could also choose first deterministically)
                if (strictNumberMatch && matches.length > 1) {
                    this.logger?.warn?.(
                        `[releaseIncomingNumber] Multiple matches for ${inputNumber}; using the first exact match`
                    );
                }

                sid = match.sid;
            } catch (e: any) {
                this.logger?.error?.(`[releaseIncomingNumber] Number lookup failed: ${e?.message || e}`);
                return { released: false, reason: 'lookup_failed', detail: e };
            }
        }

        if (!sid) return { released: false, reason: 'lookup_failed' };

        try {
            await retry(async () => {
                try {
                    await this.client.incomingPhoneNumbers(sid!).remove();
                } catch (e: any) {
                    const code = e?.code ?? e?.status;
                    if (code === 20404) { // already released
                        this.logger.log?.(
                            `[releaseIncomingNumber] SID ${sid} not found (already released). Treating as success.`
                        );
                        return;
                    }
                    // retry only for 5xx or 429; otherwise throw through
                    const msg = e?.message ?? '';
                    if (code === 429 || (typeof code === 'number' && code >= 500) || /ECONNRESET|ETIMEDOUT|ENETUNREACH/i.test(msg)) throw e;
                }
            }, { retries });

            return { released: true, sid, phoneNumber: inputNumber };
        } catch (e: any) {
            return { released: false, reason: 'twilio_error', detail: e };
        }
    }

    buildForwardTwiML(forwardingNumber: string, callerIdE164: string) {
        const vr = new twiml.VoiceResponse();

        const dial = vr.dial({
            callerId: callerIdE164, // <-- FIX: pass the tracking number here
            record: 'record-from-answer-dual',
            recordingStatusCallback: `${this.cfg.twilioWebhookBase}/twilio/recording`,
            recordingStatusCallbackEvent: ['completed'], // fire when ready
        });

        dial.number({}, forwardingNumber);
        return vr.toString();
    }
}
