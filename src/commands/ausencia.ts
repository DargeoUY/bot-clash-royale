import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import { BotCommand } from '../types';
import { activateVacation, extendVacation, cancelVacation } from '../services/vacation.service';
import { errorEmbed, successEmbed, EMBED_COLOR } from '../utils/embeds';

async function ejecutarActivar(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  const rawTag = interaction.options.getString('player_tag');
  const days = interaction.options.getInteger('dias', true);
  const motivo = interaction.options.getString('motivo') || null;

  if (!rawTag) {
    await interaction.editReply({
      embeds: [errorEmbed('Falta tag', 'Necesitás estar registrado con /registrar.')],
    });
    return;
  }

  const result = await activateVacation(rawTag, days, motivo, interaction.user.id);

  if (!result.success) {
    await interaction.editReply({ embeds: [errorEmbed('Vacaciones', result.message)] });
    return;
  }

  const embed = new EmbedBuilder()
    .setTitle('🏖️ Modo Vacaciones Activado')
    .setDescription(result.message)
    .setColor(EMBED_COLOR)
    .addFields(
      { name: 'Días', value: `${days}`, inline: true },
      { name: 'Usados esta temp.', value: `${result.daysUsed}/20`, inline: true },
    )
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}

async function ejecutarExtender(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  const rawTag = interaction.options.getString('player_tag');
  const days = interaction.options.getInteger('dias', true);

  if (!rawTag) {
    await interaction.editReply({ embeds: [errorEmbed('Falta tag', 'No estás registrado.')] });
    return;
  }

  const result = await extendVacation(rawTag, days);

  if (!result.success) {
    await interaction.editReply({ embeds: [errorEmbed('Extensión', result.message)] });
    return;
  }

  await interaction.editReply({
    embeds: [successEmbed('Vacaciones Extendidas', result.message)],
  });
}

async function ejecutarCancelar(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  const rawTag = interaction.options.getString('player_tag');
  if (!rawTag) {
    await interaction.editReply({ embeds: [errorEmbed('Falta tag', 'No estás registrado.')] });
    return;
  }

  const result = await cancelVacation(rawTag);

  if (!result.success) {
    await interaction.editReply({ embeds: [errorEmbed('Cancelar', result.message)] });
    return;
  }

  await interaction.editReply({
    embeds: [successEmbed('Vacaciones', 'Modo vacaciones cancelado. ¡Bienvenido de vuelta!')],
  });
}

export const ausencia: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('ausencia')
    .setDescription('Gestionar modo vacaciones')
    .addSubcommand((sub) =>
      sub
        .setName('activar')
        .setDescription('Activar modo vacaciones')
        .addStringOption((opt) => opt.setName('player_tag').setDescription('Tu tag de CR (ej: #PLAYER123)').setRequired(true))
        .addIntegerOption((opt) => opt.setName('dias').setDescription('Cantidad de días (máx 20)').setRequired(true).setMinValue(1).setMaxValue(20))
        .addStringOption((opt) => opt.setName('motivo').setDescription('Motivo').setRequired(false)),
    )
    .addSubcommand((sub) =>
      sub
        .setName('extender')
        .setDescription('Extender vacaciones')
        .addStringOption((opt) => opt.setName('player_tag').setDescription('Tu tag').setRequired(true))
        .addIntegerOption((opt) => opt.setName('dias').setDescription('Días a extender').setRequired(true).setMinValue(1)),
    )
    .addSubcommand((sub) =>
      sub
        .setName('cancelar')
        .setDescription('Cancelar modo vacaciones')
        .addStringOption((opt) => opt.setName('player_tag').setDescription('Tu tag').setRequired(true)),
    ),
  execute: async (interaction) => {
    const sub = interaction.options.getSubcommand();
    if (sub === 'activar') await ejecutarActivar(interaction);
    else if (sub === 'extender') await ejecutarExtender(interaction);
    else if (sub === 'cancelar') await ejecutarCancelar(interaction);
  },
};
