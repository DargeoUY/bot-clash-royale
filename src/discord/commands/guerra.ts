import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import { BotCommand } from '../../types';
import { getGuildClanTag } from '../../utils/guild';
import { getCurrentRiverRace } from '../../api/clan';
import { getLeaderboard } from '../../services/points.service';
import { CRApiError } from '../../api/client';
import { errorEmbed, EMBED_COLOR } from '../../utils/embeds';

async function executeEstado(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply();

  try {
    const clanTag = await getGuildClanTag(interaction.guildId!);
    const race = await getCurrentRiverRace(clanTag);
    const clan = race.clan;

    const embed = new EmbedBuilder()
      .setTitle('⚔️ Estado de la Guerra')
      .setDescription(`River Race — Temporada ${race.idTemporada || 'actual'}`)
      .setColor(EMBED_COLOR)
      .addFields(
        { name: 'Fama del clan', value: `${clan?.fame || 0}`, inline: true },
        { name: 'Participantes', value: `${clan?.participants?.length || 0}`, inline: true },
        { name: 'Estado', value: race.state === 'matched' ? 'En curso' : race.state === 'full' ? 'Finalizada' : race.state === 'ended' ? 'Terminada' : race.state, inline: true },
      );

    if (clan?.participants && clan.participants.length > 0) {
      const topParticipants = clan.participants
        .sort((a, b) => b.fame - a.fame)
        .slice(0, 5)
        .map((p, i) => `${i + 1}. ${p.name}: ${p.fame} fama, ${p.mazosUsadosHoy} decks hoy`)
        .join('\n');

      embed.addFields({ name: 'Top Participantes', value: topParticipants || 'Sin datos' });
    }

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    if (error instanceof CRApiError && error.status === 404) {
      await interaction.editReply({
        embeds: [errorEmbed('Sin guerra', 'No hay una guerra activa en este momento.')],
      });
    } else {
      await interaction.editReply({
        embeds: [errorEmbed('Error', 'No se pudo obtener el estado de la guerra.')],
      });
    }
  }
}

async function executeSemanal(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply();
  const clanTag = await getGuildClanTag(interaction.guildId!);
  const leaderboard = await getLeaderboard(clanTag, 'semanal');

  const embed = new EmbedBuilder()
    .setTitle('📊 Reporte Semanal de Guerra')
    .setColor(EMBED_COLOR)
    .setDescription('Top jugadores por puntos esta semana:')
    .setTimestamp();

  if (leaderboard.length === 0) {
    embed.setDescription('Sin datos de guerra esta semana.');
  } else {
    const topList = leaderboard.map((p, i) => {
      const medals = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
      return `${medals} **${p.name}** — ${p.points} pts`;
    }).join('\n');
    embed.setDescription(topList);
  }

  await interaction.editReply({ embeds: [embed] });
}

async function executeMensual(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply();
  const clanTag = await getGuildClanTag(interaction.guildId!);
  const leaderboard = await getLeaderboard(clanTag, 'mensual');

  const embed = new EmbedBuilder()
    .setTitle('📊 Reporte Mensual de Guerra')
    .setColor(EMBED_COLOR)
    .setDescription('Top jugadores por puntos este mes:')
    .setTimestamp();

  if (leaderboard.length === 0) {
    embed.setDescription('Sin datos este mes todavía.');
  } else {
    const topList = leaderboard.map((p, i) => {
      const medals = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
      return `${medals} **${p.name}** — ${p.points} pts`;
    }).join('\n');
    embed.setDescription(topList);
  }

  await interaction.editReply({ embeds: [embed] });
}

export const guerra: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('guerra')
    .setDescription('Información de guerra del clan')
    .addSubcommand((sub) => sub.setName('estado').setDescription('Estado actual de la guerra'))
    .addSubcommand((sub) => sub.setName('semanal').setDescription('Reporte semanal de guerra'))
    .addSubcommand((sub) => sub.setName('mensual').setDescription('Reporte mensual de guerra')),
  execute: async (interaction) => {
    const sub = interaction.options.getSubcommand();
    if (sub === 'estado') await executeEstado(interaction);
    else if (sub === 'semanal') await executeSemanal(interaction);
    else if (sub === 'mensual') await executeMensual(interaction);
  },
};
