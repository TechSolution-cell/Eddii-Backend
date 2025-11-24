import { Expose, Type } from 'class-transformer';
import { CallIntent, CallResult, CallStatus } from 'src/common/enums/telephony.enum';

export class MarketingSourceBriefDto {
    @Expose()
    id!: string;

    @Expose()
    name!: string;

    @Expose()
    description?: string;

    @Expose()
    channel?: string;

    @Expose()
    campaignName?: string;
}

export class CallLogReponseDto {
    @Expose()
    id!: string;

    /** E.164 tracking number*/
    @Expose()
    callerNumber!: string;

    @Expose()
    receiverNumber!: string;

    @Expose()
    status: CallStatus;

    @Expose()
    callStartedAt: Date;

    @Expose()
    durationSeconds: number;

    @Expose()
    result: CallResult;

    @Expose()
    intent: CallIntent;

    @Expose()
    sentiment: number | null;

    @Expose()
    transcriptJson: string | null;

    @Expose()
    recordingUrl: string | null;

    @Expose()
    trackingNumber: string | null;

    @Type(() => MarketingSourceBriefDto)
    @Expose()
    marketingSource?: MarketingSourceBriefDto | null;
}