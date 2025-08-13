const { GuildConfig, Ticket } = require('../models');
const { EMBED_COLORS } = require('../config.js');
const { PermissionsBitField, EmbedBuilder, ChannelType } = require('discord.js');

module.exports = {
  name: 'messageReactionAdd',
  async execute(reaction, user, client) {
    if (user.bot) return;

    const message = reaction.message;
    const config = await GuildConfig.findOne({ guildId: message.guild.id });
    if (!config || config.panelType !== 'reactions' || message.id !== config.panelMessageId) return;

    const category = config.ticketCategories.find(cat => cat.emoji === reaction.emoji.name);
    if (!category) return;

    await reaction.users.remove(user.id);

    const openTickets = await Ticket.countDocuments({ guildId: message.guild.id, ticketCreatorId: user.id, status: 'open' });
    if (openTickets >= config.ticketLimit) {
      return user.send(`Ai atins limita de ${config.ticketLimit} tichete deschise!`);
    }

    const parentId = config.parentCategoryId || message.channel.parentId;

    const ticketChannel = await message.guild.channels.create({
      name: `ticket-${user.username}-${category.value}`,
      type: ChannelType.GuildText,
      parent: parentId,
      permissionOverwrites: [
        { id: message.guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
        { id: user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
        { id: client.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
        ...config.ticketAccessRoles.map(roleId => ({ id: roleId, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] })),
      ],
    });

    const ticket = new Ticket({
      guildId: message.guild.id,
      ticketChannelId: ticketChannel.id,
      ticketCreatorId: user.id,
      ticketType: category.value,
    });
    await ticket.save();

    const embed = new EmbedBuilder()
      .setTitle(config.welcomeTitle.replace('{type}', category.value))
      .setDescription(config.welcomeMessage.replace('{user}', `<@${user.id}>`))
      .setColor(EMBED_COLORS.BOT_EMBED)
      .setFooter({ text: config.embedFooter });

    let pingMessage = '';
    if (config.notifySupport) {
      pingMessage = config.ticketPingRoles.map(roleId => `<@&${roleId}>`).join(' ');
    }

    await ticketChannel.send({ content: pingMessage, embeds: [embed] });
    await user.send(`Tichetul tău a fost creat: ${ticketChannel}`);
  },
};