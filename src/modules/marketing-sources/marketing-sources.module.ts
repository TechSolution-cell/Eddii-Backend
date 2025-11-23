import { Module } from '@nestjs/common';
import { MarketingSourcesService } from './marketing-sources.service';
import { MarketingSourcesController } from './marketing-sources.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MarketingSource } from 'src/entities/marketing-source.entity';
import { TrackingNumber } from 'src/entities/tracking-number.entity';

@Module({
    imports: [TypeOrmModule.forFeature([MarketingSource, TrackingNumber])],
    controllers: [MarketingSourcesController],
    providers: [MarketingSourcesService],
})
export class MarketingSourcesModule { }
