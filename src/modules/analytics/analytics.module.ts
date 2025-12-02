import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HourlyRollupService } from './services/hourly-rollup.service';
import { CallAnalyticsHourly } from 'src/entities/call-analytics-hourly.entity';

@Module({
    imports: [TypeOrmModule.forFeature([CallAnalyticsHourly])],
    providers: [HourlyRollupService],
    exports: [HourlyRollupService],
})
export class AnalyticsModule { }
