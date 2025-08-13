require('dotenv').config();
const { Client, IntentsBitField } = require('discord.js');
const mongoose = require('mongoose');
const fs = require('fs').promises;
const path = require('path');
const chalk = require('chalk');

// Configuration object
const config = {
  prefix: process.env.PREFIX || '!',
  folders: {
    commands: './commands',
    events: './events',
    models: './models',
  },
  intents: [
    IntentsBitField.Flags.Guilds,
    IntentsBitField.Flags.GuildMessages,
    IntentsBitField.Flags.MessageContent,
    IntentsBitField.Flags.GuildMembers,
    IntentsBitField.Flags.GuildMessageReactions,
  ],
  mongodb: {
    uri: process.env.MONGODB_URI,
    retries: 3,
    retryDelay: 5000,
    options: {
      serverSelectionTimeoutMS: 30000, // 30 seconds
      socketTimeoutMS: 45000, // 45 seconds
      connectTimeoutMS: 30000, // 30 seconds
    },
  },
};

// Validate environment variables
if (!process.env.DISCORD_BOT_TOKEN || !process.env.MONGODB_URI) {
  console.error(chalk.redBright('❌ Missing environment variables! Ensure DISCORD_BOT_TOKEN and MONGODB_URI are set in .env file.'));
  process.exit(1);
}

const client = new Client({ intents: config.intents });

// Initialize collections
client.commands = new Map();
client.config = config; // Attach config to client for command access
const loadStatus = {
  events: [],
  models: [],
  commands: [],
};

// Logging function with timestamp
const logWithTimestamp = (message, color = chalk.white) => {
  const timestamp = new Date().toLocaleString('en-US', { timeZone: 'UTC' });
  console.log(color(`[${timestamp}] ${message}`));
};

// Log environment variables
logWithTimestamp(`DISCORD_BOT_TOKEN: ${process.env.DISCORD_BOT_TOKEN ? 'Loaded' : 'Missing'}`, chalk.cyan);
logWithTimestamp(`MONGODB_URI: ${process.env.MONGODB_URI ? 'Loaded' : 'Missing'}`, chalk.cyan);
logWithTimestamp(`PREFIX: ${process.env.PREFIX || config.prefix}`, chalk.cyan);

// Function to format loading table
const logTable = (type, items) => {
  logWithTimestamp(`${type.charAt(0).toUpperCase() + type.slice(1)} Loading Status:`, chalk.yellow);
  console.table(
    items.map(item => ({
      Name: item.name,
      Category: item.category || 'N/A',
      Status: item.status === 'Loaded' ? chalk.blueBright(item.status) : chalk.redBright(item.status),
      Error: item.error || 'None',
    }))
  );
};

// Load files recursively
async function loadFiles(dir, type, callback) {
  try {
    const files = await fs.readdir(dir, { withFileTypes: true });
    for (const file of files) {
      const fullPath = path.join(dir, file.name);
      if (file.isDirectory()) {
        await loadFiles(fullPath, type, callback);
      } else if (file.name.endsWith('.js')) {
        try {
          const item = require(fullPath);
          await callback(file.name.replace('.js', ''), item, fullPath);
          loadStatus[type].push({
            name: file.name.replace('.js', ''),
            category: item.category || type,
            status: 'Loaded',
            error: null,
          });
        } catch (error) {
          loadStatus[type].push({
            name: file.name.replace('.js', ''),
            category: type,
            status: 'Error',
            error: error.message,
          });
          logWithTimestamp(`Failed to load ${type} ${file.name}: ${error.message}`, chalk.redBright);
        }
      }
    }
  } catch (error) {
    loadStatus[type].push({
      name: 'N/A',
      category: type,
      status: 'Error',
      error: `Folder ${dir} not found`,
    });
    logWithTimestamp(`${type} folder not found: ${dir}`, chalk.redBright);
  }
}

// Load models
async function loadModels() {
  logWithTimestamp('Checking models folder...', chalk.cyan);
  await loadFiles(config.folders.models, 'models', async (name) => {
    logWithTimestamp(`Loaded model: ${name}`, chalk.green);
  });
}

// Load commands
async function loadCommands() {
  logWithTimestamp('Checking commands folder...', chalk.cyan);
  await loadFiles(config.folders.commands, 'commands', async (name, command) => {
    client.commands.set(command.name, command);
    logWithTimestamp(`Loaded command: ${command.name} (${command.category || 'Uncategorized'})`, chalk.green);
  });
}

// Load events
async function loadEvents() {
  logWithTimestamp('Checking events folder...', chalk.cyan);
  await loadFiles(config.folders.events, 'events', async (name, event) => {
    const bindEvent = (...args) => event.execute(...args, client);
    if (event.once) {
      client.once(name, bindEvent);
    } else {
      client.on(name, bindEvent);
    }
    logWithTimestamp(`Loaded event: ${name}`, chalk.green);
  });
}

// MongoDB connection with retry
async function connectMongoDB(attempt = 1) {
  try {
    await mongoose.connect(config.mongodb.uri, config.mongodb.options);
    logWithTimestamp('Connected to MongoDB', chalk.green);
  } catch (error) {
    logWithTimestamp(`MongoDB connection attempt ${attempt} failed: ${error.message}`, chalk.redBright);
    if (attempt < config.mongodb.retries) {
      logWithTimestamp(`Retrying MongoDB connection in ${config.mongodb.retryDelay / 1000} seconds...`, chalk.yellow);
      await new Promise(resolve => setTimeout(resolve, config.mongodb.retryDelay));
      await connectMongoDB(attempt + 1);
    } else {
      logWithTimestamp('Max MongoDB connection retries reached. Exiting...', chalk.redBright);
      process.exit(1);
    }
  }
}

// Handle unhandled promise rejections
process.on('unhandledRejection', error => {
  logWithTimestamp(`Unhandled promise rejection: ${error.message}`, chalk.redBright);
  console.error(error.stack);
});

// Initialize bot
async function init() {
  await loadModels();
  await loadCommands();
  await loadEvents();
  await connectMongoDB();

  client.once('ready', () => {
    logWithTimestamp(`Logged in as ${client.user.tag}`, chalk.cyan);
    logTable('events', loadStatus.events);
    logTable('models', loadStatus.models);
    logTable('commands', loadStatus.commands);
  });

  try {
    await client.login(process.env.DISCORD_BOT_TOKEN);
  } catch (error) {
    logWithTimestamp(`Failed to login: ${error.message}`, chalk.redBright);
    process.exit(1);
  }
}

init();
