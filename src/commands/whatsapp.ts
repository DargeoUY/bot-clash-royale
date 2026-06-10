import { SlashCommandBuilder, ChatInputCommandInteraction, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } from 'discord.js';
import { BotCommand } from '../types';

async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const modal = new ModalBuilder()
    .setCustomId('modal_whatsapp')
    .setTitle('📱 Registro de WhatsApp');

  const nameInput = new TextInputBuilder()
    .setCustomId('whatsapp_name')
    .setLabel('Nombre en el juego')
    .setPlaceholder('Ej: Darkgeo')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(50);

  const phoneInput = new TextInputBuilder()
    .setCustomId('whatsapp_phone')
    .setLabel('Número de celular')
    .setPlaceholder('Ej: +598 99 123 456')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(30);

  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(nameInput),
    new ActionRowBuilder<TextInputBuilder>().addComponents(phoneInput),
  );

  await interaction.showModal(modal);
}

export const whatsapp: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('whatsapp')
    .setDescription('Registrar tu nombre en el juego y número de WhatsApp'),
  execute,
};
