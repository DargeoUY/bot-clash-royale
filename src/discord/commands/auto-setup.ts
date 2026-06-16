import { SlashCommandBuilder, ChatInputCommandInteraction, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { BotCommand } from '../../types';
import { autoCreateSetup } from '../../services/auto-setup.service';
import { validarConexion, marcarUsado } from '../../services/telegram-link.service';
import { getClanInfo } from '../../api/clan';
import { formatPlayerTag } from '../../utils/validators';
import { errorEmbed, EMBED_COLOR } from '../../utils/embeds';
import logger from '../../config/logger';

const MODAL_CUSTOM_ID = 'auto_setup_modal';

async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const modal = new ModalBuilder()
    .setCustomId(MODAL_CUSTOM_ID)
    .setTitle('Configuración inicial del clan');

  const clanTagInput = new TextInputBuilder()
    .setCustomId('clan_tag')
    .setLabel('Tag del clan (ej: #28P8RQUY)')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('#28P8RQUY')
    .setRequired(true);

  const codigoInput = new TextInputBuilder()
    .setCustomId('codigo_telegram')
    .setLabel('Código de Telegram (opcional)')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('Ej: XK4M9P — dejalo vacío si no tenés')
    .setRequired(false);

  const row1 = new ActionRowBuilder<TextInputBuilder>().addComponents(clanTagInput);
  const row2 = new ActionRowBuilder<TextInputBuilder>().addComponents(codigoInput);

  modal.addComponents(row1, row2);
  await interaction.showModal(modal);
}

async function handleModal(interaction: import('discord.js').ModalSubmitInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  const guild = interaction.guild;
  if (!guild) {
    await interaction.editReply({ embeds: [errorEmbed('Error', 'Este comando solo funciona en un servidor.')] });
    return;
  }

  const rawTag = interaction.fields.getTextInputValue('clan_tag');
  const codigo = interaction.fields.getTextInputValue('codigo_telegram') || undefined;

  let clanTag: string;
  try {
    const info = await getClanInfo(rawTag);
    clanTag = info.tag;
  } catch {
    await interaction.editReply({ embeds: [errorEmbed('Error', 'Tag de clan inválido. Verificá que exista.')] });
    return;
  }

  let chatIdVinculado: number | null = null;
  if (codigo) {
    const conexion = await validarConexion(codigo.toUpperCase());
    if (!conexion) {
      await interaction.editReply({ embeds: [errorEmbed('Código inválido', 'El código de Telegram no es válido o expiró. Generá uno nuevo invitando el bot de Telegram a tu grupo.')] });
      return;
    }
    chatIdVinculado = conexion.chatId;
  }

  try {
    const result = await autoCreateSetup(guild, clanTag, chatIdVinculado);

    if (chatIdVinculado) {
      await marcarUsado(codigo!.toUpperCase(), guild.id);
    }

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
            `<#${result.channels.members}> — Aeropuerto (altas/bajas)`,
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
      .setFooter({ text: chatIdVinculado ? '✅ Telegram vinculado correctamente' : '💡 Para vincular Telegram, invitá el bot y usá el código' })
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
    .setDescription('Configuración inicial del bot (líderes) — abre formulario')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  execute,
  adminOnly: true,
  modalHandler: handleModal,
};
