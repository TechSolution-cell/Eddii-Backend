import {
    IsOptional,
    IsString,
    MaxLength,
    IsEnum,
    IsArray,
    IsISO8601,
} from 'class-validator';
import { Transform } from 'class-transformer';

import { TrimOrUndefined, TrimCollapseOrUndefined } from 'src/common/transformers/trim.util';

import { PaginationQueryDto } from 'src/common/dto';
import { SortOrder, MarketingSourceSortBy } from 'src/common/enums';



export class SearchMarketingSourcesQueryDto extends PaginationQueryDto {
    @TrimCollapseOrUndefined()
    @IsOptional()
    @IsString()
    @MaxLength(200)
    term?: string;

    @TrimCollapseOrUndefined()
    @IsOptional()
    @IsString()
    @MaxLength(120)
    name?: string;

    /**
     * Accepts:
     * - single string (e.g. "paid")
     * - CSV string (e.g. "paid, organic, referral")
     * - array of strings (e.g. ["paid","organic"])
     * Transforms to string[] or undefined.
     */

    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    @Transform(({ value, obj, key }) => {
        if (typeof value === 'string' && !value.trim()) {
            delete obj[key];
            return undefined;
        }
        if (Array.isArray(value)) {
            return value
                .map((v) => (typeof v === 'string' ? v.trim() : v))
                .filter((v) => typeof v === 'string' && v.length);
        }
        if (typeof value === 'string') {
            const trimmed = value.trim();
            if (!trimmed) return undefined;
            return trimmed
                .split(',')
                .map((v) => v.trim())
                .filter(Boolean);
        }
        return undefined;
    })
    channel?: string[];

    @TrimCollapseOrUndefined()
    @IsOptional()
    @IsString()
    @MaxLength(150)
    campaignName?: string;

    @TrimOrUndefined()
    @IsOptional()
    @IsISO8601()
    createdFrom?: string; // ISO

    @TrimOrUndefined()
    @IsOptional()
    @IsISO8601()
    createdTo?: string;  // ISO

    @IsOptional()
    @IsEnum(MarketingSourceSortBy)
    sortBy?: MarketingSourceSortBy = MarketingSourceSortBy.CreatedAt;

    @IsOptional()
    @IsEnum(SortOrder)
    sortOrder?: SortOrder = SortOrder.DESC;
}
