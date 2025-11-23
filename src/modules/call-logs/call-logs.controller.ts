
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { S3Client } from '@aws-sdk/client-s3';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import {
    Controller, Get,
    NotFoundException, UseGuards, Param, Res, Headers,
    Query
} from '@nestjs/common';
import type { Response } from 'express';


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

    @Get()
    search(@CurrentUser() user: JwtUser, @Query() q: SearchCallLogsQueryDto) {
        return this.svc.search(user.sub, q);
    }

    @Get(':id/recording')
    async getRecording(
        @Param('id') id: string,
        @Res() res: Response,
        @Headers('range') range?: string,
        @Headers('if-none-match') ifNoneMatch?: string,
        @Headers('if-modified-since') ifModifiedSince?: string,
    ) {
        const log = await this.svc.findById(id);

        if (log.recordingObjectKey) {
            const preSignedUrl = await this.mediaIngestService.getPresignedReadUrl(log.recordingObjectKey)
            res.setHeader('Cache-Control', 'no-store');
            return res.redirect(302, preSignedUrl);
        } else {
            throw new NotFoundException('Recording not available yet');
        }
    }
}
