import { ModalSubmitInteraction, EmbedBuilder, TextChannel } from 'discord.js';
import prisma from '../database/prisma';
import { crGet } from '../api/client';
import { EMBED_COLOR } from '../utils/embeds';
import logger from '../config/logger';

export async function handleTorneoModal(interaction: ModalSubmitInteraction): Promise<void> {
  const rawTag = interaction.fields.getTextInputValue('torneo_tag').trim();
  const password = interaction.fields.getTextInputValue('torneo_pass').trim() || 'Sin contraseña';
  const guildId = interaction.guildId;

  const tag = rawTag.startsWith('#') ? rawTag : `#${rawTag}`;

  try {
    const tournament = await crGet<{
      name: string; tag: string; status: string;
      startTime?: string; endTime?: string;
      playerCount: number; maxPlayers: number;
    }>(`/tournaments/${encodeURIComponent(tag)}`);

    const startTime = tournament.startTime
      ? `<t:${Math.floor(new Date(tournament.startTime).getTime() / 1000)}:F>`
      : 'Sin fecha';
    const endTime = tournament.endTime
      ? `<t:${Math.floor(new Date(tournament.endTime).getTime() / 1000)}:F>`
      : 'Sin fecha';
    const statusLabel =
      tournament.status === 'inProgress' ? '🟢 En curso' :
      tournament.status === 'open' ? '🔵 Abierto' :
      tournament.status === 'full' ? '🟡 Lleno' :
      tournament.status === 'ended' ? '🔴 Finalizado' :
      `⚪ ${tournament.status}`;

    const embed = new EmbedBuilder()
      .setTitle(`🏆 ${tournament.name}`)
      .setColor(0x9B59B6)
      .setDescription('¡Nuevo torneo disponible!')
      .addFields(
        { name: 'Tag', value: `\`${tournament.tag}\``, inline: true },
        { name: 'Contraseña', value: `||${password}||`, inline: true },
        { name: 'Estado', value: statusLabel, inline: true },
        { name: 'Jugadores', value: `${tournament.playerCount}/${tournament.maxPlayers}`, inline: true },
        { name: 'Inicio', value: startTime, inline: true },
        { name: 'Finalización', value: endTime, inline: true },
      )
      .setFooter({ text: `Creado por ${interaction.user.tag}` })
      .setTimestamp();

    let channelId: string | null = null;
    if (guildId) {
      const cfg = await prisma.botConfig.findUnique({ where: { key: `channel_torneo_${guildId}` } });
      if (cfg) channelId = cfg.value;
    }

    if (!channelId) {
      await interaction.reply({
        embeds: [new EmbedBuilder().setTitle('❌ Canal no configurado')
          .setDescription('Un líder debe configurar `/config canal-torneo`.')
          .setColor(0xE74C3C)],
        ephemeral: true,
      });
      return;
    }

    const channel = (await interaction.client.channels.fetch(channelId)) as TextChannel;
    if (!channel) {
      await interaction.reply({ content: 'Canal no encontrado.', ephemeral: true });
      return;
    }

    await channel.send({ embeds: [embed] });
    await interaction.reply({
      embeds: [new EmbedBuilder().setTitle('✅ Torneo publicado')
        .setDescription(`**${tournament.name}** en ${channel}`)
        .setColor(EMBED_COLOR)],
      ephemeral: true,
    });
  } catch (err) {
    logger.error(`Torneo error: ${(err as Error).message}`);
    await interaction.reply({
      embeds: [new EmbedBuilder().setTitle('❌ Error')
        .setDescription('No se encontró el torneo. Verificá el tag.')
        .setColor(0xE74C3C)],
      ephemeral: true,
    });
  }
}
