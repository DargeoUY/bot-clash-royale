import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { BotCommand } from '../types';
import { getGuildClanTag } from '../utils/guild';
import { getCurrentRiverRace } from '../api/clan';
import prisma from '../database/prisma';
import { errorEmbed, EMBED_COLOR } from '../utils/embeds';

function todayKey(): string {
  return new Date().toISOString().split('T')[0];
}

function medal(i: number): string {
  return i < 3 ? ['🥇', '🥈', '🥉'][i] : `${i + 1}`;
}

async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  const clanTag = await getGuildClanTag(interaction.guildId!);

  const rows = await prisma.dailyDelta.findMany({
    where: { clanTag, date: todayKey() },
  });

  const players = await prisma.player.findMany({
    where: { tag: { in: rows.map(r => r.playerTag) } },
    select: { tag: true, name: true },
  });
  const nameMap = new Map(players.map(p => [p.tag, p.name]));

  const deltas = rows.map(r => ({
    name: nameMap.get(r.playerTag) || r.playerTag,
    trophies: r.trophies,
    wins: r.wins,
    losses: r.losses,
    donations: r.donations,
  }));

  // War stats (live, 1 API call)
  let warPlayers: { name: string; fame: number }[] = [];
  try {
    const race = await getCurrentRiverRace(clanTag);
    if (race.clan?.participants) {
      warPlayers = race.clan.participants.map(p => ({ name: p.name, fame: p.fame }));
    }
  } catch { /* ok */ }

  const embeds: EmbedBuilder[] = [];
  const totalW = deltas.reduce((s, d) => s + d.wins, 0);
  const totalL = deltas.reduce((s, d) => s + d.losses, 0);
  const totalD = deltas.reduce((s, d) => s + d.donations, 0);
  const totalF = warPlayers.reduce((s, p) => s + p.fame, 0);

  const header = new EmbedBuilder()
    .setTitle('📊 Ranking Completo (admin)')
    .setColor(EMBED_COLOR)
    .setDescription(`**${deltas.length}** jugadores | ✅ ${totalW}V ❌ ${totalL}D | 💎 ${totalD.toLocaleString()} donaciones | ⚡ ${totalF.toLocaleString()} fama`)
    .setTimestamp();
  embeds.push(header);

  // Copas
  const byTrophies = [...deltas].sort((a, b) => b.trophies - a.trophies);
  if (byTrophies.length > 0) {
    let text = '';
    byTrophies.forEach((d, i) => {
      const sign = d.trophies > 0 ? '+' : '';
      text += `${medal(i)} **${d.name}** — ${sign}${d.trophies}\n`;
    });
    for (let i = 0; i < text.length; i += 1024) {
      embeds.push(new EmbedBuilder().setTitle('--- Todas las Copas ---').setColor(0xFFD700).setDescription(text.slice(i, i + 1024)));
    }
  }

  // Batallas
  const byBattles = [...deltas].sort((a, b) => (b.wins + b.losses) - (a.wins + a.losses));
  if (byBattles.length > 0) {
    let text = '';
    byBattles.forEach((d, i) => {
      text += `${medal(i)} **${d.name}** — ${d.wins + d.losses} batallas (${d.wins}V/${d.losses}D)\n`;
    });
    for (let i = 0; i < text.length; i += 1024) {
      embeds.push(new EmbedBuilder().setTitle('--- Todas las Batallas ---').setColor(0xE74C3C).setDescription(text.slice(i, i + 1024)));
    }
  }

  // Donaciones
  const byDons = [...deltas].sort((a, b) => b.donations - a.donations);
  if (byDons.length > 0) {
    let text = '';
    byDons.forEach((d, i) => {
      text += `${medal(i)} **${d.name}** — ${d.donations.toLocaleString()} 💎\n`;
    });
    for (let i = 0; i < text.length; i += 1024) {
      embeds.push(new EmbedBuilder().setTitle('--- Todas las Donaciones ---').setColor(0xFF69B4).setDescription(text.slice(i, i + 1024)));
    }
  }

  // Guerra (live from API)
  const byFame = [...warPlayers].sort((a, b) => b.fame - a.fame);
  if (byFame.length > 0) {
    let text = '';
    byFame.forEach((p, i) => {
      text += `${medal(i)} **${p.name}** — ${p.fame.toLocaleString()} ⚡ fama\n`;
    });
    for (let i = 0; i < text.length; i += 1024) {
      embeds.push(new EmbedBuilder().setTitle('--- Toda la Guerra ---').setColor(0x9B59B6).setDescription(text.slice(i, i + 1024)));
    }
  }

  if (embeds.length <= 1) {
    await interaction.editReply({ content: 'Sin datos todavía.' });
  } else {
    await interaction.editReply({ embeds: embeds.slice(0, 10) });
  }
}

export const rankingn: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('rankingn')
    .setDescription('Ranking COMPLETO con todos los jugadores + guerra (líderes)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  execute,
  adminOnly: true,
};
