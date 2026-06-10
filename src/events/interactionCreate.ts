import { Interaction, ModalSubmitInteraction, EmbedBuilder } from 'discord.js';
import logger from '../config/logger';
import { commands } from '../commands';
import { errorEmbed, isAdmin, EMBED_COLOR } from '../utils/embeds';
import prisma from '../database/prisma';

const cooldowns = new Map<string, number>();

async function handleModal(interaction: ModalSubmitInteraction): Promise<void> {
  if (interaction.customId === 'modal_whatsapp') {
    const name = interaction.fields.getTextInputValue('whatsapp_name');
    const phone = interaction.fields.getTextInputValue('whatsapp_phone');
    const discordId = interaction.user.id;

    try {
      // Buscar si ya existe un player con este discordId
      const existing = await prisma.player.findFirst({
        where: { discordId },
        orderBy: { updatedAt: 'desc' },
      });

      if (existing) {
        await prisma.player.update({
          where: { id: existing.id },
          data: { name, phone },
        });
      } else {
        // Crear uno nuevo sin tag (no vinculado a CR)
        await prisma.player.create({
          data: {
            tag: `discord_${discordId}`,
            name,
            discordId,
            phone,
            status: 'active',
          },
        });
      }

      await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle('✅ Registro exitoso')
            .setDescription(`**${name}** — ${phone}\nTus datos se guardaron correctamente.`)
            .setColor(EMBED_COLOR),
        ],
        ephemeral: true,
      });
      logger.info(`WhatsApp registered: ${name} (${phone}) -> ${discordId}`);
    } catch (err) {
      logger.error(`Modal whatsapp error: ${(err as Error).message}`);
      await interaction.reply({
        embeds: [errorEmbed('Error', 'No se pudo guardar. Intentá de nuevo.')],
        ephemeral: true,
      });
    }
    return;
  }
}

export async function handleInteraction(interaction: Interaction): Promise<void> {
  // Handle modal submissions
  if (interaction.isModalSubmit()) {
    await handleModal(interaction);
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
