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

    // Set welcome message
    else if (input === 'setwelcomemessage') {
      const msg = args.slice(1).join(' ');
      if (!msg) {
        return message.reply('Te rog specifică un mesaj de bun venit!');
      }
      config.welcomeMessage = msg;
      await config.save();
      response = `Mesaj de bun venit setat la: "${msg}"`;
    }

    // Set embed footer
    else if (input === 'setfooter') {
      const footer = args.slice(1).join(' ');
      if (!footer) {
        return message.reply('Te rog specifică un text pentru footer!');
      }
      config.embedFooter = footer;
      await config.save();
      response = `Footer embed setat la: "${footer}"`;
    }

    // Add category
    else if (input === 'addcategory') {
      if (args.length < 5) {
        return message.reply('Utilizare: $ticket addcategory <label> <value> <description> <emoji>');
      }
      const label = args[1];
      const value = args[2];
      const description = args[3];
      const emoji = args[4];
      if (!isValidEmoji(emoji, message.guild)) {
        return message.reply('Emoji invalid!');
      }
      if (!config.ticketCategories) config.ticketCategories = [];
      config.ticketCategories.push({ label, value, description, emoji });
      await config.save();
      response = `Categorie adăugată: ${label} (${emoji})`;
    }

    // Remove category
    else if (input === 'removecategory') {
      const value = args[1];
      if (!value) return message.reply('Specifică valoarea categoriei de șters!');
      if (!config.ticketCategories) config.ticketCategories = [];
      config.ticketCategories = config.ticketCategories.filter(cat => cat.value !== value);
      await config.save();
      response = `Categorie ștersă dacă exista: ${value}`;
    }

    // List categories
    else if (input === 'listcategories') {
      if (!config.ticketCategories || config.ticketCategories.length === 0) {
        return message.reply('Nu există categorii definite!');
      }
      const cats = config.ticketCategories.map(cat => `- ${cat.label} (${cat.value}): ${cat.description} ${cat.emoji}`).join('\n');
      response = `Categorii:\n${cats}`;
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
      return message.reply('Utilizare incorectă! Exemple: `$ticket setup #channel`, `$ticket paneltype buttons`, `$ticket setcolor #FF0000`, `$ticket setimage <url>`, `$ticket setwelcomeimage <url>`, `$ticket setwelcomemessage <text>`, `$ticket setfooter <text>`, `$ticket addcategory <label> <value> <desc> <emoji>`, `$ticket removecategory <value>`, `$ticket listcategories`, `$ticket pingrole @role`, `$ticket accessrole @role`, `$ticket log #channel`, `$ticket limit 10`, `$ticket close`, `$ticket closeall`, `$ticket add <id>`, `$ticket remove <id>`');
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
    const validCategories = config.ticketCategories.filter(cat => isValidEmoji(cat.emoji, guild));
    if (validCategories.length === 0) {
      setupStates.delete(interactionOrMessage.author.id);
      return interactionOrMessage.reply('Niciun emoji valid pentru meniu! Adaugă categorii cu emoji-uri valide folosind `$ticket addcategory`.');
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
      if (isValidEmoji(cat.emoji, guild)) {
        await sentMsg.react(cat.emoji);
      } else {
        console.warn(`Emoji invalid pentru categoria ${cat.label}: ${cat.emoji}`);
      }
    }
  }

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

  setupStates.delete(interactionOrMessage.author.id);
  interactionOrMessage.reply('Panel creat în canalul specificat!');
}

