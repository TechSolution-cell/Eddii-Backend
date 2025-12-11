import { IsISO8601, IsOptional, IsEnum, IsUUID, IsString } from 'class-validator';
import { Transform } from 'class-transformer';

export enum DateGrouping {
    Day = 'day',
    Week = 'week',
    Month = 'month',
}

/**
 * Query for the RANGE endpoint (/dashboard/range).
 * Includes from/to, groupBy, marketingSourceIds & timezone.
 */
export class DashboardRangeQueryDto {
    @IsOptional()
    @IsISO8601()
    from?: string;

    @IsOptional()
    @IsISO8601()
    to?: string;

    @IsOptional()
    @IsEnum(DateGrouping)
    groupBy?: DateGrouping;

    @IsOptional()
    @Transform(({ value }) =>
        Array.isArray(value) ? value : String(value).split(','),
    )
    @IsUUID('4', { each: true })
    marketingSourceIds?: string[];

    @IsOptional()
    @IsString()
    timezone?: string;
}

/**
 * Query for the STATIC endpoint (/dashboard/static).
 * No from/to or groupBy – they’re fixed windows (today/last7/last30).
 */
export class DashboardStaticQueryDto {
    @IsOptional()
    @Transform(({ value }) =>
        Array.isArray(value) ? value : String(value).split(','),
    )
    @IsUUID('4', { each: true })
    marketingSourceIds?: string[];

    @IsOptional()
    @IsString()
    timezone?: string;
}
