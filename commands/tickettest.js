const { EmbedBuilder, PermissionsBitField } = require('discord.js');
const { EMBED_COLORS } = require('../config.js');

module.exports = {
  name: 'tickettest',
  category: 'Ticket Management',
  description: 'Manage ticket system settings',
  async execute(message, args, client) {
    if (!message.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
      const embed = new EmbedBuilder()
        .setTitle('Permission Denied')
        .setDescription('You need the `Manage Guild` permission to use this command!')
        .setColor(EMBED_COLORS.ERROR)
        .setFooter({ text: client.user.username });
      return message.reply({ embeds: [embed] });
    }

    const embed = new EmbedBuilder()
      .setTitle('Ticket Command')
      .setDescription('Ticket system setup not yet implemented.')
      .setColor(EMBED_COLORS.BOT_EMBED)
      .setFooter({ text: client.user.username });
    message.reply({ embeds: [embed] });
  },
};
