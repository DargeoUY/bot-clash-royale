import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { BotCommand } from '../../types';
import prisma from '../../database/prisma';
import { errorEmbed } from '../../utils/embeds';

async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const guideChannelKey = `channel_guide_${interaction.guildId}`;
  const configRecord = await prisma.configuracionBot.findUnique({
    where: { key: guideChannelKey },
  });

  if (configRecord) {
    await interaction.reply({
      embeds: [{
        color: 0xffd700,
        title: '📋 Guía de uso',
        description: `La guía completa está en <#${configRecord.value}>. ¡Andá a leerla!`,
      }],
      ephemeral: true,
    });
  } else {
    await interaction.reply({
      embeds: [errorEmbed(
        'Guía no configurada',
        'El líder del clan todavía no configuró el bot. Pedile que use `/auto-setup`.',
      )],
      ephemeral: true,
    });
  }
}

export const guia: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('guia')
    .setDescription('Enlace al canal con la guía de uso completa'),
  execute,
};
