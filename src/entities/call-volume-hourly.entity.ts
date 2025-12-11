import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    Index,
    Unique,
    CreateDateColumn,
    UpdateDateColumn,
} from 'typeorm';

@Entity('call_volume_hourly')
@Index(['businessId', 'bucketStartUtc'])
@Index(['businessId', 'marketingSourceId', 'bucketStartUtc'])
@Unique(
    'uq_call_volume_hourly_business_source_bucket',
    ['businessId', 'marketingSourceId', 'bucketStartUtc'],
)
export class CallVolumeHourly {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'business_id', type: 'uuid' })
    businessId: string;

    @Column({ name: 'marketing_source_id', type: 'uuid', nullable: true })
    marketingSourceId: string | null;

    /**
     * Start of the 1-hour bucket in UTC (e.g. 2025-03-01T15:00:00Z)
     */
    @Column({ name: 'bucket_start_utc', type: 'timestamptz' })
    bucketStartUtc: Date;

    @Column({ name: 'total_calls', type: 'int', default: 0 })
    totalCalls: number;

    @Column({ name: 'total_seconds', type: 'int', default: 0 })
    totalSeconds: number;

    @CreateDateColumn({ name: 'created_at', type: 'timestamptz', precision: 3 })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz', precision: 3 })
    updatedAt: Date;
}
