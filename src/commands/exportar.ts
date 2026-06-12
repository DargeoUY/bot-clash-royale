import { SlashCommandBuilder, ChatInputCommandInteraction, AttachmentBuilder, PermissionFlagsBits } from 'discord.js';
import { BotCommand } from '../types';
import { getGuildClanTag } from '../utils/guild';
import prisma from '../database/prisma';

function escapeCsvField(value: unknown): string {
  const str = String(value ?? '');
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  const formato = interaction.options.getString('formato') || 'csv';

  const clanTag = await getGuildClanTag(interaction.guildId!);

  const players = await prisma.player.findMany({
    where: { clanTag },
    include: { points: { orderBy: { totalPoints: 'desc' } } },
  });

  if (formato === 'csv') {
    const rows = players.map((p) => ({
      tag: p.tag,
      name: p.name,
      role: p.role,
      trophies: p.trophies,
      discordId: p.discordId || '',
      isRegistered: p.isRegistered,
      totalPoints: p.points[0]?.totalPoints || 0,
    }));

    const headers = 'tag,name,role,trophies,discordId,isRegistered,totalPoints\n';
    const csvManual = headers + rows.map((r) => Object.values(r).map(escapeCsvField).join(',')).join('\n');
    const buffer = Buffer.from(csvManual, 'utf-8');
    const attachment = new AttachmentBuilder(buffer, {
      name: `clashbot-export-${Date.now()}.csv`,
    });
    await interaction.editReply({ content: 'Exportación CSV:', files: [attachment] });
  } else {
    const data = players.map((p) => ({
      tag: p.tag,
      name: p.name,
      role: p.role,
      trophies: p.trophies,
      discordId: p.discordId,
      isRegistered: p.isRegistered,
      totalPoints: p.points[0]?.totalPoints || 0,
    }));

    const jsonStr = JSON.stringify(data, null, 2);
    const buffer = Buffer.from(jsonStr, 'utf-8');
    const attachment = new AttachmentBuilder(buffer, {
      name: `clashbot-export-${Date.now()}.json`,
    });

    await interaction.editReply({ content: 'Exportación JSON:', files: [attachment] });
  }
}

export const exportar: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('exportar')
    .setDescription('Exportar datos del clan (líderes)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption((opt) =>
      opt
        .setName('formato')
        .setDescription('Formato')
        .setRequired(false)
        .addChoices({ name: 'CSV', value: 'csv' }, { name: 'JSON', value: 'json' }),
    ),
  execute,
  adminOnly: true,
};
