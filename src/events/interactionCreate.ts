import { Interaction, ModalSubmitInteraction, EmbedBuilder } from 'discord.js';
import logger from '../config/logger';
import { commands } from '../commands';
import { errorEmbed, isAdmin, EMBED_COLOR } from '../utils/embeds';
import prisma from '../database/prisma';
import { getClanMembers } from '../api/clan';
import { getGuildClanTag } from '../utils/guild';

const cooldowns = new Map<string, number>();

async function handleModal(interaction: ModalSubmitInteraction): Promise<void> {
  if (interaction.customId === 'modal_whatsapp') {
    const name = interaction.fields.getTextInputValue('whatsapp_name').trim().toLowerCase();
    const phone = interaction.fields.getTextInputValue('whatsapp_phone');
    const discordId = interaction.user.id;
    const guildId = interaction.guildId;

    try {
      // Validar que el nombre coincide con un miembro del clan
      let matched = false;
      if (guildId) {
        try {
          const clanTag = await getGuildClanTag(guildId);
          const members = await getClanMembers(clanTag);
          matched = members.some((m) => m.name.toLowerCase().trim() === name);
        } catch { /* si la API falla, dejamos matched=false */ }
      }

      if (!matched) {
        await interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setTitle('❌ No verificado')
              .setDescription(
                `El nombre **${interaction.fields.getTextInputValue('whatsapp_name')}** no coincide con ningún miembro del clan.\n\n` +
                `Verificá que sea exactamente igual a tu nombre en Clash Royale.`
              )
              .setColor(0xE74C3C),
          ],
          ephemeral: true,
        });
        return;
      }

      // Guardar en DB
      const existing = await prisma.player.findFirst({
        where: { discordId },
        orderBy: { updatedAt: 'desc' },
      });

      if (existing) {
        await prisma.player.update({
          where: { id: existing.id },
          data: { name: interaction.fields.getTextInputValue('whatsapp_name'), phone },
        });
      } else {
        await prisma.player.create({
          data: {
            tag: `discord_${discordId}`,
            name: interaction.fields.getTextInputValue('whatsapp_name'),
            discordId,
            phone,
            status: 'active',
          },
        });
      }

      // Obtener el link de WhatsApp
      let link = 'No configurado. Un líder debe usar /config link-whatsapp.';
      if (guildId) {
        const cfg = await prisma.botConfig.findUnique({
          where: { key: `link_whatsapp_${guildId}` },
        });
        if (cfg) link = cfg.value;
      }

      await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle('✅ Verificado — Grupo de WhatsApp')
            .setDescription(
              `**${interaction.fields.getTextInputValue('whatsapp_name')}**, estos son tus datos:\n\n` +
              `📱 **WhatsApp:** ${phone}\n` +
              `🔗 **Grupo:** ${link}`
            )
            .setColor(EMBED_COLOR),
        ],
        ephemeral: true,
      });
      logger.info(`WhatsApp verified: ${name} (${phone}) -> ${discordId}`);
    } catch (err) {
      logger.error(`Modal whatsapp error: ${(err as Error).message}`);
      await interaction.reply({
        embeds: [errorEmbed('Error', 'No se pudo procesar. Intentá de nuevo.')],
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
