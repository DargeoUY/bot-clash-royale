import { PermissionFlagsBits, ChatInputCommandInteraction, EmbedBuilder, ColorResolvable } from 'discord.js';

export const EMBED_COLOR: ColorResolvable = '#FFD700';
export const EMBED_ERROR_COLOR: ColorResolvable = '#FF0000';
export const EMBED_SUCCESS_COLOR: ColorResolvable = '#00FF00';

export function isAdmin(interaction: ChatInputCommandInteraction): boolean {
  if (!interaction.memberPermissions) return false;
  return interaction.memberPermissions.has(PermissionFlagsBits.ManageGuild);
}

export function createEmbed(title: string, description: string): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle(title)
    .setDescription(description)
    .setColor(EMBED_COLOR)
    .setTimestamp();
}

export function errorEmbed(title: string, description: string): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle(title)
    .setDescription(description)
    .setColor(EMBED_ERROR_COLOR)
    .setTimestamp();
}

export function successEmbed(title: string, description: string): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle(title)
    .setDescription(description)
    .setColor(EMBED_SUCCESS_COLOR)
    .setTimestamp();
}

export function translateRole(role: string | null | undefined): string {
  const map: Record<string, string> = {
    leader: 'líder',
    coLeader: 'co-líder',
    elder: 'veterano',
    member: 'miembro',
  };
  return map[role || ''] || 'miembro';
}
