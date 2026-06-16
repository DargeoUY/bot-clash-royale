import prisma from '../database/prisma';
import { config } from '../config';

export async function getGuildClanTag(guildId: string): Promise<string> {
  const cfg = await prisma.botConfig.findUnique({
    where: { key: `clan_tag_${guildId}` },
  });
  return cfg?.value || config.CLAN_TAG;
}

export async function getGuildApiKey(guildId: string): Promise<string | undefined> {
  const cfg = await prisma.botConfig.findUnique({
    where: { key: `cr_api_key_${guildId}` },
  });
  return cfg?.value || undefined;
}

export async function getAllClanTags(): Promise<string[]> {
  const configs = await prisma.botConfig.findMany({
    where: { key: { startsWith: 'clan_tag_' } },
  });
  return [...new Set(configs.map((c) => c.value))];
}

export async function getAllClanConfigs(): Promise<
  { clanTag: string; guildId: string; apiKey?: string }[]
> {
  const tags = await prisma.botConfig.findMany({
    where: { key: { startsWith: 'clan_tag_' } },
  });

  const results: { clanTag: string; guildId: string; apiKey?: string }[] = [];
  for (const t of tags) {
    const guildId = t.key.replace('clan_tag_', '');
    const apiKey = await getGuildApiKey(guildId);
    results.push({ clanTag: t.value, guildId, apiKey });
  }

  return results;
}
