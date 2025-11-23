
import { IsEmail, IsString, MinLength, MaxLength, IsNumber, max, Max, Min, IsInt, IsOptional } from 'class-validator';
import { Transform } from 'class-transformer';

import { TrimOrUndefined, TrimCollapseKeepEmpty } from 'src/common/transformers/trim.util';
import { ToOptionalInt } from 'src/common/transformers/number.util';
// import { AccountRole } from '../../../common/enums/account-role.enum.ts';

export class CreateBusinessDto {
    @TrimOrUndefined()
    @Transform(({ value }) => (value ?? '').toLowerCase())
    @IsEmail()
    email!: string;

    @TrimCollapseKeepEmpty()
    @IsString()
    @MinLength(2)
    @MaxLength(255)
    businessName!: string;

    @ToOptionalInt({ truncate: true }) // accepts "5" → 5, "5.9" → 5, '' → undefined
    @IsOptional()
    @IsInt({ message: 'maxTrackingNumbers must be an integer' })
    @Min(0, { message: 'maxTrackingNumbers cannot be negative' })
    @Max(1000, { message: 'maxTrackingNumbers is too large' })
    maxTrackingNumbers?: number;


    @TrimOrUndefined()
    @IsString()
    @MinLength(6)
    password!: string;

    // @IsOptional()
    // @IsEnum(AccountRole)
    // accountRole?: AccountRole; // default BUSINESS_ADMIN
}
