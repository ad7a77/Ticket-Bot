const mongoose = require('mongoose');

const guildConfigSchema = new mongoose.Schema({
  guildId: { type: String, required: true, unique: true },
  panelType: { type: String, default: 'menu' },
  panelTitle: String,
  panelDescription: String,
  embedColor: String,
  panelImage: String,
  welcomeImage: String,
  welcomeMessage: String,
  embedFooter: String,
  ticketPingRoles: [String],
  ticketAccessRoles: [String],
  ticketCategories: [
    {
      label: String,
      value: String,
      description: String,
      emoji: String,
    },
  ],
  panelMessageId: String,
  panelChannelId: String,
  transcriptChannelId: String,
  ticketLimit: { type: Number, default: 5 },
});

module.exports = mongoose.model('GuildConfig', guildConfigSchema);
