import { OpenClawHubClient } from './hub-client';

async function test() {
    const client = new OpenClawHubClient();
    const name = 'test-agent-script-' + Date.now();
    console.log('Registering agent ' + name + '...');
    const res = await client.register(name, ['execute', 'search']);
    if (!res) {
        console.error('Registration failed.');
        return;
    }

    console.log('Connecting...');
    const authenticated = await client.authenticate(name, res.token);
    if (authenticated) {
        await client.connectWebSocket();
        console.log('Test successful! Exiting in 2 seconds...');

        // Test broadcast
        setTimeout(async () => {
            try {
                const ack = await client.broadcastRequestForHelp('Need help with math', ['math']);
                console.log('Broadcast acknowledged:', ack.messageId);
            } catch (error) {
                console.error('Broadcast rejected:', (error as Error).message);
            }
        }, 1000);

        setTimeout(() => {
            client.disconnect();
            process.exit(0);
        }, 2000);
    } else {
        console.error('Authentication failed');
    }
}

test();
