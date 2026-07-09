const { startBotApi, botManager } = require('./bot_api');
const { startGramJs, gramJsClient } = require('./gramjs_client');
const storage = require('./storage');

async function main() {
    console.log('--- Telegram Multi-Bot Reaction System ---');
    
    // 0. Load Storage
    await storage.load();

    // 1. Start Bot API (initializes bots without polling)
    await startBotApi();

    // 2. Start GramJS (for history fetching)
    await startGramJs();

    const trackedChannels = new Set();
    if (process.env.CHANNEL_ID) {
        trackedChannels.add(process.env.CHANNEL_ID);
    }

    // Capture channels when bots are added
    botManager.setChannelDetectedCallback((chatId) => {
        trackedChannels.add(chatId.toString());
    });

    // 3. Scan existing/historical posts first and react immediately
    console.log('[Startup] Starting initial history scan...');
    if (trackedChannels.size === 0) {
        console.log('[Startup] No channels configured in CHANNEL_ID. Skipping background sync.');
    } else {
        for (const chatId of trackedChannels) {
            try {
                console.log(`[Startup] Fetching history for channel ${chatId}...`);
                const messageIds = await gramJsClient.getChannelMessages(chatId);
                
                if (messageIds.length > 0) {
                    console.log(`[Startup] Syncing ${messageIds.length} posts in channel ${chatId}...`);
                    // React to historical messages sequentially and immediately
                    for (const messageId of messageIds.reverse()) {
                        // Pass true for isImmediate so it reacts immediately rather than spreading over 4 hours
                        await botManager.reactToMessage(chatId, messageId, 'Startup Sync', true);
                    }
                }
            } catch (error) {
                console.error(`[Startup] Error during history sync for channel ${chatId}:`, error.message);
            }
        }
    }
    console.log('[Startup] Initial history scan and reaction updates complete.');

    // 4. Start polling for new/real-time posts
    await botManager.startPolling();



    console.log('--- System is Ready: Historical posts processed, Real-time active ---');
}

main().catch(err => {
    console.error('Fatal Error:', err);
    process.exit(1);
});
