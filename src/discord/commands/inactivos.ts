import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { BotCommand } from '../../types';
import { getGuildClanTag } from '../../utils/guild';
import { checkInactivity, statusDisplay } from '../../services/inactivity.service';
import { EMBED_COLOR } from '../../utils/embeds';
import prisma from '../../database/prisma';

async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply();
  try {
    const clanTag = await getGuildClanTag(interaction.guildId!);

    const playerCount = await prisma.jugador.count({ where: { clanTag } });

    if (playerCount === 0) {
      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setTitle('⚠️ Sin datos locales')
            .setDescription('No hay miembros sincronizados todavía.\nEjecutá **/clan sincronizar** primero para importar los datos.')
            .setColor(EMBED_COLOR)
            .setTimestamp(),
        ],
      });
      return;
    }

    const results = await checkInactivity(clanTag, interaction.guildId);

    if (results.length === 0) {
      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setTitle('✅ Sin inactivos')
            .setDescription('Todos los miembros registrados están activos.')
            .setColor(EMBED_COLOR)
            .setTimestamp(),
        ],
      });
      return;
    }

    const warning = results.filter((r) => r.status === 'warning');
    const inactive = results.filter((r) => r.status === 'inactive');
    const kick = results.filter((r) => r.status === 'kick_suggested');

    const lines: string[] = [];
    if (kick.length > 0) lines.push('⛔ **Para expulsión:**', ...kick.map((p) => `  • ${p.nombreJugador} — ${p.diasInactivo} días`), '');
    if (inactive.length > 0) lines.push('🔴 **Inactivos:**', ...inactive.map((p) => `  • ${p.nombreJugador} — ${p.diasInactivo} días`), '');
    if (warning.length > 0) lines.push('🟡 **Aviso:**', ...warning.map((p) => `  • ${p.nombreJugador} — ${p.diasInactivo} días`));

    const embed = new EmbedBuilder()
      .setTitle('⚠️ Miembros Inactivos')
      .setDescription(lines.join('\n'))
      .setColor(EMBED_COLOR)
      .setFooter({ text: `Total: ${results.length} inactivos` })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setTitle('❌ Error')
          .setDescription(`Error al consultar inactivos: ${(error as Error).message}`)
          .setColor(0xFF0000)
          .setTimestamp(),
      ],
    });
  }
}

export const inactivos: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('inactivos')
    .setDescription('Ver miembros inactivos del clan (líderes)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  execute,
  adminOnly: true,
};
