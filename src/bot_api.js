const { TelegramBot } = require('node-telegram-bot-api');
const config = require('./config');
const storage = require('./storage');

/**
 * Delay helper for rate limiting
 */
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

class BotManager {
    constructor() {
        this.bots = [];
        this.onChannelDetected = null;
    }

    async init() {
        if (!config.botTokens || config.botTokens.length === 0) {
            console.error('Bot API: No bot tokens defined in .env');
            process.exit(1);
        }

        console.log(`Bot API: Initializing ${config.botTokens.length} bot(s)...`);

        for (let i = 0; i < config.botTokens.length; i++) {
            const token = config.botTokens[i];
            const bot = new TelegramBot(token, { polling: false }); // Do not start polling yet
            const botName = `Bot #${i + 1}`;

            bot.on('polling_error', (error) => {
                console.error(`${botName}: Polling error:`, error.code || error.message);
            });

            // Listen for being added to a channel (Immediate Trigger)
            bot.on('my_chat_member', async (update) => {
                if (update.new_chat_member?.status === 'administrator' || update.new_chat_member?.status === 'member') {
                    const chatId = update.chat.id;
                    const chatTitle = update.chat.title;
                    console.log(`[${botName}] Detected channel: "${chatTitle}" (ID: ${chatId})`);
                    
                    if (this.onChannelDetected) {
                        await this.onChannelDetected(chatId);
                    }
                }
            });

            // Listen for new posts (Delayed / Spread Reaction)
            bot.on('channel_post', async (msg) => {
                // Pass false for isImmediate so it spreads reactions randomly over 4 hours
                await this.reactToMessage(msg.chat.id, msg.message_id, `New post in ${msg.chat.title}`, false);
            });

            this.bots.push(bot);
            console.log(`${botName}: Connected and ready.`);
        }

        console.log('Bot API: All bots are initialized.');
    }

    /**
     * Start long polling for all bots manually
     */
    async startPolling() {
        console.log(`Bot API: Starting polling for ${this.bots.length} bot(s)...`);
        for (let i = 0; i < this.bots.length; i++) {
            const bot = this.bots[i];
            const botName = `Bot #${i + 1}`;
            try {
                await bot.startPolling();
                console.log(`${botName}: Polling started.`);
            } catch (error) {
                console.error(`${botName}: Error starting polling:`, error.message);
            }
        }
        console.log('Bot API: All bots are actively polling.');
    }

