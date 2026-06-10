import { crGet } from './client';
import {
  ClanInfo,
  ClanMember,
  CurrentRiverRace,
  RiverRaceLogEntry,
} from './types';

function encodeTag(tag: string): string {
  return encodeURIComponent(tag.startsWith('#') ? tag : `#${tag}`);
}

export async function getClanInfo(clanTag: string, apiKey?: string): Promise<ClanInfo> {
  return crGet<ClanInfo>(`/clans/${encodeTag(clanTag)}`, apiKey);
}

export async function getClanMembers(clanTag: string, apiKey?: string): Promise<ClanMember[]> {
  const result = await crGet<{ items: ClanMember[] }>(
    `/clans/${encodeTag(clanTag)}/members`,
    apiKey,
  );
  return result.items;
}

export async function getCurrentRiverRace(clanTag: string, apiKey?: string): Promise<CurrentRiverRace> {
  return crGet<CurrentRiverRace>(`/clans/${encodeTag(clanTag)}/currentriverrace`, apiKey);
}

export async function getRiverRaceLog(clanTag: string, apiKey?: string): Promise<RiverRaceLogEntry[]> {
  const result = await crGet<{ items: RiverRaceLogEntry[] }>(
    `/clans/${encodeTag(clanTag)}/riverracelog`,
    apiKey,
    { limit: '10' },
  );
  return result.items;
}
