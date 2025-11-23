import { Matches, IsUUID, IsOptional} from 'class-validator';

import { Trim, TrimOrNull} from 'src/common/transformers/trim.util';

export class UpdateTrackingNumberDto {
    @TrimOrNull()
    @IsOptional()
    @Matches(/^\+\d+$/, { message: 'forwardingVoiceNumber must be in +E.164 format' })
    forwardingVoiceNumber?: string;

    @TrimOrNull()
    @IsOptional()
    @IsUUID()
    marketingSourceId?: string;
}
