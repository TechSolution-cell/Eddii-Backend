import { IsISO8601, IsOptional, IsEnum, IsUUID } from 'class-validator';
import { Transform } from 'class-transformer';
// import { DateGrouping } from './date-grouping.enum';

export enum DateGrouping {
    Day = 'day',
    Week = 'week',
    Month = 'month',
}

export class DashboardQueryDto {
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
}