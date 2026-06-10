// === Common Types ===

export interface IconUrls {
  small?: string;
  medium?: string;
  large?: string;
}

export interface Arena {
  id: number;
  name: string;
  iconUrls?: IconUrls;
}

export interface Badge {
  name: string;
  level: number;
  maxLevel: number;
  iconUrls: IconUrls;
}

export interface Location {
  id: number;
  name: string;
  isCountry: boolean;
  countryCode?: string;
}

// === Clan Types ===

export interface ClanMember {
  tag: string;
  name: string;
  role: 'member' | 'elder' | 'coLeader' | 'leader';
  expLevel: number;
  trophies: number;
  arena: Arena;
  clanRank: number;
  previousClanRank: number;
  donations: number;
  donationsReceived: number;
  lastSeen: string;
}

export interface ClanInfo {
  tag: string;
  name: string;
  type: 'open' | 'inviteOnly' | 'closed';
  description: string;
  badgeId: number;
  clanScore: number;
  clanWarTrophies: number;
  location: Location;
  requiredTrophies: number;
  donationsPerWeek: number;
  clanChestStatus: string;
  clanChestLevel: number;
  clanChestMaxLevel: number;
  members: number;
  memberList?: ClanMember[];
  badgeUrls?: IconUrls;
}

export interface ClanSearchResult {
  items: ClanInfo[];
  paging: {
    cursors: {
      after?: string;
      before?: string;
    };
  };
}

// === River Race (Clan Wars 2.0) Types ===

export interface RiverRaceClan {
  tag: string;
  name: string;
  badgeId: number;
  badgeUrls: IconUrls;
  fame: number;
  repairPoints: number;
  finishTime: string;
  participants: RiverRaceParticipant[];
  periodPoints: number;
  clanScore: number;
}

export interface RiverRaceParticipant {
  tag: string;
  name: string;
  fame: number;
  repairPoints: number;
  boatAttacks: number;
  decksUsed: number;
  decksUsedToday: number;
}

export interface RiverRacePeriod {
  id: number;
  startTime: string;
  endTime: string;
}

export interface CurrentRiverRace {
  state: string;
  seasonId: number;
  sectionIndex: number;
  periodType: string;
  periodIndex: number;
  clan: RiverRaceClan;
  clans: RiverRaceClan[];
  periodLogs?: RiverRacePeriodLog[];
}

export interface RiverRacePeriodLog {
  periodIndex: number;
  periodType: string;
  items: RiverRaceLogEntry[];
}

export interface RiverRaceLogEntry {
  seasonId: number;
  sectionIndex: number;
  createdDate: string;
  standings: RiverRaceStanding[];
}

export interface RiverRaceStanding {
  rank: number;
  trophyChange: number;
  clan: {
    tag: string;
    name: string;
    badgeId: number;
    badgeUrls: IconUrls;
    fame: number;
    repairPoints: number;
    finishTime: string;
    participants: RiverRaceParticipant[];
  };
}

// === Player Types ===

export interface PlayerCard {
  name: string;
  id: number;
  level: number;
  maxLevel: number;
  starLevel?: number;
  count: number;
  iconUrls: IconUrls;
}

export interface PlayerBadge {
  name: string;
  level: number;
  maxLevel: number;
  progress: number;
  target: number;
  iconUrls: IconUrls;
}

export interface PlayerInfo {
  tag: string;
  name: string;
  expLevel: number;
  trophies: number;
  bestTrophies: number;
  wins: number;
  losses: number;
  battleCount: number;
  threeCrownWins: number;
  challengeCardsWon: number;
  challengeMaxWins: number;
  tournamentCardsWon: number;
  tournamentBattleCount: number;
  donations: number;
  donationsReceived: number;
  totalDonations: number;
  warDayWins: number;
  clanCardsCollected: number;
  clan?: {
    tag: string;
    name: string;
    badgeId: number;
    badgeUrls: IconUrls;
  };
  arena: Arena;
  cards?: PlayerCard[];
  currentDeck?: PlayerCard[];
  currentFavouriteCard?: PlayerCard;
  badges?: PlayerBadge[];
  role?: string;
}

export interface BattleLogOpponent {
  tag: string;
  name: string;
  startingTrophies: number;
  trophyChange: number;
  crowns: number;
  kingTowerHitPoints: number;
  princessTowersHitPoints?: number[];
  clan?: {
    tag: string;
    name: string;
    badgeId: number;
    badgeUrls: IconUrls;
  };
  cards: BattleLogCard[];
}

export interface BattleLogCard {
  name: string;
  id: number;
  level: number;
  maxLevel: number;
  starLevel?: number;
  iconUrls: IconUrls;
}

export interface BattleLogEntry {
  type: string;
  battleTime: string;
  arena: Arena;
  gameMode: {
    id: number;
    name: string;
  };
  deckSelection: string;
  team: BattleLogOpponent[];
  opponent: BattleLogOpponent[];
  teamCrowns?: number;
  opponentCrowns?: number;
}
