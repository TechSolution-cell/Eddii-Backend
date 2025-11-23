import { Expose } from 'class-transformer';

export class AvailableNumberResponseDto {
    @Expose()
    phoneNumber: string;            // E.164

    @Expose()
    friendlyName: string | null;    // e.g., "(415) 555-0123"\

    @Expose()
    locality: string | null;        // city

    @Expose()
    region: string | null;          // state / province

    @Expose()
    isoCountry: string;             // "US"

    @Expose()
    lata: string | null;

    @Expose()
    rateCenter: string | null;

    @Expose()
    beta: boolean;

    @Expose()
    capabilities: {
        voice: boolean;
        sms: boolean;
        mms: boolean;
    };
};