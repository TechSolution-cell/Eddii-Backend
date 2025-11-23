import { Controller, Get, Post, Patch, Delete, Param, Body, UseGuards, Query } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { MarketingSourcesService } from './marketing-sources.service';
import { CreateMarketingSourceDto } from './dto/create-marketing-source.dto';
import { UpdateMarketingSourceDto } from './dto/update-marketing-source.dto';
import { AccountRole } from 'src/common/enums';
import { SearchMarketingSourcesQueryDto } from './dto/search-marketing-sources.query.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(AccountRole.BusinessAdmin)
@Controller('marketing-sources')
export class MarketingSourcesController {
    constructor(private readonly svc: MarketingSourcesService) { }

    @Post()
    create(@CurrentUser() user: JwtUser, @Body() dto: CreateMarketingSourceDto) {
        return this.svc.create(user.sub, dto);
    }

    @Get()
    search(@CurrentUser() user: JwtUser, @Query() q: SearchMarketingSourcesQueryDto) {
        return this.svc.search(user.sub, q);
    }

    @Get(':id')
    findOne(@CurrentUser() user: JwtUser, @Param('id') id: string) {
        return this.svc.findOneScoped(user.sub, id);
    }

    @Patch(':id')
    update(@CurrentUser() user: JwtUser, @Param('id') id: string, @Body() dto: UpdateMarketingSourceDto) {
        return this.svc.update(user.sub, id, dto);
    }

    @Delete(':id')
    remove(@CurrentUser() user: JwtUser, @Param('id') id: string) {
        return this.svc.remove(user.sub, id);
    }
}
