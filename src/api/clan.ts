import { crGet } from './client';
import {
  ClanInfo,
  ClanMember,
  ClanSearchResult,
  CurrentRiverRace,
  RiverRaceLogEntry,
} from './types';

function encodeTag(tag: string): string {
  return encodeURIComponent(tag.startsWith('#') ? tag : `#${tag}`);
}

export async function getClanInfo(clanTag: string): Promise<ClanInfo> {
  return crGet<ClanInfo>(`/clans/${encodeTag(clanTag)}`);
}

export async function getClanMembers(clanTag: string): Promise<ClanMember[]> {
  const result = await crGet<{ items: ClanMember[] }>(
    `/clans/${encodeTag(clanTag)}/members`,
  );
  return result.items;
}

export async function getCurrentRiverRace(clanTag: string): Promise<CurrentRiverRace> {
  return crGet<CurrentRiverRace>(`/clans/${encodeTag(clanTag)}/currentriverrace`);
}

export async function getRiverRaceLog(clanTag: string): Promise<RiverRaceLogEntry[]> {
  const result = await crGet<{ items: RiverRaceLogEntry[] }>(
    `/clans/${encodeTag(clanTag)}/riverracelog`,
    { limit: '10' },
  );
  return result.items;
}

export async function searchClans(params: {
  name?: string;
  minMembers?: number;
  minScore?: number;
  limit?: number;
}): Promise<ClanSearchResult> {
  const queryParams: Record<string, string> = {};
  if (params.name) queryParams.name = params.name;
  if (params.minMembers) queryParams.minMembers = String(params.minMembers);
  if (params.minScore) queryParams.minScore = String(params.minScore);
  if (params.limit) queryParams.limit = String(params.limit);

  return crGet<ClanSearchResult>('/clans', queryParams);
}
