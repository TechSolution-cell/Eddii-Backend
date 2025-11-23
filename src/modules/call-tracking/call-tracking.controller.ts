
// ── Framework & Lib  ──────────────────────────────────────────────────────────
import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { Query } from '@nestjs/common';

// ──  Internal shared/utils  ────────────────────────────────────────────────────────────
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtUser } from '../../common/decorators/current-user.decorator';

// ── App modules/services/providers  ──────────────────────────────────────────────────────────
import { CallTrackingService } from './call-tracking.service';

// ── API surface (DTOs)  ──────────────────────────────────────────────────────────
import { ProvisionNumberDto } from './dto/provision-number.dto';
import { UpdateTrackingNumberDto } from './dto/update-tracking-number.dto';
import { QueryAvailableNumbersDto } from './dto/query-available-numbers.dto';
import { SearchTrackingNumbersQueryDto } from './dto/search-tracking-numbers.query.dto';


@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('call-tracking')
export class CallTrackingController {
    constructor(private readonly svc: CallTrackingService) { }

    @Get('tracking-numbers')
    search(@CurrentUser() user: JwtUser, @Query() q: SearchTrackingNumbersQueryDto) {
        return this.svc.search({
            businessId: user.sub,
            ...q
        });
    }

    @Post('tracking-numbers/provision')
    provision(@CurrentUser() user: JwtUser, @Body() dto: ProvisionNumberDto) {
        return this.svc.provision(user.sub, dto);
    }

    @Get('available-numbers')
    searchAvailableNumbers(
        @CurrentUser() user: JwtUser,
        @Query() query: QueryAvailableNumbersDto,
    ) {
        return this.svc.availableNumbers(user.sub, query);
    }

    @Patch('tracking-numbers/:id')
    update(@CurrentUser() user: JwtUser, @Param('id') id: string, @Body() dto: UpdateTrackingNumberDto) {
        return this.svc.update(user.sub, id, dto);
    }

    @Delete('tracking-numbers/:id')
    remove(@CurrentUser() user: JwtUser, @Param('id') id: string) {
        return this.svc.remove(user.sub, id);
    }
}
