import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';

function digestToken(token: string): string {
    // 64-char hex string (32 bytes) — safely under bcrypt's 72-byte limit
    return crypto.createHash('sha256').update(token, 'utf8').digest('hex');
}

export async function hashToken(token: string): Promise<string> {
    const salt = await bcrypt.genSalt(12);
    return bcrypt.hash(digestToken(token), salt);
}

export async function compareToken(token: string, hash: string): Promise<boolean> {
    return bcrypt.compare(digestToken(token), hash);
}
