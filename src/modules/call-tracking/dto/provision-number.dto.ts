import { IsOptional, IsString, IsUUID, Matches, IsISO31661Alpha2 } from 'class-validator';
import { } from 'class-validator';

import { TrimOrUndefined } from 'src/common/transformers/trim.util';

export class ProvisionNumberDto {

    // Optional: buy a specific phone number (E.164). If omitted, we will search by areaCode/country.
    @TrimOrUndefined()
    @IsOptional()
    @Matches(/^\+\d+$/)
    trackingNumber?: string;

    // The number to forward calls to (E.164)
    @TrimOrUndefined()
    @IsOptional()
    @Matches(/^\+\d+$/)
    forwardingVoiceNumber?: string;

    @TrimOrUndefined()
    @IsOptional()
    @IsUUID()
    marketingSourceId?: string;

    // Search options if phoneNumber is not provided
    @TrimOrUndefined()
    @IsOptional()
    @IsISO31661Alpha2()
    country?: string; // e.g., 'US'

    @TrimOrUndefined()
    @IsOptional()
    @IsString()
    areaCode?: string; // e.g., '415'

}
