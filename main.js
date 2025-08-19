import readline from 'readline';
import { createBot, handleCommand, getBot } from './bot.js';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const ask = (query) => new Promise(resolve => rl.question(query, resolve));

async function main() {
    console.log("\n--- Gemini Minecraft Bot ---");
    const host = await ask('Enter server host (e.g., localhost): ');
    const port = parseInt(await ask('Enter server port (e.g., 25565): '), 10);
    const username = await ask('Enter bot username (e.g., GeminiBot): ');
    const version = await ask('Enter server version (e.g., 1.21): ');

    console.log(`\n\x1b[36m[SYSTEM]\x1b[0m Connecting to ${host}:${port} as ${username}...`);
    
    const bot = createBot({ host, port, username, version });

    bot.once('end', (reason) => {
        console.log(`\x1b[36m[SYSTEM]\x1b[0m Disconnected. Reason: ${reason}`);
        rl.close();
        process.exit(0);
    });
    
    bot.on('error', () => {
        // The error is logged in bot.js, this just prevents an uncaught exception
    });

    rl.on('line', (input) => {
        const currentBot = getBot();
        if (currentBot && currentBot.entity) {
            handleCommand(input, 'Terminal');
        } else {
            console.log('\x1b[36m[SYSTEM]\x1b[0m Bot is not connected or ready yet.');
        }
    });
}

main().catch(err => {
    console.error('\x1b[31m%s\x1b[0m', `An unexpected error occurred: ${err.message}`);
    rl.close();
    process.exit(1);
});