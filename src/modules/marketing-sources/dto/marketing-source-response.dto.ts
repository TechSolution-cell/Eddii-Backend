import { Expose } from 'class-transformer';

export class MarketingSourceResponseDto {
    @Expose()
    id!: string;

    @Expose()
    name!: string;

    @Expose()
    description?: string | null;

    @Expose()
    channel?: string | null;

    @Expose()
    campaignName?: string | null;

    @Expose()
    createdAt?: Date;

    @Expose()
    updatedAt?: Date;
}
