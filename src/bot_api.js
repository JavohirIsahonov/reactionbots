const { TelegramBot } = require('node-telegram-bot-api');
const config = require('./config');
const storage = require('./storage');


const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

class BotManager {
    constructor() {
        this.bots = [];
        this.onChannelDetected = null;
        this.scheduledTasks = new Set();
        this.activePostTaskCounts = new Map();
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
        const postKey = `${chatId}_${messageId}`;
        
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

                let attempts = 0;
                const maxAttempts = 10;
                let success = false;

                while (attempts < maxAttempts && !success) {
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
                        success = true;

                        const waitTime = Math.floor(Math.random() * (config.reactionDelayMax - config.reactionDelayMin + 1)) + config.reactionDelayMin;
                        await delay(waitTime);
                    } catch (error) {
                        attempts++;
                        const errorMessage = error.message || '';
                        if (errorMessage.includes('REACTION_ID_INVALID') || errorMessage.includes('400') || errorMessage.includes('already set')) {
                            await storage.saveReaction(chatId, messageId, i, true);
                            console.log(`${logPrefix}${botName}: Reaction confirmed for ${messageId} (Non-retryable: ${errorMessage})`);
                            success = true;
                        } else {
                            console.error(`[ERROR] ${logPrefix}${botName} failed (immediate) to react to post ${messageId} on attempt ${attempts}/${maxAttempts}. Error: ${errorMessage}`);
                            if (attempts >= maxAttempts) {
                                console.error(`[FATAL] ${logPrefix}${botName} reached max attempts (${maxAttempts}) during immediate reaction for post ${messageId}. Skipping.`);
                            } else {
                                await delay(5000); // Wait 5s before retrying
                            }
                        }
                    }
                }
            }
        } else {
            // New post: distribute reactions randomly over the next 1 hour
            // Check tasks to schedule using this.scheduledTasks and avoid duplicates from multiple bots
            const tasksToCreate = [];
            for (let i = 0; i < this.bots.length; i++) {
                const taskKey = `${chatId}_${messageId}_bot_${i}`;
                if (!this.scheduledTasks.has(taskKey)) {
                    this.scheduledTasks.add(taskKey);
                    tasksToCreate.push(i);
                }
            }

            if (tasksToCreate.length > 0) {
                this.activePostTaskCounts.set(postKey, tasksToCreate.length);

                console.log(`Post ${messageId}: Created ${tasksToCreate.length} scheduled reaction tasks.`);

                for (const botIndex of tasksToCreate) {
                    const botName = `Bot #${botIndex + 1}`;
                    const randomDelayMs = Math.floor(Math.random() * (1 * 60 * 60 * 1000));
                    
                    console.log(`Bot #${botIndex + 1} scheduled.`);

                    // Asynchronously schedule reaction
                    setTimeout(() => {
                        this.reactWithRetry(this.bots[botIndex], botIndex, chatId, messageId, logPrefix);
                    }, randomDelayMs);
                }
            }
        }
    }

    /**
     * Attempts to react to a message with a specific bot, retrying on retryable errors.
     */
    async reactWithRetry(bot, botIndex, chatId, messageId, logPrefix, retryCount = 0, maxRetries = 10) {
        const botName = `Bot #${botIndex + 1}`;
        const reactionEmoji = config.getReactionForBot(botIndex, this.bots.length);
        const taskKey = `${chatId}_${messageId}_bot_${botIndex}`;
        const postKey = `${chatId}_${messageId}`;

        // Cleanup helper function
        const finalizeTask = () => {
            // Remove the bot's task key
            this.scheduledTasks.delete(taskKey);

            // Update post task counter
            if (this.activePostTaskCounts.has(postKey)) {
                const currentCount = this.activePostTaskCounts.get(postKey) - 1;
                if (currentCount <= 0) {
                    this.activePostTaskCounts.delete(postKey);
                    console.log(`[Task Completion] All bot tasks for post ${messageId} have finished.`);
                } else {
                    this.activePostTaskCounts.set(postKey, currentCount);
                }
            }
        };

        // Check if already reacted
        const alreadyReacted = await storage.hasReacted(chatId, messageId, botIndex);
        if (alreadyReacted) {
            console.log(`${logPrefix}${botName}: Skipping task for ${messageId} (already in storage)`);
            finalizeTask();
            return;
        }

        try {
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
            finalizeTask();
        } catch (error) {
            const errorMessage = error.message || '';
            if (errorMessage.includes('REACTION_ID_INVALID') || errorMessage.includes('400') || errorMessage.includes('already set')) {
                await storage.saveReaction(chatId, messageId, botIndex, true);
                console.log(`${logPrefix}${botName}: Reaction confirmed for ${messageId} (Non-retryable: ${errorMessage})`);
                finalizeTask();
                return;
            }

            console.error(`[ERROR] ${logPrefix}${botName} failed to react to post ${messageId} (attempt ${retryCount + 1}/${maxRetries}). Error: ${errorMessage}`);

            if (retryCount >= maxRetries - 1) {
                console.error(`[FATAL] ${logPrefix}${botName} reached max retries (${maxRetries}) for post ${messageId}. Skipping.`);
                finalizeTask();
                return;
            }

            const retryDelay = 10000; // 10 seconds
            console.log(`${logPrefix}${botName}: Retrying in ${retryDelay / 1000}s...`);
            setTimeout(() => {
                this.reactWithRetry(bot, botIndex, chatId, messageId, logPrefix, retryCount + 1, maxRetries);
            }, retryDelay);
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
