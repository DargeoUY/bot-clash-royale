import { config } from '../../config';
import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import { BotCommand } from '../../types';
import { EMBED_COLOR } from '../../utils/embeds';

const PANEL_URL = config.BASE_URL;

const execute = async (interaction: ChatInputCommandInteraction): Promise<void> => {
  const embed = new EmbedBuilder()
    .setTitle('🌐 Panel de Administración')
    .setDescription(
      `Accedé al panel web para ver estadísticas y rankings en tiempo real:\n\n` +
      `🔗 **[Abrir Panel](${PANEL_URL})**\n\n` +
      `Requisitos:\n` +
      `• Ser líder o co-líder del clan en Discord\n` +
      `• Iniciar sesión con Discord o cuenta web`,
    )
    .setColor(EMBED_COLOR)
    .setFooter({ text: 'Los datos se actualizan automáticamente cada cinco minutos' });

  await interaction.reply({ embeds: [embed], ephemeral: true });
};

export const web: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('web')
    .setDescription('Link al panel web de administración'),
  execute,
};
