const { startGramJs, gramJsClient } = require('./src/gramjs_client');
const config = require('./src/config');
const storage = require('./src/storage');

async function run() {
    await storage.load();
    const clientWrapper = await startGramJs();
    if (!clientWrapper) {
        console.error("Could not start GramJS client");
        process.exit(1);
    }
    const client = clientWrapper.client;

    try {
        console.log("Storage loaded keys:", Object.keys(storage.data));
    } catch (e) {
        console.error("Error logging storage keys:", e);
    }
    process.exit(0);
}

run();
