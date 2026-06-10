import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import { BotCommand } from '../types';
import { getGuildClanTag } from '../utils/guild';
import { checkInactivity } from '../services/inactivity.service';
import { EMBED_COLOR } from '../utils/embeds';

async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply();

  const results = await checkInactivity(await getGuildClanTag(interaction.guildId!), interaction.guildId);

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
    .setDefaultMemberPermissions('0'),
  execute,
  adminOnly: true,
};
