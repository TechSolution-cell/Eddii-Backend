import { Expose, Type } from 'class-transformer';

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

export class TrackingNumberResponseDto {
    @Expose()
    id!: string;

    /** E.164 tracking number*/
    @Expose()
    number!: string;

    @Expose()
    forwardingVoiceNumber?: string;

    @Type(() => MarketingSourceBriefDto)
    @Expose()
    marketingSource?: MarketingSourceBriefDto | null;

    @Expose()
    createdAt!: Date | null;

    @Expose()
    updatedAt!: Date | null;
}