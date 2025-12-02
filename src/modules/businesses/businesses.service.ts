
// ──  Framework & Lib  ──────────────────────────────────────────────────────────
import { DataSource, ILike, Repository } from 'typeorm';

import { Injectable, BadRequestException, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

// ──  Internal shared/utils  ────────────────────────────────────────────────────────────
import { handleDbError, PgQueryError, isRetryablePgError, sleep } from 'src/common/utils';
import type { Paginated } from 'src/common/utils';
import { escapeLike } from 'src/common/utils/like-utils';

// ── Domain (Entities/Repositories/Enums)  ──────────────────────────────────────────────────────────
import { Business } from '../../entities/business.entity';
import { AccountRole } from 'src/common/enums';
import { SortOrder, BusinessSortBy } from 'src/common/enums';

// ── API surface (DTOs)  ──────────────────────────────────────────────────────────
import { BusinessResponseDto, CreateBusinessDto, UpdateBusinessDto } from './dto';

// ── Local/feature utilities  ──────────────────────────────────────────────────────────
import { hashPassword } from '../auth/utils/password.util';
import { BusinessStatus } from 'src/common/enums';
import { SearchBusinessesQueryDto } from './dto/search-businesses.query.dto';


const SAFE_SELECT: (keyof Business)[] = [
    'id',
    'email',
    'businessName',
    'maxTrackingNumbers',
    'trackingNumbersUsedCount',
    'createdAt',
    'updatedAt'
] as const;

type SearchOptions = SearchBusinessesQueryDto & {
    rolesToExclude?: AccountRole[];
};

@Injectable()
export class BusinessesService {
    constructor(
        @InjectRepository(Business) private repo: Repository<Business>,
        private readonly dataSource: DataSource
    ) { }

    static readonly MAX_RETRIES = 3;

    async create(dto: CreateBusinessDto) {
        try {
            const [isEmailInUse, isBusinessNameInUse] = await Promise.all([
                this.repo.exists({ where: { email: ILike(dto.email) } }),
                this.repo.exists({ where: { businessName: ILike(dto.businessName) } }),
            ]);

            if (isEmailInUse) {
                throw new BadRequestException('Email already in use');
            }
            if (isBusinessNameInUse) {
                throw new BadRequestException('Business name already in use');
            }

            const b = this.repo.create({
                email: dto.email,
                businessName: dto.businessName,
                maxTrackingNumbers: dto.maxTrackingNumbers,
                trackingNumbersUsedCount: 0,
                passwordHash: await hashPassword(dto.password),
                accountRole: AccountRole.BusinessAdmin,
                status: BusinessStatus.Active
            });
            return this.repo.save(b);
        } catch (err) {
            handleDbError(err as PgQueryError, 'Cannot create business');
        }
    }

    async search(opts: SearchOptions): Promise<Paginated<BusinessResponseDto>> {

        const page = Math.max(1, Number(opts?.page ?? 1));
        const limit = Math.min(100, Math.max(1, Number(opts?.limit ?? 20)));

        const SORTABLE = new Set<string>(Object.values(BusinessSortBy));

        const sortBy: BusinessSortBy = SORTABLE.has(String(opts?.sortBy))
            ? opts!.sortBy as BusinessSortBy
            : BusinessSortBy.CreatedAt;

        const sortOrder: SortOrder =
            String(opts?.sortOrder ?? '').toUpperCase() === SortOrder.ASC
                ? SortOrder.ASC
                : SortOrder.DESC;

        try {
            const qb = this.repo
                .createQueryBuilder('biz')
                .select(SAFE_SELECT.map((c) => `biz.${String(c)}`))
                .where('biz.status = :status', { status: BusinessStatus.Active })
                .orderBy(`biz.${sortBy}`, sortOrder)
                .skip((page - 1) * limit)
                .take(limit);

            // Exclude by accountRole (default: SuperAdmin)
            const rolesToExclude = opts?.rolesToExclude?.length ? opts.rolesToExclude : [AccountRole.SuperAdmin];
            if (rolesToExclude.length) {
                qb.andWhere('biz.accountRole NOT IN (:...exclusions)', { exclusions: rolesToExclude });
            }

            // name partial match
            if (opts?.name?.trim()) {
                const name = `%${escapeLike(opts.name.trim())}%`;
                qb.andWhere("biz.businessName ILIKE :name ESCAPE '\\'", { name });
            }

            // email exact match
            if (opts?.email?.trim()?.toLowerCase()) {
                const email = opts.email.trim().toLowerCase();
                qb.andWhere("biz.email = :email", { email });
            }

            // createdAt range
            if (opts?.createdFrom) qb.andWhere('biz.createdAt >= :from', { from: opts.createdFrom });
            if (opts?.createdTo) qb.andWhere('biz.createdAt < :to', { to: opts.createdTo });

            const [rows, total] = await qb.getManyAndCount();

            const pageCount = Math.max(1, Math.ceil(total / limit));
            return {
                items: rows as unknown as BusinessResponseDto[],
                meta: {
                    total,
                    page,
                    limit,
                    pageCount,
                    hasNext: page < pageCount,
                    hasPrev: page > 1,
                },
            };
        } catch (err: any) {
            handleDbError(err as PgQueryError, 'Cannot load businesses');
        }
    }

    // async findAll(): Promise<Paginated<BusinessResponseDto>> {
    //     return this.search();
    // }

    async findOne(id: string): Promise<BusinessResponseDto> {
        const b = await this.repo.findOne({
            where: { id },
            select: SAFE_SELECT,
        });
        if (!b) throw new NotFoundException('Business not found');
        return b as unknown as BusinessResponseDto;
    }

    async update(id: string, dto: UpdateBusinessDto) {
        if (!id) throw new BadRequestException('Business id is required');

        // Determine if there's anything to update (treat undefined as "do not touch")
        const hasWork =
            dto?.email !== undefined ||
            dto?.businessName !== undefined ||
            dto?.maxTrackingNumbers !== undefined ||
            dto?.password !== undefined;

        if (!hasWork) {
            throw new BadRequestException('Nothing to update');
        }

        const [isEmailInUse, isBusinessNameInUse] = await Promise.all([
            dto.email ? this.repo.exists({ where: { email: ILike(dto.email) } }) : false,
            dto.businessName ? this.repo.exists({ where: { businessName: ILike(dto.businessName) } }) : false,
        ]);

        if (isEmailInUse) {
            throw new BadRequestException('This email is already associated with an account. Try signing in or use a different email.');
        }

        if (isBusinessNameInUse) {
            throw new BadRequestException('This business name is already in use. Please choose a different name.');
        }

        // Guard — ensure new maxTrackingNumbers is not less than the current used count
        if (dto.maxTrackingNumbers) {
            const qbRes = await this.repo
                .createQueryBuilder()
                .update(this.repo.metadata.target)
                .set({ maxTrackingNumbers: dto.maxTrackingNumbers } as any)
                .where('id = :id', { id })
                .andWhere(':newMax >= "tracking_numbers_used_count"', { newMax: dto.maxTrackingNumbers })
                .returning(['tracking_numbers_used_count'])
                .execute();

            if (!qbRes.affected) {
                const current = await this.repo.findOne({
                    where: { id },
                    select: ['trackingNumbersUsedCount', 'maxTrackingNumbers'],
                });

                const used = current?.trackingNumbersUsedCount ?? 'unknown';
                throw new BadRequestException(
                    `Max tracking numbers cannot be less than current used count (used: ${used}, requested: ${dto.maxTrackingNumbers}).`
                );
            }
        }

        const MAX = BusinessesService.MAX_RETRIES ?? 3;

        for (let attempt = 1; attempt <= MAX; attempt++) {
            try {
                await this.dataSource.transaction(async (manager) => {
                    const bRepo = manager.withRepository(this.repo);

                    // Load fresh inside the txn
                    const row = await bRepo.findOne({ where: { id } });
                    if (!row) throw new NotFoundException('Business not found');

                    // Snapshot timestamp for OCC
                    const ts = (row as any).updatedAt;

                    // Build SET payload (only provided fields) + bump updatedAt
                    const set: any = { updatedAt: () => 'NOW()' };

                    if (dto.email !== undefined) set.email = dto.email;
                    if (dto.businessName !== undefined) set.businessName = dto.businessName;
                    if (dto.maxTrackingNumbers !== undefined) set.maxTrackingNumbers = dto.maxTrackingNumbers;
                    if (dto.password !== undefined) {
                        set.passwordHash = await hashPassword(dto.password);
                    }

                    const res = await bRepo
                        .createQueryBuilder()
                        .update(bRepo.metadata.target)
                        .set(set)
                        .where('id = :id AND "updated_at" = :updatedAt', {
                            id: (row as any).id,
                            updatedAt: ts,
                        })
                        .execute();

                    if (res.affected === 0) {
                        throw new ConflictException('Business was updated concurrently');
                    }
                });

                // Success: return the fresh row 
                const updatedBiz = await this.repo.findOne({ where: { id }, select: SAFE_SELECT });
                return {
                    updated: true,
                    biz: updatedBiz
                }
            } catch (err: any) {
                if (err instanceof ConflictException || isRetryablePgError?.(err)) {
                    if (attempt < MAX) {
                        const jitter = 15 + Math.floor(Math.random() * 35); // 15–50ms
                        await sleep(jitter);
                        continue;
                    }
                    throw new ConflictException('Concurrent update detected; please retry');
                }
                return handleDbError(err as PgQueryError, 'Cannot update business');
            }
        }

        // Defensive fallback
        throw new ConflictException('Concurrent update detected; please retry');
    }


    async remove(id: string) {
        const b = await this.repo.findOne({ where: { id } });
        if (!b) throw new NotFoundException('Business not found');
        try {
            await this.repo.update(id, { status: BusinessStatus.Deleted });
            await this.repo.softDelete(id); // sets deletedAt
            // await this.repo.remove(b);
        } catch (err) {
            handleDbError(err as PgQueryError, 'Cannot delete business');
        }
        return { deleted: true };
    }
}
