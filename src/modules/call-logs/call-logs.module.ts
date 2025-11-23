import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CallLog } from '../../entities/call-log.entity';
import { CallLogsService } from './call-logs.service';
import { CallLogsController } from './call-logs.controller';
// import { MediaIngestService } from '../recordings/services/media-ingest.service';
import { RecordingsModule } from '../recordings/recordings.module';

@Module({
    imports: [TypeOrmModule.forFeature([CallLog]), RecordingsModule],
    providers: [CallLogsService],
    controllers: [CallLogsController],
    exports: [CallLogsService],
})
export class CallLogsModule { }
