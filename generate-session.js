const { TelegramClient } = require("telegram");
const { StringSession } = require("telegram/sessions");
const input = require("input");
require("dotenv").config();

(async () => {
    const client = new TelegramClient(
        new StringSession(""),
        Number(process.env.API_ID),
        process.env.API_HASH,
        {
            connectionRetries: 5,
        }
    );

    await client.start({
        phoneNumber: async () => await input.text("Phone Number: "),
        password: async () => await input.text("2FA Password (if any): "),
        phoneCode: async () => await input.text("Telegram Code: "),
        onError: console.log,
    });

    console.log("\n✅ STRING_SESSION:\n");
    console.log(client.session.save());

    process.exit(0);
})();