// Gestionare interacțiuni pentru setup
module.exports.handleInteraction = async (interaction, client) => {
  if (!interaction.isStringSelectMenu() || !interaction.customId.startsWith('ticket_setup_')) return;

  const userId = interaction.user.id;
  const state = setupStates.get(userId);
  if (!state) return interaction.reply({ content: 'Sesiune de setup expirată!', ephemeral: true });

  const config = state.config;

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
    createMessageCollector(state, userId, client);
  } else if (interaction.customId === `ticket_setup_pingroles_${userId}`) {
    config.ticketPingRoles = interaction.values.includes('none') ? [] : interaction.values;
    state.step = 8;
    const embed = new EmbedBuilder()
      .setTitle('Configurare Sistem Tichete - Pas 8: Roluri Acces')
      .setDescription(
        'Alege rolurile care vor avea acces automat la tichete (selectează "Fără roluri" dacă nu vrei acces automat):'
      )
      .setColor(EMBED_COLORS.BOT_EMBED)
      .setFooter({ text: 'Selectează o opțiune pentru a continua' });
    const roles = interaction.guild.roles.cache.filter(role => !role.managed && role.id !== interaction.guild.id);
    const row = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`ticket_setup_accessroles_${userId}`)
        .setPlaceholder('Alege rolurile')
        .setMinValues(0)
        .setMaxValues(roles.size)
        .addOptions([
          { label: 'Fără roluri', value: 'none' },
          ...roles.map(role => ({ label: role.name, value: role.id })),
        ])
    );
    await interaction.update({ embeds: [embed], components: [row] });
  } else if (interaction.customId === `ticket_setup_accessroles_${userId}`) {
    config.ticketAccessRoles = interaction.values.includes('none') ? [] : interaction.values.filter(v => v !== 'none');
    state.step = 9;
    const embed = new EmbedBuilder()
      .setTitle('Configurare Sistem Tichete - Pas 9: Categorii Tichete')
      .setDescription('Trimite categorii în format: label value description emoji\nUna pe mesaj. Trimite "done" când ai terminat.\nEx: Suport Tehnic support Suport pentru probleme tehnice 🔧')
      .setColor(EMBED_COLORS.BOT_EMBED)
      .setFooter({ text: 'Aștept răspunsurile tale.' });
    await interaction.update({ embeds: [embed], components: [] });
    state.awaitingMessage = 'categories';
    createMessageCollector(state, userId, client);
  }
};

// Funcție pentru crearea unui collector de mesaje pentru input customizabil
function createMessageCollector(state, userId, client) {
  const filter = m => m.author.id === userId && m.channel.id === state.setupChannel.id;
  const collector = state.setupChannel.createMessageCollector({ filter, time: 300000 }); // 5 minute timeout

  collector.on('collect', async m => {
    await handleCollectedMessage(m, state, client, collector);
  });

  collector.on('end', collected => {
    if (collected.size === 0) {
      setupStates.delete(userId);
      state.setupChannel.send('Setup expirat din cauza inactivității!');
    }
  });
}

