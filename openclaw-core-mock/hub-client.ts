import { io, Socket } from 'socket.io-client';
import axios from 'axios';

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

        // Listen for incoming broadcasted collaboration requests
        this.socket.on('broadcast', (data) => {
            if (data.type === 'request-help') {
                console.log(`\n[Broadcast] Agent ${data.senderId} needs help: ${data.taskDescription}`);
                console.log(`Requires capabilities: ${data.requiredCapabilities.join(', ')}`);
                // Here the local agent AI would decide to respond or ignore
            }
        });

        this.socket.on('direct-message', (data) => {
            console.log(`\n[Direct Message] From ${data.senderId}:`, data.payload);
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
        if (!this.socket) throw new Error('Not connected');
        this.socket.emit('request-help', { taskDescription, requiredCapabilities });
    }

    disconnect() {
        if (this.socket) this.socket.disconnect();
    }
}
