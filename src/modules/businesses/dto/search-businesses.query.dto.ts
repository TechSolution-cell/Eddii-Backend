import {
    IsOptional,
    IsString,
    MaxLength,
    IsEnum,
    IsISO8601,
    IsEmail,
    IsLowercase,
} from 'class-validator';

import { TrimOrUndefined, TrimCollapseOrUndefined } from 'src/common/transformers/trim.util';

import { PaginationQueryDto } from 'src/common/dto';
import { BusinessSortBy, SortOrder } from 'src/common/enums';
import { ToLower } from 'src/common/transformers';


export class SearchBusinessesQueryDto extends PaginationQueryDto {
    @TrimCollapseOrUndefined()
    @IsOptional()
    @IsString()
    @MaxLength(120)
    name?: string;

    @TrimCollapseOrUndefined()
    @ToLower()
    @IsOptional()
    @IsLowercase()
    @IsEmail()
    email?: string;

    @TrimOrUndefined()
    @IsOptional()
    @IsISO8601()
    createdFrom?: string; // ISO

    @TrimOrUndefined()
    @IsOptional()
    @IsISO8601()
    createdTo?: string;  // ISO

    @IsOptional()
    @IsEnum(BusinessSortBy)
    sortBy?: BusinessSortBy = BusinessSortBy.CreatedAt;

    @IsOptional()
    @IsEnum(SortOrder)
    sortOrder?: SortOrder = SortOrder.DESC;
}
