import {
  Entity, PrimaryGeneratedColumn, Column, OneToMany,
  CreateDateColumn, UpdateDateColumn, Index,
  BeforeInsert, BeforeUpdate,
  DeleteDateColumn,
  Check
} from 'typeorm';
import { MarketingSource } from './marketing-source.entity';
import { TrackingNumber } from './tracking-number.entity';
import { CallLog } from './call-log.entity';
import { AccountRole } from 'src/common/enums';
import { BusinessStatus } from 'src/common/enums';


@Entity('businesses')
@Check('chk_business_max_tracking_numbers',
  '"max_tracking_numbers" BETWEEN 0 AND 10000)'
)
export class Business {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 255 })
  email: string;

  @Column({ name: 'password_hash', type: 'varchar', length: 255 })
  passwordHash: string;

  @Index({ unique: true })
  @Column({ name: 'business_name', type: 'varchar', length: 255, default: '' })
  businessName: string;
  
  @Column({
    name: 'timezone',
    type: 'varchar',
    length: 64,
    default: 'UTC',
  })
  timezone: string;


  @Column({ name: 'max_tracking_numbers', type: 'int', default: 10 })
  maxTrackingNumbers: number;

  @Column({ name: 'tracking_numbers_used_count', type: 'int', default: 0 })
  trackingNumbersUsedCount: number;

  @Column({ name: 'account_role', type: 'varchar', length: 32, default: AccountRole.BusinessAdmin })
  accountRole: AccountRole;

  @Column({ name: 'refresh_token_hash', type: 'varchar', length: 255, nullable: true })
  refreshTokenHash: string | null;

  @Index()
  @Column({
    name: 'status',
    type: 'enum',
    enum: BusinessStatus,
    default: BusinessStatus.Active,
  })
  status: BusinessStatus;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true, precision: 3 })
  deletedAt: Date | null;

  @OneToMany(() => MarketingSource, (ms) => ms.business)
  marketingSources: MarketingSource[];

  @OneToMany(() => TrackingNumber, (ct) => ct.business)
  trackingNumbers: TrackingNumber[];

  @OneToMany(() => CallLog, (cl) => cl.business)
  callLogs: CallLog[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz', precision: 3 })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz', precision: 3 })
  updatedAt: Date;

  @BeforeInsert()
  @BeforeUpdate()
  normalizeEmail() {
    this.email = (this.email ?? '').trim().toLowerCase();
  }
}
