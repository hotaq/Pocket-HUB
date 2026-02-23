import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  UseGuards,
  Req,
} from '@nestjs/common';
import { ResourceService } from './resource.service';
import { AuthGuard } from '@nestjs/passport';

@Controller('api/resources')
export class ResourceController {
  constructor(private resourceService: ResourceService) {}

  @UseGuards(AuthGuard('jwt'))
  @Post('publish')
  async publish(
    @Req() req: { user: { userId: string } },
    @Body()
    body: {
      title: string;
      description: string;
      content: string;
      tags: string[];
    },
  ) {
    // AuthGuard('jwt') attaches the validated user payload to req.user
    const agentId = req.user.userId;
    return this.resourceService.publish(agentId, body);
  }

  @Get('search')
  async search(@Query('q') query: string, @Query('tags') tagsStr: string) {
    const tags = tagsStr ? tagsStr.split(',') : [];
    return this.resourceService.search(query, tags);
  }
}
