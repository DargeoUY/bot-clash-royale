import { Guild } from 'discord.js';
import prisma from '../database/prisma';
import { getPlayerInfo } from '../api/player';
import { CRApiError } from '../api/client';
import logger from '../config/logger';

export interface RegistrationResult {
  success: boolean;
  player?: {
    tag: string;
    nombre: string;
    trofeos: number;
    rol: string;
  };
  error?: string;
}

export async function registerPlayer(
  playerTag: string,
  discordId: string,
  clanTag: string,
  guild?: Guild,
): Promise<RegistrationResult> {
  try {
    const playerInfo = await getPlayerInfo(playerTag);

    if (!playerInfo.clan || playerInfo.clan.tag !== clanTag) {
      return {
        success: false,
        error: `#${playerInfo.name} no pertenece al clan. Pertenece a ${playerInfo.clan?.name || 'ningún clan'}.`,
      };
    }

    const existingPlayer = await prisma.jugador.findUnique({
      where: { tag: playerTag },
    });

    if (existingPlayer?.idDiscord && existingPlayer?.idDiscord !== discordId) {
      return {
        success: false,
        error: `#${playerTag} ya está vinculado a otro usuario de Discord.`,
      };
    }

    const player = await prisma.jugador.upsert({
      where: { tag: playerTag },
      update: {
        nombre: playerInfo.name,
        idDiscord: discordId,
        registrado: true,
        nivel: playerInfo.expLevel,
        trofeos: playerInfo.trophies,
        clanTag: playerInfo.clan.tag,
      },
      create: {
        tag: playerTag,
        nombre: playerInfo.name,
        idDiscord: discordId,
        registrado: true,
        nivel: playerInfo.expLevel,
        trofeos: playerInfo.trophies,
        clanTag: playerInfo.clan.tag,
      },
    });

    logger.info(`Player registered: ${player.nombre} (${player.tag}) -> Discord ${discordId}`);

    if (guild) {
      try {
        const reclutaKey = `role_recluta_${guild.id}`;
        const cfg = await prisma.configuracionBot.findUnique({ where: { clave: reclutaKey } });
        if (cfg) {
          const member = await guild.members.fetch(discordId).catch(() => null);
          if (member) {
            const role = guild.roles.cache.get(cfg.valor);
            if (role && !member.roles.cache.has(role.id)) {
              await member.roles.add(role);
              logger.info(`Rol Recluta asignado a ${player.nombre}`);
            }
          }
        }
      } catch (err) {
        logger.warn(`No se pudo asignar rol Recluta a ${player.nombre}: ${(err as Error).message}`);
      }
    }

    return {
      success: true,
      player: {
        tag: player.tag,
        nombre: player.nombre,
        trofeos: player.trofeos || 0,
        rol: player.rol || 'miembro',
      },
    };
  } catch (error) {
    if (error instanceof CRApiError) {
      if (error.status === 404) {
        return {
          success: false,
          error: `No se encontró el jugador con tag ${playerTag}. Verificá que el tag sea correcto.`,
        };
      }
      return {
        success: false,
        error: `Error de API: ${error.message}`,
      };
    }
    logger.error('Unexpected error in registerPlayer:', error);
    const errMsg = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: `Error inesperado: ${errMsg}`,
    };
  }
}
