import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { BotCommand } from '../../types';
import { getClanInfo } from '../../api/clan';
import { CRApiError } from '../../api/client';
import prisma from '../../database/prisma';
import { errorEmbed, EMBED_COLOR } from '../../utils/embeds';

async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  const clanTag = interaction.options.getString('clan_tag', true);
  const apiKey = interaction.options.getString('api_key') || undefined;
  const guild = interaction.guild;
  if (!guild) {
    await interaction.editReply({
      embeds: [errorEmbed('Error', 'Este comando solo funciona en un servidor.')],
    });
    return;
  }

  // Validate clan exists
  try {
    const clanInfo = await getClanInfo(clanTag, apiKey);

    await prisma.configuracionBot.upsert({
      where: { clave: `clan_tag_${guild.id}` },
      update: { valor: clanTag },
      create: { clave: `clan_tag_${guild.id}`, valor: clanTag },
    });

    if (apiKey) {
      await prisma.configuracionBot.upsert({
        where: { clave: `cr_api_key_${guild.id}` },
        update: { valor: apiKey },
        create: { clave: `cr_api_key_${guild.id}`, valor: apiKey },
      });
    }

    // Also upsert the clan in DB
    await prisma.clan.upsert({
      where: { tag: clanTag },
      update: {
        name: clanInfo.name,
        description: clanInfo.description,
        totalMiembros: clanInfo.members,
        idServidorDiscord: guild.id,
      },
      create: {
        tag: clanTag,
        name: clanInfo.name,
        description: clanInfo.description,
        totalMiembros: clanInfo.members,
        idServidorDiscord: guild.id,
      },
    });

    const embed = new EmbedBuilder()
      .setTitle('✅ Configuración exitosa')
      .setDescription(`El servidor quedó vinculado al clan **${clanInfo.name}**`)
      .setColor(EMBED_COLOR)
      .addFields(
        { name: 'Tag', value: clanTag, inline: true },
        { name: 'Miembros', value: `${clanInfo.members}/50`, inline: true },
        { name: 'API Key propia', value: apiKey ? 'Sí' : 'Usa la del bot', inline: true },
      )
      .setFooter({ text: 'El bot empezará a sincronizar datos en la próxima ronda. Usá /auto-setup para canales/roles.' })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    if (error instanceof CRApiError) {
      if (error.status === 404) {
        await interaction.editReply({
          embeds: [errorEmbed('Clan no encontrado', `No se encontró el clan ${clanTag}. Verificá el tag.`)],
        });
      } else {
        await interaction.editReply({
          embeds: [errorEmbed('Error de API', `[${error.status}] ${error.message}`)],
        });
      }
    } else {
      await interaction.editReply({
        embeds: [errorEmbed('Error', 'No se pudo validar el clan.')],
      });
    }
  }
}

export const setup: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Vincular este servidor con un clan de Clash Royale (líderes)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption((opt) =>
      opt.setName('clan_tag').setDescription('Tag del clan (ej: #28P8RQUY)').setRequired(true),
    )
    .addStringOption((opt) =>
      opt.setName('api_key').setDescription('API Key propia (opcional, usa la del bot si no se especifica)').setRequired(false),
    ),
  execute,
  adminOnly: true,
};
