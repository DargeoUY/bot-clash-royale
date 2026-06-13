import { crGet } from './client';
import { PlayerInfo, BattleLogEntry } from './types';

function encodeTag(tag: string): string {
  const clean = tag.startsWith('#') ? tag.slice(1) : tag;
  return encodeURIComponent(clean);
}

export async function getPlayerInfo(playerTag: string, apiKey?: string): Promise<PlayerInfo> {
  return crGet<PlayerInfo>(`/players/${encodeTag(playerTag)}`, apiKey);
}

export async function getPlayerBattleLog(playerTag: string, apiKey?: string): Promise<BattleLogEntry[]> {
  return crGet<BattleLogEntry[]>(`/players/${encodeTag(playerTag)}/battlelog`, apiKey);
}
