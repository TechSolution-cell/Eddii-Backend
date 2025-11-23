import { Module } from '@nestjs/common';
import { BusinessesService } from './businesses.service';
import { BusinessesController } from './businesses.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Business } from 'src/entities/business.entity';

@Module({
    imports: [TypeOrmModule.forFeature([Business])],
    controllers: [BusinessesController],
    providers: [BusinessesService],
})
export class BusinessesModule { }
