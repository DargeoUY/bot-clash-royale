import { crGet } from './client';
import { PlayerInfo, BattleLogEntry } from './types';

function encodeTag(tag: string): string {
  return encodeURIComponent(tag.startsWith('#') ? tag : `#${tag}`);
}

export async function getPlayerInfo(playerTag: string): Promise<PlayerInfo> {
  return crGet<PlayerInfo>(`/players/${encodeTag(playerTag)}`);
}

export async function getPlayerBattleLog(playerTag: string): Promise<BattleLogEntry[]> {
  return crGet<BattleLogEntry[]>(`/players/${encodeTag(playerTag)}/battlelog`);
}
