// src/modules/dashboard/dashboard.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { DashboardController } from './dashboard.controller';
import { DashboardService } from './services/dashboard.service';

import { Business } from 'src/entities/business.entity';
import { CallVolumeHourly } from 'src/entities/call-volume-hourly.entity';
import { CallDepartmentHourlyKpi } from 'src/entities/call-department-hourly-kpi.entity';
import { DashboardSummaryService } from './services/dashboard-summary.service';
import { DashboardChartService } from './services/dashboard-chart.service';

@Module({
    imports: [TypeOrmModule.forFeature([Business, CallVolumeHourly, CallDepartmentHourlyKpi])],
    controllers: [DashboardController],
    providers: [DashboardService, DashboardSummaryService, DashboardChartService],
    exports: [DashboardService],
})
export class DashboardModule { }
