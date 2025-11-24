import {
    IsOptional,
    IsEnum,
    IsISO8601,
    IsUUID,
} from 'class-validator';

import { TrimOrUndefined } from 'src/common/transformers/trim.util';

import { PaginationQueryDto } from 'src/common/dto';
import { CallLogSortBy } from 'src/common/enums/telephony.enum';
import { SortOrder } from 'src/common/enums';


export class SearchCallLogsQueryDto extends PaginationQueryDto {

    @TrimOrUndefined()
    @IsOptional()
    @IsUUID()
    marketingSourceId?: string;

    @TrimOrUndefined()
    @IsOptional()
    @IsISO8601()
    startedFrom?: string; // ISO

    @TrimOrUndefined()
    @IsOptional()
    @IsISO8601()
    startedTo?: string;  // ISO

    @IsOptional()
    @IsEnum(CallLogSortBy)
    sortBy?: CallLogSortBy = CallLogSortBy.CallStartedAt;

    @IsOptional()
    @IsEnum(SortOrder)
    sortOrder?: SortOrder = SortOrder.DESC;
}
