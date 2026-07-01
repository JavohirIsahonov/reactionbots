require('dotenv').config();

// Dynamically load all BOT_TOKEN keys (BOT_TOKEN, BOT_TOKEN2, BOT_TOKEN3, etc.)
const botTokens = [];
const botKeys = Object.keys(process.env).filter(key => key === 'BOT_TOKEN' || /^BOT_TOKEN\d+$/.test(key));

// Sort naturally: BOT_TOKEN first, then BOT_TOKEN2, BOT_TOKEN3, ..., BOT_TOKEN11
botKeys.sort((a, b) => {
    if (a === 'BOT_TOKEN') return -1;
    if (b === 'BOT_TOKEN') return 1;
    const numA = parseInt(a.replace('BOT_TOKEN', ''), 10);
    const numB = parseInt(b.replace('BOT_TOKEN', ''), 10);
    return numA - numB;
});

botKeys.forEach(key => {
    const token = process.env[key];
    if (token && token.trim() !== '') {
        botTokens.push(token.trim());
    }
});

/**
 * Distributes totalBots reactions among these four emoji:
 * 1. ❤️‍🔥 (Heart on Fire)
 * 2. 💘 (Heart with Arrow)
 * 3. 🕊️ (Dove)
 * 4. 💔 (Broken Heart)
 * 
 * If totalBots is 11, returns exactly:
 * - 4 bots -> ❤️‍🔥
 * - 3 bots -> 💘
 * - 2 bots -> 🕊️
 * - 2 bots -> 💔
 * 
 * For other bot counts, distributes as evenly as possible.
 */
function getReactionForBot(botIndex, totalBots) {
    const emojis = ['❤️‍🔥', '💘', '🕊️', '💔'];
    
    // Distribution bucket counts
    const base = Math.floor(totalBots / 4);
    const remainder = totalBots % 4;
    
    const distribution = [base, base, base, base];
    for (let i = 0; i < remainder; i++) {
        distribution[i] += 1;
    }
    
    // Specific override for 11 bots to match requested distribution exactly: 4, 3, 2, 2
    if (totalBots === 11) {
        distribution[0] = 4; // ❤️‍🔥
        distribution[1] = 3; // 💘
        distribution[2] = 2; // 🕊️
        distribution[3] = 2; // 💔
    }
    
    // Determine which emoji the botIndex belongs to
    let countSum = 0;
    for (let i = 0; i < emojis.length; i++) {
        countSum += distribution[i];
        if (botIndex < countSum) {
            return emojis[i];
        }
    }
    return emojis[emojis.length - 1]; // Fallback
}

module.exports = {
    botTokens,
    getReactionForBot,
    
    // Channel configuration
    channelId: process.env.CHANNEL_ID,
    
    // Performance and Rate Limiting
    reactionDelayMin: parseInt(process.env.REACTION_DELAY_MIN) || 500,
    reactionDelayMax: parseInt(process.env.REACTION_DELAY_MAX) || 1000,
    
    // GramJS (MTProto) for history fetching
    apiId: parseInt(process.env.API_ID),
    apiHash: process.env.API_HASH,
    stringSession: process.env.STRING_SESSION || '',
};
