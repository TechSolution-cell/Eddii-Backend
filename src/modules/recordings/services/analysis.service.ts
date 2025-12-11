import { Inject, Injectable, Logger } from '@nestjs/common';
import OpenAI from 'openai';
import { CallDepartment, CallIntent, CallResult } from 'src/common/enums/telephony.enum';
import { Role, Turn } from './transcription.service';


type AnalysisOut = {
    intent: CallIntent | null;
    result: CallResult | null;
    department: CallDepartment | null;
    sentiment: number | null; // 1–5
};

type RoleMap = { speaker0: Role; speaker1: Role };

@Injectable()
export class AnalysisService {
    private readonly logger = new Logger(AnalysisService.name);

    constructor(@Inject('OPENAI') private readonly openai: OpenAI | null) { }

    /** Build a chronological sample:
     *  speaker0: hello...
     *  speaker1: hi...
     */
    private buildSequentialSample(
        turns: Turn[],
        opts?: { maxLines?: number; maxChars?: number; perLineLimit?: number }
    ): string {
        const maxLines = opts?.maxLines ?? 60;
        const maxChars = opts?.maxChars ?? 2500;
        const perLineLimit = opts?.perLineLimit ?? 200;

        const lines: string[] = [];
        for (const t of turns) {
            if (t.speakerId !== '0' && t.speakerId !== '1') continue;
            const text = (t.text || '').replace(/\s+/g, ' ').trim().slice(0, perLineLimit);
            if (!text) continue;
            lines.push(`speaker${t.speakerId}: ${text}`);
            if (lines.length >= maxLines) break;
        }

        // Cap total prompt size
        let out = lines.join('\n');
        if (out.length > maxChars) {
            out = out.slice(0, maxChars);
            const lastNL = out.lastIndexOf('\n');
            if (lastNL > 0) out = out.slice(0, lastNL);
        }
        return out;
    }

    // Add this helper next to buildSequentialSample()
    private buildLabeledSequentialSample(
        turns: Turn[],
        opts?: { maxLines?: number; maxChars?: number; perLineLimit?: number }
    ): string {
        const maxLines = opts?.maxLines ?? 80;
        const maxChars = opts?.maxChars ?? 3000;
        const perLineLimit = opts?.perLineLimit ?? 220;

        const lines: string[] = [];
        for (const t of turns) {
            // prefer role labels; fallback to speaker if unknown
            const label =
                t.role === 'salesperson' ? 'salesperson'
                    : t.role === 'client' ? 'client'
                        : (t.speakerId === '0' || t.speakerId === '1') ? `speaker${t.speakerId}` : 'speaker';
            const text = (t.text || '').replace(/\s+/g, ' ').trim().slice(0, perLineLimit);
            if (!text) continue;
            lines.push(`${label}: ${text}`);
            if (lines.length >= maxLines) break;
        }

        let out = lines.join('\n');
        if (out.length > maxChars) {
            out = out.slice(0, maxChars);
            const lastNL = out.lastIndexOf('\n');
            if (lastNL > 0) out = out.slice(0, lastNL);
        }
        return out;
    }

    private applyRoleMap(turns: Turn[], map: RoleMap): Turn[] {
        return turns.map(t => ({
            ...t,
            role:
                t.speakerId === '0' ? map.speaker0 :
                    t.speakerId === '1' ? map.speaker1 :
                        'unknown',
        }));
    }

