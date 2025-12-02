import { Controller, Get, Post, Patch, Delete, Param, Body, UseGuards, Query } from '@nestjs/common';
import { BusinessesService } from './businesses.service';
import { CreateBusinessDto } from './dto/create-business.dto';
import { UpdateBusinessDto } from './dto/update-business.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { AccountRole } from 'src/common/enums';
import { SearchBusinessesQueryDto } from './dto/search-businesses.query.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(AccountRole.SuperAdmin)
@Controller('businesses')
export class BusinessesController {
    constructor(private readonly svc: BusinessesService) { }

    @Post()
    create(@Body() dto: CreateBusinessDto) {
        return this.svc.create(dto);
    }

    @Get()
    list(@Query() q: SearchBusinessesQueryDto) {
        return this.svc.search({
            ...q,
            rolesToExclude: [AccountRole.SuperAdmin]
        });
    }

    @Get(':id')
    findOne(@Param('id') id: string) {
        return this.svc.findOne(id);
    }

    @Patch(':id')
    update(@Param('id') id: string, @Body() dto: UpdateBusinessDto) {
        return this.svc.update(id, dto);
    }

    @Delete(':id')
    remove(@Param('id') id: string) {
        return this.svc.remove(id);
    }
}
