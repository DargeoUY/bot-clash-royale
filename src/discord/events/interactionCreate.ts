import { Interaction } from 'discord.js';
import logger from '../../config/logger';
import { commands } from '../commands';
import { errorEmbed, isAdmin } from '../../utils/embeds';
import { checkRegistered } from '../middleware/guild-check';

export async function handleInteraction(interaction: Interaction): Promise<void> {
  if (interaction.isModalSubmit()) {
    const commandName = interaction.customId.replace('_modal', '');
    for (const [, cmd] of commands) {
      if (cmd.modalHandler && interaction.customId === 'auto_setup_modal') {
        await cmd.modalHandler(interaction);
        return;
      }
    }
    return;
  }

  if (!interaction.isChatInputCommand()) return;

  const command = commands.get(interaction.commandName);
  if (!command) {
    logger.warn(`Comando no encontrado: ${interaction.commandName}`);
    return;
  }

  if (command.adminOnly && !isAdmin(interaction)) {
    await interaction.reply({
      embeds: [errorEmbed('Permiso denegado', 'Este comando es solo para líderes y co-líderes.')],
      ephemeral: true,
    });
    return;
  }

  const publicCommands = ['registrar', 'ayuda', 'guia', 'setup', 'auto-setup', 'config', 'sync'];
  if (!publicCommands.includes(interaction.commandName)) {
    await interaction.deferReply({ ephemeral: true });
    const ok = await checkRegistered(interaction);
    if (!ok) return;
  }

  try {
    await command.execute(interaction);
    logger.debug(`Comando ejecutado: /${interaction.commandName} por ${interaction.user.tag}`);
  } catch (error) {
    logger.error(`Error ejecutando /${interaction.commandName}:`, error);

    const reply = {
      embeds: [errorEmbed('Error', 'Ocurrió un error al ejecutar el comando.')],
      ephemeral: true,
    };

    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(reply);
    } else {
      await interaction.reply(reply);
    }
  }
}
