import { Controller, Post, UseGuards, Request, Body, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { RefreshDto } from './dto/refresh.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { LoginDto } from './dto/login.dto';

@Controller('auth')
export class AuthController {
    constructor(private readonly auth: AuthService) { }

    @UseGuards(AuthGuard('local'))
    @Post('login')
    async login(
        @Request() req: any,
        @Body() _dto: LoginDto
    ) {
        // const user = await this.auth.validateUser(dto.email, dto.password);
        // if (!user) throw new UnauthorizedException('Invalid credentials');

        // returns { access_token, refresh_token }
        return this.auth.issueTokenPair(req.user, !!_dto.rememberMe);
        // return this.auth.sign(req.user);
    }

    // Accept refresh token in body.
    @Post('refresh')
    async refresh(@Body() dto: RefreshDto) {
        console.log('refresh');
        return this.auth.refreshTokens(dto.refreshToken);
    }

    // Require access token to logout and revoke the stored refresh token
    @UseGuards(JwtAuthGuard)
    @Post('logout')
    async logout(@Request() req: any) {
        return this.auth.logout(req.user.sub);
    }
}
