import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { createClient, RedisClientType } from 'redis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private pubClient: RedisClientType;
  private subClient: RedisClientType;
  private sessionClient: RedisClientType;

  async onModuleInit() {
    const url = process.env.REDIS_URL || 'redis://localhost:6379';

    this.pubClient = createClient({ url });
    this.subClient = createClient({ url });
    this.sessionClient = createClient({ url });

    await Promise.all([
      this.pubClient.connect(),
      this.subClient.connect(),
      this.sessionClient.connect(),
    ]);
  }

  async onModuleDestroy() {
    await Promise.all([
      this.pubClient.quit(),
      this.subClient.quit(),
      this.sessionClient.quit(),
    ]);
  }

  getPubClient(): RedisClientType {
    return this.pubClient;
  }

  getSubClient(): RedisClientType {
    return this.subClient;
  }

  getSessionClient(): RedisClientType {
    return this.sessionClient;
  }

  async setSession(agentId: string, socketId: string): Promise<void> {
    await this.sessionClient.set(`session:${agentId}`, socketId);
  }

  async getSession(agentId: string): Promise<string | null> {
    return await this.sessionClient.get(`session:${agentId}`);
  }

  async removeSession(agentId: string): Promise<void> {
    await this.sessionClient.del(`session:${agentId}`);
  }

  async publish(channel: string, message: string): Promise<void> {
    await this.pubClient.publish(channel, message);
  }

  async subscribe(
    channel: string,
    listener: (message: string, channel: string) => void,
  ): Promise<void> {
    await this.subClient.subscribe(channel, listener);
  }
}
