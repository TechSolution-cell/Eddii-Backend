import {
    Controller, Post, UseGuards, Request,
    Body, Logger
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

import { AuthService } from './auth.service';

import { RefreshDto } from './dto/refresh.dto';
import { LoginDto } from './dto/login.dto';

@Controller('auth')
export class AuthController {
    constructor(private readonly auth: AuthService) { }

    private readonly logger = new Logger(AuthController.name);

    @UseGuards(AuthGuard('local'))
    @Post('login')
    async login(
        @Request() req: any,
        @Body() _dto: LoginDto
    ) {
        return this.auth.issueTokenPair(req.user, !!_dto.rememberMe);
    }

    // Accept refresh token in body.
    @Post('refresh')
    async refresh(
        @Body() dto: RefreshDto) {
        return this.auth.refreshTokens(dto.refreshToken);
    }

    // Require access token to logout and revoke the stored refresh token
    @UseGuards(JwtAuthGuard)
    @Post('logout')
    async logout(@Request() req: any) {
        return this.auth.logout(req.user.sub);
    }
}
