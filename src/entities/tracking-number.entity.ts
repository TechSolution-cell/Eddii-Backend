import {
    Entity, PrimaryGeneratedColumn, Column, ManyToOne, Index,
    CreateDateColumn, UpdateDateColumn, JoinColumn,
    OneToMany
} from 'typeorm';

import { MarketingSource } from './marketing-source.entity';
import { NumberRoute } from './number-route.entity';
import { Business } from './business.entity';
import { TrackingNumberStatus } from 'src/common/enums';
import { CallLog } from './call-log.entity';


@Entity('tracking_numbers')
@Index(['marketingSourceId'])
@Index(['status'])
@Index(
    'uq_tracking_numbers_number_active',
    ['number'],
    { unique: true, where: `"status" = 'active'` } // <-- partial index predicate 
)
export class TrackingNumber {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Index()
    @Column({ name: 'number', type: 'varchar', length: 32 })
    number: string;   // E.164

    /** Capabilities reflect how the number was provisioned */
    @Column({ name: 'voice_enabled', type: 'boolean', default: true })
    voiceEnabled: boolean;

    @Column({ name: 'sms_enabled', type: 'boolean', default: false })
    smsEnabled: boolean;

    @Column({ name: 'mms_enabled', type: 'boolean', default: false })
    mmsEnabled: boolean;

    /** Twilio identifiers */
    @Index({ unique: true })
    @Column({ name: 'twilio_phone_sid', type: 'varchar', length: 64, nullable: true })
    twilioPhoneSid?: string;

    @Column({ name: 'twilio_messaging_service_sid', type: 'varchar', length: 64, nullable: true })
    twilioMessagingServiceSid?: string;

    /** Ownership via source (implies business) */
    @Column({ name: 'marketing_source_id', type: 'uuid', nullable: true })
    marketingSourceId: string | null;

    @ManyToOne(() => MarketingSource, (ms) => ms.trackingNumbers, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'marketing_source_id' })
    marketingSource: MarketingSource | null;

    @Column({ name: 'business_id', type: 'uuid', nullable: false })
    businessId: string;

    @ManyToOne(() => Business, (b) => b.trackingNumbers, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'business_id' })
    business: Business;

    /** All routes (history + scheduled + current) */
    @OneToMany(() => NumberRoute, (route) => route.trackingNumber, { cascade: false })
    routes: NumberRoute[];

    @OneToMany(() => CallLog, (log) => log.trackingNumberId, { cascade: false })
    callLogs: CallLog[];

    /** Lifecycle */
    @Column({
        name: 'status',
        type: 'enum',
        enum: TrackingNumberStatus,
        default: TrackingNumberStatus.Active,
    })
    status: TrackingNumberStatus;

    @Column({ name: 'country', type: 'varchar', length: 10, nullable: true })
    country?: string;

    @Column({ name: 'region', type: 'varchar', length: 64, nullable: true })
    region?: string;

    @Column({ name: 'purchased_at', type: 'timestamptz', nullable: true, precision: 3 })
    purchasedAt: Date | null;

    @Column({ name: 'released_at', type: 'timestamptz', nullable: true, precision: 3 })
    releasedAt: Date | null;

    @Column({ name: 'metadata', type: 'jsonb', nullable: true })
    metadata: Record<string, any> | null;

    @CreateDateColumn({ name: 'created_at', type: 'timestamptz', precision: 3 })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz', precision: 3 })
    updatedAt: Date;
}
