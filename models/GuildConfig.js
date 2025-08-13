const mongoose = require('mongoose');

const guildConfigSchema = new mongoose.Schema({
  guildId: { type: String, required: true },
  prefix: { type: String, default: '$' },
  panelTitle: { type: String, default: '🎫 Sistem de Tichete' },
  panelDescription: { type: String, default: 'Selectează tipul de tichet din meniul de mai jos.' },
  embedColor: { type: String, default: '#5865F2' },
  embedFooter: { type: String, default: 'Powered by YourBotName' },
  welcomeTitle: { type: String, default: 'Tichet {type}' },
  welcomeMessage: { type: String, default: 'Bine ai venit, {user}! Spune-ne cum te putem ajuta.' },
  closeMessage: { type: String, default: 'Acest tichet a fost închis. Canalul va fi șters în 5 secunde.' },
  ticketCategories: { type: Array, default: [
    { label: 'Suport General', value: 'general', description: 'Pentru întrebări generale.', emoji: '❓' },
    { label: 'Raportare Bug', value: 'bug', description: 'Pentru raportarea unui bug.', emoji: '🐛' },
    { label: 'Întrebare Tehnică', value: 'technical', description: 'Pentru probleme tehnice.', emoji: '🔧' },
  ] },
  supportRoles: { type: Array, default: [] },
  parentCategoryId: { type: String, default: null },
  ticketLimit: { type: Number, default: 3 },
  transcriptChannelId: { type: String, default: null },
  notifySupport: { type: Boolean, default: true },
  panelType: { type: String, default: 'menu' }, // 'buttons', 'menu', 'reactions'
  ticketPingRoles: { type: Array, default: [] }, // Roluri pentru ping la creare tichet
  ticketAccessRoles: { type: Array, default: [] }, // Roluri cu acces automat la tichete
});

module.exports = mongoose.model('GuildConfig', guildConfigSchema);