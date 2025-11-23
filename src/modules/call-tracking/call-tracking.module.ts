
// ── Framework & Lib  ──────────────────────────────────────────────────────────────────
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

// ── App modules/services/providers  ────────────────────────────────────────────────────
import { TwilioModule } from '../twilio/twilio.module';
import { MarketingSourcesService } from '../marketing-sources/marketing-sources.service';
import { CallTrackingService } from './call-tracking.service';
import { CallTrackingController } from './call-tracking.controller';


// ── Domain (Entities/Repositories/Enums)  ───────────────────────────────────────────────
import { TrackingNumber } from 'src/entities/tracking-number.entity';
import { MarketingSource } from '../../entities/marketing-source.entity';
import { NumberRoute} from 'src/entities/number-route.entity';
import { Business } from 'src/entities/business.entity';

@Module({
    imports: [TypeOrmModule.forFeature([TrackingNumber, MarketingSource, NumberRoute, Business]), TwilioModule],
    controllers: [CallTrackingController],
    providers: [CallTrackingService, MarketingSourcesService],
    exports: [CallTrackingService],
})
export class CallTrackingModule { }
