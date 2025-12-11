import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HourlyRollupService } from './services/hourly-rollup.service';

import { CallVolumeHourly } from 'src/entities/call-volume-hourly.entity';
import { CallDepartmentHourlyKpi } from 'src/entities/call-department-hourly-kpi.entity';

@Module({
    imports: [TypeOrmModule.forFeature([CallVolumeHourly, CallDepartmentHourlyKpi])],
    providers: [HourlyRollupService],
    exports: [HourlyRollupService],
})
export class AnalyticsModule { }
