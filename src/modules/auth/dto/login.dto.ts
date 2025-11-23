import { IsBoolean, IsEmail, IsLowercase, IsOptional, IsString, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';

export class LoginDto {
    @IsEmail()
    @IsLowercase()
    @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
    email: string;

    @IsString()
    @MinLength(6)
    password: string;

    @IsOptional()
    @IsBoolean()
    rememberMe?: boolean;
}
