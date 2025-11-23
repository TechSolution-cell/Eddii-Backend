import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Business } from 'src/entities/business.entity';
import { Repository } from 'typeorm';
import { comparePassword, hashPassword } from './password.util';
import { JwtService, TokenExpiredError } from '@nestjs/jwt';
import { ConfigService } from '../../config/config.service';
import { JwtPayload } from './strategies/jwt.strategy'
// import { AccountRole } from 'src/common/enums/account-role.enum.ts';

@Injectable()
export class AuthService {
    constructor(
        @InjectRepository(Business) private readonly bizRepo: Repository<Business>,
        private readonly jwt: JwtService, private readonly cfg: ConfigService,
    ) { }

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
        return {
            access_token: access,
            refresh_token: refresh,
            // business: {
            //     id: user.id,
            //     email: user.email,
            //     businessName: user.businessName
            // }
        };
    }

    /** Verify + rotate refresh token */
    async refreshTokens(refreshToken: string) {
        let decoded: JwtPayload;
        try {
            // verify signature
            decoded = await this.jwt.verifyAsync<JwtPayload>(refreshToken, {
                secret: this.cfg.jwtRefreshSecret,
            });
        } catch (e: any) {
            if (e instanceof TokenExpiredError || e?.name === 'TokenExpiredError') {
                console.log('refresh_token_expired');
                throw new UnauthorizedException({
                    code: 'refresh_token_expired',
                    message: 'Refresh token has expired. Please sign in again.',
                });
            }
            console.log('invalid_refresh_token');
            throw new UnauthorizedException({
                code: 'invalid_refresh_token',
                message: 'Refresh token is invalid.',
            });
        }

        const user = await this.bizRepo.findOne({ where: { id: decoded.sub } });
        if (!user || !user.refreshTokenHash) {
            console.log('invalid_refresh_token -- 1');
            throw new UnauthorizedException({
                code: 'invalid_refresh_token',
                message: 'Refresh token is invalid.',
            });
        }

        // verify it matches the last stored token (revocation support)
        const ok = await comparePassword(refreshToken, user.refreshTokenHash);
        if (!ok) {
            console.log('invalid_refresh_token -- 2');
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
        const payload: JwtPayload = { sub: user.id, name: user.businessName, email: user.email, role: user.accountRole, rememberMe: rememberMe };
        return this.jwt.signAsync(payload, {
            secret: this.cfg.jwtRefreshSecret,
            expiresIn: rememberMe ? this.cfg.jwtRefreshExpiresInRemember : this.cfg.jwtRefreshExpiresIn
        });
    }

    private async setRefreshToken(userId: string, refreshToken: string) {
        const refreshTokenHash = await hashPassword(refreshToken);
        await this.bizRepo.update(userId, { refreshTokenHash });
    }
    private async clearRefreshToken(userId: string) {
        await this.bizRepo.update(userId, { refreshTokenHash: null });
    }

    async logout(userId: string) {
        await this.clearRefreshToken(userId);
        return { success: true };
    }

    // async sign(user: Business) {
    //     const payload = {
    //         sub: user.id,
    //         email: user.email,
    //         role: user.accountRole as AccountRole,
    //     };
    //     return {
    //         businessId: user.id,
    //         role: user.accountRole,
    //         accessToken: await this.jwt.signAsync(payload),
    //     };
    // }
}
