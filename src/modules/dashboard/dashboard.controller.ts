import { Controller, Get, Query, UseGuards } from '@nestjs/common';

import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtUser } from '../../common/decorators/current-user.decorator';

import { DashboardService } from './services/dashboard.service';

import {
    DashboardRangeQueryDto,
    DashboardStaticQueryDto,
} from './dto/dashboard-query.dto';
import {
    DashboardStaticResponseDto,
    DashboardRangeResponseDto,
} from './dto/dashboard-response.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('dashboard')
export class DashboardController {
    constructor(private readonly dashboardService: DashboardService) { }

    /**
     * 1) STATIC METRICS
     *    - Today / Last 7 Days / Last 30 Days for Sales & Service
     */
    @Get('static')
    async getStaticDashboard(
        @CurrentUser() user: JwtUser,
        @Query() query: DashboardStaticQueryDto,
    ): Promise<DashboardStaticResponseDto> {
        return this.dashboardService.getStaticDashboard(user.sub, query);
    }

    /**
     * 2) SELECTED RANGE + CHART
     *    - Selected range metrics for Sales & Service
     *    - Chart data for the same filters.
     */
    @Get('range')
    async getRangeDashboard(
        @CurrentUser() user: JwtUser,
        @Query() query: DashboardRangeQueryDto,
    ): Promise<DashboardRangeResponseDto> {
        return this.dashboardService.getRangeDashboard(user.sub, query);
    }
}
