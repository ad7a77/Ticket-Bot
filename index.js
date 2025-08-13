require('dotenv').config();
const { Client, IntentsBitField } = require('discord.js');
const mongoose = require('mongoose');
const fs = require('fs');
const chalk = require('chalk');

const client = new Client({
  intents: [
    IntentsBitField.Flags.Guilds,
    IntentsBitField.Flags.GuildMessages,
    IntentsBitField.Flags.MessageContent,
    IntentsBitField.Flags.GuildMembers,
    IntentsBitField.Flags.GuildMessageReactions, // Adăugat pentru reacții
  ],
});

// Inițializare colecții
client.commands = new Map();
const loadStatus = {
  events: [],
  models: [],
  commands: [],
};

// Funcție pentru formatarea tabelului
const logTable = (type, items) => {
  console.log(chalk.yellow(`\n${type.charAt(0).toUpperCase() + type.slice(1)} Loading Status:`));
  console.table(
    items.map(item => ({
      Name: item.name,
      Category: item.category || 'N/A',
      Status: item.status === 'Loaded' ? chalk.blueBright(item.status) : chalk.redBright(item.status),
      Error: item.error || 'None',
    }))
  );
};

// Încărcare modele
if (fs.existsSync('./models')) {
  console.log(chalk.cyan('Checking models folder...'));
  const modelFiles = fs.readdirSync('./models').filter(file => file.endsWith('.js'));
  console.log(chalk.cyan(`Found ${modelFiles.length} model files: ${modelFiles.join(', ')}`));
  for (const file of modelFiles) {
    try {
      const model = require(`./models/${file}`);
      loadStatus.models.push({
        name: file.replace('.js', ''),
        category: 'MongoDB Model',
        status: 'Loaded',
        error: null,
      });
    } catch (error) {
      loadStatus.models.push({
        name: file.replace('.js', ''),
        category: 'MongoDB Model',
        status: 'Error',
        error: error.message,
      });
    }
  }
} else {
  console.log(chalk.redBright('Models folder not ASfound!'));
  loadStatus.models.push({
    name: 'N/A',
    category: 'MongoDB Model',
    status: 'Error',
    error: 'Models folder not found',
  });
}

// Încărcare comenzi
if (fs.existsSync('./commands')) {
  console.log(chalk.cyan('Checking commands folder...'));
  const commandFiles = fs.readdirSync('./commands').filter(file => file.endsWith('.js'));
  console.log(chalk.cyan(`Found ${commandFiles.length} command files: ${commandFiles.join(', ')}`));
  for (const file of commandFiles) {
    try {
      const command = require(`./commands/${file}`);
      client.commands.set(command.name, command);
      loadStatus.commands.push({
        name: command.name,
        category: command.category || 'Uncategorized',
        status: 'Loaded',
        error: null,
      });
    } catch (error) {
      loadStatus.commands.push({
        name: file.replace('.js', ''),
        category: 'Unknown',
        status: 'Error',
        error: error.message,
      });
    }
  }
} else {
  console.log(chalk.redBright('Commands folder not found!'));
  loadStatus.commands.push({
    name: 'N/A',
    category: 'Commands',
    status: 'Error',
    error: 'Commands folder not found',
  });
}

// Încărcare evenimente
if (fs.existsSync('./events')) {
  console.log(chalk.cyan('Checking events folder...'));
  const eventFiles = fs.readdirSync('./events').filter(file => file.endsWith('.js'));
  console.log(chalk.cyan(`Found ${eventFiles.length} event files: ${eventFiles.join(', ')}`));
  for (const file of eventFiles) {
    try {
      const event = require(`./events/${file}`);
      const eventName = file.replace('.js', '');
      client.on(eventName, (...args) => event.execute(...args, client));
      loadStatus.events.push({
        name: eventName,
        category: 'Discord Event',
        status: 'Loaded',
        error: null,
      });
    } catch (error) {
      loadStatus.events.push({
        name: file.replace('.js', ''),
        category: 'Discord Event',
        status: 'Error',
        error: error.message,
      });
    }
  }
} else {
  console.log(chalk.redBright('Events folder not found!'));
  loadStatus.events.push({
    name: 'N/A',
    category: 'Discord Event',
    status: 'Error',
    error: 'Events folder not found',
  });
}

// Conexiune MongoDB
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log(chalk.cyan('Connected to MongoDB')))
  .catch(err => console.error(chalk.redBright('MongoDB connection error: ') + err.message));

// Logare și afișare tabele
client.once('ready', () => {
  console.log(chalk.cyan(`Logged in as ${client.user.tag}`));
  logTable('events', loadStatus.events);
  logTable('models', loadStatus.models);
  logTable('commands', loadStatus.commands);
});

client.login(process.env.DISCORD_BOT_TOKEN);
