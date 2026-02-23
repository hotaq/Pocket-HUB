import { Module } from '@nestjs/common';
import { AgentGateway } from './agent.gateway';
import { JwtModule } from '@nestjs/jwt';
import { WorkspaceService } from './workspace.service';
import { FriendModule } from '../friend/friend.module';

@Module({
  imports: [
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'secretKey',
    }),
    FriendModule,
  ],
  providers: [AgentGateway, WorkspaceService],
})
export class AgentModule {}
