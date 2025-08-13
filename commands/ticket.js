const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  StringSelectMenuBuilder,
  ChannelType,
  ButtonStyle,
  PermissionsBitField,
} = require('discord.js');
const { EMBED_COLORS } = require('../config.js');
const { isTicketChannel, closeTicket, closeAllTickets, addToTicket, removeFromTicket } = require('../handlers/ticket.js');
const { GuildConfig } = require('../models');
const chalk = require('chalk');

// Temporary storage for setup state
const setupStates = new Map();

// Logging function with timestamp
const logWithTimestamp = (message, color = chalk.white) => {
  const timestamp = new Date().toLocaleString('en-US', { timeZone: 'UTC' });
  console.log(color(`[${timestamp}] ${message}`));
};

module.exports = {
  name: 'ticket',
  category: 'Ticket Management',
  description: 'Manage ticket system settings and operations',
  async execute(message, args, client) {
    if (!message.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
      const embed = new EmbedBuilder()
        .setTitle('Permission Denied')
        .setDescription('You need the `Manage Guild` permission to use this command!')
        .setColor(EMBED_COLORS.ERROR)
        .setFooter({ text: client.user.username });
      return message.reply({ embeds: [embed] });
    }

    const input = args[0]?.toLowerCase();
    let config;
    try {
      logWithTimestamp(`Fetching GuildConfig for guild ${message.guild.id}`, chalk.cyan);
      config = await GuildConfig.findOne({ guildId: message.guild.id }) || new GuildConfig({ guildId: message.guild.id });
      logWithTimestamp(`GuildConfig fetched: ${config ? 'Found' : 'Created new'}`, chalk.green);
    } catch (error) {
      logWithTimestamp(`Error fetching GuildConfig: ${error.message}`, chalk.redBright);
      const embed = new EmbedBuilder()
        .setTitle('Error')
        .setDescription('An error occurred while accessing server configuration. Please try again later.')
        .setColor(EMBED_COLORS.ERROR)
        .setFooter({ text: client.user.username });
      return message.reply({ embeds: [embed] });
    }

    let responseEmbed = new EmbedBuilder().setColor(EMBED_COLORS.SUCCESS).setFooter({ text: client.user.username });

    // Setup
    if (input === 'setup') {
      if (!message.guild.members.me.permissions.has(PermissionsBitField.Flags.ManageChannels)) {
        responseEmbed
          .setTitle('Permission Error')
          .setDescription('I lack the `Manage Channels` permission to create ticket channels!')
          .setColor(EMBED_COLORS.ERROR);
        return message.reply({ embeds: [responseEmbed] });
      }
      const targetChannel = message.mentions.channels.first() || message.guild.channels.cache.get(args[1]);
      if (!targetChannel || targetChannel.type !== ChannelType.GuildText) {
        responseEmbed
          .setTitle('Invalid Channel')
          .setDescription('Please specify a valid text channel!')
          .setColor(EMBED_COLORS.ERROR);
        return message.reply({ embeds: [responseEmbed] });
      }
      return startSetupWizard(message, targetChannel, config, client);
    }

    // Set panel type
    else if (input === 'paneltype') {
      const type = args[1]?.toLowerCase();
      if (!['buttons', 'menu', 'reactions'].includes(type)) {
        responseEmbed
          .setTitle('Invalid Panel Type')
          .setDescription('Invalid type! Options: buttons, menu, reactions')
          .setColor(EMBED_COLORS.ERROR);
        return message.reply({ embeds: [responseEmbed] });
      }
      config.panelType = type;
      await config.save();
      responseEmbed.setTitle('Panel Type Set').setDescription(`Panel type set to '${type}'`);
    }

    // Set embed color
    else if (input === 'setcolor') {
      const color = args[1];
      if (!color || !/^#[0-9A-F]{6}$/i.test(color)) {
        responseEmbed
          .setTitle('Invalid Color')
          .setDescription('Please specify a valid hex color code (e.g., #FF0000)!')
          .setColor(EMBED_COLORS.ERROR);
        return message.reply({ embeds: [responseEmbed] });
      }
      config.embedColor = color;
      await config.save();
      responseEmbed.setTitle('Embed Color Set').setDescription(`Embed color set to ${color}`);
    }

    // Set panel image
    else if (input === 'setimage') {
      const url = args[1];
      if (!url || !url.match(/\.(jpeg|jpg|gif|png)$/)) {
        responseEmbed
          .setTitle('Invalid Image URL')
          .setDescription('Please specify a valid image URL (jpg, jpeg, png, gif)!')
          .setColor(EMBED_COLORS.ERROR);
        return message.reply({ embeds: [responseEmbed] });
      }
      config.panelImage = url;
      await config.save();
      responseEmbed.setTitle('Panel Image Set').setDescription(`Panel image set to ${url}`);
    }

    // Set welcome image
    else if (input === 'setwelcomeimage') {
      const url = args[1];
      if (!url || !url.match(/\.(jpeg|jpg|gif|png)$/)) {
        responseEmbed
          .setTitle('Invalid Image URL')
          .setDescription('Please specify a valid image URL (jpg, jpeg, png, gif)!')
          .setColor(EMBED_COLORS.ERROR);
        return message.reply({ embeds: [responseEmbed] });
      }
      config.welcomeImage = url;
      await config.save();
      responseEmbed.setTitle('Welcome Image Set').setDescription(`Welcome message image set to ${url}`);
    }

    // Set welcome message
    else if (input === 'setwelcomemessage') {
      const msg = args.slice(1).join(' ');
      if (!msg) {
        responseEmbed
          .setTitle('Invalid Message')
          .setDescription('Please specify a welcome message!')
          .setColor(EMBED_COLORS.ERROR);
        return message.reply({ embeds: [responseEmbed] });
      }
      config.welcomeMessage = msg;
      await config.save();
      responseEmbed.setTitle('Welcome Message Set').setDescription(`Welcome message set to: "${msg}"`);
    }

    // Set embed footer
    else if (input === 'setfooter') {
      const footer = args.slice(1).join(' ');
      if (!footer) {
        responseEmbed
          .setTitle('Invalid Footer')
          .setDescription('Please specify a footer text!')
          .setColor(EMBED_COLORS.ERROR);
        return message.reply({ embeds: [responseEmbed] });
      }
      config.embedFooter = footer;
      await config.save();
      responseEmbed.setTitle('Embed Footer Set').setDescription(`Embed footer set to: "${footer}"`);
    }

    // Add category
    else if (input === 'addcategory') {
      if (args.length < 5) {
        responseEmbed
          .setTitle('Invalid Usage')
          .setDescription('Usage: `$ticket addcategory <label> <value> <description> <emoji>`')
          .setColor(EMBED_COLORS.ERROR);
        return message.reply({ embeds: [responseEmbed] });
      }
      const label = args[1];
      const value = args[2];
      const description = args[3];
      const emoji = args[4];
      if (!isValidEmoji(emoji, message.guild)) {
        responseEmbed.setTitle('Invalid Emoji').setDescription('Invalid emoji!').setColor(EMBED_COLORS.ERROR);
        return message.reply({ embeds: [responseEmbed] });
      }
      if (!config.ticketCategories) config.ticketCategories = [];
      config.ticketCategories.push({ label, value, description, emoji });
      await config.save();
      responseEmbed.setTitle('Category Added').setDescription(`Added category: ${label} (${emoji})`);
    }

    // Remove category
    else if (input === 'removecategory') {
      const value = args[1];
      if (!value) {
        responseEmbed
          .setTitle('Invalid Usage')
          .setDescription('Please specify the value of the category to remove!')
          .setColor(EMBED_COLORS.ERROR);
        return message.reply({ embeds: [responseEmbed] });
      }
      if (!config.ticketCategories) config.ticketCategories = [];
      config.ticketCategories = config.ticketCategories.filter(cat => cat.value !== value);
      await config.save();
      responseEmbed.setTitle('Category Removed').setDescription(`Removed category if it existed: ${value}`);
    }

    // List categories
    else if (input === 'listcategories') {
      if (!config.ticketCategories || config.ticketCategories.length === 0) {
        responseEmbed
          .setTitle('No Categories')
          .setDescription('No ticket categories defined!')
          .setColor(EMBED_COLORS.ERROR);
        return message.reply({ embeds: [responseEmbed] });
      }
      const cats = config.ticketCategories.map(cat => `- ${cat.label} (${cat.value}): ${cat.description} ${cat.emoji}`).join('\n');
      responseEmbed.setTitle('Ticket Categories').setDescription(cats);
    }

    // Add ping role
    else if (input === 'pingrole') {
      const role = message.mentions.roles.first() || message.guild.roles.cache.get(args[1]);
      if (!role) {
        responseEmbed
          .setTitle('Invalid Role')
          .setDescription('Please mention a valid role!')
          .setColor(EMBED_COLORS.ERROR);
        return message.reply({ embeds: [responseEmbed] });
      }
      if (!config.ticketPingRoles.includes(role.id)) {
        config.ticketPingRoles.push(role.id);
        await config.save();
        responseEmbed.setTitle('Ping Role Added').setDescription(`Role ${role.name} added for ticket creation pings.`);
      } else {
        responseEmbed.setTitle('Role Already Added').setDescription('This role is already set for pings!');
      }
    }

    // Add access role
    else if (input === 'accessrole') {
      const role = message.mentions.roles.first() || message.guild.roles.cache.get(args[1]);
      if (!role) {
        responseEmbed
          .setTitle('Invalid Role')
          .setDescription('Please mention a valid role!')
          .setColor(EMBED_COLORS.ERROR);
        return message.reply({ embeds: [responseEmbed] });
      }
      if (!config.ticketAccessRoles.includes(role.id)) {
        config.ticketAccessRoles.push(role.id);
        await config.save();
        responseEmbed.setTitle('Access Role Added').setDescription(`Role ${role.name} added for automatic ticket access.`);
      } else {
        responseEmbed.setTitle('Role Already Added').setDescription('This role is already set for access!');
      }
    }

    // Log channel
    else if (input === 'log') {
      const target = message.mentions.channels.first() || message.guild.channels.cache.get(args[1]);
      if (!target || target.type !== ChannelType.GuildText) {
        responseEmbed
          .setTitle('Invalid Channel')
          .setDescription('Please specify a valid text channel!')
          .setColor(EMBED_COLORS.ERROR);
        return message.reply({ embeds: [responseEmbed] });
      }
      const response = await setupLogChannel(target, config);
      responseEmbed.setTitle('Log Channel Set').setDescription(response);
    }

    // Set limit
    else if (input === 'limit') {
      const limit = parseInt(args[1], 10);
      if (isNaN(limit) || limit < 5) {
        responseEmbed
          .setTitle('Invalid Limit')
          .setDescription('Please specify a valid number (minimum 5)!')
          .setColor(EMBED_COLORS.ERROR);
        return message.reply({ embeds: [responseEmbed] });
      }
      const response = await setupLimit(limit, config);
      responseEmbed.setTitle('Ticket Limit Set').setDescription(response);
    }

    // Close
    else if (input === 'close') {
      const response = await closeTicket(message.channel, message.author, 'Closed by a moderator');
      if (!response) return;
      responseEmbed.setTitle('Ticket Closed').setDescription(response);
    }

    // Close all
    else if (input === 'closeall') {
      let sent = await message.reply({ embeds: [new EmbedBuilder().setTitle('Closing Tickets').setDescription('Closing all tickets...').setColor(EMBED_COLORS.BOT_EMBED).setFooter({ text: client.user.username })] });
      const response = await closeAllTickets(message.guild, message.author);
      responseEmbed.setTitle('All Tickets Closed').setDescription(response);
      return sent.editable ? sent.edit({ embeds: [responseEmbed] }) : message.channel.send({ embeds: [responseEmbed] });
    }

    // Add
    else if (input === 'add') {
      if (args.length < 2) {
        responseEmbed
          .setTitle('Invalid Usage')
          .setDescription('Please specify a user ID or role ID!')
          .setColor(EMBED_COLORS.ERROR);
        return message.reply({ embeds: [responseEmbed] });
      }
      let inputId = args[1];
      if (message.mentions.users.size > 0) inputId = message.mentions.users.first().id;
      else if (message.mentions.roles.size > 0) inputId = message.mentions.roles.first().id;
      const response = await addToTicket(message, inputId);
      responseEmbed.setTitle('Added to Ticket').setDescription(response);
    }

    // Remove
    else if (input === 'remove') {
      if (args.length < 2) {
        responseEmbed
          .setTitle('Invalid Usage')
          .setDescription('Please specify a user ID or role ID!')
          .setColor(EMBED_COLORS.ERROR);
        return message.reply({ embeds: [responseEmbed] });
      }
      let inputId = args[1];
      if (message.mentions.users.size > 0) inputId = message.mentions.users.first().id;
      else if (message.mentions.roles.size > 0) inputId = message.mentions.roles.first().id;
      const response = await removeFromTicket(message, inputId);
      responseEmbed.setTitle('Removed from Ticket').setDescription(response);
    }

    // Invalid input
    else {
      responseEmbed
        .setTitle('Invalid Command')
        .setDescription(
          'Incorrect usage! Examples:\n' +
          '`$ticket setup #channel` - Start ticket system setup\n' +
          '`$ticket paneltype buttons` - Set panel type (buttons, menu, reactions)\n' +
          '`$ticket setcolor #FF0000` - Set embed color\n' +
          '`$ticket setimage <url>` - Set panel image\n' +
          '`$ticket setwelcomeimage <url>` - Set welcome image\n' +
          '`$ticket setwelcomemessage <text>` - Set welcome message\n' +
          '`$ticket setfooter <text>` - Set embed footer\n' +
          '`$ticket addcategory <label> <value> <desc> <emoji>` - Add ticket category\n' +
          '`$ticket removecategory <value>` - Remove ticket category\n' +
          '`$ticket listcategories` - List all categories\n' +
          '`$ticket pingrole @role` - Add role to ping on ticket creation\n' +
          '`$ticket accessrole @role` - Add role for automatic ticket access\n' +
          '`$ticket log #channel` - Set log channel\n' +
          '`$ticket limit 10` - Set max open tickets\n' +
          '`$ticket close` - Close current ticket\n' +
          '`$ticket closeall` - Close all tickets\n' +
          '`$ticket add <id>` - Add user/role to ticket\n' +
          '`$ticket remove <id>` - Remove user/role from ticket'
        )
        .setColor(EMBED_COLORS.ERROR);
      return message.reply({ embeds: [responseEmbed] });
    }

    await message.reply({ embeds: [responseEmbed] });
  },

  // Handle interactions for setup wizard
  async handleInteraction(interaction, client) {
    if (!interaction.isStringSelectMenu() || !interaction.customId.startsWith('ticket_setup_')) return;

    const userId = interaction.user.id;
    const state = setupStates.get(userId);
    if (!state) {
      const embed = new EmbedBuilder()
        .setTitle('Setup Expired')
        .setDescription('Your setup session has expired!')
        .setColor(EMBED_COLORS.ERROR)
        .setFooter({ text: client.user.username });
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    const config = state.config;

    if (interaction.customId === `ticket_setup_paneltype_${userId}`) {
      config.panelType = interaction.values[0];
      state.step = 2;
      const embed = new EmbedBuilder()
        .setTitle('Ticket System Setup - Step 2: Panel Title')
        .setDescription('Send a message with the desired panel title (e.g., "Ticket System").')
        .setColor(EMBED_COLORS.BOT_EMBED)
        .setFooter({ text: 'Waiting for your response.' });
      await interaction.update({ embeds: [embed], components: [] });
      state.awaitingMessage = 'title';
      createMessageCollector(state, userId, client);
    } else if (interaction.customId === `ticket_setup_pingroles_${userId}`) {
      config.ticketPingRoles = interaction.values.includes('none') ? [] : interaction.values;
      state.step = 8;
      const embed = new EmbedBuilder()
        .setTitle('Ticket System Setup - Step 8: Access Roles')
        .setDescription(
          'Select the roles that will have automatic access to tickets (choose "No roles" for no automatic access):'
        )
        .setColor(EMBED_COLORS.BOT_EMBED)
        .setFooter({ text: 'Select an option to continue.' });
      const roles = interaction.guild.roles.cache.filter(role => !role.managed && role.id !== interaction.guild.id);
      const row = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`ticket_setup_accessroles_${userId}`)
          .setPlaceholder('Select roles')
          .setMinValues(0)
          .setMaxValues(roles.size)
          .addOptions([
            { label: 'No roles', value: 'none' },
            ...roles.map(role => ({ label: role.name, value: role.id })),
          ])
      );
      await interaction.update({ embeds: [embed], components: [row] });
    } else if (interaction.customId === `ticket_setup_accessroles_${userId}`) {
      config.ticketAccessRoles = interaction.values.includes('none') ? [] : interaction.values.filter(v => v !== 'none');
      state.step = 9;
      const embed = new EmbedBuilder()
        .setTitle('Ticket System Setup - Step 9: Ticket Categories')
        .setDescription(
          'Send categories in the format: label value description emoji\nOne per message. Send "done" when finished.\nExample: Technical Support support Technical issue support 🔧'
        )
        .setColor(EMBED_COLORS.BOT_EMBED)
        .setFooter({ text: 'Waiting for your responses.' });
      await interaction.update({ embeds: [embed], components: [] });
      state.awaitingMessage = 'categories';
      createMessageCollector(state, userId, client);
    }
  },

  // Handle messages for setup wizard
  async handleMessage(message, client) {
    const userId = message.author.id;
    const state = setupStates.get(userId);
    if (!state || !state.awaitingMessage) return;

    await handleCollectedMessage(message, state, client);
  },
};

