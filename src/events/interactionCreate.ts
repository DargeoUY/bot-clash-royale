import { Interaction } from 'discord.js';
import logger from '../config/logger';
import { commands } from '../commands';
import { errorEmbed, isAdmin } from '../utils/embeds';

const cooldowns = new Map<string, number>();

export async function handleInteraction(interaction: Interaction): Promise<void> {
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

  // Cooldown check
  if (command.cooldownSeconds) {
    const key = `${interaction.commandName}_${interaction.user.id}`;
    const lastUsed = cooldowns.get(key);
    const now = Date.now();
    if (lastUsed && (now - lastUsed) < command.cooldownSeconds * 1000) {
      const remaining = Math.ceil((command.cooldownSeconds * 1000 - (now - lastUsed)) / 1000);
      await interaction.reply({
        embeds: [errorEmbed('Cooldown', `Esperá ${remaining}s para usar /${interaction.commandName} de nuevo.`)],
        ephemeral: true,
      });
      return;
    }
    cooldowns.set(key, now);
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
