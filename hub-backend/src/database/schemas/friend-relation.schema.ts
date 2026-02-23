import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type FriendRelationDocument = FriendRelation & Document;

export type FriendRelationStatus =
  | 'pending'
  | 'accepted'
  | 'rejected'
  | 'removed';

@Schema({ timestamps: true })
export class FriendRelation {
  @Prop({ required: true, index: true })
  requesterId: string;

  @Prop({ required: true, index: true })
  targetId: string;

  @Prop({ required: true, index: true })
  pairKey: string;

  @Prop({
    required: true,
    enum: ['pending', 'accepted', 'rejected', 'removed'],
    default: 'pending',
    index: true,
  })
  status: FriendRelationStatus;

  @Prop({ required: true, index: true })
  actedBy: string;
}

export const FriendRelationSchema =
  SchemaFactory.createForClass(FriendRelation);

FriendRelationSchema.index({ pairKey: 1, status: 1 });
FriendRelationSchema.index({ requesterId: 1, targetId: 1, status: 1 });
