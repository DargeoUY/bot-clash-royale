import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import { BotCommand } from '../../types';
import { EMBED_COLOR } from '../../utils/embeds';

async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const embed = new EmbedBuilder()
    .setTitle('📋 Comandos disponibles')
    .setColor(EMBED_COLOR)
    .setDescription('Acá tenés todos los comandos del bot:')
    .addFields(
      {
        name: '👤 Jugadores',
        value: [
          '`/registrar <tag>` — Vincula tu cuenta de CR con Discord',
          '`/perfil [tag]` — Ver tu perfil o el de otro jugador',
          '`/puntos ver` — Ver tus puntos acumulados',
          '`/ranking` — Top jugadores del clan',
          '`/guerra estado` — Estado actual de la guerra',
          '`/ausencia <dias>` — Activar modo vacaciones',
        ].join('\n'),
      },
      {
        name: '⚙️ Líderes',
        value: [
          '`/clan info` — Información del clan',
          '`/guerra semanal` — Reporte semanal de guerra',
          '`/guerra mensual` — Reporte mensual de guerra',
          '`/inactivos` — Ver miembros inactivos',
          '`/config` — Configurar el bot',
          '`/auto-setup` — Configuración inicial',
        ].join('\n'),
      },
      {
        name: '🔗 Enlaces',
        value: [
          '`/guia` — Ver la guía completa en el canal dedicado',
        ].join('\n'),
      },
    )
    .setFooter({ text: 'Bot Clash Royale — Usá /guia para más detalles' })
    .setTimestamp();

  await interaction.reply({ embeds: [embed], ephemeral: true });
}

export const ayuda: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('ayuda')
    .setDescription('Lista de comandos disponibles'),
  execute,
};
