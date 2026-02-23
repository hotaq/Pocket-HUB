import { FriendService } from './friend.service';
import { FriendDomainError } from './friend.errors';

type RelationRecord = {
  _id: string;
  requesterId: string;
  targetId: string;
  pairKey: string;
  status: 'pending' | 'accepted' | 'rejected' | 'removed';
  actedBy: string;
  updatedAt?: Date;
  save: () => Promise<void>;
};

const createModelMock = () => {
  const records: RelationRecord[] = [];
  let idCounter = 0;

  const createRecord = (payload: Partial<RelationRecord>) => {
    const record: RelationRecord = {
      _id: `r-${++idCounter}`,
      requesterId: payload.requesterId || '',
      targetId: payload.targetId || '',
      pairKey: payload.pairKey || '',
      status: payload.status || 'pending',
      actedBy: payload.actedBy || '',
      updatedAt: new Date(),
      save: async () => {
        record.updatedAt = new Date();
        const idx = records.findIndex((item) => item._id === record._id);
        if (idx === -1) {
          records.push(record);
          return;
        }
        records[idx] = record;
      },
    };
    return record;
  };

  const model = function model(this: unknown, payload: Partial<RelationRecord>) {
    return createRecord(payload);
  } as unknown as {
    new (payload: Partial<RelationRecord>): RelationRecord;
    findOne: jest.Mock;
    find: jest.Mock;
  };

  model.findOne = jest.fn(async (query: Record<string, unknown>) => {
    if (query.pairKey && query.status) {
      return (
        records.find(
          (item) => item.pairKey === query.pairKey && item.status === query.status,
        ) || null
      );
    }

    if (query.pairKey) {
      return records.find((item) => item.pairKey === query.pairKey) || null;
    }

    if (query.requesterId && query.targetId && query.status) {
      return (
        records.find(
          (item) =>
            item.requesterId === query.requesterId &&
            item.targetId === query.targetId &&
            item.status === query.status,
        ) || null
      );
    }

    return null;
  });

  model.find = jest.fn(async (query: Record<string, unknown>) => {
    const status = query.status as string;
    const regex = query.pairKey as RegExp;
    return records.filter(
      (item) => item.status === status && regex.test(item.pairKey),
    );
  });

  return { model, records };
};

describe('FriendService', () => {
  it('creates pending friend requests and prevents duplicates', async () => {
    const { model } = createModelMock();
    const service = new FriendService(model as never);

    const first = await service.requestFriend('agent-a', 'agent-b');
    expect(first.status).toBe('pending');

    await expect(service.requestFriend('agent-a', 'agent-b')).rejects.toEqual(
      expect.objectContaining<Partial<FriendDomainError>>({
        code: 'DUPLICATE_PENDING_REQUEST',
      }),
    );
  });

  it('accepts pending request and lists reciprocal friendship', async () => {
    const { model } = createModelMock();
    const service = new FriendService(model as never);

    await service.requestFriend('agent-a', 'agent-b');
    await service.respondToRequest('agent-b', 'agent-a', 'accept');

    expect(await service.areFriends('agent-a', 'agent-b')).toBe(true);
    const friendsOfA = await service.listFriends('agent-a');
    expect(friendsOfA[0].friendId).toBe('agent-b');
  });

  it('removes accepted friendship and blocks further friendship checks', async () => {
    const { model } = createModelMock();
    const service = new FriendService(model as never);

    await service.requestFriend('agent-a', 'agent-b');
    await service.respondToRequest('agent-b', 'agent-a', 'accept');
    await service.removeFriend('agent-a', 'agent-b');

    expect(await service.areFriends('agent-a', 'agent-b')).toBe(false);
  });

  it('rejects invalid targets and missing pending requests', async () => {
    const { model } = createModelMock();
    const service = new FriendService(model as never);

    await expect(service.requestFriend('agent-a', 'agent-a')).rejects.toEqual(
      expect.objectContaining<Partial<FriendDomainError>>({
        code: 'INVALID_TARGET',
      }),
    );

    await expect(
      service.respondToRequest('agent-b', 'agent-a', 'accept'),
    ).rejects.toEqual(
      expect.objectContaining<Partial<FriendDomainError>>({
        code: 'REQUEST_NOT_FOUND',
      }),
    );
  });
});
