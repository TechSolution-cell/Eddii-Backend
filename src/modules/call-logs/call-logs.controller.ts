import {
    Controller, Get,
    NotFoundException, UseGuards, Param, Query, Logger
} from '@nestjs/common';


import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtUser } from '../../common/decorators/current-user.decorator';

import { CallLogsService } from './call-logs.service';
import { MediaIngestService } from '../recordings/services/media-ingest.service';

import { SearchCallLogsQueryDto } from './dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('call-logs')
export class CallLogsController {
    constructor(
        private readonly svc: CallLogsService,
        private readonly mediaIngestService: MediaIngestService
    ) { }

    private readonly logger = new Logger(CallLogsController.name);

    @Get()
    search(@CurrentUser() user: JwtUser, @Query() q: SearchCallLogsQueryDto) {
        this.logger.debug(q);

        return this.svc.search(user.sub, q);
    }

    @Get(':id/recording')
    async getRecording(@Param('id') id: string): Promise<{ url: string }> {
        const log = await this.svc.findById(id);

        if (!log) {
            throw new NotFoundException('Call log not found');
        }

        if (!log.recordingObjectKey) {
            throw new NotFoundException('Recording not available yet');
        }

        try {
            const preSignedUrl = await this.mediaIngestService.getPresignedReadUrl(
                log.recordingObjectKey,
            );

            return { url: preSignedUrl };
        } catch (err) {
            throw new NotFoundException('Failed to get a recording url');
        }
    }
}
