// src/modules/dashboard/dashboard.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

import { Business } from 'src/entities/business.entity';
import { CallAnalyticsHourly } from 'src/entities/call-analytics-hourly.entity';

@Module({
    imports: [TypeOrmModule.forFeature([Business, CallAnalyticsHourly])],
    controllers: [DashboardController],
    providers: [DashboardService],
    exports: [DashboardService],
})
export class DashboardModule { }
