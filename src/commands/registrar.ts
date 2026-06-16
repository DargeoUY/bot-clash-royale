import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import { BotCommand } from '../types';
import { getGuildClanTag } from '../utils/guild';
import { registerPlayer } from '../services/registration.service';
import { isValidPlayerTag, formatPlayerTag } from '../utils/validators';
import { errorEmbed, EMBED_COLOR } from '../utils/embeds';

async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  const rawTag = interaction.options.getString('player_tag', true);
  const discordId = interaction.user.id;

  if (!isValidPlayerTag(rawTag)) {
    await interaction.editReply({
      embeds: [errorEmbed('Tag inválido', 'El formato del tag no es válido. Ejemplo: `#28P8RQUY` o `#PLAYER123`')],
    });
    return;
  }

  const playerTag = formatPlayerTag(rawTag);
  const clanTag = await getGuildClanTag(interaction.guildId!);
  const result = await registerPlayer(playerTag, discordId, clanTag, interaction.guild || undefined);

  if (!result.success) {
    await interaction.editReply({
      embeds: [errorEmbed('Registro fallido', result.error || 'Error desconocido.')],
    });
    return;
  }

  const embed = new EmbedBuilder()
    .setTitle('✅ Registro exitoso')
    .setDescription(`¡Tu cuenta de Clash Royale fue vinculada correctamente!`)
    .setColor(EMBED_COLOR)
    .addFields(
      { name: 'Jugador', value: `${result.player!.name}`, inline: true },
      { name: 'Tag', value: result.player!.tag, inline: true },
      { name: 'Trofeos', value: `${result.player!.trophies}`, inline: true },
      { name: 'Rol en el clan', value: result.player!.role, inline: true },
    )
    .setFooter({ text: 'Usá /perfil para ver tus stats completos' })
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}

export const registrar: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('registrar')
    .setDescription('Vincula tu cuenta de Clash Royale con tu Discord')
    .addStringOption((option) =>
      option
        .setName('player_tag')
        .setDescription('Tu tag de Clash Royale (ej: #PLAYER123)')
        .setRequired(true),
    ),
  execute,
};
