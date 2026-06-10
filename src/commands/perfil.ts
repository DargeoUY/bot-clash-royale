import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import { BotCommand } from '../types';
import { getPlayerInfo } from '../api/player';
import { CRApiError } from '../api/client';
import { isValidPlayerTag, formatPlayerTag } from '../utils/validators';
import { errorEmbed, EMBED_COLOR } from '../utils/embeds';

async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply();

  const rawTag = interaction.options.getString('player_tag');
  let playerTag: string;

  if (rawTag) {
    if (!isValidPlayerTag(rawTag)) {
      await interaction.editReply({
        embeds: [errorEmbed('Tag inválido', 'El formato del tag no es válido.')],
      });
      return;
    }
    playerTag = formatPlayerTag(rawTag);
  } else {
    await interaction.editReply({
      embeds: [errorEmbed('Falta tag', 'Usá /perfil #TAG para ver un perfil específico.')],
    });
    return;
  }

  try {
    const player = await getPlayerInfo(playerTag);

    const winRate = player.battleCount > 0
      ? Math.round((player.wins / player.battleCount) * 100)
      : 0;

    const embed = new EmbedBuilder()
      .setTitle(`🏆 ${player.name}`)
      .setColor(EMBED_COLOR)
      .setThumbnail(player.arena?.iconUrls?.medium || null)
      .addFields(
        { name: 'Tag', value: player.tag, inline: true },
        { name: 'Nivel', value: `${player.expLevel}`, inline: true },
        { name: 'Trofeos', value: `🏆 ${player.trophies}`, inline: true },
        { name: 'Récord', value: `${player.bestTrophies}`, inline: true },
        { name: 'Victorias', value: `${player.wins}`, inline: true },
        { name: 'Derrotas', value: `${player.losses}`, inline: true },
        { name: 'Win Rate', value: `${winRate}%`, inline: true },
        { name: 'Batallas', value: `${player.battleCount}`, inline: true },
        { name: 'Donaciones', value: `${player.totalDonations}`, inline: true },
        { name: 'Arena', value: player.arena?.name || 'N/A', inline: true },
      )
      .setTimestamp();

    if (player.clan) {
      embed.addFields({
        name: 'Clan',
        value: `${player.clan.name} (${player.clan.tag})`,
        inline: true,
      });
    }

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    if (error instanceof CRApiError && error.status === 404) {
      await interaction.editReply({
        embeds: [errorEmbed('No encontrado', `No se encontró el jugador ${playerTag}.`)],
      });
    } else {
      await interaction.editReply({
        embeds: [errorEmbed('Error', 'No se pudo obtener el perfil.')],
      });
    }
  }
}

export const perfil: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('perfil')
    .setDescription('Ver el perfil de un jugador de Clash Royale')
    .addStringOption((option) =>
      option
        .setName('player_tag')
        .setDescription('Tag del jugador (ej: #PLAYER123)')
        .setRequired(false),
    ),
  execute,
};
