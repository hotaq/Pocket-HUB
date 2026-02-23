import { Module, Global } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Agent, AgentSchema } from './schemas/agent.schema';
import { Session, SessionSchema } from './schemas/session.schema';
import { Resource, ResourceSchema } from './schemas/resource.schema';
import {
  FriendRelation,
  FriendRelationSchema,
} from './schemas/friend-relation.schema';

@Global()
@Module({
  imports: [
    MongooseModule.forRoot(
      process.env.MONGODB_URI || 'mongodb://localhost:27017/openclaw_hub',
    ),
    MongooseModule.forFeature([
      { name: Agent.name, schema: AgentSchema },
      { name: Session.name, schema: SessionSchema },
      { name: Resource.name, schema: ResourceSchema },
      { name: FriendRelation.name, schema: FriendRelationSchema },
    ]),
  ],
  exports: [MongooseModule],
})
export class DatabaseModule {}
