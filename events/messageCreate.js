const { GuildConfig } = require('../models');
const ticketCommand = require('../commands/ticket.js');

module.exports = {
  name: 'messageCreate',
  async execute(message, client) {
    if (message.author.bot) return;

    const config = await GuildConfig.findOne({ guildId: message.guild.id }) || new GuildConfig({ guildId: message.guild.id });
    if (!message.content.startsWith(config.prefix)) return;

    const args = message.content.slice(config.prefix.length).trim().split(/ +/);
    const commandName = args.shift().toLowerCase();

    const command = client.commands.get(commandName);
    if (!command) return;

    try {
      await command.execute(message, args, client);
    } catch (error) {
      console.error(error);
      await message.reply(`A apărut o eroare: ${error.message}`);
    }

    // Gestionare mesaje pentru setup
    await ticketCommand.handleMessage(message, client);
  },
};