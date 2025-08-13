const { GuildConfig } = require('../models');
const { PermissionsBitField } = require('discord.js');

function isValidEmoji(emoji, guild) {
  const unicodeRegex = /\p{Emoji}/u;
  if (unicodeRegex.test(emoji)) return true;
  const customEmojiRegex = /^<:[a-zA-Z0-9_]+:\d+>$/;
  if (customEmojiRegex.test(emoji)) {
    const emojiId = emoji.match(/\d+/)[0];
    return guild.emojis.cache.has(emojiId);
  }
  return false;
}

module.exports = {
  name: 'addcategory',
  category: 'Ticket Management',
  description: 'Adaugă o categorie nouă pentru tichete',
  async execute(message, args) {
    if (!message.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
      return message.reply('Trebuie să ai permisiunea `Manage Guild` pentru a folosi această comandă!');
    }

    if (args.length < 4) {
      return message.reply('Utilizare: `$addcategory <label> <value> <description> <emoji>`');
    }

    const [label, value, ...descriptionParts] = args;
    const description = descriptionParts.slice(0, -1).join(' ');
    const emoji = args[args.length - 1];

    if (!isValidEmoji(emoji, message.guild)) {
      return message.reply('Emoji invalid! Folosește un emoji Unicode sau un emoji custom din acest server.');
    }

    const config = await GuildConfig.findOne({ guildId: message.guild.id }) || new GuildConfig({ guildId: message.guild.id });

    if (config.ticketCategories.some(cat => cat.value === value)) {
      return message.reply('O categorie cu această valoare există deja!');
    }

    config.ticketCategories.push({ label, value, description, emoji });
    await config.save();

    message.reply(`Categorie adăugată: ${label} (${value})`);
  },
};