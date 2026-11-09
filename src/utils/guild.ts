import prisma from '../database/prisma';

export async function getGuildClanTag(guildId: string): Promise<string> {
  const cfg = await prisma.configuracionBot.findUnique({
    where: { clave: `clan_tag_${guildId}` },
  });
  if (!cfg) throw new Error('Servidor sin configurar. Usá /auto-setup.');
  return cfg.valor;
}

export async function getGuildApiKey(guildId: string): Promise<string | undefined> {
  const cfg = await prisma.configuracionBot.findUnique({
    where: { clave: `cr_api_key_${guildId}` },
  });
  return cfg?.valor || undefined;
}

export async function getAllClanTags(): Promise<string[]> {
  const clans = await prisma.clan.findMany({ select: { tag: true } });
  return clans.map((c) => c.tag);
}

export async function getAllClanConfigs(): Promise<
  { clanTag: string; guildId: string; apiKey?: string }[]
> {
  const enabled = await prisma.clan.findMany({ where: { discordEnabled: true, idServidorDiscord: { not: null } } });
  const tags = await prisma.configuracionBot.findMany({
    where: { clave: { startsWith: 'clan_tag_' } },
  });

  const results: { clanTag: string; guildId: string; apiKey?: string }[] = [];
  for (const t of tags) {
    const guildId = t.clave.replace('clan_tag_', '');
    if (!enabled.some(c => c.tag === t.valor && c.idServidorDiscord === guildId)) continue;
    const apiKey = await getGuildApiKey(guildId);
    results.push({ clanTag: t.valor, guildId, apiKey });
  }

  return results;
}
