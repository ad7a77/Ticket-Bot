const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  StringSelectMenuBuilder,
  ChannelType,
  ButtonStyle,
  ComponentType,
  PermissionsBitField,
} = require('discord.js');
const { EMBED_COLORS } = require('../config.js');
const { isTicketChannel, closeTicket, closeAllTickets, addToTicket, removeFromTicket } = require('../handlers/ticket.js');
const { GuildConfig } = require('../models');

// Stocare temporară pentru starea setup-ului
const setupStates = new Map();

module.exports = {
  name: 'ticket',
  category: 'Ticket Management',
  description: 'Various ticketing commands',
  async execute(message, args, client) {
    if (!message.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
      return message.reply('Trebuie să ai permisiunea `Manage Guild` pentru a folosi această comandă!');
    }

    const input = args[0]?.toLowerCase();
    const config = await GuildConfig.findOne({ guildId: message.guild.id }) || new GuildConfig({ guildId: message.guild.id });
    let response;

    // Setup
    if (input === 'setup') {
      if (!message.guild.members.me.permissions.has(PermissionsBitField.Flags.ManageChannels)) {
        return message.reply('Îmi lipsesc permisiunile `Manage Channels` pentru a crea canale de tichete!');
      }
      const targetChannel = message.mentions.channels.first() || message.guild.channels.cache.get(args[1]);
      if (!targetChannel || targetChannel.type !== ChannelType.GuildText) {
        return message.reply('Te rog specifică un canal de text valid!');
      }
      return startSetupWizard(message, targetChannel, config, client);
    }

    // Set panel type
    else if (input === 'paneltype') {
      const type = args[1]?.toLowerCase();
      if (!['buttons', 'menu', 'reactions'].includes(type)) {
        return message.reply('Tip invalid! Opțiuni: buttons, menu, reactions');
      }
      config.panelType = type;
      await config.save();
      response = `Tip panel setat la '${type}'`;
    }

    // Set embed color
    else if (input === 'setcolor') {
      const color = args[1];
      if (!color || !/^#[0-9A-F]{6}$/i.test(color)) {
        return message.reply('Te rog specifică un cod hex valid (ex. #FF0000)!');
      }
      config.embedColor = color;
      await config.save();
      response = `Culoare embed setată la ${color}`;
    }

    // Set panel image
    else if (input === 'setimage') {
      const url = args[1];
      if (!url || !url.match(/\.(jpeg|jpg|gif|png)$/)) {
        return message.reply('Te rog specifică un URL valid pentru imagine (jpg, jpeg, png, gif)!');
      }
      config.panelImage = url;
      await config.save();
      response = `Imagine panel setată la ${url}`;
    }

    // Set welcome image
    else if (input === 'setwelcomeimage') {
      const url = args[1];
      if (!url || !url.match(/\.(jpeg|jpg|gif|png)$/)) {
        return message.reply('Te rog specifică un URL valid pentru imagine (jpg, jpeg, png, gif)!');
      }
      config.welcomeImage = url;
      await config.save();
      response = `Imagine mesaj de bun venit setată la ${url}`;
    }

    // Add ping role
    else if (input === 'pingrole') {
      const role = message.mentions.roles.first() || message.guild.roles.cache.get(args[1]);
      if (!role) return message.reply('Te rog menționează un rol valid!');
      if (!config.ticketPingRoles.includes(role.id)) {
        config.ticketPingRoles.push(role.id);
        await config.save();
        response = `Rolul ${role.name} adăugat pentru ping la creare tichet.`;
      } else {
        response = 'Rolul există deja!';
      }
    }

    // Add access role
    else if (input === 'accessrole') {
      const role = message.mentions.roles.first() || message.guild.roles.cache.get(args[1]);
      if (!role) return message.reply('Te rog menționează un rol valid!');
      if (!config.ticketAccessRoles.includes(role.id)) {
        config.ticketAccessRoles.push(role.id);
        await config.save();
        response = `Rolul ${role.name} adăugat pentru acces automat la tichete.`;
      } else {
        response = 'Rolul există deja!';
      }
    }

    // Log channel
    else if (input === 'log') {
      const target = message.mentions.channels.first() || message.guild.channels.cache.get(args[1]);
      if (!target || target.type !== ChannelType.GuildText) {
        return message.reply('Te rog specifică un canal de text valid!');
      }
      response = await setupLogChannel(target, config);
    }

    // Set limit
    else if (input === 'limit') {
      const limit = parseInt(args[1], 10);
      if (isNaN(limit) || limit < 5) {
        return message.reply('Te rog specifică un număr valid (minim 5)!');
      }
      response = await setupLimit(limit, config);
    }

    // Close
    else if (input === 'close') {
      response = await closeTicket(message.channel, message.author, 'Închis de un moderator');
      if (!response) return;
    }

    // Close all
    else if (input === 'closeall') {
      let sent = await message.reply('Se închid tichetele...');
      response = await closeAllTickets(message.guild, message.author);
      return sent.editable ? sent.edit(response) : message.channel.send(response);
    }

    // Add
    else if (input === 'add') {
      if (args.length < 2) return message.reply('Te rog specifică un user ID sau role ID!');
      let inputId = args[1];
      if (message.mentions.users.size > 0) inputId = message.mentions.users.first().id;
      else if (message.mentions.roles.size > 0) inputId = message.mentions.roles.first().id;
      response = await addToTicket(message, inputId);
    }

    // Remove
    else if (input === 'remove') {
      if (args.length < 2) return message.reply('Te rog specifică un user ID sau role ID!');
      let inputId = args[1];
      if (message.mentions.users.size > 0) inputId = message.mentions.users.first().id;
      else if (message.mentions.roles.size > 0) inputId = message.mentions.roles.first().id;
      response = await removeFromTicket(message, inputId);
    }

    // Invalid input
    else {
      return message.reply('Utilizare incorectă! Exemple: `$ticket setup #channel`, `$ticket paneltype buttons`, `$ticket setcolor #FF0000`, `$ticket setimage <url>`, `$ticket setwelcomeimage <url>`, `$ticket pingrole @role`, `$ticket accessrole @role`, `$ticket log #channel`, `$ticket limit 10`, `$ticket close`, `$ticket closeall`, `$ticket add <id>`, `$ticket remove <id>`');
    }

    if (response) await message.reply(response);
  },
};

