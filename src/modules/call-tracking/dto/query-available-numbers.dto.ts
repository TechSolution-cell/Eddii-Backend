import { IsISO31661Alpha2, IsInt, Min, Max, Length, IsNumberString } from 'class-validator';
import { Transform } from 'class-transformer';


import { ValidateIfPresent } from 'src/common/validators/validate-if-present.decorator';

export class QueryAvailableNumbersDto {
    @ValidateIfPresent()
    @IsISO31661Alpha2()
    country?: string = 'US';

    // @Matches(/^\d{3}$/)
    @Transform(({ value }) => String(value).trim())
    @IsNumberString()
    @Length(3, 3)
    areaCode!: string;

    @ValidateIfPresent()
    @Transform(({ value }) => Number(value))
    @IsInt() @Min(1) @Max(30)
    limit?: number = 10;
}
