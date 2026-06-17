import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import { BotCommand } from '../../types';
import { getGuildClanTag } from '../../utils/guild';
import { getPlayerPoints, getPointHistory, addPoints, getLeaderboard } from '../../services/points.service';
import { getWeeklyTrophyRanking, getMonthlyTrophyRanking, getDonationRanking, getWarRanking } from '../../services/ranking.service';
import { isValidPlayerTag, formatPlayerTag } from '../../utils/validators';
import { errorEmbed, successEmbed, EMBED_COLOR } from '../../utils/embeds';

async function ejecutarVer(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  const rawTag = interaction.options.getString('player_tag');
  let playerTag: string;

  if (rawTag) {
    if (!isValidPlayerTag(rawTag)) {
      await interaction.editReply({ embeds: [errorEmbed('Tag inválido', 'El formato no es válido.')] });
      return;
    }
    playerTag = formatPlayerTag(rawTag);
  } else {
    await interaction.editReply({
      embeds: [errorEmbed('Falta tag', 'Especificá tu tag o registrate con /registrar.')],
    });
    return;
  }

  const points = await getPlayerPoints(playerTag);

  const embed = new EmbedBuilder()
    .setTitle(`⭐ Puntos de ${playerTag}`)
    .setColor(EMBED_COLOR)
    .addFields(
      { name: 'Total', value: `${points.total}`, inline: true },
      { name: 'Guerra', value: `${points.war}`, inline: true },
      { name: 'Actividad', value: `${points.activity}`, inline: true },
      { name: 'Bonus', value: `${points.bonus}`, inline: true },
      { name: 'Temporada', value: points.season, inline: true },
    )
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}

async function ejecutarBonus(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply();

  const rawTag = interaction.options.getString('player', true);
  const cantidad = interaction.options.getInteger('cantidad', true);
  const motivo = interaction.options.getString('motivo', true);

  if (!isValidPlayerTag(rawTag)) {
    await interaction.editReply({ embeds: [errorEmbed('Tag inválido', '')] });
    return;
  }

  const playerTag = formatPlayerTag(rawTag);
  await addPoints(playerTag, cantidad, 'bonus', motivo);

  await interaction.editReply({
    embeds: [successEmbed('Puntos otorgados', `+${cantidad} pts a ${playerTag}: ${motivo}`)],
  });
}

async function ejecutarPenalizar(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply();

  const rawTag = interaction.options.getString('player', true);
  const cantidad = interaction.options.getInteger('cantidad', true);
  const motivo = interaction.options.getString('motivo', true);

  if (!isValidPlayerTag(rawTag)) {
    await interaction.editReply({ embeds: [errorEmbed('Tag inválido', '')] });
    return;
  }

  const playerTag = formatPlayerTag(rawTag);
  await addPoints(playerTag, -Math.abs(cantidad), 'penalty', motivo);

  await interaction.editReply({
    embeds: [successEmbed('Penalización', `-${Math.abs(cantidad)} pts a ${playerTag}: ${motivo}`)],
  });
}

async function ejecutarHistorial(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply();

  const rawTag = interaction.options.getString('player', true);
  if (!isValidPlayerTag(rawTag)) {
    await interaction.editReply({ embeds: [errorEmbed('Tag inválido', '')] });
    return;
  }
  const playerTag = formatPlayerTag(rawTag);

  const history = await getPointHistory(playerTag);

  const embed = new EmbedBuilder()
    .setTitle(`📜 Historial de ${playerTag}`)
    .setColor(EMBED_COLOR)
    .setTimestamp();

  if (history.length === 0) {
    embed.setDescription('Sin historial de puntos.');
  } else {
    embed.setDescription(
      history
        .map((h) => `**${h.points > 0 ? '+' : ''}${h.points}** — ${h.reason}${h.description ? `: ${h.description}` : ''}`)
        .join('\n'),
    );
  }

  await interaction.editReply({ embeds: [embed] });
}

