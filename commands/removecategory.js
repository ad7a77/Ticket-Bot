const { GuildConfig } = require('../models');
const { PermissionsBitField } = require('discord.js');

module.exports = {
  name: 'removecategory',
  category: 'Ticket Management',
  description: 'Elimină o categorie de tichete',
  async execute(message, args) {
    if (!message.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
      return message.reply('Trebuie să ai permisiunea `Manage Guild` pentru a folosi această comandă!');
    }

    if (args.length < 1) {
      return message.reply('Utilizare: `$removecategory <value>`');
    }

    const value = args[0];
    const config = await GuildConfig.findOne({ guildId: message.guild.id }) || new GuildConfig({ guildId: message.guild.id });

    const index = config.ticketCategories.findIndex(cat => cat.value === value);
    if (index === -1) {
      return message.reply('Categoria nu există!');
    }

    config.ticketCategories.splice(index, 1);
    await config.save();

    message.reply(`Categoria ${value} a fost eliminată.`);
  },
};