const fs = require('fs').promises;
const path = require('path');

const STORAGE_PATH = path.join(__dirname, '..', 'reactions.json');

class StorageManager {
    constructor() {
        this.data = {};
        this.isLoaded = false;
        this.writeQueue = Promise.resolve();
    }

    /**
     * Load the JSON data from disk
     */
    async load() {
        try {
            const content = await fs.readFile(STORAGE_PATH, 'utf8');
            this.data = JSON.parse(content);
            this.isLoaded = true;
        } catch (error) {
            if (error.code === 'ENOENT') {
                console.log('Storage: reactions.json not found, creating new one...');
                this.data = {};
                await this.saveToFile();
                this.isLoaded = true;
            } else {
                console.error('Storage: Error loading reactions.json:', error.message);
                throw error;
            }
        }
    }

    /**
     * Check if a bot has already reacted to a message
     * @param {string|number} chatId 
     * @param {string|number} messageId 
     * @param {number} botIndex 
     */
    async hasReacted(chatId, messageId, botIndex) {
        if (!this.isLoaded) await this.load();
        
        const cId = chatId.toString();
        const mId = messageId.toString();
        const botKey = `bot${botIndex}`;

        return !!(this.data[cId] && this.data[cId][mId] && this.data[cId][mId][botKey]);
    }

    /**
     * Record a success or "already reacted" state
     */
    async saveReaction(chatId, messageId, botIndex, success = true) {
        if (!this.isLoaded) await this.load();

        const cId = chatId.toString();
        const mId = messageId.toString();
        const botKey = `bot${botIndex}`;

        if (!this.data[cId]) this.data[cId] = {};
        if (!this.data[cId][mId]) this.data[cId][mId] = {};
        
        this.data[cId][mId][botKey] = success;

        // Queue the write operation to prevent corruption from concurrent calls
        this.writeQueue = this.writeQueue.then(() => this.saveToFile());
        return this.writeQueue;
    }

    /**
     * Persist current state to reactions.json
     */
    async saveToFile() {
        try {
            const content = JSON.stringify(this.data, null, 2);
            await fs.writeFile(STORAGE_PATH, content, 'utf8');
        } catch (error) {
            console.error('Storage: Error saving to file:', error.message);
        }
    }
}

module.exports = new StorageManager();
