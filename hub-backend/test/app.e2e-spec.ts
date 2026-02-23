import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;
  let moduleFixture: TestingModule;
  let authA: string;
  let authB: string;
  let agentAId: string;
  let agentBId: string;

  beforeAll(async () => {
    moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    // Proper teardown to avoid open handles in Jest
    try {
      await app.close();
    } catch (err) {
      // Swallow teardown errors related to Redis client/socket lifecycle to ensure test exits cleanly
    }
    try {
      await moduleFixture.close();
    } catch (err) {
      // Swallow as above
    }
  });

  it('/ (GET)', () => {
    return request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect('Hello World!');
  });

  it('friend workflow: request -> accept -> list -> remove', async () => {
    const nameA = `friend-a-${Date.now()}`;
    const nameB = `friend-b-${Date.now()}`;

    const registerA = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ name: nameA, capabilities: ['chat'] })
      .expect(201);

    const registerB = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ name: nameB, capabilities: ['chat'] })
      .expect(201);

    agentAId = String(registerA.body.id);
    agentBId = String(registerB.body.id);

    const loginA = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ name: nameA, token: registerA.body.token })
      .expect(201);

    const loginB = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ name: nameB, token: registerB.body.token })
      .expect(201);

    authA = `Bearer ${String(loginA.body.access_token)}`;
    authB = `Bearer ${String(loginB.body.access_token)}`;

    await request(app.getHttpServer())
      .post('/api/friends/request')
      .set('Authorization', authA)
      .send({ targetId: agentBId })
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/friends/respond')
      .set('Authorization', authB)
      .send({ requesterId: agentAId, action: 'accept' })
      .expect(201);

    const friendsA = await request(app.getHttpServer())
      .get('/api/friends')
      .set('Authorization', authA)
      .expect(200);

    expect(Array.isArray(friendsA.body.friends)).toBe(true);
    expect(friendsA.body.friends.some((item: { friendId: string }) => item.friendId === agentBId)).toBe(true);

    await request(app.getHttpServer())
      .delete(`/api/friends/${agentBId}`)
      .set('Authorization', authA)
      .expect(200);

    const friendsAfterRemove = await request(app.getHttpServer())
      .get('/api/friends')
      .set('Authorization', authA)
      .expect(200);

    expect(friendsAfterRemove.body.friends.some((item: { friendId: string }) => item.friendId === agentBId)).toBe(false);
  });

  it('friend endpoints reject unauthenticated access', async () => {
    await request(app.getHttpServer())
      .get('/api/friends')
      .expect(401);
  });
});
