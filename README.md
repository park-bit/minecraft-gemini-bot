<<<<<<< HEAD
# Gemini Minecraft Bot - Terminal Edition

This project is a sophisticated, AI-powered Minecraft bot that you control entirely from your terminal. It uses Mineflayer to interact with the game world and Google's Gemini API to make intelligent, human-like decisions.

You can connect to a server, monitor the bot's status, and issue commands, all from your command line.

## Key Features

- **Advanced AI:** Powered by the Gemini API for complex decision-making, conversational memory, and proactive behavior.
- **Terminal Control:** No web UI needed. Control everything from your terminal for a lightweight and stable experience.
- **Expanded Skillset:** The bot can do more than just move and gather. It can:
  - **Craft** items (given the resources).
  - **Attack** hostile mobs to defend itself.
  - **Navigate** to specific coordinates (`goto x y z`).
  - Follow and interact with players.
- **Live Console Output:** Real-time updates on the bot's actions and status are printed to your console.
- **AI Thought Process:** The bot's internal monologue is displayed in the console, giving you insight into its decisions.

## How to Run

### 1. Prerequisites
- **Node.js and npm:** Required to run the bot.
- **Gemini API Key:** The bot's AI requires a Google Gemini API key.
- **A Minecraft Server:** The bot needs a server to connect to.

### 2. Setup

**A. Configure API Key**
Open the `apiKey.js` file in the project's root directory and paste your Gemini API key into the `API_KEY` constant.

**B. Install Dependencies**
Open your terminal in the project directory and run:
```bash
npm install
```

### 3. Launching the Application

In your terminal, run:
```bash
npm start
```

### 4. Connecting the Bot

1.  The script will prompt you to enter the server details:
    - Server Host (e.g., `localhost` or `mc.example.com`)
    - Server Port (usually `25565`)
    - Bot Username
    - Server Version
2.  The bot will then attempt to connect to the server.

### 5. Interacting with the Bot

Once the bot has spawned, you can type commands directly into the terminal and press Enter. You can talk to it naturally or give it specific instructions like "gather 10 oak logs", "craft a wooden pickaxe", or "attack the zombie". Enjoy your new, intelligent Minecraft companion!
=======
# minecraft-gemini-bot
A gemini based minecraft bot using mineflyer and googleai....
>>>>>>> 28a388693f5fc397ba5718afa6736cd8881a9bf9
