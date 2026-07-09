const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');
const { Api } = require('telegram/tl');
const config = require('./config');
const readline = require('readline');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
});

/**
 * GramJS (MTProto) Client
 * 
 * WHY THIS IS NEEDED:
 * Standard Telegram Bots (Bot API) cannot retrieve message history in channels.
 * They only receive new updates (messages) as they happen.
 * To "react to all existing posts," we must use a User Account (MTProto) 
 * to fetch the message history and get the IDs for the bots to react to.
 */
class GramJsClient {
    constructor() {
        this.client = null;
    }

    async init() {
        if (!config.apiId || !config.apiHash) {
            console.error('GramJS: API_ID or API_HASH is missing in .env');
            return null;
        }

        console.log('GramJS: Connecting to MTProto...');
        const stringSession = new StringSession(config.stringSession);
        this.client = new TelegramClient(stringSession, config.apiId, config.apiHash, {
            connectionRetries: 5,
        });

        await this.client.start({
            phoneNumber: async () => new Promise((resolve) => rl.question('Please enter your number: ', resolve)),
            password: async () => new Promise((resolve) => rl.question('Please enter your password: ', resolve)),
            phoneCode: async () => new Promise((resolve) => rl.question('Please enter the code you received: ', resolve)),
            onError: (err) => console.log('GramJS Error:', err.message),
        });

        console.log('GramJS: Successfully connected!');
        if (!config.stringSession) {
            console.log('--- SAVE THIS SESSION STRING TO YOUR .env AS STRING_SESSION ---');
            console.log(this.client.session.save());
            console.log('--------------------------------------------------------------');
        }

        return this.client;
    }

    /**
     * Retrieve existing posts from a channel
     */
    async getChannelMessages(chatId) {
        if (!this.client) {
            console.error('GramJS: Client not initialized');
            return [];
        }

        try {
            console.log(`GramJS: Fetching all messages from channel ${chatId}...`);
            let allMessageIds = [];
            let offsetId = 0;
            const limit = 100;

            while (true) {
                const messages = await this.client.getMessages(chatId, {
                    limit: limit,
                    offsetId: offsetId,
                });

                if (!messages || messages.length === 0) {
                    break;
                }

                const validMessageIds = messages.filter(m => m.id && m.className === 'Message').map(m => m.id);
                allMessageIds.push(...validMessageIds);

                const minId = Math.min(...messages.map(m => m.id));
                if (minId <= 1 || (offsetId !== 0 && minId >= offsetId)) {
                    break;
                }
                offsetId = minId;
            }

            console.log(`GramJS: Found ${allMessageIds.length} messages in total for ${chatId}.`);
            return allMessageIds;
        } catch (error) {
            console.error('GramJS: Error fetching history:', error.message);
            return [];
        }
    }
}

const gramJsClient = new GramJsClient();

async function startGramJs() {
    await gramJsClient.init();
    return gramJsClient;
}

module.exports = { startGramJs, gramJsClient };
