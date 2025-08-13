const { EmbedBuilder, ChannelType, PermissionsBitField } = require('discord.js');
const { GuildConfig, Ticket } = require('../models');
const { EMBED_COLORS } = require('../config.js');
const ticketCommand = require('../commands/ticket.js');

module.exports = {
  name: 'interactionCreate',
  async execute(interaction, client) {
    if (interaction.isStringSelectMenu() && interaction.customId.startsWith('ticket_setup_')) {
      if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
        return interaction.reply({ content: 'Trebuie să ai permisiunea `Manage Guild`!', ephemeral: true });
      }
      await ticketCommand.handleInteraction(interaction, client);
      return;
    }

    if (!interaction.isButton() && !interaction.isStringSelectMenu()) return;

    const config = await GuildConfig.findOne({ guildId: interaction.guild.id });
    if (!config) return interaction.reply({ content: 'Configurația serverului nu este setată!', ephemeral: true });

    let ticketType;
    if (interaction.isButton() && interaction.customId.startsWith('ticket_create_')) {
      ticketType = interaction.customId.replace('ticket_create_', '');
    } else if (interaction.isStringSelectMenu() && interaction.customId === 'ticket_type') {
      ticketType = interaction.values[0];
    } else {
      return;
    }

    const guild = interaction.guild;
    const user = interaction.user;

    const openTickets = await Ticket.countDocuments({ guildId: guild.id, ticketCreatorId: user.id, status: 'open' });
    if (openTickets >= config.ticketLimit) {
      return interaction.reply({ content: `Ai atins limita de ${config.ticketLimit} tichete deschise!`, ephemeral: true });
    }

    const parentId = config.parentCategoryId || interaction.channel.parentId;

    const ticketChannel = await guild.channels.create({
      name: `ticket-${user.username}-${ticketType}`,
      type: ChannelType.GuildText,
      parent: parentId,
      permissionOverwrites: [
        { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
        { id: user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
        { id: client.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
        ...config.ticketAccessRoles.map(roleId => ({
          id: roleId,
          allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages],
        })),
      ],
    });

    const ticket = new Ticket({
      guildId: guild.id,
      ticketChannelId: ticketChannel.id,
      ticketCreatorId: user.id,
      ticketType,
      transcriptChannelId: config.transcriptChannelId,
    });
    await ticket.save();

    const embed = new EmbedBuilder()
      .setTitle(config.welcomeTitle.replace('{type}', ticketType))
      .setDescription(config.welcomeMessage.replace('{user}', `<@${user.id}>`))
      .setColor(config.embedColor || EMBED_COLORS.BOT_EMBED)
      .setFooter({ text: config.embedFooter });
    if (config.welcomeImage) embed.setImage(config.welcomeImage);

    let pingMessage = '';
    if (config.notifySupport) {
      pingMessage = config.ticketPingRoles.map(roleId => `<@&${roleId}>`).join(' ');
    }

    await ticketChannel.send({ content: pingMessage, embeds: [embed] });
    await interaction.reply({ content: `Tichetul tău a fost creat: ${ticketChannel}`, ephemeral: true });
  },
};