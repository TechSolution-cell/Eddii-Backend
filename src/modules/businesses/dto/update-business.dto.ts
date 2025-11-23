
import { IsEmail, IsOptional, IsString, MinLength, MaxLength, IsNotEmpty, Max, IsInt, Min } from 'class-validator';
import { Transform } from 'class-transformer';

import { Trim, TrimCollapseKeepEmpty } from 'src/common/transformers/trim.util';
import { ToOptionalInt } from 'src/common/transformers/number.util';
// import { AccountRole } from '../../../common/enums/account-role.enum.ts';

export class UpdateBusinessDto {
    @Transform(({ value }) => (value ?? '').toLowerCase())
    @IsOptional()
    @IsEmail()
    email?: string;

    @Trim()
    @IsOptional()
    @IsString()
    @IsNotEmpty()
    @MinLength(6)
    password?: string;

    @TrimCollapseKeepEmpty()
    @IsOptional()
    @IsString()
    @MinLength(2)
    @MaxLength(255)
    businessName?: string;

    @ToOptionalInt({ truncate: true }) // accepts "5" → 5, "5.9" → 5, '' → undefined
    @IsOptional()
    @IsInt({ message: 'maxTrackingNumbers must be an integer' })
    @Min(0, { message: 'maxTrackingNumbers cannot be negative' })
    @Max(1000, { message: 'maxTrackingNumbers is too large' })
    maxTrackingNumbers?: number;

    // @IsOptional()
    // @IsEnum(AccountRole)
    // accountRole: AccountRole;
}
