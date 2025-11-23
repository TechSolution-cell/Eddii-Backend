import {
  Entity, PrimaryGeneratedColumn, Column, ManyToOne, Index,
  CreateDateColumn, UpdateDateColumn, JoinColumn,
  DeleteDateColumn
} from 'typeorm';

import { NumberRouteStatus } from 'src/common/enums/phone-number.enum';

import { TrackingNumber } from './tracking-number.entity';


@Entity('number_routes')
@Index(
  'uq_active_route_per_tn',
  ['trackingNumberId'],
  { unique: true, where: `status = 'active'` } // <-- partial index predicate 
)
@Index(['effectiveFrom', 'effectiveTo'])
export class NumberRoute {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** FK to the number; one active route at a time (enforced in app or DB) */
  @Column({ name: 'tracking_number_id', type: 'uuid', nullable: false })
  readonly trackingNumberId: string;

  @ManyToOne(() => TrackingNumber, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tracking_number_id' })
  trackingNumber: TrackingNumber;

  /** Channel forwarding */
  @Column({ name: 'forwarding_voice_number', type: 'varchar', length: 32, nullable: true })
  forwardingVoiceNumber?: string;

  @Column({ name: 'forwarding_sms_number', type: 'varchar', length: 32, nullable: true })
  forwardingSmsNumber?: string;

  @Column({ name: 'forwarding_mms_number', type: 'varchar', length: 32, nullable: true })
  forwardingMmsNumber?: string;

  /** Per-route overrides (recording/voicemail) */
  @Column({ name: 'recording_enabled', type: 'boolean', default: true })
  recordingEnabled: boolean;

  @Column({ name: 'voicemail_enabled', type: 'boolean', default: false })
  voicemailEnabled: boolean;

  @Column({ name: 'voicemail_greeting_url', type: 'varchar', length: 512, nullable: true })
  voicemailGreetingUrl?: string;

  @Column({ name: 'voicemail_transcribe', type: 'boolean', default: true })
  voicemailTranscribe: boolean;

  @Column({ name: 'voicemail_notify_emails', type: 'text', array: true, nullable: true })
  voicemailNotifyEmails?: string[];

  /** Optional: whisper (kept on route so you can A/B) */
  @Column({ name: 'call_whisper_enabled', type: 'boolean', default: false })
  callWhisperEnabled: boolean;

  @Column({ name: 'call_whisper_text', type: 'varchar', length: 255, nullable: true })
  callWhisperText?: string;


  @Column({
    name: 'status',
    type: 'enum',
    enum: NumberRouteStatus,
    default: NumberRouteStatus.Active
  })
  status: NumberRouteStatus; // enforce only one active per number

  @Column({ name: 'effective_from', type: 'timestamptz', default: () => 'NOW()' })
  effectiveFrom: Date;

  @Column({ name: 'effective_to', type: 'timestamptz', nullable: true })
  effectiveTo?: Date;

  /** For complex rules (time-of-day, round-robin, IVR, etc.) */
  @Column({ name: 'rules', type: 'jsonb', nullable: true })
  rules?: {
    hours?: { tz: string; periods: Array<{ dow: number[]; start: string; end: string }> };
    strategy?: 'single' | 'sequential' | 'round_robin' | 'ivr';
    agents?: Array<{ e164: string; weight?: number }>;
    afterHours?: { forwardTo?: string; voicemail?: boolean };
    smsAutoReply?: { text?: string; enabled?: boolean };
  };

  @Column({ name: 'metadata', type: 'jsonb', nullable: true })
  metadata?: Record<string, any>;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz', precision: 3 })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true, precision: 3 })
  deletedAt: Date | null;
}
