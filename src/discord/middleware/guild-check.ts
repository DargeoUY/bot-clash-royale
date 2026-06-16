import { ChatInputCommandInteraction } from 'discord.js';
import prisma from '../../database/prisma';
import { getGuildClanTag } from '../../utils/guild';
import { errorEmbed } from '../../utils/embeds';

export async function checkRegistered(interaction: ChatInputCommandInteraction): Promise<boolean> {
  const clanTag = await getGuildClanTag(interaction.guildId!);
  const player = await prisma.jugador.findFirst({
    where: { idDiscord: interaction.user.id, clanTag },
  });
  if (!player) {
    await interaction.editReply({
      embeds: [errorEmbed('Acceso denegado', 'Disculpa, no perteneces a este clan. Registrate con `/registrar #TAG`.')],
    });
    return false;
  }
  return true;
}
