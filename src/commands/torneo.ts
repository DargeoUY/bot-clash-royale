import { SlashCommandBuilder, ChatInputCommandInteraction, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } from 'discord.js';
import { BotCommand } from '../types';

async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const modal = new ModalBuilder()
    .setCustomId('modal_torneo')
    .setTitle('🏆 Crear Torneo');

  const tagInput = new TextInputBuilder()
    .setCustomId('torneo_tag')
    .setLabel('Tag del torneo (ej: #2GYR9UYG)')
    .setPlaceholder('#2GYR9UYG')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(15);

  const passInput = new TextInputBuilder()
    .setCustomId('torneo_pass')
    .setLabel('Contraseña del torneo')
    .setPlaceholder('Ej: clash2026')
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setMaxLength(30);

  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(tagInput),
    new ActionRowBuilder<TextInputBuilder>().addComponents(passInput),
  );

  await interaction.showModal(modal);
}

export const torneo: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('torneo')
    .setDescription('Publicar un torneo en el canal de torneos'),
  execute,
  cooldownSeconds: 180,
};
