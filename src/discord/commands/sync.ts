import { SlashCommandBuilder, ChatInputCommandInteraction, PermissionFlagsBits, Client } from 'discord.js';
import { BotCommand } from '../../types';
import { getGuildClanTag } from '../../utils/guild';
import { syncClanData, syncCurrentWar } from '../../services/clan-war.service';
import { errorEmbed, successEmbed } from '../../utils/embeds';

let discordClient: Client;

export function setClient(client: Client): void {
  discordClient = client;
}

async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  const clanTag = await getGuildClanTag(interaction.guildId!);

  try {
    const result = await syncClanData(clanTag, discordClient);
    await syncCurrentWar(clanTag);

    await interaction.editReply({
      embeds: [successEmbed('✅ Sincronización completada',
        `Miembros activos: ${result.memberCount}\n` +
        `🟢 Ingresaron: ${result.changes.joined}\n` +
        `🔴 Se fueron: ${result.changes.left}\n` +
        `🔵 Reingresaron: ${result.changes.rejoined}`
      )],
    });
  } catch (error) {
    await interaction.editReply({
      embeds: [errorEmbed('Error', `Error al sincronizar: ${(error as Error).message}`)],
    });
  }
}

export const sync: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('sync')
    .setDescription('Sincronizar datos del clan manualmente (líderes)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  execute,
  adminOnly: true,
};
