import {
    Entity, PrimaryGeneratedColumn, Column, ManyToOne, Index,
    CreateDateColumn, UpdateDateColumn, OneToMany, JoinColumn,
    DeleteDateColumn
} from 'typeorm';
import { Business } from './business.entity';
import { TrackingNumber } from './tracking-number.entity';
import { MarketingSourceStatus } from 'src/common/enums/marketing.enum';
import { CallLog } from './call-log.entity';

@Entity('marketing_sources')
@Index(['businessId', 'id'])
// CREATE INDEX idx_ms_business_id_id
//   ON marketing_sources (business_id, id);
export class MarketingSource {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Index({ unique: true })
    @Column({ type: 'varchar', length: 255 })
    name: string;

    @Column({ type: 'text', nullable: true, default: '' })
    description?: string;

    @Column({ type: 'varchar', length: 255, nullable: true, default: '' })
    channel?: string;

    @Column({ name: 'campaign_name', type: 'varchar', length: 255, nullable: true, default: '' })
    campaignName?: string;

    @Index()
    @Column({
        name: 'status',
        type: 'enum',
        enum: MarketingSourceStatus,
        default: MarketingSourceStatus.Active,
    })
    status: MarketingSourceStatus;

    @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true, precision: 3 })
    deletedAt: Date | null;

    @Column({ name: 'business_id', type: 'uuid' })
    readonly businessId: string; // mirror of the FK column

    @ManyToOne(() => Business, (b) => b.marketingSources, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'business_id' })
    business: Business;

    @OneToMany(() => TrackingNumber, (tn) => tn.marketingSource)
    trackingNumbers: TrackingNumber[];


    @OneToMany(() => CallLog, (cl) => cl.marketingSource)
    callLogs: CallLog[];

    @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz', precision: 3 })
    updatedAt: Date;
}