async function handleCollectedMessage(message, state, client, collector) {
  const userId = message.author.id;
  const config = state.config;

  if (state.awaitingMessage === 'title') {
    config.panelTitle = message.content.slice(0, 256);
    state.step = 3;
    state.awaitingMessage = 'description';
    const embed = new EmbedBuilder()
      .setTitle('Configurare Sistem Tichete - Pas 3: Descriere Panel')
      .setDescription('Trimite un mesaj cu descrierea dorită pentru panel (ex. "Selectează tipul de tichet").')
      .setColor(EMBED_COLORS.BOT_EMBED)
      .setFooter({ text: 'Aștept răspunsul tău.' });
    await message.reply({ embeds: [embed] });
  } else if (state.awaitingMessage === 'description') {
    config.panelDescription = message.content.slice(0, 2048);
    state.step = 4;
    state.awaitingMessage = 'color';
    const embed = new EmbedBuilder()
      .setTitle('Configurare Sistem Tichete - Pas 4: Culoare Embed')
      .setDescription('Trimite un mesaj cu un cod hex pentru culoare (ex. #FF0000 pentru roșu).')
      .setColor(EMBED_COLORS.BOT_EMBED)
      .setFooter({ text: 'Aștept răspunsul tău.' });
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
      .setFooter({ text: 'Aștept răspunsul tău.' });
    await message.reply({ embeds: [embed] });
  } else if (state.awaitingMessage === 'panelImage') {
    const input = message.content.toLowerCase();
    if (input !== 'none' && !input.match(/\.(jpeg|jpg|gif|png)$/)) {
      return message.reply('Te rog trimite un URL valid sau "none"!');
    }
    config.panelImage = input === 'none' ? null : input;
    state.step = 6;
    state.awaitingMessage = 'welcomeImage';
    const embed = new EmbedBuilder()
      .setTitle('Configurare Sistem Tichete - Pas 6: Imagine Mesaj Bun Venit')
      .setDescription('Trimite un mesaj cu URL-ul imaginii pentru mesajul de bun venit (jpg/png/gif) sau "none" pentru fără imagine.')
      .setColor(EMBED_COLORS.BOT_EMBED)
      .setFooter({ text: 'Aștept răspunsul tău.' });
    await message.reply({ embeds: [embed] });
  } else if (state.awaitingMessage === 'welcomeImage') {
    const input = message.content.toLowerCase();
    if (input !== 'none' && !input.match(/\.(jpeg|jpg|gif|png)$/)) {
      return message.reply('Te rog trimite un URL valid sau "none"!');
    }
    config.welcomeImage = input === 'none' ? null : input;
    state.step = 7;
    state.awaitingMessage = 'welcomeMessage';
    const embed = new EmbedBuilder()
      .setTitle('Configurare Sistem Tichete - Pas 7: Mesaj Bun Venit')
      .setDescription('Trimite textul pentru mesajul de bun venit în tichet sau "none" pentru default.')
      .setColor(EMBED_COLORS.BOT_EMBED)
      .setFooter({ text: 'Aștept răspunsul tău.' });
    await message.reply({ embeds: [embed] });
  } else if (state.awaitingMessage === 'welcomeMessage') {
    const input = message.content.toLowerCase();
    config.welcomeMessage = input === 'none' ? null : message.content.slice(0, 2048);
    state.step = 8;
    state.awaitingMessage = 'footer';
    const embed = new EmbedBuilder()
      .setTitle('Configurare Sistem Tichete - Pas 8: Footer Embed')
      .setDescription('Trimite textul pentru footer-ul embed-ului sau "none" pentru fără footer.')
      .setColor(EMBED_COLORS.BOT_EMBED)
      .setFooter({ text: 'Aștept răspunsul tău.' });
    await message.reply({ embeds: [embed] });
  } else if (state.awaitingMessage === 'footer') {
    const input = message.content.toLowerCase();
    config.embedFooter = input === 'none' ? null : message.content.slice(0, 2048);
    state.step = 9;
    const roles = message.guild.roles.cache.filter(role => !role.managed && role.id !== message.guild.id);
    const embed = new EmbedBuilder()
      .setTitle('Configurare Sistem Tichete - Pas 9: Roluri Ping')
      .setDescription(
        roles.size > 0
          ? 'Alege rolurile care vor primi ping la crearea tichetului (selectează "Fără ping" dacă nu vrei ping-uri):'
          : 'Nu există roluri disponibile. Selectează "Fără ping" sau adaugă roluri mai târziu.'
      )
      .setColor(EMBED_COLORS.BOT_EMBED)
      .setFooter({ text: 'Selectează o opțiune.' });
    const row = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`ticket_setup_pingroles_${userId}`)
        .setPlaceholder('Alege rolurile')
        .setMinValues(0)
        .setMaxValues(roles.size)
        .addOptions([
          { label: 'Fără ping', value: 'none' },
          ...roles.map(role => ({ label: role.name, value: role.id })),
        ])
    );
    await message.reply({ embeds: [embed], components: [row] });
    collector.stop(); // Oprim collector-ul deoarece următorul este interacțiune
  } else if (state.awaitingMessage === 'categories') {
    const input = message.content.toLowerCase();
    if (input === 'done') {
      if (config.ticketCategories.length === 0 && config.panelType !== 'reactions') {
        return message.reply('Trebuie să adaugi cel puțin o categorie!');
      }
      state.awaitingMessage = null;
      await finalizeSetup(message, state.targetChannel, config, client);
      collector.stop();
    } else {
      const parts = message.content.split(' ');
      if (parts.length < 4) {
        return message.reply('Format invalid! label value description emoji');
      }
      const label = parts[0];
      const value = parts[1];
      const description = parts.slice(2, -1).join(' ');
      const emoji = parts[parts.length - 1];
      if (!isValidEmoji(emoji, message.guild)) {
        return message.reply('Emoji invalid!');
      }
      config.ticketCategories.push({ label, value, description, emoji });
      message.reply(`Categorie adăugată: ${label} (${emoji}). Trimite următoarea sau "done".`);
    }
  }

  setupStates.set(userId, state);
}

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

  return `Configurare salvată. Poți avea acum ${limit} tichete deschise`;
}
