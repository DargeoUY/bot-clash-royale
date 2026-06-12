import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { BotCommand } from '../types';
import prisma from '../database/prisma';
import { isTelegramConfigured } from '../services/telegram.service';
import { config } from '../config';

async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  const guildId = interaction.guildId!;

  const chatCfg = await prisma.botConfig.findUnique({
    where: { key: `telegram_chat_${guildId}` },
  });

  const configured = isTelegramConfigured();
  const tokenPreview = config.TELEGRAM_BOT_TOKEN
    ? `${config.TELEGRAM_BOT_TOKEN.substring(0, 5)}...(${config.TELEGRAM_BOT_TOKEN.length} chars)`
    : 'NO CONFIGURADO (TELEGRAM_BOT_TOKEN en .env)';
  const chatId = chatCfg?.value || 'NO CONFIGURADO';

  let result = `**Configuración de Telegram**\n\n`;
  result += `**Estado en memoria:** ${configured ? '✅ Configurado' : '❌ No configurado'}\n\n`;
  result += `**Token (.env):** \`${tokenPreview}\`\n`;
  result += `Longitud: ${config.TELEGRAM_BOT_TOKEN?.length || 0}\n\n`;
  result += `**Chat ID (DB):** \`${chatId}\`\n`;
  result += `Longitud: ${chatId.length}\n`;
  result += `Tipo: ${typeof chatId}\n\n`;

  if (chatId !== 'NO CONFIGURADO') {
    result += `**Análisis del Chat ID:**\n`;
    result += `Primer carácter: '${chatId[0]}' (código: ${chatId.charCodeAt(0)})\n`;
    result += `¿Empieza con guión?: ${chatId.startsWith('-')}\n`;
    result += `¿Es número válido?: ${!isNaN(Number(chatId))}\n`;
  }

  await interaction.editReply(result);
}

export const debugTelegram: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('debug-telegram')
    .setDescription('Debug de configuración de Telegram (solo admin)'),
  execute,
  adminOnly: true,
};
