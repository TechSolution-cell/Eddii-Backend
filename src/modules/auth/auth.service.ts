import { Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { JwtService, TokenExpiredError } from '@nestjs/jwt';

import { comparePassword } from './utils/password.util';
import { hashToken, compareToken } from './utils/token-hash.util';

import { ConfigService } from '../../config/config.service';
import { JwtPayload } from './strategies/jwt.strategy'

import { Business } from 'src/entities/business.entity';
// import { AccountRole } from 'src/common/enums/account-role.enum.ts';

@Injectable()
export class AuthService {
    constructor(
        @InjectRepository(Business)
        private readonly bizRepo: Repository<Business>,
        private readonly jwt: JwtService,
        private readonly cfg: ConfigService,
    ) { }

    private readonly logger = new Logger(AuthService.name);

    async validateUser(email: string, password: string): Promise<Business | null> {
        const user = await this.bizRepo.findOne({ where: { email } });
        if (!user) return null;
        const ok = await comparePassword(password, user.passwordHash);
        return ok ? user : null;
    }

    /** Issue both tokens and persist hashed refresh token */
    async issueTokenPair(user: Business, rememberMe = false) {
        const [access, refresh] = await Promise.all([
            this.signAccessToken(user),
            this.signRefreshToken(user, rememberMe),
        ]);
        await this.setRefreshToken(user.id, refresh);
        // this.logger.debug({
        //     access_token: access,
        //     refresh_token: refresh
        // });
        return {
            access_token: access,
            refresh_token: refresh
        };
    }

    /** Verify + rotate refresh token */
    async refreshTokens(refreshToken: string) {
        // this.logger.debug('refresh token');

        let decoded: JwtPayload;
        try {
            // verify signature
            decoded = await this.jwt.verifyAsync<JwtPayload>(refreshToken, {
                secret: this.cfg.jwtRefreshSecret,
            });
        } catch (e: any) {
            if (e instanceof TokenExpiredError || e?.name === 'TokenExpiredError') {
                // this.logger.error('refresh_token_expired');
                throw new UnauthorizedException({
                    code: 'refresh_token_expired',
                    message: 'Refresh token has expired. Please sign in again.',
                });
            }

            throw new UnauthorizedException({
                code: 'invalid_refresh_token',
                message: 'Refresh token is invalid.',
            });
        }

        const user = await this.bizRepo.findOne({ where: { id: decoded.sub } });

        if (!user || !user.refreshTokenHash) {
            throw new UnauthorizedException({
                code: 'invalid_refresh_token',
                message: 'Refresh token is invalid.',
            });
        }

        // verify it matches the last stored token (revocation support)
        // this.logger.debug(refreshToken, user.refreshTokenHash);
        const ok = await compareToken(refreshToken, user.refreshTokenHash);
        if (!ok) {
            // this.logger.error('refresh_token does not match with hashed refresh_token');
            throw new UnauthorizedException({
                code: 'invalid_refresh_token',
                message: 'Refresh token is invalid.',
            });
        }

        // rotate: issue new pair & store new refresh hash
        const isRemember = !!decoded.rememberMe;
        return this.issueTokenPair(user, isRemember);
    }

    private async signAccessToken(user: Business) {
        const payload: JwtPayload = { sub: user.id, name: user.businessName, email: user.email, role: user.accountRole };
        return this.jwt.signAsync(payload); // uses access secret/expiresIn from JwtModule
    }

    private async signRefreshToken(user: Business, rememberMe = false) {
        const payload: JwtPayload = {
            sub: user.id,
            name: user.businessName,
            email: user.email,
            role: user.accountRole,
            rememberMe: rememberMe
        };

        return this.jwt.signAsync(payload, {
            secret: this.cfg.jwtRefreshSecret,
            expiresIn: rememberMe ? this.cfg.jwtRefreshExpiresInRemember : this.cfg.jwtRefreshExpiresIn,
            jwtid: randomUUID()
        });
    }

    private async setRefreshToken(userId: string, refreshToken: string) {
        const refreshTokenHash = await hashToken(refreshToken);
        await this.bizRepo.update(userId, { refreshTokenHash });
    }
    private async clearRefreshToken(userId: string) {
        await this.bizRepo.update(userId, { refreshTokenHash: null });
    }

    async logout(userId: string) {
        await this.clearRefreshToken(userId);
        return { success: true };
    }
}
