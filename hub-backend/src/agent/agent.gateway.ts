import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Session, SessionDocument } from '../database/schemas/session.schema';
import { Agent, AgentDocument } from '../database/schemas/agent.schema';
import { WorkspaceService } from './workspace.service';

@WebSocketGateway({ cors: true })
@Injectable()
export class AgentGateway
  implements OnGatewayConnection, OnGatewayDisconnect, OnModuleInit
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(AgentGateway.name);

  constructor(
    private redisService: RedisService,
    private jwtService: JwtService,
    private workspaceService: WorkspaceService,
    @InjectModel(Session.name) private sessionModel: Model<SessionDocument>,
    @InjectModel(Agent.name) private agentModel: Model<AgentDocument>,
  ) {}

  async onModuleInit() {
    // Subscribe to redis for pub/sub broadcasting
    await this.redisService.subscribe('agent-broadcasts', (message) => {
      const parsed = JSON.parse(message) as {
        topic: string;
        payload: unknown;
        senderId?: string;
      };
      this.server.to(parsed.topic).emit('broadcast', parsed);
    });

    // Subscribe to direct messages
    await this.redisService.subscribe('agent-direct', (message) => {
      const parsed = JSON.parse(message) as {
        targetId: string;
        payload: unknown;
        senderId?: string;
      };
      this.server.to(`agent-${parsed.targetId}`).emit('direct-message', parsed);
    });
  }

  async handleConnection(client: Socket) {
    try {
      const auth = client.handshake.auth as { token?: string };
      const headers = client.handshake.headers as { authorization?: string };
      const token =
        auth.token?.split(' ')[1] || headers.authorization?.split(' ')[1];
      if (!token) throw new Error('No token provided');

      const payload = this.jwtService.verify<{ sub: string }>(token, {
        secret: String(process.env.JWT_SECRET || 'secretKey'),
      });
      const agentId = String(payload.sub);

      await this.redisService.setSession(agentId, client.id);

      const session = new this.sessionModel({ agentId, socketId: client.id });
      await session.save();

      await this.agentModel.findByIdAndUpdate(agentId, { status: 'online' });

      // Join a room specific to this agent for direct messaging
      await client.join(`agent-${agentId}`);
      (client.data as { agentId: string }).agentId = agentId;

      this.logger.log(`Agent connected: ${agentId}`);
    } catch (error) {
      this.logger.error(`Connection failed: ${(error as Error).message}`);
      client.disconnect();
    }
  }

  async handleDisconnect(client: Socket) {
    const agentId = (client.data as { agentId?: string }).agentId;
    if (agentId) {
      await this.redisService.removeSession(agentId);
      await this.sessionModel.deleteOne({ socketId: client.id });
      await this.agentModel.findByIdAndUpdate(agentId, { status: 'offline' });
      this.logger.log(`Agent disconnected: ${agentId}`);
    }
  }

  @SubscribeMessage('subscribe')
  async handleSubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { topic: string },
  ) {
    await client.join(data.topic);
    return { success: true, topic: data.topic };
  }

  @SubscribeMessage('broadcast')
  async handleBroadcast(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { topic: string; payload: unknown },
  ) {
    const message = {
      senderId: (client.data as { agentId: string }).agentId,
      topic: data.topic,
      payload: data.payload,
      timestamp: new Date().toISOString(),
    };

    await this.redisService.publish(
      'agent-broadcasts',
      JSON.stringify(message),
    );
    return { success: true };
  }

  @SubscribeMessage('direct-message')
  async handleDirectMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { targetId: string; payload: unknown },
  ) {
    const message = {
      senderId: (client.data as { agentId: string }).agentId,
      targetId: data.targetId,
      payload: data.payload,
      timestamp: new Date().toISOString(),
    };

    await this.redisService.publish('agent-direct', JSON.stringify(message));
    return { success: true };
  }

  @SubscribeMessage('request-help')
  async handleRequestHelp(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    data: { taskDescription: string; requiredCapabilities: string[] },
  ) {
    const message = {
      type: 'request-help',
      senderId: (client.data as { agentId: string }).agentId,
      taskDescription: data.taskDescription,
      requiredCapabilities: data.requiredCapabilities,
      timestamp: new Date().toISOString(),
    };
    await this.redisService.publish(
      'agent-broadcasts',
      JSON.stringify({ topic: 'global', payload: message }),
    );
    return { success: true };
  }

  @SubscribeMessage('accept-task')
  async handleAcceptTask(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { requesterId: string; taskId: string },
  ) {
    const message = {
      type: 'accept-task',
      senderId: (client.data as { agentId: string }).agentId,
      taskId: data.taskId,
      timestamp: new Date().toISOString(),
    };
    await this.redisService.publish(
      'agent-direct',
      JSON.stringify({ targetId: data.requesterId, payload: message }),
    );
    return { success: true };
  }

  @SubscribeMessage('workspace-write')
  async handleWorkspaceWrite(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    data: {
      workspaceId: string;
      newState: Record<string, unknown>;
      expectedVersion: number;
    },
  ) {
    try {
      const updated = await this.workspaceService.writeWorkspace(
        data.workspaceId,
        (client.data as { agentId: string }).agentId,
        data.newState,
        data.expectedVersion,
      );
      this.server
        .to(`workspace-${data.workspaceId}`)
        .emit('workspace-updated', updated);
      return { success: true, workspace: updated };
    } catch (e) {
      return { success: false, error: (e as Error).message };
    }
  }

  @SubscribeMessage('workspace-join')
  async handleWorkspaceJoin(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { workspaceId: string },
  ) {
    await client.join(`workspace-${data.workspaceId}`);
    const current = await this.workspaceService.getWorkspace(data.workspaceId);
    return { success: true, workspace: current };
  }
}
