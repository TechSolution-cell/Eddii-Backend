import { IsOptional, IsString, MaxLength, MinLength, IsNotEmpty } from 'class-validator';
import { TrimOrUndefined, TrimCollapseOrUndefined } from 'src/common/transformers/trim.util';


export class CreateMarketingSourceDto {
    @TrimCollapseOrUndefined()
    @IsString()
    @IsNotEmpty()
    @MinLength(2)
    @MaxLength(255)
    name: string;

    @TrimOrUndefined()
    @IsOptional()
    @IsString()
    @MaxLength(255)
    description?: string;

    @TrimCollapseOrUndefined()
    @IsOptional()
    @IsString()
    @MaxLength(255)
    channel?: string;

    @TrimCollapseOrUndefined()
    @IsOptional()
    @IsString()
    @MaxLength(255)
    campaignName?: string;
}
