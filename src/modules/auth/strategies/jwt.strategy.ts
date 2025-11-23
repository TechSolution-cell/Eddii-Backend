import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '../../../config/config.service';
import { AccountRole } from 'src/common/enums';

export interface JwtPayload {
    sub: string;
    name: string;
    email: string;
    role: AccountRole;
    rememberMe?: boolean;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
    constructor(cfg: ConfigService) {
        super({
            jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
            ignoreExpiration: false,
            secretOrKey: cfg.jwtSecret,
        });
    }
    async validate(payload: JwtPayload) {
        return payload; // attached as req.user
    }
}
