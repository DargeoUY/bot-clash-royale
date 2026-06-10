import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { BotCommand } from '../types';
import { getClanInfo, getClanMembers, getCurrentRiverRace } from '../api/clan';
import { getPlayerInfo } from '../api/player';
import { CRApiError } from '../api/client';
import prisma from '../database/prisma';
import { EMBED_COLOR } from '../utils/embeds';

interface TestResult {
  name: string;
  ok: boolean;
  detail: string;
  ms: number;
}

async function runTest(name: string, fn: () => Promise<string>): Promise<TestResult> {
  const start = Date.now();
  try {
    const detail = await fn();
    return { name, ok: true, detail, ms: Date.now() - start };
  } catch (err) {
    const msg = err instanceof CRApiError ? `[${err.status}] ${err.message}` : (err as Error).message;
    return { name, ok: false, detail: msg, ms: Date.now() - start };
  }
}

export async function executeDiagnostico(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply();

  const results: TestResult[] = [];

  // ── CR API tests ──
  results.push(await runTest('API Clan Info', async () => {
    const c = await getClanInfo('#28P8RQUY');
    return `${c.name} (${c.members}/50)`;
  }));

  results.push(await runTest('API Miembros', async () => {
    const m = await getClanMembers('#28P8RQUY');
    return `${m.length} miembros`;
  }));

  results.push(await runTest('API River Race', async () => {
    const r = await getCurrentRiverRace('#28P8RQUY');
    return `Estado: ${r.state}, ${r.clan?.participants?.length || 0} participantes`;
  }));

  results.push(await runTest('API Player Info', async () => {
    const p = await getPlayerInfo('#880V0RP9G');
    return `${p.name} — ${p.trophies}🏆 ${p.wins}V/${p.losses}D`;
  }));

  // ── Database tests ──
  results.push(await runTest('DB Escritura', async () => {
    const testKey = 'test_healthcheck';
    await prisma.botConfig.upsert({
      where: { key: testKey },
      update: { value: String(Date.now()) },
      create: { key: testKey, value: String(Date.now()) },
    });
    return 'OK';
  }));

  results.push(await runTest('DB Lectura', async () => {
    const c = await prisma.clan.count();
    const p = await prisma.player.count();
    return `${c} clanes, ${p} jugadores`;
  }));

  // ── Build report ──
  const passed = results.filter((r) => r.ok).length;
  const failed = results.length - passed;
  const totalMs = results.reduce((s, r) => s + r.ms, 0);

  const embed = new EmbedBuilder()
    .setTitle(failed === 0 ? '✅ Todos los tests pasaron' : `⚠️ ${failed} test(s) fallaron`)
    .setColor(failed === 0 ? EMBED_COLOR : 0xE74C3C)
    .setDescription(`**${passed}/${results.length}** OK — **${totalMs}ms** total`)
    .setFooter({ text: 'Diagnóstico de conexiones y APIs' })
    .setTimestamp();

  const lines: string[] = [];
  for (const r of results) {
    const icon = r.ok ? '✅' : '❌';
    lines.push(`${icon} **${r.name}**: ${r.detail} _(${r.ms}ms)_`);
  }
  embed.addFields({ name: 'Resultados', value: lines.join('\n') });

  await interaction.editReply({ embeds: [embed] });
}

export const diagnostico: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('diagnostico')
    .setDescription('Testear que todos los sistemas funcionen correctamente (líderes)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  execute: executeDiagnostico,
  adminOnly: true,
  cooldownSeconds: 120,
};
