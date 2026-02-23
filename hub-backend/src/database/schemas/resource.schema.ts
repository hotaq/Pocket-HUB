import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { Agent } from './agent.schema';

export type ResourceDocument = Resource & Document;

@Schema({ timestamps: true })
export class Resource {
  @Prop({ required: true })
  title: string;

  @Prop()
  description: string;

  @Prop({ type: Object })
  content: any;

  @Prop([String])
  tags: string[];

  @Prop({ default: '1.0.0' })
  version: string;

  @Prop({ type: Types.ObjectId, ref: 'Agent' })
  authorId: Agent | Types.ObjectId;
}

export const ResourceSchema = SchemaFactory.createForClass(Resource);
