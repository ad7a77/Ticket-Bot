const mongoose = require('mongoose');

const ticketSchema = new mongoose.Schema({
  guildId: String,
  ticketChannelId: String,
  ticketCreatorId: String,
  ticketType: String,
  status: { type: String, default: 'open' },
  messages: { type: Array, default: [] },
  transcriptChannelId: String,
});

module.exports = mongoose.model('Ticket', ticketSchema);