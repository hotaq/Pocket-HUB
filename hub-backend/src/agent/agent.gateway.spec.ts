import { Socket } from 'socket.io';
import { Model } from 'mongoose';
import { JwtService } from '@nestjs/jwt';
import { AgentGateway } from './agent.gateway';
import { RedisService } from '../redis/redis.service';
import { WorkspaceService } from './workspace.service';
import { SessionDocument } from '../database/schemas/session.schema';
import { AgentDocument } from '../database/schemas/agent.schema';
import { FriendService } from '../friend/friend.service';

const buildClient = (agentId?: string): Socket =>
  ({
    data: agentId ? { agentId } : {},
    join: jest.fn(async () => undefined),
  } as unknown as Socket);

describe('AgentGateway messaging', () => {
  let gateway: AgentGateway;
  let redisMock: jest.Mocked<
    Pick<
      RedisService,
      'publish' | 'subscribe' | 'getSession' | 'setSession' | 'removeSession'
    >
  >;
  let friendServiceMock: jest.Mocked<Pick<FriendService, 'areFriends'>>;

  beforeEach(() => {
    redisMock = {
      publish: jest.fn(async (_channel: string, _message: string) => undefined),
      subscribe: jest.fn(
        async (_channel: string, _listener: (message: string) => void) =>
          undefined,
      ),
      getSession: jest.fn(async (_agentId: string) => null),
      setSession: jest.fn(async (_agentId: string, _socketId: string) => undefined),
      removeSession: jest.fn(async (_agentId: string) => undefined),
    };

    friendServiceMock = {
      areFriends: jest.fn(async (_a: string, _b: string) => true),
    };

    gateway = new AgentGateway(
      redisMock as unknown as RedisService,
      {} as JwtService,
      {} as WorkspaceService,
      friendServiceMock as unknown as FriendService,
      {} as Model<SessionDocument>,
      {} as Model<AgentDocument>,
    );
  });

  it('rejects broadcast when sender is unauthenticated', async () => {
    const ack = await gateway.handleBroadcast(buildClient(), {
      topic: 'global',
      payload: { hello: 'world' },
    });

    expect(ack.success).toBe(false);
    expect(ack.code).toBe('UNAUTHORIZED');
    expect(redisMock.publish).not.toHaveBeenCalled();
  });

  it('normalizes broadcast envelope and acknowledges accepted-for-routing-only', async () => {
    const ack = await gateway.handleBroadcast(buildClient('sender-1'), {
      topic: 'global',
      payload: { content: 'hi' },
    });

    expect(ack).toMatchObject({
      success: true,
      status: 'accepted',
      semantics: 'accepted-for-routing-only',
    });

    expect(redisMock.publish).toHaveBeenCalledTimes(1);
    const [channel, payload] = redisMock.publish.mock.calls[0];
    expect(channel).toBe('agent-broadcasts');

    const parsed = JSON.parse(payload) as {
      messageId: string;
      type: string;
      senderId: string;
      topic: string;
      payload: unknown;
      timestamp: string;
    };
    expect(parsed.type).toBe('broadcast');
    expect(parsed.senderId).toBe('sender-1');
    expect(parsed.topic).toBe('global');
    expect(parsed.messageId.length).toBeGreaterThan(0);
    expect(parsed.timestamp.length).toBeGreaterThan(0);
  });

  it('rejects direct-message when target is offline', async () => {
    redisMock.getSession.mockResolvedValueOnce(null);

    const ack = await gateway.handleDirectMessage(buildClient('sender-1'), {
      targetId: 'receiver-1',
      payload: { content: 'hello' },
    });

    expect(ack.success).toBe(false);
    expect(ack.code).toBe('TARGET_OFFLINE');
    expect(redisMock.publish).not.toHaveBeenCalled();
  });

  it('routes direct-message when target is online', async () => {
    redisMock.getSession.mockResolvedValueOnce('socket-2');

    const ack = await gateway.handleDirectMessage(buildClient('sender-1'), {
      targetId: 'receiver-1',
      payload: { senderId: 'spoof', content: 'hello' },
    });

    expect(ack.success).toBe(true);
    expect(redisMock.publish).toHaveBeenCalledTimes(1);

    const [channel, payload] = redisMock.publish.mock.calls[0];
    expect(channel).toBe('agent-direct');
    const parsed = JSON.parse(payload) as {
      senderId: string;
      targetId: string;
      type: string;
      payload: { senderId?: string; content?: string };
    };

    expect(parsed.type).toBe('direct-message');
    expect(parsed.senderId).toBe('sender-1');
    expect(parsed.targetId).toBe('receiver-1');
    expect(parsed.payload.senderId).toBe('spoof');
  });

  it('rejects oversized payloads', async () => {
    const previousMaxBytes = process.env.AGENT_MSG_MAX_BYTES;
    process.env.AGENT_MSG_MAX_BYTES = '8';
    try {
      gateway = new AgentGateway(
        redisMock as unknown as RedisService,
        {} as JwtService,
        {} as WorkspaceService,
        friendServiceMock as unknown as FriendService,
        {} as Model<SessionDocument>,
        {} as Model<AgentDocument>,
      );

      const ack = await gateway.handleBroadcast(buildClient('sender-1'), {
        topic: 'global',
        payload: { tooBig: '0123456789' },
      });

      expect(ack.success).toBe(false);
      expect(ack.code).toBe('PAYLOAD_TOO_LARGE');
    } finally {
      if (previousMaxBytes === undefined) {
        delete process.env.AGENT_MSG_MAX_BYTES;
      } else {
        process.env.AGENT_MSG_MAX_BYTES = previousMaxBytes;
      }
    }
  });

  it('supports request-help as online-only broadcast', async () => {
    const ack = await gateway.handleRequestHelp(buildClient('agent-1'), {
      taskDescription: 'Need assistance',
      requiredCapabilities: ['math', 'code'],
    });

    expect(ack.success).toBe(true);
    expect(redisMock.publish).toHaveBeenCalledTimes(1);
    const [channel, payload] = redisMock.publish.mock.calls[0];
    expect(channel).toBe('agent-broadcasts');

    const parsed = JSON.parse(payload) as {
      type: string;
      topic: string;
      payload: { taskDescription: string; requiredCapabilities: string[] };
    };
    expect(parsed.type).toBe('request-help');
    expect(parsed.topic).toBe('global');
    expect(parsed.payload.taskDescription).toBe('Need assistance');
  });

  it('routes broadcast-all with accepted ack semantics', async () => {
    const ack = await gateway.handleBroadcastAll(buildClient('agent-1'), {
      payload: { notice: 'hello everyone' },
      includeSender: false,
    });

    expect(ack.success).toBe(true);
    expect(redisMock.publish).toHaveBeenCalledTimes(1);

    const [channel, payload] = redisMock.publish.mock.calls[0];
    expect(channel).toBe('agent-broadcast-all');
    const parsed = JSON.parse(payload) as {
      type: string;
      senderId: string;
      payload: { notice: string };
    };
    expect(parsed.type).toBe('broadcast-all');
    expect(parsed.senderId).toBe('agent-1');
    expect(parsed.payload.notice).toBe('hello everyone');
  });

  it('rejects direct-message when friend policy is enabled and relation is missing', async () => {
    const previousPolicy = process.env.FRIEND_REQUIRED_FOR_DIRECT;
    process.env.FRIEND_REQUIRED_FOR_DIRECT = 'true';
    friendServiceMock.areFriends.mockResolvedValueOnce(false);

    try {
      gateway = new AgentGateway(
        redisMock as unknown as RedisService,
        {} as JwtService,
        {} as WorkspaceService,
        friendServiceMock as unknown as FriendService,
        {} as Model<SessionDocument>,
        {} as Model<AgentDocument>,
      );

      const ack = await gateway.handleDirectMessage(buildClient('sender-1'), {
        targetId: 'receiver-1',
        payload: { content: 'blocked' },
      });

      expect(ack.success).toBe(false);
      expect(ack.code).toBe('FRIENDSHIP_REQUIRED');
      expect(redisMock.publish).not.toHaveBeenCalled();
    } finally {
      if (previousPolicy === undefined) {
        delete process.env.FRIEND_REQUIRED_FOR_DIRECT;
      } else {
        process.env.FRIEND_REQUIRED_FOR_DIRECT = previousPolicy;
      }
    }
  });
});
