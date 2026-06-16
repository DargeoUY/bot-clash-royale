import prisma from '../database/prisma';
import { config } from '../config';

export async function getGuildClanTag(guildId: string): Promise<string> {
  const cfg = await prisma.configuracionBot.findUnique({
    where: { clave: `clan_tag_${guildId}` },
  });
  return cfg?.valor || config.CLAN_TAG;
}

export async function getGuildApiKey(guildId: string): Promise<string | undefined> {
  const cfg = await prisma.configuracionBot.findUnique({
    where: { clave: `cr_api_key_${guildId}` },
  });
  return cfg?.valor || undefined;
}

export async function getAllClanTags(): Promise<string[]> {
  const configs = await prisma.configuracionBot.findMany({
    where: { clave: { startsWith: 'clan_tag_' } },
  });
  return [...new Set(configs.map((c) => c.valor))];
}

export async function getAllClanConfigs(): Promise<
  { clanTag: string; guildId: string; apiKey?: string }[]
> {
  const tags = await prisma.configuracionBot.findMany({
    where: { clave: { startsWith: 'clan_tag_' } },
  });

  const results: { clanTag: string; guildId: string; apiKey?: string }[] = [];
  for (const t of tags) {
    const guildId = t.clave.replace('clan_tag_', '');
    const apiKey = await getGuildApiKey(guildId);
    results.push({ clanTag: t.valor, guildId, apiKey });
  }

  return results;
}
