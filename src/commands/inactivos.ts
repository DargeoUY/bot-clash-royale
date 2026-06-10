import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { BotCommand } from '../types';
import { getGuildClanTag } from '../utils/guild';
import { getClanMembers } from '../api/clan';
import { errorEmbed, EMBED_COLOR } from '../utils/embeds';

function parseDate(value: string): Date | null {
  try {
    const d = new Date(value);
    if (!isNaN(d.getTime())) return d;
    const m = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(?:\.(\d+))?Z$/);
    if (m) {
      const iso = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}.${m[7] || '000'}Z`;
      const parsed = new Date(iso);
      return isNaN(parsed.getTime()) ? null : parsed;
    }
    return null;
  } catch { return null; }
}

async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply();

  try {
    const clanTag = await getGuildClanTag(interaction.guildId!);
    const members = await getClanMembers(clanTag);
    const now = new Date();

    const results: { name: string; tag: string; daysInactive: number; status: string; icon: string }[] = [];

    const thresholds = members.length >= 43
      ? { warning: 2, inactive: 4, kick: 6 }
      : members.length >= 30
        ? { warning: 2, inactive: 5, kick: 10 }
        : { warning: 2, inactive: 7, kick: 14 };

    for (const m of members) {
      if (!m.lastSeen) continue;
      const d = parseDate(m.lastSeen);
      if (!d) continue;
      const days = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
      if (days < 2) continue;

      let status: string;
      let icon: string;
      if (days >= thresholds.kick) { status = 'Expulsión sugerida'; icon = '⛔'; }
      else if (days >= thresholds.inactive) { status = 'Inactivo'; icon = '🔴'; }
      else { status = 'Advertencia'; icon = '🟡'; }

      results.push({ name: m.name, tag: m.tag, daysInactive: days, status, icon });
    }

    results.sort((a, b) => b.daysInactive - a.daysInactive);

    if (results.length === 0) {
      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setTitle('✅ Todos activos')
            .setDescription(`${members.length} miembros. No hay inactivos (${thresholds.warning}+ días sin jugar).`)
            .setColor(EMBED_COLOR)
            .setTimestamp(),
        ],
      });
      return;
    }

    const embed = new EmbedBuilder()
      .setTitle(`⚠️ ${results.length} miembros inactivos`)
      .setColor(EMBED_COLOR)
      .setFooter({ text: `Umbrales: ${thresholds.warning}d aviso | ${thresholds.inactive}d inactivo | ${thresholds.kick}d expulsión` })
      .setTimestamp();

    const chunks: string[] = [];
    let current = '';
    for (const r of results) {
      const line = `${r.icon} **${r.name}** — ${r.daysInactive} días (${r.status})\n`;
      if (current.length + line.length > 1024) { chunks.push(current); current = line; }
      else { current += line; }
    }
    if (current) chunks.push(current);

    embed.setDescription(chunks[0]);
    for (let i = 1; i < chunks.length; i++) {
      embed.addFields({ name: `\u200b`, value: chunks[i] });
    }

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    await interaction.editReply({ embeds: [errorEmbed('Error', 'No se pudo obtener la actividad.')] });
  }
}

export const inactivos: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('inactivos')
    .setDescription('Ver miembros inactivos del clan (líderes)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  execute,
  adminOnly: true,
};
