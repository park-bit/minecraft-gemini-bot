
import mineflayer from 'mineflayer';
import pkg from 'mineflayer-pathfinder';
const { pathfinder, goals } = pkg;
import { getBotState, handleUserCommand, startChat } from './services/geminiService.js';

let bot = null;
let isAwaitingAI = false; // Prevents overlapping AI calls
let isBotReady = false; // Flag to ensure bot is fully initialized
let idleTimer = null;

// State for persistent actions
let followInterval = null;
let attackInterval = null;
let gatherProcess = null;

let lastHealth = 20; // For self-defense
const IDLE_ACTION_DELAY = 30000; // 30 seconds

// Simple colored logging
const log = (message, type) => {
  const colors = {
    system: '\x1b[36m', // Cyan
    thought: '\x1b[35m', // Magenta
    bot: '\x1b[32m', // Green
    user: '\x1b[37m', // White
    error: '\x1b[31m', // Red
    reset: '\x1b[0m'
  };
  const prefix = `[${type.toUpperCase()}]`;
  console.log(`${colors[type] || colors.system}%s${colors.reset}`, `${prefix} ${message}`);
};

const stopPersistentActions = () => {
    if (followInterval) {
        clearInterval(followInterval);
        followInterval = null;
    }
    if (attackInterval) {
        clearInterval(attackInterval);
        attackInterval = null;
    }
    if (gatherProcess) {
        clearTimeout(gatherProcess.timeout);
        gatherProcess = null;
    }
    if (bot?.pathfinder) {
        bot.pathfinder.stop();
    }
    // Safely stop any digging operations to prevent listener leaks
    if (bot) {
        bot.stopDigging();
    }
};

const resetIdleTimer = () => {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
        if (bot && bot.entity && !isAwaitingAI && isBotReady) {
             handleCommand('What should I do now? I am idle.', 'BotIdleAction');
        }
    }, IDLE_ACTION_DELAY);
};

async function runManualGatherStep() {
    if (!gatherProcess || !bot?.entity) {
        stopPersistentActions();
        return;
    }

    const inventoryCount = bot.inventory.count(gatherProcess.blockType.id);
    if (inventoryCount >= gatherProcess.targetAmount) {
        bot.chat(`I've finished gathering ${gatherProcess.targetAmount} ${gatherProcess.blockName}.`);
        stopPersistentActions();
        return;
    }

    // Find the nearest reachable block by preferring ones with air above them.
    const block = bot.findBlock({
        matching: (block) => {
            if (block?.type !== gatherProcess.blockType.id) return false;
            const blockAbove = bot.blockAt(block.position.offset(0, 1, 0));
            // A simple but effective heuristic: is the block exposed to the air?
            // This avoids targeting blocks underground or in walls.
            return blockAbove && blockAbove.type === 0; // type 0 is air
        },
        maxDistance: 48,
        count: 1,
    });


    if (block) {
        try {
            await bot.pathfinder.goto(new goals.GoalGetToBlock(block.position.x, block.position.y, block.position.z));
            
            // Check if task was cancelled while moving
            if (!gatherProcess) return;

            const targetBlock = bot.blockAt(block.position); // Re-fetch block to ensure it's still there
            if (targetBlock && targetBlock.type === gatherProcess.blockType.id) {
                await bot.dig(targetBlock);

                // Check if task was cancelled during digging
                if (!gatherProcess) return;

                log(`Successfully collected one ${gatherProcess.blockName}.`, 'system');
                gatherProcess.failedAttempts = 0; // Reset failures on success
                gatherProcess.timeout = setTimeout(runManualGatherStep, 250);
            } else {
                if (!gatherProcess) return;
                log("Block disappeared before I could get it. Looking for another.", 'system');
                gatherProcess.timeout = setTimeout(runManualGatherStep, 250);
            }
        } catch (err) {
            // CRITICAL: Check if gatherProcess was nulled during an await, which would cause a crash.
            if (!gatherProcess) return;

            log(`Could not get to ${gatherProcess.blockName}: ${err.message}`, 'error');
            gatherProcess.failedAttempts++;

            if (gatherProcess.failedAttempts >= 3) {
                bot.chat(`I'm having trouble reaching blocks here. I'll try a different spot.`);
                gatherProcess.failedAttempts = 0; // Reset after deciding to move
                const moveDistance = 32;
                const angle = Math.random() * Math.PI * 2;
                const x = Math.floor(bot.entity.position.x + moveDistance * Math.cos(angle));
                const z = Math.floor(bot.entity.position.z + moveDistance * Math.sin(angle));
                try {
                    await bot.pathfinder.goto(new goals.GoalBlock(x, bot.entity.position.y, z));
                    if (!gatherProcess) return; // check for interruption
                    gatherProcess.timeout = setTimeout(runManualGatherStep, 250);
                } catch (pathfinderErr) {
                    bot.chat("I got stuck trying to find a new spot. I'll stop this task for now.");
                    stopPersistentActions();
                }
            } else {
                 log(`Having trouble getting to that block. Trying another one...`, 'system');
                 gatherProcess.timeout = setTimeout(runManualGatherStep, 1000);
            }
        }
    } else {
        bot.chat(`I can't find any reachable ${gatherProcess.blockName} nearby. I'm going to search a new area.`);
        const moveDistance = 32;
        const angle = Math.random() * Math.PI * 2;
        const x = Math.floor(bot.entity.position.x + moveDistance * Math.cos(angle));
        const z = Math.floor(bot.entity.position.z + moveDistance * Math.sin(angle));
        try {
            await bot.pathfinder.goto(new goals.GoalBlock(x, bot.entity.position.y, z));
            if (!gatherProcess) return; // check for interruption
            gatherProcess.timeout = setTimeout(runManualGatherStep, 250);
        } catch (pathfinderErr) {
            bot.chat("I got stuck trying to find a new spot. I'll stop this task for now.");
            stopPersistentActions();
        }
    }
}