async function ejecutarRanking(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply();

  const tipo = interaction.options.getString('tipo') || 'puntos';
  const periodo = interaction.options.getString('periodo') || 'mensual';
  const clanTag = await getGuildClanTag(interaction.guildId!);

  let embed: EmbedBuilder;

  if (tipo === 'trofeos') {
    const ranking = periodo === 'semanal'
      ? await getWeeklyTrophyRanking(clanTag)
      : await getMonthlyTrophyRanking(clanTag);
    embed = new EmbedBuilder()
      .setTitle(`🏆 Ranking de Trofeos (${periodo === 'semanal' ? 'Semanal' : 'Mensual'})`)
      .setColor(EMBED_COLOR)
      .setTimestamp();
    if (ranking.length === 0) {
      embed.setDescription('Sin datos todavía.');
    } else {
      embed.setDescription(
        ranking.map((p) => {
          const medal = p.rank === 1 ? '🥇' : p.rank === 2 ? '🥈' : p.rank === 3 ? '🥉' : `${p.rank}.`;
          const signo = p.delta >= 0 ? '+' : '';
          return `${medal} **${p.name}** — ${signo}${p.delta} 🏆`;
        }).join('\n'),
      );
    }
  } else if (tipo === 'donaciones') {
    const ranking = await getDonationRanking(clanTag);
    embed = new EmbedBuilder()
      .setTitle('💎 Ranking de Donaciones')
      .setColor(EMBED_COLOR)
      .setTimestamp();
    if (ranking.length === 0) {
      embed.setDescription('Sin datos todavía.');
    } else {
      embed.setDescription(
        ranking.map((p) => {
          const medal = p.rank === 1 ? '🥇' : p.rank === 2 ? '🥈' : p.rank === 3 ? '🥉' : `${p.rank}.`;
          return `${medal} **${p.name}** — ${p.donations} donadas`;
        }).join('\n'),
      );
    }
  } else if (tipo === 'guerra') {
    const ranking = await getWarRanking(clanTag);
    embed = new EmbedBuilder()
      .setTitle('⚔️ Ranking de Guerra (fama mensual)')
      .setColor(EMBED_COLOR)
      .setTimestamp();
    if (ranking.length === 0) {
      embed.setDescription('Sin datos de guerra este mes.');
    } else {
      embed.setDescription(
        ranking.map((p) => {
          const medal = p.rank === 1 ? '🥇' : p.rank === 2 ? '🥈' : p.rank === 3 ? '🥉' : `${p.rank}.`;
          return `${medal} **${p.name}** — ${p.fame} fama`;
        }).join('\n'),
      );
    }
  } else {
    const leaderboard = await getLeaderboard(clanTag, periodo as 'semanal' | 'mensual' | 'general');
    embed = new EmbedBuilder()
      .setTitle(`🏆 Ranking de Puntos (${periodo === 'semanal' ? 'Semanal' : periodo === 'mensual' ? 'Mensual' : 'General'})`)
      .setColor(EMBED_COLOR)
      .setTimestamp();
    if (leaderboard.length === 0) {
      embed.setDescription('Sin datos todavía.');
    } else {
      embed.setDescription(
        leaderboard.map((p) => {
          const medal = p.rank === 1 ? '🥇' : p.rank === 2 ? '🥈' : p.rank === 3 ? '🥉' : `${p.rank}.`;
          return `${medal} **${p.name}** — ${p.points} pts`;
        }).join('\n'),
      );
    }
  }

  await interaction.editReply({ embeds: [embed] });
}

export const puntos: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('puntos')
    .setDescription('Sistema de puntos')
    .addSubcommand((sub) =>
      sub
        .setName('ver')
        .setDescription('Ver tus puntos')
        .addStringOption((opt) =>
          opt.setName('player_tag').setDescription('Tag del jugador').setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('bonus')
        .setDescription('Otorgar puntos bonus (líderes)')
        .addStringOption((opt) => opt.setName('player').setDescription('Tag').setRequired(true))
        .addIntegerOption((opt) => opt.setName('cantidad').setDescription('Puntos').setRequired(true))
        .addStringOption((opt) => opt.setName('motivo').setDescription('Razón').setRequired(true)),
    )
    .addSubcommand((sub) =>
      sub
        .setName('penalizar')
        .setDescription('Penalizar puntos (líderes)')
        .addStringOption((opt) => opt.setName('player').setDescription('Tag').setRequired(true))
        .addIntegerOption((opt) => opt.setName('cantidad').setDescription('Puntos a quitar').setRequired(true))
        .addStringOption((opt) => opt.setName('motivo').setDescription('Razón').setRequired(true)),
    )
    .addSubcommand((sub) =>
      sub
        .setName('historial')
        .setDescription('Ver historial de puntos de un jugador')
        .addStringOption((opt) => opt.setName('player').setDescription('Tag').setRequired(true)),
    ),
  execute: async (interaction) => {
    const sub = interaction.options.getSubcommand();
    if (sub === 'ver') await ejecutarVer(interaction);
    else if (sub === 'bonus') await ejecutarBonus(interaction);
    else if (sub === 'penalizar') await ejecutarPenalizar(interaction);
    else if (sub === 'historial') await ejecutarHistorial(interaction);
  },
};

export const ranking: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('ranking')
    .setDescription('Ver rankings del clan')
    .addStringOption((opt) =>
      opt
        .setName('tipo')
        .setDescription('Tipo de ranking')
        .setRequired(false)
        .addChoices(
          { name: 'Trofeos', value: 'trofeos' },
          { name: 'Donaciones', value: 'donaciones' },
          { name: 'Guerra', value: 'guerra' },
          { name: 'Puntos', value: 'puntos' },
        ),
    )
    .addStringOption((opt) =>
      opt
        .setName('periodo')
        .setDescription('Período (solo trofeos/puntos)')
        .setRequired(false)
        .addChoices(
          { name: 'Semanal', value: 'semanal' },
          { name: 'Mensual', value: 'mensual' },
        ),
    ),
  execute: ejecutarRanking,
};
