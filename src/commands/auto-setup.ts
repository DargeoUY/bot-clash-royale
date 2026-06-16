import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { BotCommand } from '../types';
import { autoCreateSetup } from '../services/auto-setup.service';
import { errorEmbed, EMBED_COLOR } from '../utils/embeds';

async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  const guild = interaction.guild;
  if (!guild) {
    await interaction.editReply({
      embeds: [errorEmbed('Error', 'Este comando solo funciona en un servidor.')],
    });
    return;
  }

  const clanTag = interaction.options.getString('clan_tag', true);

  try {
    const result = await autoCreateSetup(guild, clanTag);

    const embed = new EmbedBuilder()
      .setTitle('✅ Auto-Setup completado')
      .setDescription(`El bot fue configurado para el clan \`${clanTag}\``)
      .setColor(EMBED_COLOR)
      .addFields(
        {
          name: 'Canales creados',
          value: [
            `<#${result.channels.guide}> — Guía de uso`,
            `<#${result.channels.registro}> — Registro`,
            `<#${result.channels.war}> — Reportes de guerra`,
            `<#${result.channels.alerts}> — Alertas de inactividad`,
            `<#${result.channels.ranking}> — Ranking y premios`,
            `<#${result.channels.members}> — Cambios de miembros`,
          ].join('\n'),
        },
        {
          name: 'Roles creados',
          value: [
            `<@&${result.roles.campeon}> — Campeón del Mes`,
            `<@&${result.roles.guerrero}> — Guerrero Élite`,
            `<@&${result.roles.donador}> — Donador Legendario`,
            `<@&${result.roles.activo}> — Activo`,
            `<@&${result.roles.ausente}> — Ausente`,
            `<@&${result.roles.inactivo}> — Inactivo`,
            `<@&${result.roles.recluta}> — Recluta`,
          ].join('\n'),
        },
      )
      .setFooter({ text: 'La guía de uso fue publicada y pineada en el canal de guía' })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    await interaction.editReply({
      embeds: [errorEmbed('Error', `No se pudo completar el auto-setup: ${(error as Error).message}`)],
    });
  }
}

export const autoSetup: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('auto-setup')
    .setDescription('Configuración inicial del bot (líderes) — crea canales, roles y guía')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption((option) =>
      option
        .setName('clan_tag')
        .setDescription('Tag del clan (ej: #28P8RQUY)')
        .setRequired(true),
    ),
  execute,
  adminOnly: true,
};
