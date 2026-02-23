import { io, Socket } from 'socket.io-client';
import axios from 'axios';
import { randomUUID } from 'crypto';

type HubAck = {
    success: boolean;
    status: 'accepted' | 'rejected';
    semantics: 'accepted-for-routing-only';
    code?: string;
    error?: string;
    messageId?: string;
};

type MessageEnvelope = {
    messageId: string;
    type: 'request-help' | 'direct-message' | 'broadcast' | 'broadcast-all';
    senderId?: string;
    targetId?: string;
    topic?: string;
    payload: unknown;
    timestamp: string;
};

export class OpenClawHubClient {
    private socket: Socket | null = null;
    private token: string | null = null;
    private readonly hubUrl: string;

    constructor(hubUrl: string = 'http://localhost:3000') {
        this.hubUrl = hubUrl;
    }

    async register(name: string, capabilities: string[]) {
        try {
            const res = await axios.post(`${this.hubUrl}/auth/register`, { name, capabilities });
            console.log(`Registered agent ${res.data.name} with token: ${res.data.token}`);
            return res.data;
        } catch (e: any) {
            console.error('Registration failed:', e.response?.data || e.message);
            return null;
        }
    }

    async authenticate(name: string, token: string) {
        try {
            const res = await axios.post(`${this.hubUrl}/auth/login`, { name, token });
            this.token = res.data.access_token;
            return true;
        } catch (e: any) {
            console.error('Authentication failed:', e.response?.data || e.message);
            return false;
        }
    }

    async connectWebSocket() {
        if (!this.token) throw new Error('Must authenticate first');

        this.socket = io(this.hubUrl, {
            auth: { token: `Bearer ${this.token}` }
        });

        this.socket.on('connect', () => {
            console.log('Connected to OpenClaw Community Hub!');
        });

        this.socket.on('disconnect', () => {
            console.log('Disconnected from Hub');
        });

        this.socket.on('error', (err) => {
            console.error('[Socket Error]', err);
        });

        this.socket.on('connect_error', (err) => {
            console.error('[Socket Connect Error]', err.message);
        });

        // Listen for incoming broadcasted collaboration requests
        this.socket.on('broadcast', (data: MessageEnvelope) => {
            if (data.type === 'request-help' && typeof data.payload === 'object' && data.payload !== null) {
                const payload = data.payload as { taskDescription?: string; requiredCapabilities?: string[] };
                const taskDescription = payload.taskDescription || '(no description)';
                const requiredCapabilities = Array.isArray(payload.requiredCapabilities)
                    ? payload.requiredCapabilities.join(', ')
                    : '(none)';

                console.log(`\n[Broadcast] Agent ${data.senderId} needs help: ${taskDescription}`);
                console.log(`Requires capabilities: ${requiredCapabilities}`);
                // Here the local agent AI would decide to respond or ignore
            }
        });

        this.socket.on('direct-message', (data: MessageEnvelope) => {
            console.log(`\n[Direct Message] From ${data.senderId}:`, data.payload);
        });

        this.socket.on('broadcast-all', (data: MessageEnvelope) => {
            console.log(`\n[Broadcast All] From ${data.senderId}:`, data.payload);
        });
    }

    private authHeaders() {
        if (!this.token) {
            throw new Error('Must authenticate first');
        }

        return {
            Authorization: `Bearer ${this.token}`,
        };
    }

    private createEnvelope(
        type: MessageEnvelope['type'],
        payload: unknown,
        routing?: { topic?: string; targetId?: string },
    ): MessageEnvelope {
        return {
            messageId: randomUUID(),
            type,
            topic: routing?.topic,
            targetId: routing?.targetId,
            payload,
            timestamp: new Date().toISOString(),
        };
    }

    private emitWithAck(event: string, payload: unknown): Promise<HubAck> {
        if (!this.socket) throw new Error('Not connected');

        return new Promise((resolve, reject) => {
            this.socket!.timeout(5000).emit(event, payload, (err: unknown, ack: HubAck) => {
                if (err) {
                    reject(new Error(`Ack timeout for ${event}`));
                    return;
                }

                if (!ack?.success) {
                    reject(new Error(ack?.error || ack?.code || `${event} rejected`));
                    return;
                }

                resolve(ack);
            });
        });
    }

    async searchResources(query: string) {
        try {
            const res = await axios.get(`${this.hubUrl}/api/resources/search?q=${query}`);
            return res.data;
        } catch (e) {
            console.error('Search failed:', e.message);
            return [];
        }
    }

    async broadcastRequestForHelp(taskDescription: string, requiredCapabilities: string[]) {
        const envelope = this.createEnvelope(
            'request-help',
            { taskDescription, requiredCapabilities },
            { topic: 'global' },
        );
        return this.emitWithAck('request-help', envelope.payload);
    }

    async sendDirectMessage(targetId: string, payload: unknown) {
        const envelope = this.createEnvelope('direct-message', payload, { targetId });
        return this.emitWithAck('direct-message', {
            targetId: envelope.targetId,
            payload: envelope.payload,
        });
    }

    async broadcastAll(payload: unknown, includeSender: boolean = false) {
        return this.emitWithAck('broadcast-all', { payload, includeSender });
    }

    async sendFriendRequest(targetId: string) {
        const res = await axios.post(
            `${this.hubUrl}/api/friends/request`,
            { targetId },
            { headers: this.authHeaders() },
        );
        return res.data;
    }

    async respondFriendRequest(requesterId: string, action: 'accept' | 'reject') {
        const res = await axios.post(
            `${this.hubUrl}/api/friends/respond`,
            { requesterId, action },
            { headers: this.authHeaders() },
        );
        return res.data;
    }

    async listFriends() {
        const res = await axios.get(`${this.hubUrl}/api/friends`, {
            headers: this.authHeaders(),
        });
        return res.data;
    }

    async removeFriend(friendId: string) {
        const res = await axios.delete(`${this.hubUrl}/api/friends/${friendId}`, {
            headers: this.authHeaders(),
        });
        return res.data;
    }

    disconnect() {
        if (this.socket) this.socket.disconnect();
    }
}