// Function to validate emojis
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

async function startSetupWizard(message, targetChannel, config, client) {
  const userId = message.author.id;
  setupStates.set(userId, {
    step: 1,
    targetChannel,
    setupChannel: message.channel,
    config: {
      panelType: config.panelType || 'menu',
      panelTitle: config.panelTitle,
      panelDescription: config.panelDescription,
      embedColor: config.embedColor,
      panelImage: config.panelImage,
      welcomeImage: config.welcomeImage,
      welcomeMessage: config.welcomeMessage,
      embedFooter: config.embedFooter,
      ticketPingRoles: config.ticketPingRoles || [],
      ticketAccessRoles: config.ticketAccessRoles || [],
      ticketCategories: config.ticketCategories || [],
    },
  });

  const embed = new EmbedBuilder()
    .setTitle('Ticket System Setup - Step 1: Panel Type')
    .setDescription('Select the panel type for creating tickets:')
    .setColor(EMBED_COLORS.BOT_EMBED)
    .setFooter({ text: 'Select an option to continue.' });

  const row = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`ticket_setup_paneltype_${userId}`)
      .setPlaceholder('Select panel type')
      .addOptions([
        { label: 'Buttons', value: 'buttons', description: 'Individual buttons for each category', emoji: '🔘' },
        { label: 'Menu', value: 'menu', description: 'A dropdown menu for selection', emoji: '📜' },
        { label: 'Emoji Reactions', value: 'reactions', description: 'Emoji reactions for categories', emoji: '😀' },
      ])
  );

  await message.reply({ embeds: [embed], components: [row] });
}

