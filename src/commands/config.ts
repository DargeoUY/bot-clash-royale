import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { BotCommand } from '../types';
import { errorEmbed, createEmbed } from '../utils/embeds';
import prisma from '../database/prisma';

async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const subcommand = interaction.options.getSubcommand();

  if (subcommand === 'canal-guia') {
    const channel = interaction.options.getChannel('canal', true);
    await prisma.botConfig.upsert({
      where: { key: `channel_guide_${interaction.guildId}` },
      update: { value: channel.id },
      create: { key: `channel_guide_${interaction.guildId}`, value: channel.id },
    });
    await interaction.reply({
      embeds: [createEmbed('Configuración', `Canal de guía configurado: ${channel}`)],
      ephemeral: true,
    });
    return;
  }

  if (subcommand === 'canal-guerra') {
    const channel = interaction.options.getChannel('canal', true);
    await prisma.botConfig.upsert({
      where: { key: `channel_war_${interaction.guildId}` },
      update: { value: channel.id },
      create: { key: `channel_war_${interaction.guildId}`, value: channel.id },
    });
    await interaction.reply({
      embeds: [createEmbed('Configuración', `Canal de guerra configurado: ${channel}`)],
      ephemeral: true,
    });
    return;
  }

  if (subcommand === 'canal-alertas') {
    const channel = interaction.options.getChannel('canal', true);
    await prisma.botConfig.upsert({
      where: { key: `channel_alerts_${interaction.guildId}` },
      update: { value: channel.id },
      create: { key: `channel_alerts_${interaction.guildId}`, value: channel.id },
    });
    await interaction.reply({
      embeds: [createEmbed('Configuración', `Canal de alertas configurado: ${channel}`)],
      ephemeral: true,
    });
    return;
  }

  if (subcommand === 'canal-ranking') {
    const channel = interaction.options.getChannel('canal', true);
    await prisma.botConfig.upsert({
      where: { key: `channel_ranking_${interaction.guildId}` },
      update: { value: channel.id },
      create: { key: `channel_ranking_${interaction.guildId}`, value: channel.id },
    });
    await interaction.reply({
      embeds: [createEmbed('Configuración', `Canal de ranking configurado: ${channel}`)],
      ephemeral: true,
    });
    return;
  }

  if (subcommand === 'canal-miembros') {
    const channel = interaction.options.getChannel('canal', true);
    await prisma.botConfig.upsert({
      where: { key: `channel_members_${interaction.guildId}` },
      update: { value: channel.id },
      create: { key: `channel_members_${interaction.guildId}`, value: channel.id },
    });
    await interaction.reply({
      embeds: [createEmbed('Configuración', `Canal de cambios de miembros configurado: ${channel}`)],
      ephemeral: true,
    });
    return;
  }

  if (subcommand === 'link-whatsapp') {
    const url = interaction.options.getString('url', true);
    await prisma.botConfig.upsert({
      where: { key: `link_whatsapp_${interaction.guildId}` },
      update: { value: url },
      create: { key: `link_whatsapp_${interaction.guildId}`, value: url },
    });
    await interaction.reply({
      embeds: [createEmbed('Configuración', `Link de WhatsApp actualizado`),
      ],
      ephemeral: true,
    });
    return;
  }

  if (subcommand === 'link-reglamento') {
    const url = interaction.options.getString('url', true);
    await prisma.botConfig.upsert({
      where: { key: `link_rules_${interaction.guildId}` },
      update: { value: url },
      create: { key: `link_rules_${interaction.guildId}`, value: url },
    });
    await interaction.reply({
      embeds: [createEmbed('Configuración', `Link de reglamento actualizado`)],
      ephemeral: true,
    });
    return;
  }

  if (subcommand === 'umbral-inactividad') {
    const days = interaction.options.getInteger('dias', true);
    await prisma.botConfig.upsert({
      where: { key: `inactivity_days_${interaction.guildId}` },
      update: { value: String(days) },
      create: { key: `inactivity_days_${interaction.guildId}`, value: String(days) },
    });
    await interaction.reply({
      embeds: [createEmbed('Configuración', `Umbral de inactividad configurado a ${days} días.`)],
      ephemeral: true,
    });
    return;
  }

  await interaction.reply({
    embeds: [errorEmbed('Subcomando', 'Subcomando no reconocido.')],
    ephemeral: true,
  });
}

export const botConfig: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('config')
    .setDescription('Administrar configuración del bot (líderes)')
    .setDefaultMemberPermissions('0')
    .addSubcommand((sub) =>
      sub
        .setName('canal-guia')
        .setDescription('Configurar canal de guía')
        .addChannelOption((opt) =>
          opt.setName('canal').setDescription('Canal de Discord').setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('canal-guerra')
        .setDescription('Configurar canal de reportes de guerra')
        .addChannelOption((opt) =>
          opt.setName('canal').setDescription('Canal de Discord').setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('canal-alertas')
        .setDescription('Configurar canal de alertas de inactividad')
        .addChannelOption((opt) =>
          opt.setName('canal').setDescription('Canal de Discord').setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('canal-ranking')
        .setDescription('Configurar canal de ranking')
        .addChannelOption((opt) =>
          opt.setName('canal').setDescription('Canal de Discord').setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('canal-miembros')
        .setDescription('Configurar canal de cambios de miembros')
        .addChannelOption((opt) =>
          opt.setName('canal').setDescription('Canal de Discord').setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('link-whatsapp')
        .setDescription('Configurar link del grupo de WhatsApp')
        .addStringOption((opt) =>
          opt.setName('url').setDescription('URL del grupo').setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('link-reglamento')
        .setDescription('Configurar link del reglamento')
        .addStringOption((opt) =>
          opt.setName('url').setDescription('URL del reglamento').setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('umbral-inactividad')
        .setDescription('Días para considerar a un miembro inactivo')
        .addIntegerOption((opt) =>
          opt.setName('dias').setDescription('Cantidad de días').setRequired(true).setMinValue(1),
        ),
    ),
  execute,
  adminOnly: true,
};
