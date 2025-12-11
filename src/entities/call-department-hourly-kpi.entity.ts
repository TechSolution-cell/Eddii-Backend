import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    Index,
    Unique,
    CreateDateColumn,
    UpdateDateColumn,
} from 'typeorm';
import { CallDepartment } from 'src/common/enums/telephony.enum';

@Entity('call_department_hourly_kpis')
@Index(['businessId', 'department', 'bucketStartUtc'])
@Index(['businessId', 'department', 'marketingSourceId', 'bucketStartUtc'])
@Unique(
    'uq_call_department_hourly_kpis_business_dept_source_bucket',
    ['businessId', 'department', 'marketingSourceId', 'bucketStartUtc'],
)
export class CallDepartmentHourlyKpi {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'business_id', type: 'uuid' })
    businessId: string;

    @Column({
        name: 'department',
        type: 'enum',
        enum: CallDepartment,
    })
    department: CallDepartment;

    @Column({ name: 'marketing_source_id', type: 'uuid', nullable: true })
    marketingSourceId: string | null;

    /**
     * Start of the 1-hour bucket in UTC (e.g. 2025-03-01T15:00:00Z)
     */
    @Column({ name: 'bucket_start_utc', type: 'timestamptz' })
    bucketStartUtc: Date;

    // ---- KPIs for this hour ---------------------------------------------

    @Column({ name: 'total_calls', type: 'int', default: 0 })
    totalCalls: number;

    @Column({ name: 'connected_calls', type: 'int', default: 0 })
    connectedCalls: number;

    @Column({ name: 'requested_appointments', type: 'int', default: 0 })
    requestedAppointments: number;

    @Column({ name: 'booked_appointments', type: 'int', default: 0 })
    bookedAppointments: number;

    @Column({ name: 'sentiment_sum', type: 'int', default: 0 })
    sentimentSum: number;

    @Column({ name: 'sentiment_count', type: 'int', default: 0 })
    sentimentCount: number;

    // optional: if you want minutes per department too
    @Column({ name: 'total_seconds', type: 'int', default: 0 })
    totalSeconds: number;

    @CreateDateColumn({ name: 'created_at', type: 'timestamptz', precision: 3 })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz', precision: 3 })
    updatedAt: Date;
}
