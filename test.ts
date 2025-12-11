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


async function main() {
    const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI3N2UxMTYzMS1kNDQwLTRkMWQtYmQ0NS00ZjM0ZDgzYjUxNDQiLCJuYW1lIjoiRGVtbyBNb3RvcnMiLCJlbWFpbCI6Im93bmVyQGRlbW8uY29tIiwicm9sZSI6IkJVU0lORVNTX0FETUlOIiwicmVtZW1iZXJNZSI6ZmFsc2UsImlhdCI6MTc2NDcyNzQ3OCwiZXhwIjoxNzY1MzMyMjc4LCJqdGkiOiI0NjFiOTdhMi01OWVkLTQ5MDItODMwZi00MzM4MmEyZTUyYjcifQ.F1p-wRv08-64kKqWgyTIKpRcL3QUX5VgtWY_F-KdmnQ'
    const hashToken = '$2b$12$7g0RLDWqtFE4T5iyugnusuZ8FXJOPDCONlPIyWbIKXqNBXxjj/Vdy'

    const ok = await compareToken(token, hashToken)

    console.log(ok);
}


main().catch((err) => {
    console.error(err);
    process.exit(1);
});