async function finalizeSetup(interactionOrMessage, targetChannel, config, client) {
  const guild = interactionOrMessage.guild;
  const embed = new EmbedBuilder()
    .setTitle(config.panelTitle)
    .setDescription(config.panelDescription)
    .setColor(config.embedColor || EMBED_COLORS.BOT_EMBED);
  if (config.embedFooter) embed.setFooter({ text: config.embedFooter });
  if (config.panelImage) embed.setImage(config.panelImage);

  let components = [];
  let sentMsg;

  if (config.panelType === 'buttons') {
    const rows = [];
    let row = new ActionRowBuilder();
    config.ticketCategories.forEach((cat, index) => {
      if (!isValidEmoji(cat.emoji, guild)) {
        logWithTimestamp(`Invalid emoji for category ${cat.label}: ${cat.emoji}`, chalk.redBright);
        return;
      }
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`ticket_create_${cat.value}`)
          .setLabel(cat.label)
          .setEmoji(cat.emoji)
          .setStyle(ButtonStyle.Primary)
      );
      if ((index + 1) % 5 === 0 || index === config.ticketCategories.length - 1) {
        rows.push(row);
        row = new ActionRowBuilder();
      }
    });
    components = rows;
    sentMsg = await targetChannel.send({ embeds: [embed], components });
  } else if (config.panelType === 'menu') {
    const validCategories = config.ticketCategories.filter(cat => isValidEmoji(cat.emoji, guild));
    if (validCategories.length === 0) {
      setupStates.delete(interactionOrMessage.author?.id || interactionOrMessage.user.id);
      const errorEmbed = new EmbedBuilder()
        .setTitle('No Valid Categories')
        .setDescription('No valid emojis for menu! Add categories with valid emojis using `$ticket addcategory`.')
        .setColor(EMBED_COLORS.ERROR)
        .setFooter({ text: client.user.username });
      return interactionOrMessage.reply({ embeds: [errorEmbed] });
    }
    const row = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('ticket_type')
        .setPlaceholder('Select ticket type')
        .addOptions(
          validCategories.map(cat => ({
            label: cat.label,
            value: cat.value,
            description: cat.description,
            emoji: cat.emoji,
          }))
        )
    );
    components = [row];
    sentMsg = await targetChannel.send({ embeds: [embed], components });
  } else if (config.panelType === 'reactions') {
    sentMsg = await targetChannel.send({ embeds: [embed] });
    for (const cat of config.ticketCategories) {
      if (isValidEmoji(cat.emoji, guild)) {
        await sentMsg.react(cat.emoji);
      } else {
        logWithTimestamp(`Invalid emoji for category ${cat.label}: ${cat.emoji}`, chalk.redBright);
      }
    }
  }

  try {
    const dbConfig = await GuildConfig.findOne({ guildId: guild.id });
    dbConfig.panelType = config.panelType;
    dbConfig.panelTitle = config.panelTitle;
    dbConfig.panelDescription = config.panelDescription;
    dbConfig.embedColor = config.embedColor;
    dbConfig.panelImage = config.panelImage;
    dbConfig.welcomeImage = config.welcomeImage;
    dbConfig.welcomeMessage = config.welcomeMessage;
    dbConfig.embedFooter = config.embedFooter;
    dbConfig.ticketPingRoles = config.ticketPingRoles;
    dbConfig.ticketAccessRoles = config.ticketAccessRoles;
    dbConfig.ticketCategories = config.ticketCategories;
    dbConfig.panelMessageId = sentMsg.id;
    dbConfig.panelChannelId = targetChannel.id;
    await dbConfig.save();
    logWithTimestamp(`GuildConfig saved for guild ${guild.id}`, chalk.green);
  } catch (error) {
    logWithTimestamp(`Error saving GuildConfig: ${error.message}`, chalk.redBright);
    const errorEmbed = new EmbedBuilder()
      .setTitle('Error')
      .setDescription('An error occurred while saving the configuration. Please try again.')
      .setColor(EMBED_COLORS.ERROR)
      .setFooter({ text: client.user.username });
    return interactionOrMessage.reply({ embeds: [errorEmbed] });
  }

  setupStates.delete(interactionOrMessage.author?.id || interactionOrMessage.user.id);
  const successEmbed = new EmbedBuilder()
    .setTitle('Setup Complete')
    .setDescription('Ticket panel created in the specified channel!')
    .setColor(EMBED_COLORS.SUCCESS)
    .setFooter({ text: client.user.username });
  interactionOrMessage.reply({ embeds: [successEmbed] });
}