const executeAction = async (action, username) => {
    if (!bot) return;

    // Stop previous persistent actions when a new non-chat action comes in.
    if (action.action !== 'chat' && action.action !== 'none') {
        stopPersistentActions();
    }

    switch(action.action) {
      case 'chat':
        if(action.message) {
            log(action.message, 'bot');
            bot.chat(action.message);
        }
        break;
      case 'move': {
        const targetName = (action.target || username).toLowerCase();
        const targetPlayer = Object.values(bot.players).find(p => p.username.toLowerCase() === targetName);
        if (targetPlayer?.entity) {
          bot.chat(`On my way to ${targetPlayer.username}.`);
          const { GoalNear } = goals;
          bot.pathfinder.setGoal(new GoalNear(targetPlayer.entity.position.x, targetPlayer.entity.position.y, targetPlayer.entity.position.z, 2));
        } else {
          bot.chat(`I can't see a player named "${action.target || targetName}".`);
        }
        break;
      }
      case 'goto': {
          if (action.coordinates) {
              const { x, y, z } = action.coordinates;
              bot.chat(`Moving to coordinates: ${x}, ${y}, ${z}.`);
              bot.pathfinder.setGoal(new goals.GoalBlock(x,y,z));
          } else {
              bot.chat("I received a goto command without coordinates.");
          }
          break;
      }
      case 'gather': {
          const blockNameRaw = (action.target || '').toLowerCase().replace(" ", "_");
          const nameCorrectionMap = { 'grass': 'grass_block' };
          const blockName = nameCorrectionMap[blockNameRaw] || blockNameRaw;
          const amount = action.amount || 1;
          const blockType = bot.registry.blocksByName[blockName];

          if (!blockType) {
              bot.chat(`I don't know what a "${blockName}" is.`);
              return;
          }
          
          bot.chat(`Okay, I'll start looking for ${amount} ${blockName}. This might take a moment.`);
          
          gatherProcess = {
              blockType: blockType,
              blockName: blockName,
              targetAmount: amount,
              failedAttempts: 0,
              timeout: null,
          };

          runManualGatherStep(); // Start the non-blocking process
          break;
      }
      case 'attack': {
          const targetName = (action.target || '').toLowerCase();
          let initialTarget = Object.values(bot.entities).find(e => 
              e.isValid &&
              (e.displayName || e.name || '').toLowerCase() === targetName && 
              e.position.distanceTo(bot.entity.position) < 16
          );

          if (initialTarget) {
              bot.chat(`Engaging ${initialTarget.displayName}!`);

              attackInterval = setInterval(() => {
                  const target = bot.entities[initialTarget.id];
                  
                  if (!target || !target.isValid) {
                      bot.chat(`${initialTarget.displayName} is defeated or has disappeared.`);
                      stopPersistentActions();
                      return;
                  }

                  if (bot.entity.position.distanceTo(target.position) > 16) {
                      bot.chat(`${initialTarget.displayName} is too far away. Disengaging.`);
                      stopPersistentActions();
                      return;
                  }

                  bot.pathfinder.setGoal(new goals.GoalNear(target.position.x, target.position.y, target.position.z, 2));

                  if (bot.entity.position.distanceTo(target.position) < 3.5 && !bot.isUsingHeldItem) {
                      bot.attack(target);
                  }
              }, 500);
          } else {
              bot.chat(`I can't find ${action.target} nearby to attack.`);
          }
          break;
      }
      case 'craft': {
          const itemName = (action.item || '').toLowerCase().replace(/\s/g, '_');
          if(!itemName) {
              bot.chat("I received a craft command without an item name.");
              return;
          }
          const item = bot.registry.itemsByName[itemName];
          if (!item) {
              bot.chat(`I don't know how to craft a "${itemName}".`);
              return;
          }
          const recipe = bot.recipesFor(item.id, null, 1, null)[0];
          if (!recipe) {
              bot.chat(`I don't have a recipe for ${itemName}.`);
              return;
          }
          bot.chat(`Attempting to craft a ${itemName}...`);
          try {
              await bot.craft(recipe, 1, null);
              bot.chat(`Successfully crafted a ${itemName}!`);
          } catch (err) {
              bot.chat(`I failed to craft ${itemName}. Error: ${err.message}`);
          }
          break;
      }
      case 'look_at': {
        if(action.coordinates) {
          const { x, y, z } = action.coordinates;
          await bot.lookAt(new bot.vec3(x, y, z));
        } else if (action.target) {
          const targetPlayer = Object.values(bot.players).find(p => p.username.toLowerCase() === action.target.toLowerCase());
          if (targetPlayer?.entity) {
            await bot.lookAt(targetPlayer.entity.position.offset(0, targetPlayer.entity.height, 0));
          }
        }
        break;
      }
      case 'follow': {
        const targetName = (action.target || username).toLowerCase();
        const targetPlayer = Object.values(bot.players).find(p => p.username.toLowerCase() === targetName);
        if (targetPlayer?.entity) {
            bot.chat(`Okay, I will follow ${targetPlayer.username}.`);
            followInterval = setInterval(() => {
                if (targetPlayer?.entity && bot?.pathfinder) {
                    const { GoalNear } = goals;
                    bot.pathfinder.setGoal(new GoalNear(targetPlayer.entity.position.x, targetPlayer.entity.position.y, targetPlayer.entity.position.z, 2), true);
                } else {
                    stopPersistentActions();
                }
            }, 1000);
        } else {
            bot.chat(`I can't see a player named "${action.target || targetName}" to follow.`);
        }
        break;
      }
      case 'stop_action': {
        stopPersistentActions();
        bot.chat(action.message || "Okay, I'm stopping my current action.");
        break;
      }
      case 'equip': {
        const itemName = (action.item || '').toLowerCase().replace(/\s/g, '_');
        const item = bot.inventory.items().find(i => i.name === itemName);
        if (item) {
            try {
                await bot.equip(item, 'hand');
                bot.chat(`Equipped ${itemName}.`);
            } catch(err) {
                bot.chat(`I couldn't equip the ${itemName}. Error: ${err.message}`);
            }
        } else {
            bot.chat(`I don't have a ${itemName} to equip.`);
        }
        break;
      }
      case 'use_item': {
         try {
            bot.activateItem();
         } catch(err) {
             bot.chat(`Couldn't use the item. Maybe there's nothing to do with it. Error: ${err.message}`);
         }
         break;
      }
      case 'execute_command': {
        if (action.command) {
            bot.chat(action.command); // e.g. /time set day
        } else {
            bot.chat("I received an execute_command action without a command.");
        }
        break;
      }
      case 'drop': {
        const target = (action.target || action.item || '').toLowerCase();
        const amount = action.amount || Infinity;

        if (!target) {
            bot.chat("You need to tell me what to drop.");
            return;
        }

        if (target === 'all') {
            bot.chat("Okay, dropping my entire inventory.");
            const itemsToDrop = [...bot.inventory.items()]; // Create a copy
            for (const item of itemsToDrop) {
                try {
                    await bot.tossStack(item);
                    await new Promise(resolve => setTimeout(resolve, 50)); // Small delay to avoid server overload
                } catch (err) {
                    log(`Could not drop ${item.name}: ${err.message}`, 'error');
                    bot.chat(`I had some trouble dropping my ${item.name}.`);
                    break; // Stop if we hit an error
                }
            }
        } else {
            const itemName = target.replace(/\s/g, '_');
            const itemInInventory = bot.inventory.items().find(i => i.name === itemName);

            if (itemInInventory) {
                try {
                    const countToDrop = Math.min(amount, itemInInventory.count);
                    bot.chat(`Dropping ${countToDrop} ${itemName}.`);
                    await bot.toss(itemInInventory.type, null, countToDrop);
                } catch (err) {
                    bot.chat(`I had trouble dropping the ${itemName}.`);
                    log(`Drop error: ${err.message}`, 'error');
                }
            } else {
                bot.chat(`I don't have any ${itemName} to drop.`);
            }
        }
        break;
      }
      case 'error':
        bot.chat(action.message || "I've encountered an error.");
        break;
      case 'none':
        if(action.message) bot.chat(action.message);
        break;
      default:
        bot.chat(`I received an unhandled action '${action.action}'. I'm not sure what to do.`);
    }
};

