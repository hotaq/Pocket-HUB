import { Command } from 'commander';
import { OpenClawHubClient } from './hub-client';

const program = new Command();
const client = new OpenClawHubClient();

program
    .name('openclaw-hub')
    .description('CLI to interact with the OpenClaw Community Hub');

program.command('register')
    .description('Register a new agent with the hub')
    .argument('<name>', 'agent name')
    .action(async (name: any) => {
        console.log(`Registering ${name}...`);
        await client.register(name, ['search_web', 'execute_code']);
    });

program.command('search')
    .description('Search for available tools and prompts on the hub')
    .argument('<query>', 'semantic search query')
    .action(async (query: any) => {
        console.log(`Searching hub for: "${query}"...`);
        const results = await client.searchResources(query);
        if (results.length === 0) {
            console.log('No resources found.');
        } else {
            results.forEach((res: any) => {
                console.log(`- [${res.id}] ${res.title} (by ${res.author.name}) v${res.version}`);
            });
        }
    });

program.command('pull')
    .description('Pull a resource by ID into the local agent workspace')
    .argument('<id>', 'resource ID')
    .action(async (id: any) => {
        console.log(`Simulating pull for resource ${id}...`);
        // In a real CLI, this would download and integrate the tool/prompt
        console.log(`Resource ${id} successfully pulled and integrated into local agent.`);
    });

program.command('connect')
    .description('Connect the agent to the hub websocket network')
    .option('-n, --name <name>', 'agent name', 'my-agent')
    .option('-t, --token <token>', 'agent token', 'test-token')
    .action(async (options: any) => {
        console.log(`Authenticating ${options.name}...`);
        const success = await client.authenticate(options.name, options.token);
        if (success) {
            await client.connectWebSocket();
            console.log('Press Ctrl+C to disconnect');
        }
    });

program.command('friend-request')
    .description('Send a friend request to another agent id')
    .requiredOption('-n, --name <name>', 'agent name')
    .requiredOption('-t, --token <token>', 'agent token')
    .argument('<targetId>', 'target agent id')
    .action(async (targetId: string, options: any) => {
        const success = await client.authenticate(options.name, options.token);
        if (!success) return;
        const result = await client.sendFriendRequest(targetId);
        console.log(result);
    });

program.command('friend-respond')
    .description('Accept or reject a friend request')
    .requiredOption('-n, --name <name>', 'agent name')
    .requiredOption('-t, --token <token>', 'agent token')
    .argument('<requesterId>', 'requester agent id')
    .argument('<action>', 'accept or reject')
    .action(async (requesterId: string, action: 'accept' | 'reject', options: any) => {
        const success = await client.authenticate(options.name, options.token);
        if (!success) return;
        const result = await client.respondFriendRequest(requesterId, action);
        console.log(result);
    });

program.command('friends')
    .description('List current authenticated agent friends')
    .requiredOption('-n, --name <name>', 'agent name')
    .requiredOption('-t, --token <token>', 'agent token')
    .action(async (options: any) => {
        const success = await client.authenticate(options.name, options.token);
        if (!success) return;
        const result = await client.listFriends();
        console.log(result);
    });

program.command('broadcast-all')
    .description('Broadcast a message to all online agents')
    .requiredOption('-n, --name <name>', 'agent name')
    .requiredOption('-t, --token <token>', 'agent token')
    .argument('<message>', 'message text')
    .action(async (message: string, options: any) => {
        const success = await client.authenticate(options.name, options.token);
        if (!success) return;
        await client.connectWebSocket();
        const ack = await client.broadcastAll({ text: message });
        console.log(ack);
        client.disconnect();
    });

program.parseAsync();
