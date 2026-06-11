import { BotCommand } from '../types';
import { registrar } from './registrar';
import { clan } from './clan';
import { perfil } from './perfil';
import { ayuda } from './ayuda';
import { guia } from './guia';
import { setup } from './setup';
import { autoSetup } from './auto-setup';
import { botConfig } from './config';
import { guerra } from './guerra';
import { inactivos } from './inactivos';
import { puntos } from './puntos';
import { ranking } from './puntos';
import { ausencia } from './ausencia';
import { exportar } from './exportar';
import { whatsapp } from './whatsapp';
import { diagnostico } from './diagnostico';
import { torneo } from './torneo';
import { debugTelegram } from './debug-telegram';
import { vincular } from './vincular';

export const commands = new Map<string, BotCommand>([
  ['registrar', registrar],
  ['clan', clan],
  ['perfil', perfil],
  ['ayuda', ayuda],
  ['guia', guia],
  ['setup', setup],
  ['auto-setup', autoSetup],
  ['config', botConfig],
  ['guerra', guerra],
  ['inactivos', inactivos],
  ['puntos', puntos],
  ['ranking', ranking],
  ['ausencia', ausencia],
  ['exportar', exportar],
  ['whatsapp', whatsapp],
  ['diagnostico', diagnostico],
  ['torneo', torneo],
  ['debug-telegram', debugTelegram],
  ['vincular', vincular],
]);
