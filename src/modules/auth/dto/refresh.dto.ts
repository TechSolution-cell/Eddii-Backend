import { Expose } from 'class-transformer';
import { IsString, MinLength } from 'class-validator';
export class RefreshDto {
    @Expose({ name: 'refresh_token' })
    @IsString() 
    @MinLength(20)
    refreshToken: string;
}
