# Telegram Automatic Reaction Bot

This Node.js bot automatically reacts to every new post published in a Telegram channel. It provides two implementation options:
1. **Bot API (Recommended)**: Simple, uses a standard bot token. Requires the bot to be an administrator in the channel.
2. **GramJS (MTProto)**: Advanced, uses a user account or MTProto bot session. Bypasses some Bot API limitations.

## Features
- **Automatic Reactions**: Instantly adds an emoji reaction to new channel posts.
- **Configurable**: Change the emoji, channel, and mode via `.env`.
- **Dual Support**: Choose between standard Bot API or robust MTProto (GramJS).
- **Scalable**: Handles multiple posts asynchronously.

---

## 🛠 Setup Instructions

### 1. Prerequisites
- [Node.js](https://nodejs.org/) (v16 or higher)
- A Telegram account and a Bot (created via [@BotFather](https://t.me/BotFather))

### 2. Installation
```bash
# Move into the project directory
cd "reaksiya bot"

# Install dependencies
npm install
```

### 3. Configuration
Copy `.env.example` to `.env` and fill in your details:
```bash
# In Windows PowerShell:
cp .env.example .env
```

**Fields:**
- `BOT_TOKEN`, `BOT_TOKEN2`, etc.: Your bot tokens from @BotFather. You can add as many as you want.
- `CHANNEL_ID`: The username (e.g., `@mychannel`) or numeric ID of the channel.
- `REACTION_EMOJI`: The emoji you want the bot to use (e.g., `🔥`, `👍`, `❤️`).
- `USE_GRAMJS`: Set to `true` to use GramJS instead of Bot API.

**For GramJS Mode:**
- `API_ID` & `API_HASH`: Get these from [my.telegram.org](https://my.telegram.org).
- `STRING_SESSION`: This will be generated on your first run and should be saved back to `.env`.

### 4. Running the Bot
```bash
# Run the bot
node src/main.js
```

---

## 🔍 Bot API vs GramJS

| Feature | Bot API | GramJS (MTProto) |
|---------|---------|------------------|
| **Setup** | Easy (just a token) | Moderate (API ID/Hash) |
| **Identity** | Works as a Bot | Works as a User (or Bot) |
| **Permissions** | Needs Admin in channel | Needs to be in channel |
| **Reactions** | Limited to Bot API rules | Much more flexible |
| **Stability** | High | High |

**Recommendation**: Start with the **Bot API**. It is simpler and officially supported for bots. Use **GramJS** only if you need to react as a user or if you encounter strict Bot API limitations.

---

## 💡 Troubleshooting
- **Bot not reacting**: Ensure the bot is an **administrator** in the channel with permissions to post messages.
- **Channel ID error**: Use the full username (including `@`) or the correct numeric ID (usually starts with `-100`).
- **Emoji not working**: Some channels restrict which emojis can be used. Check the "Reactions" setting in the channel's "Edit" menu.
- **GramJS Session**: On the first run with GramJS, you will need to login via the terminal. Once logged in, copy the printed session string to your `.env` to avoid logging in again.

---

## License
MIT
