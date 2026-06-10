import { Guild, ChannelType, PermissionFlagsBits, EmbedBuilder, TextChannel } from 'discord.js';
import prisma from '../database/prisma';
import { EMBED_COLOR } from '../utils/embeds';
import logger from '../config/logger';

interface SetupResult {
  categoryId: string;
  channels: {
    guide: string;
    registro: string;
    war: string;
    alerts: string;
    ranking: string;
    members: string;
  };
  roles: {
    campeon: string;
    guerrero: string;
    donador: string;
    activo: string;
    ausente: string;
    inactivo: string;
    recluta: string;
  };
  created: { channels: number; roles: number };
}

const CATEGORY_NAME = '🏰 CLASH ROYALE';
const CHANNEL_NAMES = {
  guide: '📋・guia-de-uso',
  registro: '👋・registro',
  war: '⚔️・guerra-reportes',
  alerts: '🚨・alertas-inactividad',
  ranking: '🏆・ranking-premios',
  members: '👥・cambios-miembros',
};
const ROLE_DEFS: { key: string; name: string; color: string; hoist: boolean }[] = [
  { key: 'campeon', name: '🏆 Campeón del Mes', color: '#FFD700', hoist: true },
  { key: 'guerrero', name: '⚔️ Guerrero Élite', color: '#9B59B6', hoist: true },
  { key: 'donador', name: '💎 Donador Legendario', color: '#FF69B4', hoist: true },
  { key: 'activo', name: '✅ Activo', color: '#2ECC71', hoist: false },
  { key: 'ausente', name: '🏖️ Ausente', color: '#F39C12', hoist: false },
  { key: 'inactivo', name: '⛔ Inactivo', color: '#E74C3C', hoist: false },
  { key: 'recluta', name: '🆕 Recluta', color: '#3498DB', hoist: false },
];

async function findOrCreateChannel(
  guild: Guild,
  name: string,
  categoryId: string,
  readOnly = false,
): Promise<{ id: string; channel?: TextChannel }> {
  const existing = guild.channels.cache.find(
    (c) =>
      c.type === ChannelType.GuildText &&
      c.name === name &&
      c.parentId === categoryId,
  );
  if (existing) {
    logger.debug(`Channel exists: ${name}`);
    return { id: existing.id, channel: existing as TextChannel };
  }

  const created = await guild.channels.create({
    name,
    type: ChannelType.GuildText,
    parent: categoryId,
    permissionOverwrites: readOnly
      ? [
          {
            id: guild.roles.everyone.id,
            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory],
            deny: [PermissionFlagsBits.SendMessages],
          },
        ]
      : undefined,
  });
  logger.info(`Channel created: ${name}`);
  return { id: created.id, channel: created as TextChannel };
}

async function findOrCreateRole(guild: Guild, name: string, color: string, hoist: boolean): Promise<{ id: string; created: boolean }> {
  const existing = guild.roles.cache.find((r) => r.name === name);
  if (existing) {
    if (existing.hoist !== hoist) {
      await existing.setHoist(hoist);
    }
    logger.debug(`Role exists: ${name}`);
    return { id: existing.id, created: false };
  }

  const created = await guild.roles.create({ name, color: parseInt(color.replace('#', ''), 16), hoist });
  logger.info(`Role created: ${name} (hoisted: ${hoist})`);
  return { id: created.id, created: true };
}

