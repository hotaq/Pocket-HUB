import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { randomUUID } from 'crypto';
import { Server, Socket } from 'socket.io';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Session, SessionDocument } from '../database/schemas/session.schema';
import { Agent, AgentDocument } from '../database/schemas/agent.schema';
import { WorkspaceService } from './workspace.service';
import {
  BroadcastAllMessageEnvelope,
  BroadcastMessageEnvelope,
  DirectMessageEnvelope,
  MessagingAck,
} from './messaging.types';
import { FriendService } from '../friend/friend.service';

@WebSocketGateway({ cors: true })
@Injectable()
export class AgentGateway
  implements OnGatewayConnection, OnGatewayDisconnect, OnModuleInit
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(AgentGateway.name);
  private readonly maxPayloadBytes = Number(
    process.env.AGENT_MSG_MAX_BYTES || 16 * 1024,
  );
  private readonly rateLimitWindowMs = Number(
    process.env.AGENT_MSG_RATE_WINDOW_MS || 10_000,
  );
  private readonly rateLimitMaxEvents = Number(
    process.env.AGENT_MSG_RATE_MAX || 30,
  );
  private readonly friendRequiredForDirect =
    String(process.env.FRIEND_REQUIRED_FOR_DIRECT || 'false').toLowerCase() ===
    'true';
  private readonly rateCounters = new Map<
    string,
    { windowStart: number; count: number }
  >();

  constructor(
    private redisService: RedisService,
    private jwtService: JwtService,
    private workspaceService: WorkspaceService,
    private friendService: FriendService,
    @InjectModel(Session.name) private sessionModel: Model<SessionDocument>,
    @InjectModel(Agent.name) private agentModel: Model<AgentDocument>,
  ) {}

  async onModuleInit() {
    // Subscribe to redis for pub/sub broadcasting
    await this.redisService.subscribe('agent-broadcasts', (message) => {
      try {
        const parsed = JSON.parse(message) as BroadcastMessageEnvelope;
        this.server.to(parsed.topic).emit('broadcast', parsed);
      } catch (error) {
        this.logger.warn(
          `Skipping invalid broadcast message from redis: ${(error as Error).message}`,
        );
      }
    });

    // Subscribe to direct messages
    await this.redisService.subscribe('agent-direct', (message) => {
      try {
        const parsed = JSON.parse(message) as DirectMessageEnvelope;
        this.server.to(`agent-${parsed.targetId}`).emit('direct-message', parsed);
      } catch (error) {
        this.logger.warn(
          `Skipping invalid direct message from redis: ${(error as Error).message}`,
        );
      }
    });

    await this.redisService.subscribe('agent-broadcast-all', (message) => {
      try {
        const parsed = JSON.parse(message) as BroadcastAllMessageEnvelope;
        if (parsed.includeSender) {
          this.server.emit('broadcast-all', parsed);
          return;
        }
        this.server
          .except(`agent-${parsed.senderId}`)
          .emit('broadcast-all', parsed);
      } catch (error) {
        this.logger.warn(
          `Skipping invalid broadcast-all message from redis: ${(error as Error).message}`,
        );
      }
    });
  }

  private acceptedAck(messageId: string): MessagingAck {
    return {
      success: true,
      status: 'accepted',
      semantics: 'accepted-for-routing-only',
      messageId,
    };
  }

  private rejectedAck(code: NonNullable<MessagingAck['code']>, error: string): MessagingAck {
    return {
      success: false,
      status: 'rejected',
      semantics: 'accepted-for-routing-only',
      code,
      error,
    };
  }

  private enforceRateLimit(senderId: string, eventName: string): MessagingAck | null {
    const key = `${senderId}:${eventName}`;
    const now = Date.now();
    const current = this.rateCounters.get(key);

    if (!current || now - current.windowStart >= this.rateLimitWindowMs) {
      this.rateCounters.set(key, { windowStart: now, count: 1 });
      return null;
    }

    if (current.count >= this.rateLimitMaxEvents) {
      return this.rejectedAck(
        'RATE_LIMITED',
        `Too many ${eventName} events in ${this.rateLimitWindowMs}ms window`,
      );
    }

    current.count += 1;
    return null;
  }

  private payloadByteSize(payload: unknown): number {
    return Buffer.byteLength(JSON.stringify(payload ?? null), 'utf8');
  }

  private validateTopic(topic: unknown): string | null {
    if (typeof topic !== 'string') return null;
    const trimmed = topic.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  private validateTargetId(targetId: unknown): string | null {
    if (typeof targetId !== 'string') return null;
    const trimmed = targetId.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  private validatePayload(payload: unknown): MessagingAck | null {
    if (payload === undefined) {
      return this.rejectedAck('INVALID_PAYLOAD', 'payload is required');
    }

    const bytes = this.payloadByteSize(payload);
    if (bytes > this.maxPayloadBytes) {
      return this.rejectedAck(
        'PAYLOAD_TOO_LARGE',
        `payload exceeds ${this.maxPayloadBytes} bytes`,
      );
    }

    return null;
  }

  private getSenderId(client: Socket): string | null {
    const senderId = (client.data as { agentId?: string }).agentId;
    return typeof senderId === 'string' && senderId.length > 0 ? senderId : null;
  }

  private async enforceFriendPolicy(
    senderId: string,
    targetId: string,
  ): Promise<MessagingAck | null> {
    if (!this.friendRequiredForDirect) {
      return null;
    }

    const isFriend = await this.friendService.areFriends(senderId, targetId);
    if (isFriend) {
      return null;
    }

    return this.rejectedAck(
      'FRIENDSHIP_REQUIRED',
      'direct collaboration requires an accepted friend relation',
    );
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
    const topic = this.validateTopic(data?.topic);
    if (!topic) {
      return this.rejectedAck('INVALID_PAYLOAD', 'topic must be a non-empty string');
    }

    await client.join(topic);
    return { ...this.acceptedAck(randomUUID()), topic };
  }

  @SubscribeMessage('broadcast')
  async handleBroadcast(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { topic?: unknown; payload?: unknown },
  ): Promise<MessagingAck> {
    const senderId = this.getSenderId(client);
    if (!senderId) {
      return this.rejectedAck('UNAUTHORIZED', 'sender is not authenticated');
    }

    const rateLimitError = this.enforceRateLimit(senderId, 'broadcast');
    if (rateLimitError) return rateLimitError;

    const topic = this.validateTopic(data?.topic);
    if (!topic) {
      return this.rejectedAck('INVALID_PAYLOAD', 'topic must be a non-empty string');
    }

    const payloadError = this.validatePayload(data?.payload);
    if (payloadError) return payloadError;

    const message: BroadcastMessageEnvelope = {
      messageId: randomUUID(),
      type: 'broadcast',
      senderId,
      topic,
      payload: data.payload,
      timestamp: new Date().toISOString(),
    };

    await this.redisService.publish(
      'agent-broadcasts',
      JSON.stringify(message),
    );
    return this.acceptedAck(message.messageId);
  }

  @SubscribeMessage('broadcast-all')
  async handleBroadcastAll(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { payload?: unknown; includeSender?: unknown },
  ): Promise<MessagingAck> {
    const senderId = this.getSenderId(client);
    if (!senderId) {
      return this.rejectedAck('UNAUTHORIZED', 'sender is not authenticated');
    }

    const rateLimitError = this.enforceRateLimit(senderId, 'broadcast-all');
    if (rateLimitError) return rateLimitError;

    const payloadError = this.validatePayload(data?.payload);
    if (payloadError) return payloadError;

    const message: BroadcastAllMessageEnvelope = {
      messageId: randomUUID(),
      type: 'broadcast-all',
      senderId,
      payload: data.payload,
      includeSender: data?.includeSender === true,
      timestamp: new Date().toISOString(),
    };

    await this.redisService.publish(
      'agent-broadcast-all',
      JSON.stringify(message),
    );
    return this.acceptedAck(message.messageId);
  }

  @SubscribeMessage('direct-message')
  async handleDirectMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { targetId?: unknown; payload?: unknown },
  ): Promise<MessagingAck> {
    const senderId = this.getSenderId(client);
    if (!senderId) {
      return this.rejectedAck('UNAUTHORIZED', 'sender is not authenticated');
    }

    const rateLimitError = this.enforceRateLimit(senderId, 'direct-message');
    if (rateLimitError) return rateLimitError;

    const targetId = this.validateTargetId(data?.targetId);
    if (!targetId) {
      return this.rejectedAck('INVALID_PAYLOAD', 'targetId must be a non-empty string');
    }

    const payloadError = this.validatePayload(data?.payload);
    if (payloadError) return payloadError;

    const friendshipError = await this.enforceFriendPolicy(senderId, targetId);
    if (friendshipError) return friendshipError;

    const targetSession = await this.redisService.getSession(targetId);
    if (!targetSession) {
      return this.rejectedAck('TARGET_OFFLINE', `target agent ${targetId} is offline`);
    }

    const message: DirectMessageEnvelope = {
      messageId: randomUUID(),
      type: 'direct-message',
      senderId,
      targetId,
      payload: data.payload,
      timestamp: new Date().toISOString(),
    };

    await this.redisService.publish('agent-direct', JSON.stringify(message));
    return this.acceptedAck(message.messageId);
  }

  @SubscribeMessage('request-help')
  async handleRequestHelp(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    data: { taskDescription?: unknown; requiredCapabilities?: unknown },
  ): Promise<MessagingAck> {
    const senderId = this.getSenderId(client);
    if (!senderId) {
      return this.rejectedAck('UNAUTHORIZED', 'sender is not authenticated');
    }

    const rateLimitError = this.enforceRateLimit(senderId, 'request-help');
    if (rateLimitError) return rateLimitError;

    if (typeof data?.taskDescription !== 'string' || data.taskDescription.trim().length === 0) {
      return this.rejectedAck(
        'INVALID_PAYLOAD',
        'taskDescription must be a non-empty string',
      );
    }

    const capabilities = Array.isArray(data?.requiredCapabilities)
      ? data.requiredCapabilities.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      : null;

    if (!capabilities) {
      return this.rejectedAck(
        'INVALID_PAYLOAD',
        'requiredCapabilities must be an array of strings',
      );
    }

    const message: BroadcastMessageEnvelope = {
      messageId: randomUUID(),
      type: 'request-help',
      senderId,
      topic: 'global',
      payload: {
        taskDescription: data.taskDescription.trim(),
        requiredCapabilities: capabilities,
      },
      timestamp: new Date().toISOString(),
    };

    await this.redisService.publish(
      'agent-broadcasts',
      JSON.stringify(message),
    );
    return this.acceptedAck(message.messageId);
  }

  @SubscribeMessage('accept-task')
  async handleAcceptTask(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { requesterId?: unknown; taskId?: unknown },
  ): Promise<MessagingAck> {
    const senderId = this.getSenderId(client);
    if (!senderId) {
      return this.rejectedAck('UNAUTHORIZED', 'sender is not authenticated');
    }

    const rateLimitError = this.enforceRateLimit(senderId, 'accept-task');
    if (rateLimitError) return rateLimitError;

    const requesterId = this.validateTargetId(data?.requesterId);
    if (!requesterId) {
      return this.rejectedAck(
        'INVALID_PAYLOAD',
        'requesterId must be a non-empty string',
      );
    }

    if (typeof data?.taskId !== 'string' || data.taskId.trim().length === 0) {
      return this.rejectedAck('INVALID_PAYLOAD', 'taskId must be a non-empty string');
    }

    const friendshipError = await this.enforceFriendPolicy(senderId, requesterId);
    if (friendshipError) return friendshipError;

    const requesterSession = await this.redisService.getSession(requesterId);
    if (!requesterSession) {
      return this.rejectedAck(
        'TARGET_OFFLINE',
        `target agent ${requesterId} is offline`,
      );
    }

    const message: DirectMessageEnvelope = {
      messageId: randomUUID(),
      type: 'accept-task',
      senderId,
      targetId: requesterId,
      payload: {
        taskId: data.taskId.trim(),
      },
      timestamp: new Date().toISOString(),
    };

    await this.redisService.publish(
      'agent-direct',
      JSON.stringify(message),
    );
    return this.acceptedAck(message.messageId);
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
