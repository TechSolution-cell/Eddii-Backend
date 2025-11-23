import {
    IsOptional,
    IsEnum,
    IsISO8601,
    Matches,
    IsString,
} from 'class-validator';

import { TrimOrUndefined } from 'src/common/transformers/trim.util';

import { PaginationQueryDto } from 'src/common/dto';
import { TrackingNumberSortBy, SortOrder } from 'src/common/enums';


export class SearchTrackingNumbersQueryDto extends PaginationQueryDto {
    @TrimOrUndefined()
    @IsOptional()
    @Matches(/^\+[1-9]\d{1,14}$/, { message: 'Must be E.164, e.g. +14155552671' })
    number?: string;   // (E.164)

    @TrimOrUndefined()
    @IsOptional()
    @Matches(/^\+[1-9]\d{1,14}$/, { message: 'Must be E.164, e.g. +14155552671' })
    forwardingVoiceNumber?: string;  // (E.164)

    @TrimOrUndefined()
    @IsOptional()
    @IsString()
    marketingSourceId?: string;

    @TrimOrUndefined()
    @IsOptional()
    @IsISO8601()
    createdFrom?: string; // ISO

    @TrimOrUndefined()
    @IsOptional()
    @IsISO8601()
    createdTo?: string;  // ISO

    @IsOptional()
    @IsEnum(TrackingNumberSortBy)
    sortBy?: TrackingNumberSortBy = TrackingNumberSortBy.CreatedAt;

    @IsOptional()
    @IsEnum(SortOrder)
    sortOrder?: SortOrder = SortOrder.DESC;
}
