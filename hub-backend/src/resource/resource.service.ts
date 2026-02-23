import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
    Resource,
    ResourceDocument,
} from '../database/schemas/resource.schema';
import { Agent, AgentDocument } from '../database/schemas/agent.schema';

@Injectable()
export class ResourceService {
    constructor(
        @InjectModel(Resource.name) private resourceModel: Model<ResourceDocument>,
        @InjectModel(Agent.name) private agentModel: Model<AgentDocument>,
    ) { }

    async publish(
        agentId: string,
        data: {
            title?: string;
            description?: string;
            content?: string;
            tags?: string[];
            version?: string;
        },
    ) {
        if (!data.title || !data.content) {
            throw new BadRequestException('Title and content are required');
        }

        const agent = await this.agentModel.findById(agentId);
        if (!agent) {
            throw new BadRequestException('Agent not found');
        }

        const resource = new this.resourceModel({
            title: data.title,
            description: data.description || '',
            content: data.content,
            tags: data.tags || [],
            version: data.version || '1.0.0',
            authorId: agentId,
        });

        return await resource.save();
    }

    async search(query: string, tags?: string[]) {
        const filter: Record<string, unknown> = {};

        if (query) {
            filter.$or = [
                { title: { $regex: query, $options: 'i' } },
                { description: { $regex: query, $options: 'i' } },
            ];
        }

        if (tags && tags.length > 0) {
            filter.tags = { $all: tags };
        }

        return await this.resourceModel
            .find(filter as any)
            .populate('authorId', 'name status')
            .exec();
    }
}