// Funcție pentru validarea emoji-urilor
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
    config: {
      panelType: config.panelType || 'menu',
      panelTitle: config.panelTitle,
      panelDescription: config.panelDescription,
      embedColor: config.embedColor,
      panelImage: config.panelImage,
      welcomeImage: config.welcomeImage,
      ticketPingRoles: config.ticketPingRoles,
      ticketAccessRoles: config.ticketAccessRoles,
    },
  });

  const embed = new EmbedBuilder()
    .setTitle('Configurare Sistem Tichete - Pas 1: Tip Panel')
    .setDescription('Alege tipul panelului pentru crearea tichetelor:')
    .setColor(EMBED_COLORS.BOT_EMBED)
    .setFooter({ text: 'Selectează o opțiune pentru a continua' });

  const row = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`ticket_setup_paneltype_${userId}`)
      .setPlaceholder('Alege tipul panelului')
      .addOptions([
        { label: 'Butoane', value: 'buttons', description: 'Butoane individuale pentru fiecare categorie', emoji: '🔘' },
        { label: 'Meniu', value: 'menu', description: 'Un meniu dropdown pentru selecție', emoji: '📜' },
        { label: 'Reacții Emoji', value: 'reactions', description: 'Reacții emoji pentru categorii', emoji: '😀' },
      ])
  );

  await message.reply({ embeds: [embed], components: [row] });
}

