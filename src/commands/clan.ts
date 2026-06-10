import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
} from 'discord.js';
import { BotCommand } from '../types';
import { getGuildClanTag, getGuildApiKey } from '../utils/guild';
import { getClanInfo } from '../api/clan';
import { CRApiError } from '../api/client';
import { EMBED_COLOR, errorEmbed } from '../utils/embeds';
import { getUnregisteredMembers } from '../services/donation.service';
import { syncClanData } from '../services/clan-war.service';

async function executeInfo(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply();

  const clanTag = await getGuildClanTag(interaction.guildId!);
  const apiKey = await getGuildApiKey(interaction.guildId!);

  try {
    const clanInfo = await getClanInfo(clanTag, apiKey);

    const badgeUrl = clanInfo.badgeUrls?.large
      || `https://cdn.royaleapi.com/static/badge/${clanInfo.badgeId}.png`;

    const embed = new EmbedBuilder()
      .setTitle(`⚔️ ${clanInfo.name}`)
      .setDescription(clanInfo.description || 'Sin descripción')
      .setColor(EMBED_COLOR)
      .setThumbnail(badgeUrl)
      .setImage(badgeUrl)
      .addFields(
        { name: 'Tag', value: clanInfo.tag, inline: true },
        { name: 'Miembros', value: `${clanInfo.members}/50`, inline: true },
        { name: 'Tipo', value: clanInfo.type === 'open' ? 'Abierto' : clanInfo.type === 'inviteOnly' ? 'Por invitación' : 'Cerrado', inline: true },
        { name: 'Trofeos requeridos', value: `${clanInfo.requiredTrophies}`, inline: true },
        { name: 'Trofeos de guerra', value: `${clanInfo.clanWarTrophies}`, inline: true },
        { name: 'Donaciones/semana', value: `${clanInfo.donationsPerWeek}`, inline: true },
        { name: 'Puntaje del clan', value: `${clanInfo.clanScore}`, inline: true },
        { name: 'Ubicación', value: clanInfo.location?.name || 'Internacional', inline: true },
      )
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    if (error instanceof CRApiError) {
      await interaction.editReply({
        embeds: [errorEmbed('Error de API', `[${error.status}] ${error.message}`)],
      });
    } else {
      await interaction.editReply({
        embeds: [errorEmbed('Error', 'No se pudo obtener la información del clan.')],
      });
    }
  }
}

async function executeNoRegistrados(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply();

  try {
    const unregistered = await getUnregisteredMembers(await getGuildClanTag(interaction.guildId!));

    const embed = new EmbedBuilder()
      .setTitle('👤 Miembros sin Discord')
      .setColor(EMBED_COLOR)
      .setDescription('Estos miembros del clan aún no vincularon su Discord:')
      .setTimestamp();

    if (unregistered.length === 0) {
      embed.setDescription('✅ Todos los miembros del clan están vinculados a Discord.');
    } else {
      const list = unregistered
        .map((m) => `**${m.name}** — ${m.tag} (${m.role})`)
        .join('\n') || 'Ninguno';
      embed.setDescription(`Faltan ${unregistered.length} miembros:\n\n${list}`);
      embed.setFooter({ text: 'Pediles que usen /registrar <tag>' });
    }

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    await interaction.editReply({
      embeds: [errorEmbed('Error', 'No se pudo obtener la lista de miembros.')],
    });
  }
}

async function executeSincronizar(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply();

  try {
    await syncClanData(await getGuildClanTag(interaction.guildId!), interaction.client);
    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setTitle('✅ Sincronizado')
          .setDescription('Datos del clan actualizados desde Clash Royale.')
          .setColor(EMBED_COLOR),
      ],
    });
  } catch (error) {
    await interaction.editReply({
      embeds: [errorEmbed('Error', 'No se pudo sincronizar con la API.')],
    });
  }
}

export const clan: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('clan')
    .setDescription('Información del clan')
    .addSubcommand((sub) => sub.setName('info').setDescription('Ver información del clan'))
    .addSubcommand((sub) => sub.setName('no-registrados').setDescription('Miembros sin Discord vinculado'))
    .addSubcommand((sub) => sub.setName('sincronizar').setDescription('Forzar sincronización con CR API')),
  execute: async (interaction) => {
    const subcommand = interaction.options.getSubcommand();
    if (subcommand === 'info') await executeInfo(interaction);
    else if (subcommand === 'no-registrados') await executeNoRegistrados(interaction);
    else if (subcommand === 'sincronizar') await executeSincronizar(interaction);
  },
};