function createMessageCollector(state, userId, client) {
  const filter = m => m.author.id === userId && m.channel.id === state.setupChannel.id;
  const collector = state.setupChannel.createMessageCollector({ filter, time: 300000 }); // 5 minute timeout

  collector.on('collect', async m => {
    await handleCollectedMessage(m, state, client, collector);
  });

  collector.on('end', collected => {
    if (collected.size === 0) {
      setupStates.delete(userId);
      const embed = new EmbedBuilder()
        .setTitle('Setup Expired')
        .setDescription('Setup expired due to inactivity!')
        .setColor(EMBED_COLORS.ERROR)
        .setFooter({ text: client.user.username });
      state.setupChannel.send({ embeds: [embed] });
    }
  });
}

async function handleCollectedMessage(message, state, client, collector) {
  const userId = message.author.id;
  const config = state.config;
  const embed = new EmbedBuilder().setColor(EMBED_COLORS.BOT_EMBED).setFooter({ text: client.user.username });

  if (state.awaitingMessage === 'title') {
    config.panelTitle = message.content.slice(0, 256);
    state.step = 3;
    state.awaitingMessage = 'description';
    embed
      .setTitle('Ticket System Setup - Step 3: Panel Description')
      .setDescription('Send a message with the desired panel description (e.g., "Select a ticket type").')
      .setFooter({ text: 'Waiting for your response.' });
    await message.reply({ embeds: [embed] });
  } else if (state.awaitingMessage === 'description') {
    config.panelDescription = message.content.slice(0, 2048);
    state.step = 4;
    state.awaitingMessage = 'color';
    embed
      .setTitle('Ticket System Setup - Step 4: Embed Color')
      .setDescription('Send a message with a hex color code (e.g., #FF0000 for red).')
      .setFooter({ text: 'Waiting for your response.' });
    await message.reply({ embeds: [embed] });
  } else if (state.awaitingMessage === 'color') {
    const color = message.content;
    if (!color.match(/^#[0-9A-F]{6}$/i)) {
      embed
        .setTitle('Invalid Color')
        .setDescription('Please send a valid hex color code (e.g., #FF0000)!')
        .setColor(EMBED_COLORS.ERROR);
      return message.reply({ embeds: [embed] });
    }
    config.embedColor = color;
    state.step = 5;
    state.awaitingMessage = 'panelImage';
    embed
      .setTitle('Ticket System Setup - Step 5: Panel Image')
      .setDescription('Send a message with the panel image URL (jpg/png/gif) or "none" for no image.')
      .setFooter({ text: 'Waiting for your response.' });
    await message.reply({ embeds: [embed] });
  } else if (state.awaitingMessage === 'panelImage') {
    const input = message.content.toLowerCase();
    if (input !== 'none' && !input.match(/\.(jpeg|jpg|gif|png)$/)) {
      embed
        .setTitle('Invalid Image URL')
        .setDescription('Please send a valid URL (jpg, jpeg, png, gif) or "none"!')
        .setColor(EMBED_COLORS.ERROR);
      return message.reply({ embeds: [embed] });
    }
    config.panelImage = input === 'none' ? null : input;
    state.step = 6;
    state.awaitingMessage = 'welcomeImage';
    embed
      .setTitle('Ticket System Setup - Step 6: Welcome Image')
      .setDescription('Send a message with the welcome message image URL (jpg/png/gif) or "none" for no image.')
      .setFooter({ text: 'Waiting for your response.' });
    await message.reply({ embeds: [embed] });
  } else if (state.awaitingMessage === 'welcomeImage') {
    const input = message.content.toLowerCase();
    if (input !== 'none' && !input.match(/\.(jpeg|jpg|gif|png)$/)) {
      embed
        .setTitle('Invalid Image URL')
        .setDescription('Please send a valid URL (jpg, jpeg, png, gif) or "none"!')
        .setColor(EMBED_COLORS.ERROR);
      return message.reply({ embeds: [embed] });
    }
    config.welcomeImage = input === 'none' ? null : input;
    state.step = 7;
    state.awaitingMessage = 'welcomeMessage';
    embed
      .setTitle('Ticket System Setup - Step 7: Welcome Message')
      .setDescription('Send the text for the ticket welcome message or "none" for default.')
      .setFooter({ text: 'Waiting for your response.' });
    await message.reply({ embeds: [embed] });
  } else if (state.awaitingMessage === 'welcomeMessage') {
    const input = message.content.toLowerCase();
    config.welcomeMessage = input === 'none' ? null : message.content.slice(0, 2048);
    state.step = 8;
    state.awaitingMessage = 'footer';
    embed
      .setTitle('Ticket System Setup - Step 8: Embed Footer')
      .setDescription('Send the text for the embed footer or "none" for no footer.')
      .setFooter({ text: 'Waiting for your response.' });
    await message.reply({ embeds: [embed] });
  } else if (state.awaitingMessage === 'footer') {
    const input = message.content.toLowerCase();
    config.embedFooter = input === 'none' ? null : message.content.slice(0, 2048);
    state.step = 9;
    const roles = message.guild.roles.cache.filter(role => !role.managed && role.id !== message.guild.id);
    embed
      .setTitle('Ticket System Setup - Step 9: Ping Roles')
      .setDescription(
        roles.size > 0
          ? 'Select the roles to ping when a ticket is created (choose "No ping" for no pings):'
          : 'No roles available. Select "No ping" or add roles later with `$ticket pingrole @role`.'
      )
      .setFooter({ text: 'Select an option.' });
    const row = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`ticket_setup_pingroles_${userId}`)
        .setPlaceholder('Select roles')
        .setMinValues(0)
        .setMaxValues(roles.size)
        .addOptions([
          { label: 'No ping', value: 'none' },
          ...roles.map(role => ({ label: role.name, value: role.id })),
        ])
    );
    await message.reply({ embeds: [embed], components: [row] });
    collector.stop();
  } else if (state.awaitingMessage === 'categories') {
    const input = message.content.toLowerCase();
    if (input === 'done') {
      if (config.ticketCategories.length === 0 && config.panelType !== 'reactions') {
        embed
          .setTitle('No Categories')
          .setDescription('You must add at least one category!')
          .setColor(EMBED_COLORS.ERROR);
        return message.reply({ embeds: [embed] });
      }
      state.awaitingMessage = null;
      await finalizeSetup(message, state.targetChannel, config, client);
      collector.stop();
    } else {
      const parts = message.content.split(' ');
      if (parts.length < 4) {
        embed
          .setTitle('Invalid Format')
          .setDescription('Invalid format! Use: label value description emoji')
          .setColor(EMBED_COLORS.ERROR);
        return message.reply({ embeds: [embed] });
      }
      const label = parts[0];
      const value = parts[1];
      const description = parts.slice(2, -1).join(' ');
      const emoji = parts[parts.length - 1];
      if (!isValidEmoji(emoji, message.guild)) {
        embed.setTitle('Invalid Emoji').setDescription('Invalid emoji!').setColor(EMBED_COLORS.ERROR);
        return message.reply({ embeds: [embed] });
      }
      config.ticketCategories.push({ label, value, description, emoji });
      embed
        .setTitle('Category Added')
        .setDescription(`Added category: ${label} (${emoji}). Send the next category or "done".`)
        .setColor(EMBED_COLORS.SUCCESS);
      await message.reply({ embeds: [embed] });
    }
  }

  setupStates.set(userId, state);
}

async function setupLogChannel(target, settings) {
  if (!target.permissionsFor(target.guild.members.me).has([PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.EmbedLinks])) {
    return `I don't have permission to send embeds in ${target}!`;
  }

  settings.transcriptChannelId = target.id;
  await settings.save();

  return `Configuration saved! Ticket logs will be sent to ${target.toString()}.`;
}

async function setupLimit(limit, settings) {
  if (limit < 5) return 'Ticket limit cannot be less than 5';

  settings.ticketLimit = limit;
  await settings.save();

  return `Configuration saved. You can now have ${limit} open tickets.`;
}