    private fallbackRoleMap(turns: Turn[]): RoleMap {
        // Tiny heuristic for edge cases
        const early = turns.slice(0, 8).filter(t => t.speakerId === '0' || t.speakerId === '1');
        const score: Record<'0' | '1', number> = { '0': 0, '1': 0 };

        for (const t of early) {
            const x = t.text.toLowerCase();
            if (/(hgreg|this is|i'?m calling from|sales|service department|how can i help|thanks for calling)/i.test(x)) {
                score[t.speakerId as '0' | '1'] += 1;
            }
        }

        const agent = score['0'] === score['1'] ? null : (score['0'] > score['1'] ? '0' : '1');
        return agent === '0'
            ? { speaker0: 'salesperson', speaker1: 'client' }
            : agent === '1'
                ? { speaker0: 'client', speaker1: 'salesperson' }
                : { speaker0: 'unknown', speaker1: 'unknown' };
    }

    /** Public: assign roles using OpenAI (chronological lines). */
    async assignRoles(
        turns: Turn[],
        opts?: { model?: string }): Promise<Turn[]> {
        const has0 = turns.some(t => t.speakerId === '0');
        const has1 = turns.some(t => t.speakerId === '1');
        if (!has0 && !has1) return turns;

        const sample = this.buildSequentialSample(turns);
        if (this.openai && sample) {
            try {
                const system = [
                    // Task
                    'You assign roles in a two-party phone conversation for a car dealership.',
                    'Your job: decide which participant is the dealership "salesperson" and which is the "client". If you cannot tell, use "unknown".',
                    '',
                    // Inputs
                    'You are given chronological conversation lines in the form "speaker0: ..." and "speaker1: ...".',
                    '',
                    // Output constraints
                    'Return only the roles for speaker0 and speaker1 via the provided JSON schema. Valid roles: "salesperson", "client", "unknown".',
                    '',
                    // Primary signals that someone is the SALESPERSON
                    '- Mentions inventory, stock, VINs, trims, colors, availability, test drives, appointments, trade-in evaluation.',
                    '- Quotes or negotiates prices, taxes/fees, financing/credit, warranties, or service packages.',
                    '- Uses dealership identifiers: "this is HGreg", "our lot", "we have", "I can schedule you", "let me pull up", CRM notes.',
                    '- Asks qualifying questions: budget, timeline, preferred model/features, payoff, down payment, credit app.',
                    '- Provides next steps: emailing docs, sending a quote, holding a vehicle, transferring to finance/manager.',
                    '',
                    // Primary signals that someone is the CLIENT
                    '- Inquires about availability, price, monthly payments, mileage, Carfax, test-drive times.',
                    '- Provides personal details or preferences; answers qualifying questions.',
                    '- Describes a current vehicle for trade-in or asks about financing terms.',
                    '',
                    // Tie-breakers & heuristics (apply in order)
                    '1) If only one participant references "our dealership", inventory systems, or scheduling on behalf of the store → that participant is the salesperson.',
                    '2) If one participant mainly asks questions and the other mainly answers with dealership info → asker = client, answerer = salesperson.',
                    '3) If a participant transfers to finance/manager or sets appointments → salesperson.',
                    '4) If both participants fit both roles or neither fits either role after reviewing all lines → use "unknown" for the ambiguous participant(s).',
                    '',
                    // Edge cases
                    '- If the call starts with a receptionist then moves to a salesperson, label based on the majority of lines in the sample.',
                    '- If there are apologies for wrong number or non-sales topics with no clear cues → use "unknown".',
                    '- Do not infer based on who speaks first or on tone alone.',
                ].join('\n');

                const resp = await this.openai.responses.parse({
                    model: opts?.model ?? 'gpt-5-mini',
                    // temperature: 0,
                    instructions: system,
                    input: `Conversation sample:\n${sample}`,
                    text: {
                        format: {
                            type: "json_schema",
                            name: "roles_schema",
                            schema: {
                                type: "object",
                                additionalProperties: false,
                                required: ["speaker0", "speaker1"],
                                properties: {
                                    speaker0: { type: "string", enum: ["salesperson", "client", "unknown"] },
                                    speaker1: { type: "string", enum: ["salesperson", "client", "unknown"] }
                                }
                            },
                            // Optional: reject outputs that don't match exactly
                            strict: true
                        }
                    }
                });

                if (resp.status === "incomplete" && resp.incomplete_details?.reason === "max_output_tokens") {
                    // Handle the case where the model did not return a complete response
                    throw new Error("Incomplete response");
                }

                if (resp.output_parsed) {
                    const parsed = resp.output_parsed as Partial<RoleMap>;
                    const validRoles: Role[] = ["salesperson", "client", "unknown"];
                    const map: RoleMap = {
                        speaker0: validRoles.includes(parsed.speaker0 as Role)
                            ? (parsed.speaker0 as Role)
                            : 'unknown',
                        speaker1: validRoles.includes(parsed.speaker1 as Role)
                            ? (parsed.speaker1 as Role)
                            : 'unknown',
                    };
                    return this.applyRoleMap(turns, map);
                }

            } catch (err) {
                this.logger.error(`Role assignment via OpenAI failed: ${err}`);
            }
        }

        // Fallback
        return this.applyRoleMap(turns, this.fallbackRoleMap(turns));
    }

    /** classify using role-labeled chronological lines. 
     * -------- INTENT / RESULT / Department / SENTIMENT-------
    */
    async classifyConversation(
        turns: Turn[], opts?:
            { model?: string }): Promise<AnalysisOut | undefined> {

        const labeled = this.buildLabeledSequentialSample(turns);
        const fallbackText = turns.map(t => t.text).join(' ').trim();

        if (this.openai && labeled) {
            try {

                const system = [
                    "You are a call QA classifier for an automotive sales/service business.",
                    "Input is a labeled transcript where each line begins with salesperson:, client:, or a neutral/system label.",
                    "",
                    "TASK",
                    "- Classify the customer's PRIMARY intent, the customer's sentiment (1=very negative … 5=very positive), the call result, and whether the call is a SALES or SERVICE call.",
                    "- Base INTENT, SENTIMENT, and DEPARTMENT on the CLIENT’s utterances. Use the final state of the call for RESULT.",
                    "- If unsure, use intent=\"None\", result=\"None\", department=\"None\", sentiment=3.",
                    "",
                    "INTENT (pick one)",
                    "- Purchase: Customer is explicitly interested in BUYING or LEASING a vehicle (e.g., “I’m interested in purchasing a car”, “I’m looking for a small sedan under $30,000”, asking what cars you have, availability, trims, etc.) when they are not yet focused on trade-in, finance, or credit.",
                    "- TradeIn: Customer discusses trading in their current vehicle, appraisal value, VIN of their current car, payoff, or equity.",
                    "- Finance: Customer asks about rates, monthly payment, APR, term, down payment, lender options, rebates tied to financing.",
                    "- Credit: Customer asks about approval likelihood, credit score requirements, pre-approval, bad/no credit, bankruptcy, ITIN.",
                    "- Appointment: Customer tries to set/confirm a date/time to visit the dealership for a showroom visit or TEST DRIVE.",
                    "- Other: Customer has a clear intent unrelated to the above (e.g., vehicle availability/ETA, price/OTD quote, trim/features/colors, incentives, deposit/hold, “is the car still there?”).",
                    "- None: Insufficient information to infer any intent.",
                    "",
                    "RESULT (pick one)",
                    "- NotConnected: Call never actually connects to the customer (no answer, busy, failed, wrong number, straight to generic voicemail with no message left).",
                    "- AppointmentRequested: the DEALERSHIP EMPLOYEE clearly tries to get the customer to set an appointment (offers dates/times, asks what day works, suggests coming in), but by the end of the call there is NO firm confirmed date/time. Examples: customer needs to check their schedule, says they’ll call back, or just agrees in principle to coming in without locking a specific time.",
                    "- AppointmentBooked: A SPECIFIC date/time is agreed for an in-store visit or test drive (e.g., “Tomorrow at 3 pm works” / calendar invite sent / explicit confirmation).",
                    "- AppointmentRescheduled: An existing appointment is moved to a different time/day.",
                    "- AppointmentCancelled: An existing appointment is cancelled or the customer states they will not come to the previously scheduled time.",
                    "- CallTransferred: Caller is transferred to another person/department (e.g., finance manager, sales manager, service).",
                    "- FollowUp: The clear next step is a REMOTE follow-up (phone, text, email) instead of an in-person visit. Examples: the dealership will call/text/email the customer later, the customer will call back later, a phone follow-up time is discussed, or a quote/info will be sent, but no in-store visit or test drive is scheduled or requested.",
                    "- NotInterested: Customer states they are no longer interested, already purchased elsewhere, or clearly declines further follow-up.",
                    "- Other: A clear outcome that is not covered above (e.g., quote will be emailed/texted, deposit link sent, customer will call back, voicemail left, call back scheduled without a specific in-store time).",
                    "- None: No discernible outcome (e.g., dropped call or too little info).",
                    "",
                    "DEPARTMENT (Sales vs Service vs Parts) (pick one)",
                    "- Sales: The customer's main goal is to BUY, LEASE, or SELL a vehicle, trade in a vehicle, or discuss pricing/financing/credit for a vehicle.",
                    "- Service: The customer's main goal is SERVICE, MAINTENANCE, or REPAIR on a vehicle (e.g., oil change, brakes, check engine light, warranty repair, recall, service appointment).",
                    "- Parts: Customer’s main goal is ordering or inquiring about parts or accessories (e.g., “parts department”, “I need a bumper”, “order brake pads”, “wiper blades”, “floor mats”).",
                    "- Other: The call is clearly about something else (e.g., vendor, HR, internal staff call, marketing rep).",
                    "- None: Not enough information to tell what department this belongs to.",
                    "- If the call is clearly about buying/leasing/trading/financing a vehicle, choose Sales even if service is mentioned in passing.",
                    "- If the call is clearly about diagnostics/maintenance/repair/recall/service appointments, choose Service even if sales is mentioned in passing.",
                    "",
                    "SENTIMENT (customer focus)",
                    "- 1: very negative (angry, hostile, profanity, clear dissatisfaction).",
                    "- 2: negative (frustrated, curt, skeptical).",
                    "- 3: neutral/unclear (matter-of-fact, mixed, or sparse).",
                    "- 4: positive (polite, appreciative, satisfied).",
                    "- 5: very positive (enthusiastic, praising, excited).",
                    "",
                    "TIE-BREAKERS & RULES",
                    "- If multiple intents appear, pick the strongest based on the customer’s latest explicit goal.",
                    "- Booking an appointment does NOT change the intent; e.g., payment questions that end with a booking ⇒ intent=Finance, result=AppointmentBooked.",
                    "- Inventory/price/features questions are NOT Finance unless the customer discusses payments, APR, lenders, or terms.",
                    "- Be conservative; classify only from what is said in the transcript.",
                    "- Ignore salesperson persuasion when inferring intent; focus on what the CLIENT wants.",
                    "",
                    "OUTPUT",
                    "- Return ONLY the JSON fields per schema: intent (None|TradeIn|Finance|Credit|Appointment|Other), sentiment (1–5), result (None|NotConnected|AppointmentRequested|AppointmentBooked|AppointmentRescheduled|AppointmentCancelled|CallTransferred|NotInterested|FollowUp|Other), department (None|Sales|Service|Parts|Other).",
                ].join('\n');

                const resp = await this.openai.responses.parse({
                    model: opts?.model ?? 'gpt-5-mini',
                    instructions: system,
                    input: `Conversation:\n${labeled}`,
                    text: {
                        format: {
                            type: "json_schema",
                            name: "analysis_schema",
                            schema: {
                                type: 'object',
                                additionalProperties: false,
                                required: ['intent', 'sentiment', 'result', 'department'],
                                properties: {
                                    intent: {
                                        type: 'string',
                                        enum: ['None', 'TradeIn', 'Finance', 'Credit', 'Appointment', 'Other'],
                                    },
                                    sentiment: { type: 'number', enum: [1, 2, 3, 4, 5] },
                                    result: {
                                        type: 'string',
                                        enum: [
                                            'None',
                                            'NotConnected',
                                            'AppointmentRequested',
                                            'AppointmentBooked',
                                            'AppointmentRescheduled',
                                            'AppointmentCancelled',
                                            'CallTransferred',
                                            'NotInterested',
                                            'FollowUp',
                                            'Other',
                                        ],
                                    },
                                    department: {
                                        type: 'string',
                                        enum: ['None', 'Sales', 'Service', 'Parts', 'Other'],
                                    },
                                },
                            },
                        },
                    },
                });

                if (resp.status === "incomplete" && resp.incomplete_details?.reason === "max_output_tokens") {
                    // Handle the case where the model did not return a complete response
                    throw new Error("Incomplete response");
                }
                // const parsed = JSON.parse(resp.output_parsed ?? '{}') as Partial<AnalysisOut>;
                if (resp.output_parsed) {
                    return this.mapToEnums(resp.output_parsed);
                }
            } catch (err) {
                this.logger.error(`LLM classify (labeled) failed, falling back: ${err}`);
            }
        }
        // Fallback: heuristic on plain text
        return this.heuristic(fallbackText);
    }

    private mapToEnums(raw: {
        intent?: string;
        sentiment?: number;
        result?: string;
        department?: string;
    }): AnalysisOut {
        const intentMap: Record<string, CallIntent> = {
            None: CallIntent.None,
            TradeIn: CallIntent.TradeIn,
            Finance: CallIntent.Finance,
            Credit: CallIntent.Credit,
            Appointment: CallIntent.Appointment,
            Other: CallIntent.Other,
        };

        const resultMap: Record<string, CallResult> = {
            None: CallResult.None,
            NotConnected: CallResult.NotConnected,
            AppointmentRequested: CallResult.AppointmentRequested,
            AppointmentBooked: CallResult.AppointmentBooked,
            AppointmentRescheduled: CallResult.AppointmentRescheduled,
            AppointmentCancelled: CallResult.AppointmentCancelled,
            CallTransferred: CallResult.CallTransferred,
            NotInterested: CallResult.NotInterested,
            Other: CallResult.Other,
        };

        const departmentMap: Record<string, CallDepartment> = {
            None: CallDepartment.None,
            Sales: CallDepartment.Sales,
            Service: CallDepartment.Service,
            Parts: CallDepartment.Parts,
            Other: CallDepartment.Other,
        };

        const intent = intentMap[raw?.intent ?? ''] ?? CallIntent.None;
        const result = resultMap[raw?.result ?? ''] ?? CallResult.None;
        const department = departmentMap[raw?.department ?? ''] ?? CallDepartment.None;

        const s = Number(raw?.sentiment ?? 3);
        const sentiment = Number.isFinite(s)
            ? Math.min(5, Math.max(1, Math.round(s)))
            : 3;

        return { intent, sentiment, result, department };
    }


    private heuristic(text: string): AnalysisOut {
        const t = (text || '').toLowerCase();

        // ----- INTENT -----
        // Priority order: TradeIn > Finance > Credit > Appointment > Other/None
        let intent: CallIntent = CallIntent.None;

        if (/\btrade[-\s]?in(s)?\b/.test(t)) {
            intent = CallIntent.TradeIn;
        } else if (/\b(financ(e|ing)|loan|apr|lease|rate|payment|monthly payment|pre[-\s]?approval)\b/.test(t)) {
            intent = CallIntent.Finance;
        } else if (/\b(credit|credit score|no credit|bad credit|credit report|credit history|approval)\b/.test(t)) {
            intent = CallIntent.Credit;
        } else if (/\b(appointment|schedule|book|reserve|test[-\s]?drive|come in|come by)\b/.test(t)) {
            // treat scheduling/test-drive as an appointment intent
            intent = CallIntent.Appointment;
        } else if (t.trim().length > 0) {
            intent = CallIntent.Other;
        } else {
            intent = CallIntent.None;
        }

        // ----- RESULT -----
        // Map to new enum: None | NotConnected | AppointmentRequested | AppointmentBooked
        // | AppointmentRescheduled | AppointmentCancelled | CallTransferred | NotInterested | Other
        let result: CallResult = CallResult.None;

        const hasNoConnect = /\b(no answer|didn'?t answer|busy signal|line (?:was )?busy|call failed|couldn'?t reach|didn'?t pick up)\b/.test(t);
        const hasBooked =
            /\b(book(ed|ing)?|schedule(d)?|set (?:up)?|confirm(ed|ation)?|lock(ed)? in)\b/.test(t);
        const hasReschedule =
            /\b(reschedul(e|ed|ing)|move|push back|change) (?:my |the )?(appointment|appt)\b/.test(t);
        const hasCancel =
            /\b(cancel(l)?ed?|call off|won'?t make (?:it)?|can'?t make (?:it)?)(?: my| the)? (appointment|appt)?\b/.test(
                t,
            );
        const hasTransfer =
            /\b(transfer(red)?|warm transfer|hand(ed)? (?:off|over)|connect(ed)? (?:to|with)|forward(ed)?)\b/.test(
                t,
            );
        const hasNotInterested =
            /\b(not interested|no longer interested|already bought|already purchased|bought somewhere else|don'?t call|stop calling)\b/.test(
                t,
            );
        const hasApptRequest =
            /\b(make|set|schedule|book|looking for|want|like) (?:an )?(appointment|appt|test[-\s]?drive)\b/.test(
                t,
            );

        if (hasNoConnect) {
            result = CallResult.NotConnected;
        } else if (hasCancel) {
            result = CallResult.AppointmentCancelled;
        } else if (hasReschedule) {
            result = CallResult.AppointmentRescheduled;
        } else if (hasBooked) {
            result = CallResult.AppointmentBooked;
        } else if (hasApptRequest) {
            result = CallResult.AppointmentRequested;
        } else if (hasTransfer) {
            result = CallResult.CallTransferred;
        } else if (hasNotInterested) {
            result = CallResult.NotInterested;
        } else if (
            /\b(voicemail|voice mail|leave(?:t)? a message|left a message|hung up|disconnect(ed)?|no show|didn'?t show|information|info)\b/.test(
                t,
            )
        ) {
            result = CallResult.Other;
        } else {
            result = CallResult.None;
        }

        // ----- DEPARTMENT -----
        let department: CallDepartment = CallDepartment.None;

        const isService = /\b(service|maintenance|oil change|brake(s)?|tire(s)?|alignment|diagnostic|check engine|recall|warranty (?:repair)?|inspection|service appointment)\b/.test(
            t,
        );
        const isParts = /\b(part(s)? department|order(ing)? parts?|bumper|fender|mirror|wiper(s)?|floor mat(s)?|accessor(y|ies)|filter)\b/.test(
            t,
        );
        const isSales = /\b(buy|lease|purchase|test[-\s]?drive|trade[-\s]?in|finance|loan|payment|apr|down payment|vehicle|car|truck|suv|sedan|coupe|vin\b|stock number)\b/.test(
            t,
        );

        // Simple priority: Service only -> Service, Parts only -> Parts, else Sales if any sales signal
        if (isService && !isSales && !isParts) {
            department = CallDepartment.Service;
        } else if (isParts && !isSales && !isService) {
            department = CallDepartment.Parts;
        } else if (isSales) {
            department = CallDepartment.Sales;
        } else if (isService) {
            department = CallDepartment.Service;
        } else if (isParts) {
            department = CallDepartment.Parts;
        } else {
            department = CallDepartment.None;
        }

        // ----- SENTIMENT -----
        let sentiment = 3; // neutral baseline (1..5)
        if (/\b(rude|angry|upset|frustrat|terrible|bad|horrible|awful|mad)\b/.test(t)) {
            sentiment = 1;
        } else if (/\b(inconvenient|annoyed|not happy|disappointed)\b/.test(t)) {
            sentiment = 2;
        } else if (/\b(great|happy|thank(s| you)|awesome|perfect|excellent|appreciate it|helpful)\b/.test(t)) {
            sentiment = 4;
        } else if (/\b(amazing|fantastic|outstanding|wonderful|love you guys)\b/.test(t)) {
            sentiment = 5;
        }

        return { intent, sentiment, result, department };
    }


    // -------- INTENT / SENTIMENT / RESULT --------
    // async classifyTranscript( 
    //     transcript: string, 
    //     opts?: { model?: string }): Promise<AnalysisOut | undefined> {
    //     if (!transcript?.trim()) return { intent: null, sentiment: null, result: null };

    //     if (this.openai) {
    //         try {
    //             const system = [
    //                 "You are a call QA classifier for an automotive sales/service business.",
    //                 "Input is a transcript",
    //                 "",
    //                 "TASK",
    //                 "- Classify the customer's PRIMARY intent, the customer's sentiment (1=very negative … 5=very positive), and the call result.",
    //                 "- Base INTENT and SENTIMENT on the CLIENT’s utterances. Use the final state of the call for RESULT.",
    //                 "- If unsure, use intent=\"None\", result=\"None\", sentiment=3.",
    //                 "",
    //                 "INTENT (pick one)",
    //                 "- TradeIn: Customer discusses trading in their current vehicle, appraisal value, VIN of their current car, payoff, or equity.",
    //                 "- Finance: Customer asks about rates, monthly payment, APR, term, down payment, lender options, rebates tied to financing.",
    //                 "- Credit: Customer asks about approval likelihood, credit score requirements, pre-approval, bad/no credit, bankruptcy, ITIN.",
    //                 "- Appointment: Customer tries to set/confirm a date/time to visit the dealership for a showroom visit or TEST DRIVE.",
    //                 "- Other: Customer has a clear intent unrelated to the above (e.g., vehicle availability/ETA, price/OTD quote, trim/features/colors, incentives, deposit/hold, “is the car still there?”).",
    //                 "- None: Insufficient information to infer any intent.",
    //                 "",
    //                 "RESULT (pick one)",
    //                 "- AppointmentBooked: A SPECIFIC date/time is agreed for an in-store visit or test drive (e.g., “Tomorrow at 3 pm works” / calendar invite sent / explicit confirmation).",
    //                 "- CallTransferred: Caller is transferred to another person/department (e.g., finance manager, sales manager).",
    //                 "- Other: A clear outcome that is not a booking or transfer (e.g., quote will be emailed/texted, deposit link sent, customer will call back, voicemail left, call back scheduled without a specific in-store time).",
    //                 "- None: No discernible outcome (e.g., dropped call or too little info).",
    //                 "",
    //                 "SENTIMENT (customer focus)",
    //                 "- 1: very negative (angry, hostile, profanity, clear dissatisfaction).",
    //                 "- 2: negative (frustrated, curt, skeptical).",
    //                 "- 3: neutral/unclear (matter-of-fact, mixed, or sparse).",
    //                 "- 4: positive (polite, appreciative, satisfied).",
    //                 "- 5: very positive (enthusiastic, praising, excited).",
    //                 "",
    //                 "TIE-BREAKERS & RULES",
    //                 "- If multiple intents appear, pick the strongest based on the customer’s latest explicit goal.",
    //                 "- Booking an appointment does NOT change the intent; e.g., payment questions that end with a booking ⇒ intent=Finance, result=AppointmentBooked.",
    //                 "- Inventory/price/features questions are NOT Finance unless the customer discusses payments, APR, lenders, or terms.",
    //                 "- Be conservative; classify only from what is said in the transcript.",
    //                 "- Ignore salesman persuasion when inferring intent; focus on what the CLIENT wants.",
    //                 "",
    //                 "OUTPUT",
    //                 "- Return ONLY the JSON fields per schema: intent (None|TradeIn|Finance|Credit|Appointment|Other), sentiment (1–5), result (None|AppointmentBooked|CallTransferred|Other).",
    //             ].join('\\n');

    //             const resp = await this.openai.responses.parse({
    //                 model: opts?.model ?? 'gpt-5-mini',
    //                 // temperature: 0,
    //                 instructions: system,
    //                 input: `Transcript:\n${transcript}`,
    //                 text: {
    //                     format: {
    //                         type: "json_schema",
    //                         name: "analysis_schema",
    //                         schema: {
    //                             type: 'object',
    //                             additionalProperties: false,
    //                             required: ['intent', 'sentiment', 'result'],
    //                             properties: {
    //                                 intent: { type: 'string', enum: ['None', 'TradeIn', 'Finance', 'Credit', 'Appointment', 'Other'] },
    //                                 sentiment: { type: 'number', enum: [1, 2, 3, 4, 5] },
    //                                 result: { type: 'string', enum: ['None', 'AppointmentBooked', 'CallTransferred', 'Other'] },
    //                             }
    //                         },
    //                     },
    //                 }
    //             });

    //             if (resp.status === "incomplete" && resp.incomplete_details?.reason === "max_output_tokens") {
    //                 // Handle the case where the model did not return a complete response
    //                 throw new Error("Incomplete response");
    //             }

    //             // const parsed = JSON.parse(resp.output_parsed ?? '{}') as Partial<AnalysisOut>;
    //             if (resp.output_parsed) {
    //                 return this.mapToEnums(resp.output_parsed);
    //             }
    //         } catch (err) {
    //             this.logger.error(`LLM classify failed, falling back: ${err}`);
    //         }
    //     }
    //     return this.heuristic(transcript);
    // }
}
