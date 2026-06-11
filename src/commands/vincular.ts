import { SlashCommandBuilder, ChatInputCommandInteraction, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, PermissionFlagsBits } from 'discord.js';
import { BotCommand } from '../types';

async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const modal = new ModalBuilder()
    .setCustomId('modal_vincular')
    .setTitle('Vincular grupo de Telegram');

  const tagInput = new TextInputBuilder()
    .setCustomId('vincular_tag')
    .setLabel('Clan Tag')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('#28P8RQUY')
    .setMaxLength(15)
    .setRequired(true);

  const codeInput = new TextInputBuilder()
    .setCustomId('vincular_codigo')
    .setLabel('Código de Telegram')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('XK92')
    .setMaxLength(6)
    .setRequired(true);

  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(tagInput),
    new ActionRowBuilder<TextInputBuilder>().addComponents(codeInput),
  );

  await interaction.showModal(modal);
}

export const vincular: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('vincular')
    .setDescription('Vincular grupo de Telegram con el clan (líderes)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  execute,
  adminOnly: true,
};
