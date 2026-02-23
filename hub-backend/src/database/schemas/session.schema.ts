import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { Agent } from './agent.schema';

export type SessionDocument = Session & Document;

@Schema({ timestamps: true })
export class Session {
  @Prop({ required: true })
  socketId: string;

  @Prop({ type: Types.ObjectId, ref: 'Agent', required: true })
  agentId: Agent | Types.ObjectId;

  @Prop({ default: Date.now })
  connectedAt: Date;

  @Prop({ default: Date.now })
  lastActiveAt: Date;
}

export const SessionSchema = SchemaFactory.createForClass(Session);
