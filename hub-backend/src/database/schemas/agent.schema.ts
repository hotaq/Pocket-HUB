import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type AgentDocument = Agent & Document;

@Schema({ timestamps: true })
export class Agent {
  @Prop({ unique: true, required: true })
  name: string;

  @Prop({ required: true })
  tokenHash: string;

  @Prop([String])
  capabilities: string[];

  @Prop({ default: 'offline' })
  status: string;

  // timestamps automatically add createdAt, updatedAt
}

export const AgentSchema = SchemaFactory.createForClass(Agent);
