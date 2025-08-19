import "dotenv/config";
import { GoogleGenAI } from '@google/genai';
import { GEMINI_SYSTEM_PROMPT } from '../constants.js';

let ai = null;
let chat = null;

// Get key from environment
const apiKey = process.env.GEMINI_API_KEY;

if (apiKey && !apiKey.startsWith("AIza")) {
  console.error("CRITICAL ERROR: Invalid Gemini API key format in environment. The bot will not have AI capabilities.");
} else if (!apiKey) {
  console.error("CRITICAL ERROR: Gemini API key not found in environment. The bot will not have AI capabilities.");
} else {
  ai = new GoogleGenAI({ apiKey });
}

export const getBotState = (bot) => {
  if (!bot || !bot.entity) return null;
  
  const filterEntities = (distance, limit) => Object.values(bot.entities)
    .filter(entity => entity?.position && bot.entity.position.distanceTo(entity.position) < distance && entity.id !== bot.entity.id)
    .sort((a, b) => bot.entity.position.distanceTo(a.position) - bot.entity.position.distanceTo(b.position))
    .slice(0, limit)
    .map(entity => ({
        name: entity.displayName || entity.name,
        type: entity.type,
        position: entity.position.floored(),
        distance: bot.entity.position.distanceTo(entity.position).toFixed(1)
    }));

  return {
    health: bot.health,
    hunger: bot.food,
    position: bot.entity.position.floored(),
    heldItem: bot.heldItem ? `${bot.heldItem.count}x ${bot.heldItem.name}` : 'empty hand',
    biome: bot.blockAt(bot.entity.position)?.biome?.name || 'unknown',
    inventory: bot.inventory.items().map(item => `${item.count}x ${item.name}`),
    nearbyPlayers: Object.values(bot.players).map(p => ({
        username: p.username,
        position: p.entity?.position.floored(),
    })).filter(p => p.username !== bot.username),
    nearbyEntities: filterEntities(100, 20),
    timeOfDay: bot.time.timeOfDay,
    username: bot.username,
  };
};

export const startChat = () => {
  if (!ai) return;
  chat = ai.chats.create({
    model: 'gemini-2.5-flash',
    config: {
      systemInstruction: GEMINI_SYSTEM_PROMPT,
      tools: [{ googleSearch: {} }],
    },
  });
};

export const handleUserCommand = async (command, username, botState) => {
  if (!ai || !chat) {
    return {
      thought: "The API key is missing or invalid, so I cannot process any commands.",
      action: 'error',
      message: "I can't think right now. My connection to the Gemini API is not configured. Please check the GEMINI_API_KEY environment variable."
    };
  }

  const prompt = `
Context:
- User giving command: "${username}"
- My Username: "${botState.username}"
- Health: ${botState.health.toFixed(1)}/20
- Hunger: ${botState.hunger.toFixed(1)}/20
- Position: ${JSON.stringify(botState.position)}
- Biome: ${botState.biome}
- Item in hand: ${botState.heldItem}
- Inventory: ${botState.inventory.join(', ') || 'empty'}
- Nearby Players: ${JSON.stringify(botState.nearbyPlayers)}
- Nearby Entities (closest 20 in 100 block radius): ${JSON.stringify(botState.nearbyEntities)}
- Time of Day: ${botState.timeOfDay}

User Command: "${command}"

Remember your instructions. Provide your response and then the JSON action block.
`;

  const response = await chat.sendMessage({ message: prompt });
  const textResponse = response.text;
    
  const groundingMetadata = response.candidates?.[0]?.groundingMetadata;
  if (groundingMetadata?.groundingChunks?.length > 0) {
    console.log('\x1b[33m%s\x1b[0m', '[SYSTEM] Information sourced from the web:');
    groundingMetadata.groundingChunks.forEach(chunk => {
      if (chunk.web) {
        console.log(`  - ${chunk.web.title || 'Source'}: ${chunk.web.uri}`);
      }
    });
  }

  const jsonRegex = /```json\s*([\s\S]*?)\s*```/;
  const match = textResponse.match(jsonRegex);

  if (match && match[1]) {
    try {
      const parsedAction = JSON.parse(match[1]);
      if (!parsedAction.action) {
        console.error("Gemini response missing 'action'. Response:", match[1]);
        return {
          thought: "Malformed response without an action.",
          action: 'error',
          message: "Sorry, I got confused. Can you repeat that?"
        };
      }
      if (!parsedAction.thought) {
        parsedAction.thought = `AI chose action '${parsedAction.action}' without providing a thought.`;
      }
      return parsedAction;
    } catch (e) {
      console.error("Failed to parse Gemini JSON response:", match[1], e);
      return {
        thought: "Invalid JSON from the AI.",
        action: 'error',
        message: "Sorry, I got confused. Can you repeat that?"
      };
    }
  } else {
    return {
      thought: "No structured action, just a chat reply.",
      action: 'chat',
      message: textResponse.replace(/```/g, '')
    };
  }
};
