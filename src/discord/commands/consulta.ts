import { SlashCommandBuilder } from 'discord.js';
import { BotCommand } from '../../types';
import prisma from '../../database/prisma';
import { executeCommand } from '../../platform/commands';
import { getGuildClanTag } from '../../utils/guild';
import { isAdmin } from '../../utils/embeds';
export const consulta: BotCommand = {
  data: new SlashCommandBuilder().setName('consulta').setDescription('Comandos compartidos con web, Telegram y WhatsApp')
    .addStringOption(o => o.setName('comando').setDescription('Ejemplo: /ranking donaciones o /ayuda').setRequired(true).setMaxLength(600)),
  async execute(interaction) {
    if (!interaction.deferred) await interaction.deferReply({ ephemeral: true });
    const clanTag = await getGuildClanTag(interaction.guildId!);
    const player = await prisma.jugador.findFirst({ where: { clanTag, estado: 'active', idDiscord: interaction.user.id } });
    const text = await executeCommand({ id: `discord:${interaction.user.id}`, clanTag, admin: isAdmin(interaction), playerTag: player?.tag }, interaction.options.getString('comando', true));
    await interaction.editReply({ content: text.slice(0, 1900), allowedMentions: { parse: [] } });
  },
};
