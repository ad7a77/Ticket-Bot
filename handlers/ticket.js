const { ChannelType, PermissionsBitField } = require('discord.js');
const { Ticket } = require('../models');

async function isTicketChannel(channel) {
  if (channel.type !== ChannelType.GuildText) return false;
  const ticket = await Ticket.findOne({ ticketChannelId: channel.id, status: 'open' });
  return !!ticket;
}

async function closeTicket(channel, author, reason) {
  if (!await isTicketChannel(channel)) return 'Această comandă poate fi folosită doar în canalele de tichete!';
  if (!channel.permissionsFor(channel.guild.members.me).has(PermissionsBitField.Flags.ManageChannels)) {
    return 'Nu am permisiuni să închid tichetele!';
  }

  try {
    const ticket = await Ticket.findOne({ ticketChannelId: channel.id });
    ticket.status = 'closed';
    await ticket.save();

    if (ticket.transcriptChannelId) {
      const transcriptChannel = channel.guild.channels.cache.get(ticket.transcriptChannelId);
      if (transcriptChannel) {
        const messages = await channel.messages.fetch({ limit: 100 });
        const transcript = messages.map(m => `${m.author.tag}: ${m.content}`).reverse().join('\n');
        await transcriptChannel.send(`Transcript pentru tichet ${ticket.ticketChannelId}:\n\`\`\`\n${transcript}\n\`\`\``);
      }
    }

    await channel.send(`Tichet închis de ${author.tag}: ${reason}`);
    setTimeout(() => channel.delete(), 5000);
    return null;
  } catch (error) {
    return 'A apărut o eroare la închiderea tichetului!';
  }
}

async function closeAllTickets(guild, user) {
  const tickets = await Ticket.find({ guildId: guild.id, status: 'open' });
  let success = 0, failed = 0;

  for (const ticket of tickets) {
    const channel = guild.channels.cache.get(ticket.ticketChannelId);
    if (channel) {
      const result = await closeTicket(channel, user, 'Închiderea tuturor tachetelor');
      if (!result) success++;
      else failed++;
    } else {
      ticket.status = 'closed';
      await ticket.save();
      failed++;
    }
  }

  return `Gata! Succes: \`${success}\` Eșec: \`${failed}\``;
}

async function addToTicket(message, inputId) {
  if (!await isTicketChannel(message.channel)) return 'Această comandă poate fi folosită doar în canalele de tichete!';
  if (!inputId || isNaN(inputId)) return 'Trebuie să specifici un ID valid de utilizator sau rol!';

  try {
    await message.channel.permissionOverwrites.create(inputId, {
      ViewChannel: true,
      SendMessages: true,
    });
    return 'Gata! Utilizator/rol adăugat.';
  } catch (error) {
    return 'Eroare la adăugarea utilizatorului/rolului. ID valid?';
  }
}

async function removeFromTicket(message, inputId) {
  if (!await isTicketChannel(message.channel)) return 'Această comandă poate fi folosită doar în canalele de tichete!';
  if (!inputId || isNaN(inputId)) return 'Trebuie să specifici un ID valid de utilizator sau rol!';

  try {
    await message.channel.permissionOverwrites.create(inputId, {
      ViewChannel: false,
      SendMessages: false,
    });
    return 'Gata! Utilizator/rol eliminat.';
  } catch (error) {
    return 'Eroare la eliminarea utilizatorului/rolului. ID valid?';
  }
}

module.exports = { isTicketChannel, closeTicket, closeAllTickets, addToTicket, removeFromTicket };