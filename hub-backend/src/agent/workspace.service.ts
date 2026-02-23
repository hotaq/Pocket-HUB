import { Injectable } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class WorkspaceService {
  constructor(private redisService: RedisService) {}

  async getWorkspace(
    workspaceId: string,
  ): Promise<{ version: number; state: Record<string, unknown> }> {
    const data = await this.redisService
      .getSessionClient()
      .get(`workspace:${workspaceId}`);
    return data
      ? (JSON.parse(data) as {
          version: number;
          state: Record<string, unknown>;
        })
      : { version: 0, state: {} };
  }

  async writeWorkspace(
    workspaceId: string,
    agentId: string,
    newState: Record<string, unknown>,
    expectedVersion: number,
  ) {
    const current = await this.getWorkspace(workspaceId);

    // Conflict resolution: Optimistic concurrency control
    if (current.version !== expectedVersion) {
      throw new Error(
        `Conflict: Workspace version mismatch. Expected ${expectedVersion}, got ${current.version}`,
      );
    }

    const updated = {
      version: current.version + 1,
      lastUpdatedBy: agentId,
      state: { ...current.state, ...newState },
    };

    await this.redisService
      .getSessionClient()
      .set(`workspace:${workspaceId}`, JSON.stringify(updated));
    return updated;
  }
}
