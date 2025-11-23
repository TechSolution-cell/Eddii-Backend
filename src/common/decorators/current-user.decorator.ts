import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export interface JwtUser {
    sub: string;     // business id
    email: string;
    role: 'SUPER_ADMIN' | 'BUSINESS_ADMIN';
}

export const CurrentUser = createParamDecorator(
    (data: unknown, ctx: ExecutionContext): JwtUser => {
        const req = ctx.switchToHttp().getRequest();
        return req.user;
    },
);
