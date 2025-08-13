module.exports = {
  name: 'messageCreate',
  async execute(message, client) {
    if (message.author.bot || !message.content.startsWith(client.config.prefix)) return;

    const args = message.content.slice(client.config.prefix.length).trim().split(/ +/);
    const commandName = args.shift().toLowerCase();
    const command = client.commands.get(commandName);

    if (!command) return;

    try {
      await command.execute(message, args, client);
    } catch (error) {
      console.error(`Error executing command ${commandName}:`, error);
      const { EmbedBuilder } = require('discord.js');
      const embed = new EmbedBuilder()
        .setTitle('Error')
        .setDescription('An error occurred while executing the command!')
        .setColor('#FF0000')
        .setFooter({ text: client.user.username });
      message.reply({ embeds: [embed] });
    }
  },
};
