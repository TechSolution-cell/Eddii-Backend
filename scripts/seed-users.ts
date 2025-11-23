import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { config as dotenv } from 'dotenv';
import { hash } from 'bcrypt';
import { Business } from '../src/entities/business.entity';
import { MarketingSource } from '../src/entities/marketing-source.entity';
// import { CallTrackingNumber } from '../src/entities/number-route';
import { CallLog } from '../src/entities/call-log.entity';
import { AccountRole } from 'src/common/enums';

dotenv({ path: '.env.development' });

/**
 * Env overrides (all optional)
 * SUPER admin defaults:
 *   email=admin@yourbiz.com  pass=MyStr0ngPass!
 * BUSINESS admin defaults:
 *   email=owner@demo.com      pass=DemoPass!1   name=Demo Motors
 */
const SUPER_EMAIL = process.env.SEED_SUPER_EMAIL || 'john@hgreg.com';
const SUPER_PASS = process.env.SEED_SUPER_PASS || 'MyStr0ngPass!';

const BIZ_EMAIL = process.env.SEED_BIZ_EMAIL || 'owner@demo.com';
const BIZ_PASS = process.env.SEED_BIZ_PASS || 'DemoPass!1';
const BIZ_NAME = process.env.SEED_BIZ_NAME || 'Demo Motors';

const ds = new DataSource({
    type: 'postgres',
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    username: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    entities: [Business, MarketingSource, CallLog],
    synchronize: false, // keep false in prod; run after migrations or with synchronize=true in dev
    logging: false,
});

async function upsertBusinessAdmin(repo: ReturnType<typeof ds.getRepository>, email: string, pass: string, businessName: string, role: AccountRole) {
    let user = await repo.findOne({ where: { email } });
    if (user) {
        // if role or name changed, update; do not touch password unless env changed
        let changed = false;
        if (user.accountRole !== role) { user.accountRole = role; changed = true; }
        if (user.businessName !== businessName) { user.businessName = businessName; changed = true; }
        if (changed) {
            await repo.save(user);
            console.log(`Updated existing ${role}: ${email}`);
        } else {
            console.log(`Exists: ${role} ${email} (no changes)`);
        }
        return user;
    }

    const passwordHash = await hash(pass, 12);
    user = repo.create({
        email,
        passwordHash,
        businessName,
        accountRole: role,
    });
    await repo.save(user);
    console.log(`Created ${role}: ${email} (${businessName})`);
    return user;
}

async function main() {
    await ds.initialize();
    const repo = ds.getRepository(Business);

    // 1) SUPER_ADMIN
    await upsertBusinessAdmin(repo, SUPER_EMAIL, SUPER_PASS, 'John Hairabedian', AccountRole.SuperAdmin);

    // 2) BUSINESS_ADMIN (example business)
    await upsertBusinessAdmin(repo, BIZ_EMAIL, BIZ_PASS, BIZ_NAME, AccountRole.BusinessAdmin);

    await ds.destroy();

    console.log('\nSeed complete.');
    console.log(`- SUPER_ADMIN:    ${SUPER_EMAIL} / ${SUPER_PASS}`);
    console.log(`- BUSINESS_ADMIN: ${BIZ_EMAIL} / ${BIZ_PASS}`);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
