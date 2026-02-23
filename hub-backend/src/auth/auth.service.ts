import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { Agent, AgentDocument } from '../database/schemas/agent.schema';

@Injectable()
export class AuthService {
    constructor(
        @InjectModel(Agent.name) private agentModel: Model<AgentDocument>,
        private jwtService: JwtService,
    ) { }

    async validateAgent(
        name: string,
        pass: string,
    ): Promise<Record<string, unknown> | null> {
        const agent = await this.agentModel.findOne({ name }).exec();
        if (agent && (await bcrypt.compare(pass, agent.tokenHash))) {
            const result = agent.toObject() as unknown as Record<string, unknown>;
            delete result.tokenHash;
            return result;
        }
        return null;
    }

    login(agent: { name: string; _id: { toString: () => string } }) {
        const payload = { username: agent.name, sub: agent._id.toString() };
        return {
            access_token: this.jwtService.sign(payload),
        };
    }

    async register(name: string, capabilities: string[]) {
        // Basic implementation mimicking token generation for bots
        const plainToken = Array.from({ length: 32 }, () =>
            Math.random().toString(36).charAt(2),
        ).join('');
        const tokenHash = await bcrypt.hash(plainToken, 10);

        const agent = new this.agentModel({
            name,
            tokenHash,
            capabilities,
            status: 'offline', // default
        });

        await agent.save();

        return {
            // eslint-disable-next-line @typescript-eslint/no-base-to-string
            id: agent._id.toString(),
            name: agent.name,
            token: plainToken,
        };
    }
}
