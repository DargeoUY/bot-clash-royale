import prisma from '../database/prisma';
import { tokenHash } from '../web/security';
// Existing communities may only be linked by their current web/Discord administrator.
export async function authorizeDiscordClan(clanTag: string, guildId: string, token?: string): Promise<void> {
  await prisma.$transaction(async tx => {
    const clan = await tx.clan.findUnique({ where: { tag: clanTag } });
    if (!clan || clan.idServidorDiscord === guildId) return;
    const invite = token ? await tx.webInvite.findUnique({ where: { tokenHash: tokenHash(token) } }) : null;
    if (!invite || invite.clanTag !== clanTag || invite.role !== 'discord-link' || invite.expiresAt <= new Date()) {
      throw new Error('Este clan ya existe. Generá un código de Discord en Canales de su panel web.');
    }
    const consumed = await tx.webInvite.deleteMany({ where: { tokenHash: invite.tokenHash, expiresAt: { gt: new Date() } } });
    if (consumed.count !== 1) throw new Error('Código ya utilizado.');
    if (clan.idServidorDiscord) await tx.configuracionBot.deleteMany({ where: { clave: `clan_tag_${clan.idServidorDiscord}` } });
    await tx.clan.update({ where: { tag: clanTag }, data: { idServidorDiscord: guildId, discordEnabled: true } });
  });
}
