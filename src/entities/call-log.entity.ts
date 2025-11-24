import {
  Entity, PrimaryGeneratedColumn, Column, ManyToOne, Index,
  CreateDateColumn, UpdateDateColumn,
  Check,
  JoinColumn
} from 'typeorm';
import { Business } from './business.entity';
import { MarketingSource } from './marketing-source.entity';
import { CallStatus, CallIntent, CallResult, CallDirection } from 'src/common/enums/telephony.enum';
import { TrackingNumber } from './tracking-number.entity';

import { TranscriptionSummary, Turn } from 'src/modules/recordings/services/transcription.service';

export enum RecordingStorageProvider {
  None = 'none',
  S3 = 's3',
  GCS = 'gcs',
  Azure = 'azure',
}


@Entity('call_logs')
@Index(['marketingSourceId', 'callStartedAt', 'id'])
// await queryRunner.query(`
//   CREATE INDEX IF NOT EXISTS idx_cl_msid_startedat_id_desc
//   ON call_logs (marketing_source_id ASC, call_started_at DESC, id DESC);
// `);
@Index(['callStartedAt', 'id'])
// CREATE INDEX idx_cl_startedat_id_desc
//   ON call_logs (call_started_at DESC, id DESC);
@Check('chk_call_logs_sentiment', '"sentiment" IS NULL OR ("sentiment" BETWEEN 1 AND 5)')
export class CallLog {
  /* ---------- IDs & Foreign Keys ---------- */
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // @Index()
  // @Column({ name: 'business_id', type: 'uuid' })
  // businessId: string;

  @Column({ name: 'marketing_source_id', type: 'uuid', nullable: true })
  readonly marketingSourceId: string | null;

  @Index()
  @Column({ name: 'tracking_number_id', type: 'uuid' })
  readonly trackingNumberId: string;

  /* ---------- Relations ---------- */
  // @ManyToOne(() => Business, (b) => b.callLogs, { onDelete: 'CASCADE' })
  // business: Business;

  @ManyToOne(() => TrackingNumber, (tn) => tn.callLogs, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tracking_number_id' })
  trackingNumber: TrackingNumber;

  @ManyToOne(() => MarketingSource, (ms) => ms.callLogs, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'marketing_source_id' })
  marketingSource: MarketingSource | null;

  /* ---------- Call Metadata ---------- */
  @Column({
    type: 'enum',
    enum: CallDirection,
    default: CallDirection.Inbound,
  })
  direction: CallDirection;

  @Column({
    type: 'enum',
    enum: CallStatus,
    default: CallStatus.Unknown,
  })
  status: CallStatus;

  /* ---------- Parties ---------- */
  @Column({ name: 'caller_number', type: 'varchar', length: 32, nullable: true })
  callerNumber?: string;

  @Column({ name: 'receiver_number', type: 'varchar', length: 32, nullable: true })
  receiverNumber?: string;

  /* ---------- Timing / Duration ---------- */
  @Index()
  @Column({ name: 'call_started_at', type: 'timestamptz', nullable: true })
  callStartedAt?: Date;

  @Column({ name: 'duration_seconds', type: 'int', nullable: true })
  durationSeconds?: number;

  /* ---------- Media / Transcript ---------- */
  @Column({ name: 'recording_url', type: 'text', nullable: true })
  recordingUrl?: string; // Twilio recording url

  // @Column({
  //   name: 'recording_storage_provider',
  //   type: 'enum',
  //   enum: RecordingStorageProvider,
  //   default: RecordingStorageProvider.None
  // })
  // recordingStorageProvider: RecordingStorageProvider;

  @Column({ name: 'recording_object_key', type: 'text', nullable: true })
  recordingObjectKey?: string; // S3 Bucket

  @Column({
    type: 'text',
    name: 'transcript_text',
    nullable: true,
    comment: 'Concatenated text of all turns (optional)',
  })
  transcriptText: string | null;

  @Column({ type: 'jsonb', name: 'transcript_json', nullable: true })
  transcriptJson: Omit<TranscriptionSummary, 'fullText'> | null;


  /* ---------- Third-Party IDs ---------- */
  @Index({ unique: true })
  @Column({ name: 'twilio_call_sid', type: 'varchar', length: 64, nullable: true })
  twilioCallSid?: string;

  /* ---------- Classification / Analytics ---------- */
  @Index()
  @Column({
    name: 'result',
    type: 'enum',
    enum: CallResult,
    default: CallResult.None,
  })
  result: CallResult;

  // 1–5 (nullable if not scored)
  @Index()
  @Column({ name: 'sentiment', type: 'smallint', nullable: true })
  sentiment?: number;

  @Index()
  @Column({
    name: 'intent',
    type: 'enum',
    enum: CallIntent,
    default: CallIntent.None
  })
  intent?: CallIntent;

  /* ---------- Auditing ---------- */
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz', precision: 3 })
  updatedAt: Date;
}