    /**
     * React to a message using all available bots
     * Uses storage.js to verify if a bot should react.
     * 
     * @param {string|number} chatId 
     * @param {string|number} messageId 
     * @param {string} context 
     * @param {boolean} isImmediate If true, reacts sequentially immediately; else spreads over 4 hours.
     */
    async reactToMessage(chatId, messageId, context = '', isImmediate = false) {
        const logPrefix = context ? `[${context}] ` : '';
        
        if (isImmediate) {
            // React immediately (sequential with short delays)
            for (let i = 0; i < this.bots.length; i++) {
                const bot = this.bots[i];
                const botName = `Bot #${i + 1}`;

                // Check duplicate
                const alreadyReacted = await storage.hasReacted(chatId, messageId, i);
                if (alreadyReacted) {
                    continue;
                }

                try {
                    const reactionEmoji = config.getReactionForBot(i, this.bots.length);
                    await bot.setMessageReaction(chatId.toString(), messageId, {
                        reaction: [
                            {
                                type: 'emoji',
                                emoji: reactionEmoji
                            }
                        ]
                    });

                    await storage.saveReaction(chatId, messageId, i, true);
                    console.log(`${logPrefix}${botName}: Reaction '${reactionEmoji}' added to ${messageId} immediately`);

                    const waitTime = Math.floor(Math.random() * (config.reactionDelayMax - config.reactionDelayMin + 1)) + config.reactionDelayMin;
                    await delay(waitTime);
                } catch (error) {
                    const errorMessage = error.message || '';
                    if (errorMessage.includes('REACTION_ID_INVALID') || errorMessage.includes('400') || errorMessage.includes('already set')) {
                        await storage.saveReaction(chatId, messageId, i, true);
                        console.log(`${logPrefix}${botName}: Reaction confirmed for ${messageId} (Already exists)`);
                    } else if (errorMessage.includes('429')) {
                        console.warn(`${logPrefix}${botName}: Rate limit hit. Waiting a bit...`);
                        await delay(5000);
                        i--; // Retry
                    } else {
                        console.error(`${logPrefix}${botName}: Error reacting to ${messageId}:`, errorMessage);
                    }
                }
            }
        } else {
            // New post: distribute reactions randomly over the next 4 hours
            console.log(`${logPrefix}Scheduling reaction for post ${messageId} across all bots over 4 hours...`);
            
            for (let i = 0; i < this.bots.length; i++) {
                const bot = this.bots[i];
                const botName = `Bot #${i + 1}`;
                const botIndex = i;
                
                // Calculate random delay between 0 and 4 hours (14,400,000 ms)
                const randomDelayMs = Math.floor(Math.random() * (4 * 60 * 60 * 1000));
                const scheduledTime = new Date(Date.now() + randomDelayMs).toLocaleTimeString();
                
                const reactionEmoji = config.getReactionForBot(botIndex, this.bots.length);
                console.log(`${logPrefix}${botName} (Reaction '${reactionEmoji}') scheduled to react to ${messageId} at ${scheduledTime} (delay: ${(randomDelayMs / 1000 / 60).toFixed(1)} minutes)`);
                
                // Asynchronously schedule reaction
                setTimeout(async () => {
                    const alreadyReacted = await storage.hasReacted(chatId, messageId, botIndex);
                    if (alreadyReacted) {
                        console.log(`${logPrefix}${botName}: Skipping scheduled reaction for ${messageId} (already reacted)`);
                        return;
                    }
                    
                    try {
                        const reactionEmoji = config.getReactionForBot(botIndex, this.bots.length);
                        await bot.setMessageReaction(chatId.toString(), messageId, {
                            reaction: [
                                {
                                    type: 'emoji',
                                    emoji: reactionEmoji
                                }
                            ]
                        });
                        
                        await storage.saveReaction(chatId, messageId, botIndex, true);
                        console.log(`${logPrefix}${botName}: Delayed reaction '${reactionEmoji}' added to ${messageId}`);
                    } catch (error) {
                        const errorMessage = error.message || '';
                        if (errorMessage.includes('REACTION_ID_INVALID') || errorMessage.includes('400') || errorMessage.includes('already set')) {
                            await storage.saveReaction(chatId, messageId, botIndex, true);
                            console.log(`${logPrefix}${botName}: Reaction confirmed for ${messageId} (Already exists)`);
                        } else if (errorMessage.includes('429')) {
                            console.warn(`${logPrefix}${botName}: Rate limit hit during delayed reaction. Retrying in 10s...`);
                            setTimeout(async () => {
                                try {
                                    const reactionEmoji = config.getReactionForBot(botIndex, this.bots.length);
                                    await bot.setMessageReaction(chatId.toString(), messageId, {
                                        reaction: [
                                            {
                                                type: 'emoji',
                                                emoji: reactionEmoji
                                            }
                                        ]
                                    });
                                    await storage.saveReaction(chatId, messageId, botIndex, true);
                                    console.log(`${logPrefix}${botName}: Delayed reaction '${reactionEmoji}' added to ${messageId} after retry`);
                                } catch (retryErr) {
                                    console.error(`${logPrefix}${botName}: Retry failed for ${messageId}:`, retryErr.message);
                                }
                            }, 10000);
                        } else {
                            console.error(`${logPrefix}${botName}: Error reacting asynchronously to ${messageId}:`, errorMessage);
                        }
                    }
                }, randomDelayMs);
            }
        }
    }

    /**
     * Set a callback for when a channel is detected
     */
    setChannelDetectedCallback(callback) {
        this.onChannelDetected = callback;
    }
}

const botManager = new BotManager();

async function startBotApi() {
    await botManager.init();
    return botManager;
}

module.exports = { startBotApi, botManager };