// Funcție pentru finalizarea setup-ului
async function finalizeSetup(message, targetChannel, config, client) {
  const embed = new EmbedBuilder()
    .setTitle(config.panelTitle)
    .setDescription(config.panelDescription)
    .setColor(config.embedColor)
    .setFooter({ text: config.embedFooter });
  if (config.panelImage) embed.setImage(config.panelImage);

  let components = [];
  let sentMsg;

  if (config.panelType === 'buttons') {
    const rows = [];
    let row = new ActionRowBuilder();
    config.ticketCategories.forEach((cat, index) => {
      if (!isValidEmoji(cat.emoji, message.guild)) {
        console.warn(`Emoji invalid pentru categoria ${cat.label}: ${cat.emoji}`);
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
    const validCategories = config.ticketCategories.filter(cat => isValidEmoji(cat.emoji, message.guild));
    if (validCategories.length === 0) {
      setupStates.delete(message.author.id);
      return message.reply('Niciun emoji valid pentru meniu! Adaugă categorii cu emoji-uri valide folosind `$addcategory`.');
    }
    const row = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('ticket_type')
        .setPlaceholder('Alege tipul de tichet')
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
      if (isValidEmoji(cat.emoji, message.guild)) {
        await sentMsg.react(cat.emoji);
      } else {
        console.warn(`Emoji invalid pentru categoria ${cat.label}: ${cat.emoji}`);
      }
    }
  }

  const dbConfig = await GuildConfig.findOne({ guildId: message.guild.id });
  dbConfig.panelType = config.panelType;
  dbConfig.panelTitle = config.panelTitle;
  dbConfig.panelDescription = config.panelDescription;
  dbConfig.embedColor = config.embedColor;
  dbConfig.panelImage = config.panelImage;
  dbConfig.welcomeImage = config.welcomeImage;
  dbConfig.ticketPingRoles = config.ticketPingRoles;
  dbConfig.ticketAccessRoles = config.ticketAccessRoles;
  dbConfig.panelMessageId = sentMsg.id;
  dbConfig.panelChannelId = targetChannel.id;
  await dbConfig.save();

  setupStates.delete(message.author.id);
  message.reply('Panel creat în canalul specificat!');
}

// Gestionare interacțiuni pentru setup
module.exports.handleInteraction = async (interaction, client) => {
  if (!interaction.isStringSelectMenu() || !interaction.customId.startsWith('ticket_setup_')) return;

  const userId = interaction.user.id;
  const state = setupStates.get(userId);
  if (!state) return interaction.reply({ content: 'Sesiune de setup expirată!', ephemeral: true });

  const step = state.step;
  const config = state.config;
  const targetChannel = state.targetChannel;

  if (interaction.customId === `ticket_setup_paneltype_${userId}`) {
    config.panelType = interaction.values[0];
    state.step = 2;
    const embed = new EmbedBuilder()
      .setTitle('Configurare Sistem Tichete - Pas 2: Titlu Panel')
      .setDescription('Trimite un mesaj cu titlul dorit pentru panel (ex. "Sistem de Tichete").')
      .setColor(EMBED_COLORS.BOT_EMBED)
      .setFooter({ text: 'Aștept răspunsul tău în acest canal.' });
    await interaction.update({ embeds: [embed], components: [] });
    state.awaitingMessage = 'title';
  } else if (interaction.customId === `ticket_setup_color_${userId}`) {
    config.embedColor = interaction.values[0];
    state.step = 4;
    const embed = new EmbedBuilder()
      .setTitle('Configurare Sistem Tichete - Pas 4: Imagine Panel')
      .setDescription('Trimite un mesaj cu URL-ul imaginii pentru panel (jpg/png/gif) sau "none" pentru fără imagine.')
      .setColor(EMBED_COLORS.BOT_EMBED)
      .setFooter({ text: 'Aștept răspunsul tău în acest canal.' });
    await interaction.update({ embeds: [embed], components: [] });
    state.awaitingMessage = 'panelImage';
  } else if (interaction.customId === `ticket_setup_welcomeimage_${userId}`) {
    config.welcomeImage = interaction.values[0] === 'none' ? null : interaction.values[0];
    state.step = 6;
    const roles = interaction.guild.roles.cache.filter(role => !role.managed && role.id !== interaction.guild.id);
    const embed = new EmbedBuilder()
      .setTitle('Configurare Sistem Tichete - Pas 6: Roluri Ping')
      .setDescription(
        roles.size > 0
          ? 'Alege rolurile care vor primi ping la crearea tichetului (selectează "Fără ping" dacă nu vrei ping-uri):'
          : 'Nu există roluri disponibile. Selectează "Fără ping" sau adaugă roluri mai târziu cu `$ticket pingrole @role`.'
      )
      .setColor(EMBED_COLORS.BOT_EMBED)
      .setFooter({ text: 'Selectează o opțiune pentru a continua' });
    const row = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`ticket_setup_pingroles_${userId}`)
        .setPlaceholder('Alege rolurile')
        .setMaxValues(roles.size > 0 ? roles.size : 1)
        .addOptions(
          roles.size > 0
            ? [
                { label: 'Fără ping', value: 'none', description: 'Fără ping-uri la creare tichet' },
                ...roles.map(role => ({ label: role.name, value: role.id, description: `Rol: ${role.name}` })),
              ]
            : [{ label: 'Fără ping', value: 'none', description: 'Fără ping-uri la creare tichet' }]
        )
    );
    await interaction.update({ embeds: [embed], components: [row] });
  } else if (interaction.customId === `ticket_setup_pingroles_${userId}`) {
    config.ticketPingRoles = interaction.values.includes('none') ? [] : interaction.values;
    state.step = 7;
    const roles = interaction.guild.roles.cache.filter(role => !role.managed && role.id !== interaction.guild.id);
    const embed = new EmbedBuilder()
      .setTitle('Configurare Sistem Tichete - Pas 7: Roluri Acces')
      .setDescription(
        roles.size > 0
          ? 'Alege rolurile care vor avea acces automat la tichete (selectează "Fără roluri" dacă nu vrei acces automat):'
          : 'Nu există roluri disponibile. Selectează "Fără roluri" sau adaugă roluri mai târziu cu `$ticket accessrole @role`.'
      )
      .setColor(EMBED_COLORS.BOT_EMBED)
      .setFooter({ text: 'Selectează o opțiune pentru a continua' });
    const row = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`ticket_setup_accessroles_${userId}`)
        .setPlaceholder('Alege rolurile')
        .setMaxValues(roles.size > 0 ? roles.size : 1)
        .addOptions(
          roles.size > 0
            ? [
                { label: 'Fără roluri', value: 'none', description: 'Fără acces automat' },
                ...roles.map(role => ({ label: role.name, value: role.id, description: `Rol: ${role.name}` })),
              ]
            : [{ label: 'Fără roluri', value: 'none', description: 'Fără acces automat' }]
        )
    );
    await interaction.update({ embeds: [embed], components: [row] });
  } else if (interaction.customId === `ticket_setup_accessroles_${userId}`) {
    config.ticketAccessRoles = interaction.values.includes('none') ? [] : interaction.values;
    await finalizeSetup(interaction, targetChannel, config, client);
  }
};

