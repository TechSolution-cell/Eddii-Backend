import { Expose } from 'class-transformer';

export class BusinessResponseDto {
    @Expose()
    id!: string;

    @Expose()
    email!: string;

    @Expose()
    businessName!: string;

    @Expose()
    maxTrackingNumbers!: number;

    @Expose()
    trackingNumbersUsedCount!: number;
    
    // accountRole: 'BUSINESS_ADMIN' | 'SUPER_ADMIN';

    @Expose()
    createdAt?: Date | null;

    @Expose()
    updatedAt?: Date | null;
}