import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  FriendRelation,
  FriendRelationDocument,
  FriendRelationStatus,
} from '../database/schemas/friend-relation.schema';
import { FriendDomainError } from './friend.errors';

type RateCounter = { windowStart: number; count: number };

@Injectable()
export class FriendService {
  private readonly actionWindowMs = Number(
    process.env.FRIEND_ACTION_RATE_WINDOW_MS || 60_000,
  );
  private readonly actionMaxEvents = Number(
    process.env.FRIEND_ACTION_RATE_MAX || 20,
  );
  private readonly rateCounters = new Map<string, RateCounter>();

  constructor(
    @InjectModel(FriendRelation.name)
    private friendRelationModel: Model<FriendRelationDocument>,
  ) {}

  private pairKey(a: string, b: string): string {
    return [a, b].sort().join(':');
  }

  enforceActionRateLimit(agentId: string, action: string): void {
    const key = `${agentId}:${action}`;
    const now = Date.now();
    const current = this.rateCounters.get(key);
    if (!current || now - current.windowStart >= this.actionWindowMs) {
      this.rateCounters.set(key, { windowStart: now, count: 1 });
      return;
    }

    if (current.count >= this.actionMaxEvents) {
      throw new FriendDomainError(
        'RATE_LIMITED',
        `Too many ${action} operations in ${this.actionWindowMs}ms window`,
      );
    }

    current.count += 1;
  }

  async areFriends(a: string, b: string): Promise<boolean> {
    const relation = await this.friendRelationModel.findOne({
      pairKey: this.pairKey(a, b),
      status: 'accepted',
    });
    return !!relation;
  }

  async requestFriend(requesterId: string, targetId: string) {
    if (!targetId || requesterId === targetId) {
      throw new FriendDomainError(
        'INVALID_TARGET',
        'targetId must be a valid id different from requester',
      );
    }

    const pairKey = this.pairKey(requesterId, targetId);
    const existing = await this.friendRelationModel.findOne({ pairKey });

    if (existing?.status === 'pending') {
      throw new FriendDomainError(
        'DUPLICATE_PENDING_REQUEST',
        'A pending friend request already exists',
      );
    }

    if (existing?.status === 'accepted') {
      throw new FriendDomainError('ALREADY_FRIENDS', 'Agents are already friends');
    }

    if (existing) {
      existing.requesterId = requesterId;
      existing.targetId = targetId;
      existing.status = 'pending';
      existing.actedBy = requesterId;
      await existing.save();
      return existing;
    }

    const relation = new this.friendRelationModel({
      requesterId,
      targetId,
      pairKey,
      status: 'pending',
      actedBy: requesterId,
    });
    await relation.save();
    return relation;
  }

  async respondToRequest(
    actorId: string,
    requesterId: string,
    action: 'accept' | 'reject',
  ) {
    if (!requesterId || requesterId === actorId) {
      throw new FriendDomainError(
        'INVALID_TARGET',
        'requesterId must be a valid id different from actor',
      );
    }

    const relation = await this.friendRelationModel.findOne({
      requesterId,
      targetId: actorId,
      status: 'pending',
    });

    if (!relation) {
      throw new FriendDomainError(
        'REQUEST_NOT_FOUND',
        'Pending friend request not found',
      );
    }

    relation.status = action === 'accept' ? 'accepted' : 'rejected';
    relation.actedBy = actorId;
    await relation.save();
    return relation;
  }

  async listFriends(agentId: string) {
    const rows = await this.friendRelationModel.find({
      pairKey: new RegExp(`(^${agentId}:|:${agentId}$)`),
      status: 'accepted',
    });

    return rows.map((row) => {
      const rowWithTimestamp = row as FriendRelationDocument & {
        updatedAt?: Date;
      };
      return {
      relationId: row._id.toString(),
      friendId: row.requesterId === agentId ? row.targetId : row.requesterId,
      status: row.status,
      updatedAt: rowWithTimestamp.updatedAt,
      };
    });
  }

  async removeFriend(actorId: string, friendId: string) {
    if (!friendId || friendId === actorId) {
      throw new FriendDomainError(
        'INVALID_TARGET',
        'friendId must be a valid id different from actor',
      );
    }

    const relation = await this.friendRelationModel.findOne({
      pairKey: this.pairKey(actorId, friendId),
      status: 'accepted',
    });

    if (!relation) {
      throw new FriendDomainError(
        'REQUEST_NOT_FOUND',
        'Accepted friend relation not found',
      );
    }

    relation.status = 'removed';
    relation.actedBy = actorId;
    await relation.save();
    return relation;
  }

  normalizeStatus(status: FriendRelationStatus): FriendRelationStatus {
    return status;
  }
}