// Gestionare mesaje pentru setup
module.exports.handleMessage = async (message, client) => {
  const userId = message.author.id;
  const state = setupStates.get(userId);
  if (!state || !state.awaitingMessage) return;

  const config = state.config;

  if (state.awaitingMessage === 'title') {
    config.panelTitle = message.content.slice(0, 256); // Limita Discord pentru titlu
    state.step = 3;
    state.awaitingMessage = 'description';
    const embed = new EmbedBuilder()
      .setTitle('Configurare Sistem Tichete - Pas 3: Descriere Panel')
      .setDescription('Trimite un mesaj cu descrierea dorită pentru panel (ex. "Selectează tipul de tichet").')
      .setColor(EMBED_COLORS.BOT_EMBED)
      .setFooter({ text: 'Aștept răspunsul tău în acest canal.' });
    await message.reply({ embeds: [embed] });
  } else if (state.awaitingMessage === 'description') {
    config.panelDescription = message.content.slice(0, 2048); // Limita Discord pentru descriere
    state.step = 4;
    state.awaitingMessage = 'color';
    const embed = new EmbedBuilder()
      .setTitle('Configurare Sistem Tichete - Pas 4: Culoare Embed')
      .setDescription('Trimite un mesaj cu un cod hex pentru culoare (ex. #FF0000 pentru roșu).')
      .setColor(EMBED_COLORS.BOT_EMBED)
      .setFooter({ text: 'Aștept răspunsul tău în acest canal.' });
    await message.reply({ embeds: [embed] });
  } else if (state.awaitingMessage === 'color') {
    const color = message.content;
    if (!color.match(/^#[0-9A-F]{6}$/i)) {
      return message.reply('Te rog trimite un cod hex valid (ex. #FF0000)!');
    }
    config.embedColor = color;
    state.step = 5;
    state.awaitingMessage = 'panelImage';
    const embed = new EmbedBuilder()
      .setTitle('Configurare Sistem Tichete - Pas 5: Imagine Panel')
      .setDescription('Trimite un mesaj cu URL-ul imaginii pentru panel (jpg/png/gif) sau "none" pentru fără imagine.')
      .setColor(EMBED_COLORS.BOT_EMBED)
      .setFooter({ text: 'Aștept răspunsul tău în acest canal.' });
    await message.reply({ embeds: [embed] });
  } else if (state.awaitingMessage === 'panelImage') {
    const input = message.content.toLowerCase();
    if (input !== 'none' && !input.match(/\.(jpeg|jpg|gif|png)$/)) {
      return message.reply('Te rog trimite un URL valid (jpg, jpeg, png, gif) sau "none"!');
    }
    config.panelImage = input === 'none' ? null : input;
    state.step = 6;
    state.awaitingMessage = 'welcomeImage';
    const embed = new EmbedBuilder()
      .setTitle('Configurare Sistem Tichete - Pas 6: Imagine Mesaj Bun Venit')
      .setDescription('Trimite un mesaj cu URL-ul imaginii pentru mesajul de bun venit (jpg/png/gif) sau "none" pentru fără imagine.')
      .setColor(EMBED_COLORS.BOT_EMBED)
      .setFooter({ text: 'Aștept răspunsul tău în acest canal.' });
    await message.reply({ embeds: [embed] });
  } else if (state.awaitingMessage === 'welcomeImage') {
    const input = message.content.toLowerCase();
    if (input !== 'none' && !input.match(/\.(jpeg|jpg|gif|png)$/)) {
      return message.reply('Te rog trimite un URL valid (jpg, jpeg, png, gif) sau "none"!');
    }
    config.welcomeImage = input === 'none' ? null : input;
    state.step = 7;
    state.awaitingMessage = null;
    const roles = message.guild.roles.cache.filter(role => !role.managed && role.id !== message.guild.id);
    const embed = new EmbedBuilder()
      .setTitle('Configurare Sistem Tichete - Pas 7: Roluri Ping')
      .setDescription(
        roles.size > 0
          ? 'Alege rolurile care vor primi ping la crearea tichetului (selectează "Fără ping" dacă nu vrei ping-uri):'
          : 'Nu există roluri disponibile. Selectează "Fără ping" sau adaugă roluri mai târziu cu `$ticket pingrole @role`.'
      )
      .setColor(EMBED_COLORS.BOT_EMBED)
      .setFooter({ text: 'Selectează o opțiune pentru a continua' });
    const row = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`ticket_setup_pingroles_${userId}`)
        .setPlaceholder('Alege rolurile')
        .setMaxValues(roles.size > 0 ? roles.size : 1)
        .addOptions(
          roles.size > 0
            ? [
                { label: 'Fără ping', value: 'none', description: 'Fără ping-uri la creare tichet' },
                ...roles.map(role => ({ label: role.name, value: role.id, description: `Rol: ${role.name}` })),
              ]
            : [{ label: 'Fără ping', value: 'none', description: 'Fără ping-uri la creare tichet' }]
        )
    );
    await message.reply({ embeds: [embed], components: [row] });
  }

  setupStates.set(userId, state);
};

async function setupLogChannel(target, settings) {
  if (!target.permissionsFor(target.guild.members.me).has([PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.EmbedLinks])) {
    return `Nu am permisiuni să trimit embed-uri în ${target}!`;
  }

  settings.transcriptChannelId = target.id;
  await settings.save();

  return `Configurare salvată! Logurile tachetelor vor fi trimise în ${target.toString()}`;
}

async function setupLimit(limit, settings) {
  if (limit < 5) return 'Limita de tichete nu poate fi mai mică de 5';

  settings.ticketLimit = limit;
  await settings.save();

  return `Configurare salvată. Poți avea acum test\`${limit}\` tichete deschise`;
}