export const handleCommand = async (command, username) => {
    if (!bot) return;
    
    // A user command should always interrupt the bot's current task.
    // Idle and self-defense actions should not interrupt.
    if (username !== 'BotIdleAction' && username !== 'BotSelfDefense') {
      stopPersistentActions();
    }
    
    // Prevent multiple AI calls from overlapping.
    if (isAwaitingAI) {
        log('AI is already thinking. Ignoring new command for now.', 'system');
        return;
    }

    isAwaitingAI = true;
    if (username !== 'BotIdleAction' && username !== 'BotSelfDefense') {
        log('Bot is thinking...', 'system');
    }
    resetIdleTimer();

    try {
        const state = getBotState(bot);
        if (state) {
            const action = await handleUserCommand(command, username, {...state, username: bot.username});
            log(action.thought || 'No thought provided by AI.', 'thought');
             if (action.message && (action.action !== 'chat' && action.action !== 'none')) {
                log(action.message, 'bot');
            }
            await executeAction(action, username);
        }
    } catch (error) {
        log(`Failed to get response from Gemini: ${error.message}`, 'error');
        console.error(error);
    } finally {
        isAwaitingAI = false;
        resetIdleTimer();
    }
};

const findNearbyAttacker = () => {
    if (!bot?.entity) return null;
    return Object.values(bot.entities)
        .filter(entity =>
            entity.isValid &&
            (entity.kind === 'Hostile Mob' || entity.type === 'player') &&
            entity.position.distanceTo(bot.entity.position) < 16 && // A reasonable range to identify an attacker
            entity.id !== bot.entity.id
        )
        .sort((a, b) => a.position.distanceTo(bot.entity.position) - b.position.distanceTo(b.position))[0];
};

