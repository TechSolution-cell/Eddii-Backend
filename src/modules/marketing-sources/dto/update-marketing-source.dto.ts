
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';


import { TrimCollapseKeepEmpty, Trim } from 'src/common/transformers/trim.util';

export class UpdateMarketingSourceDto {
    @TrimCollapseKeepEmpty()
    @IsOptional()
    @IsString()
    @MinLength(2)
    @MaxLength(255)
    name?: string;

    @TrimCollapseKeepEmpty()
    @IsOptional()
    @IsString()
    @MaxLength(255)
    channel?: string;

    @TrimCollapseKeepEmpty()
    @IsOptional()
    @IsString()
    @MaxLength(255)
    campaignName?: string;

    @Trim()
    @IsOptional()
    @IsString()
    @MaxLength(255)
    description?: string;
}
