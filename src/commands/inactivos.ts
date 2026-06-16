import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { BotCommand } from '../types';
import { getGuildClanTag } from '../utils/guild';
import { checkInactivity } from '../services/inactivity.service';
import { EMBED_COLOR } from '../utils/embeds';
import prisma from '../database/prisma';

async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply();
  const clanTag = await getGuildClanTag(interaction.guildId!);

  const playerCount = await prisma.player.count({ where: { clanTag } });

  if (playerCount === 0) {
    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setTitle('⚠️ Sin datos locales')
          .setDescription('No hay miembros sincronizados todavía.\nEjecutá **/clan sincronizar** primero para importar los datos.')
          .setColor(EMBED_COLOR)
          .setTimestamp(),
      ],
    });
    return;
  }

  const results = await checkInactivity(clanTag, interaction.guildId);

  if (results.length === 0) {
    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setTitle('✅ Sin inactivos')
          .setDescription('Todos los miembros registrados están activos.')
          .setColor(EMBED_COLOR)
          .setTimestamp(),
      ],
    });
    return;
  }

  const embed = new EmbedBuilder()
    .setTitle('⚠️ Miembros Inactivos')
    .setColor(EMBED_COLOR)
    .setTimestamp();

  const list = results
    .map((r) => {
      const icon = r.status === 'kick_suggested' ? '⛔' : r.status === 'inactive' ? '🔴' : '🟡';
      return `${icon} **${r.playerName}** — ${r.daysInactive} días (${r.status})`;
    })
    .join('\n');

  embed.setDescription(list);
  embed.setFooter({ text: `Total: ${results.length} inactivos` });

  await interaction.editReply({ embeds: [embed] });
}

export const inactivos: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('inactivos')
    .setDescription('Ver miembros inactivos del clan (líderes)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  execute,
  adminOnly: true,
};