export const createBot = (options) => {
    bot = mineflayer.createBot(options);

    bot.loadPlugin(pathfinder);

    bot.on('spawn', () => {
        log('Bot spawned successfully. Ready for commands.', 'system');
        lastHealth = bot.health; // Initialize health for self-defense
        startChat();
        resetIdleTimer();
        isBotReady = true; // Bot is now fully ready to process commands
    });

    bot.on('health', () => {
        if (!isBotReady || !bot.entity) return;

        if (bot.health < lastHealth) {
            log(`Health dropped to ${bot.health.toFixed(1)}!`, 'error');
            const attacker = findNearbyAttacker();

            if (isAwaitingAI) {
                // Lizard Brain: AI is busy, react immediately and defensively without thinking.
                log(`Reacting instinctively to attack while thinking.`, 'system');
                stopPersistentActions();
                if (attacker) {
                    executeAction({ action: 'attack', target: attacker.displayName }, 'BotSelfDefense');
                }
            } else {
                // Higher Brain: AI is available, let it make a tactical decision.
                if (attacker) {
                    handleCommand(`I am being attacked by a ${attacker.displayName}! I must defend myself.`, 'BotSelfDefense');
                } else {
                     handleCommand(`I've taken damage from an unknown source!`, 'BotSelfDefense');
                }
            }
        }
        lastHealth = bot.health;
    });

    bot.on('chat', (username, message) => {
        if (username === bot.username || !isBotReady) return;
        log(`<${username}> ${message}`, 'user');
        handleCommand(message, username);
    });

    bot.on('kicked', (reason) => {
        log(`Kicked from server: ${reason}`, 'error');
        isBotReady = false;
        stopPersistentActions();
    });

    bot.on('error', (err) => {
        log(`An error occurred: ${err.message}`, 'error');
    });

    return bot;
};

export const getBot = () => bot;