export async function autoCreateSetup(guild: Guild, clanTag: string): Promise<SetupResult> {
  logger.info(`Auto-setup: configurando ${guild.name}`);

  let createdChannels = 0;
  let createdRoles = 0;

  // === Category ===
  const catExisting = guild.channels.cache.find(
    (c) => c.type === ChannelType.GuildCategory && c.name === CATEGORY_NAME,
  );
  let categoryId: string;
  if (catExisting) {
    categoryId = catExisting.id;
  } else {
    const c = await guild.channels.create({
      name: CATEGORY_NAME,
      type: ChannelType.GuildCategory,
      permissionOverwrites: [
        {
          id: guild.roles.everyone.id,
          allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory],
        },
      ],
    });
    categoryId = c.id;
    createdChannels++;
  }

  // === Channels ===
  const guide = await findOrCreateChannel(guild, CHANNEL_NAMES.guide, categoryId, true);
  const registro = await findOrCreateChannel(guild, CHANNEL_NAMES.registro, categoryId);
  const war = await findOrCreateChannel(guild, CHANNEL_NAMES.war, categoryId);
  const alerts = await findOrCreateChannel(guild, CHANNEL_NAMES.alerts, categoryId);
  const ranking = await findOrCreateChannel(guild, CHANNEL_NAMES.ranking, categoryId);
  const members = await findOrCreateChannel(guild, CHANNEL_NAMES.members, categoryId);

  // === Roles ===
  const roles: Record<string, string> = {};
  for (const r of ROLE_DEFS) {
    const result = await findOrCreateRole(guild, r.name, r.color, r.hoist);
    roles[r.key] = result.id;
    if (result.created) createdRoles++;
  }

  // === Save configs in DB ===
  const guildPrefix = `${guild.id}`;
  const configs = [
    { key: `channel_guide_${guildPrefix}`, value: guide.id },
    { key: `channel_war_${guildPrefix}`, value: war.id },
    { key: `channel_alerts_${guildPrefix}`, value: alerts.id },
    { key: `channel_ranking_${guildPrefix}`, value: ranking.id },
    { key: `channel_members_${guildPrefix}`, value: members.id },
    { key: `role_campeon_${guildPrefix}`, value: roles.campeon },
    { key: `role_guerrero_${guildPrefix}`, value: roles.guerrero },
    { key: `role_donador_${guildPrefix}`, value: roles.donador },
    { key: `role_activo_${guildPrefix}`, value: roles.activo },
    { key: `role_ausente_${guildPrefix}`, value: roles.ausente },
    { key: `role_inactivo_${guildPrefix}`, value: roles.inactivo },
    { key: `role_recluta_${guildPrefix}`, value: roles.recluta },
    { key: `clan_tag_${guildPrefix}`, value: clanTag },
  ];

  for (const cfg of configs) {
    try {
      await prisma.botConfig.upsert({
        where: { key: cfg.key },
        update: { value: cfg.value },
        create: { key: cfg.key, value: cfg.value },
      });
    } catch (err) {
      logger.error(`Error saving config ${cfg.key}:`, err);
      throw err;
    }
  }

  // === Publish/update guide ===
  if (guide.channel) {
    const guideEmbed = buildGuideEmbed();

    const pinned = await guide.channel.messages.fetchPinned().catch(() => null);
    if (pinned && pinned.size > 0) {
      for (const [, msg] of pinned) {
        if (msg.author.id === guild.client.user.id) {
          await msg.unpin().catch(() => {});
        }
      }
    }

    const guideMessage = await guide.channel.send({ embeds: guideEmbed });
    await guideMessage.pin();
    logger.info('Guide published and pinned');
  }

  logger.info(
    `Auto-setup: ${createdChannels} channels, ${createdRoles} roles nuevos (resto ya existían)`,
  );

  return {
    categoryId,
    channels: {
      guide: guide.id,
      registro: registro.id,
      war: war.id,
      alerts: alerts.id,
      ranking: ranking.id,
      members: members.id,
    },
    roles: {
      campeon: roles.campeon,
      guerrero: roles.guerrero,
      donador: roles.donador,
      activo: roles.activo,
      ausente: roles.ausente,
      inactivo: roles.inactivo,
      recluta: roles.recluta,
    },
    created: { channels: createdChannels, roles: createdRoles },
  };
}

function buildGuideEmbed(): EmbedBuilder[] {
  const commandsEmbed = new EmbedBuilder()
    .setTitle('📋 Comandos del Bot')
    .setColor(EMBED_COLOR)
    .setDescription('Lista de comandos disponibles:')
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
          '`/ayuda` — Repetir esta guía',
        ].join('\n'),
      },
      {
        name: '⚙️ Líderes',
        value: [
          '`/clan info` — Información del clan',
          '`/guerra semanal` — Reporte semanal',
          '`/guerra mensual` — Reporte mensual',
          '`/inactivos` — Ver miembros inactivos',
          '`/config` — Configurar el bot',
        ].join('\n'),
      },
    );

  const pointsEmbed = new EmbedBuilder()
    .setTitle('⭐ Sistema de Puntos')
    .setColor(EMBED_COLOR)
    .setDescription('Acumulá puntos por tu participación:')
    .addFields({
      name: 'Puntos por acción',
      value: [
        'Batalla de guerra ganada: **+3**',
        'Batalla de guerra jugada: **+1**',
        'Deck usado en guerra: **+1**',
        'Fama en River Race: **+0.5**',
        'Defense de barco: **+2**',
        'Participación completa semanal: **+5**',
        'Top donador mensual: **+10**',
        'Inactividad (por día): **-2**',
      ].join('\n'),
    })
    .setFooter({ text: 'Los puntos se resetean al inicio de cada mes' });

  const vacationEmbed = new EmbedBuilder()
    .setTitle('🏖️ Modo Vacaciones')
    .setColor(EMBED_COLOR)
    .setDescription('Si vas a estar ausente, activá el modo vacaciones para no perder puntos:')
    .addFields(
      {
        name: 'Cómo usar',
        value: [
          '`/ausencia <dias> [motivo]` — Activar modo vacaciones (máx 20 días por mes)',
          '`/ausencia extender <dias>` — Extender tus vacaciones',
          '`/ausencia cancelar` — Volver antes de tiempo',
        ].join('\n'),
      },
      {
        name: 'Reglas',
        value: 'Máximo 20 días acumulados por temporada. No perdés puntos ni recibís avisos de inactividad durante las vacaciones.',
      },
    );

  const inactivityEmbed = new EmbedBuilder()
    .setTitle('⚠️ Sistema de Inactividad')
    .setColor(EMBED_COLOR)
    .setDescription('El bot monitorea la actividad de todos los miembros:')
    .addFields(
      {
        name: 'Escala',
        value: [
          '**2 días** — Recibís un DM de aviso',
          '**4-6 días** — Se notifica en el canal de alertas',
          '**Según tamaño del clan** — Se sugiere expulsión',
        ].join('\n'),
      },
      {
        name: '¿Cómo evitarlo?',
        value: 'Jugá tus batallas de guerra o activá el modo vacaciones si vas a estar ausente.',
      },
    );

  return [commandsEmbed, pointsEmbed, vacationEmbed, inactivityEmbed];
}

