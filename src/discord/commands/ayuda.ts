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
          '`/registrar <tag>` — Vincular cuenta CR con Discord',
          '`/perfil [tag]` — Ver perfil de jugador',
          '`/ranking [tipo] [periodo]` — Rankings (trofeos/donaciones/guerra/puntos)',
          '`/puntos ver <tag>` — Ver puntos acumulados',
          '`/guerra estado` — Estado actual de la guerra',
          '`/ausencia <dias>` — Activar modo vacaciones',
          '`/ayuda` — Mostrar esta ayuda',
        ].join('\n'),
      },
      {
        name: '🏆 Rankings',
        value: [
          '`/ranking tipo:trofeos periodo:semanal` — Trofeos ganados en la semana',
          '`/ranking tipo:trofeos periodo:mensual` — Trofeos ganados en el mes',
          '`/ranking tipo:donaciones` — Donaciones del mes',
          '`/ranking tipo:guerra` — Fama en guerra del mes',
          '`/ranking tipo:puntos` — Puntos internos del bot',
        ].join('\n'),
      },
      {
        name: '⚙️ Líderes y Co-líderes',
        value: [
          '`/clan info` — Información del clan',
          '`/guerra semanal` — Reporte semanal',
          '`/guerra mensual` — Reporte mensual',
          '`/inactivos` — Miembros inactivos',
          '`/config` — Configurar canales y roles',
          '`/auto-setup` — Configuración inicial del servidor',
          '`/exportar` — Exportar datos del clan',
          '`/sync` — Sincronización manual',
        ].join('\n'),
      },
      {
        name: '🔗 Enlaces / Información',
        value: [
          '`/guia` — Guía completa en canal dedicado',
        ].join('\n'),
      },
      {
        name: '🤖 Telegram',
        value: [
          '`/ranking <tipo> <periodo>` — Rankings en Telegram',
          '`/clan` — Info del clan',
          '`/perfil <tag>` — Perfil de jugador',
          '`/registrar <tag>` — Vincular cuenta CR',
          '`/guerra` — Estado de guerra',
          '`/start` — Mensaje de bienvenida',
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
