import makeWASocket, { useMultiFileAuthState, DisconnectReason, WASocket, jidNormalizedUser } from '@whiskeysockets/baileys';
import QRCode from 'qrcode';
import path from 'path';
import { mkdir, rm } from 'fs/promises';
import prisma from '../database/prisma';
import logger from '../config/logger';
import { executeCommand } from '../platform/commands';

type Connection = { socket: WASocket; state: string; qr?: string; reconnect?: NodeJS.Timeout; stopped: boolean; attempts: number };
class WhatsAppManager {
  private connections = new Map<string, Connection>();
  private pending = new Set<string>();
  private retries = new Map<string, number>();
  private recent = new Map<string, number>();
  async connect(clanTag: string): Promise<void> {
    if (this.pending.has(clanTag)) return;
    const existing = this.connections.get(clanTag);
    if (existing && existing.state !== 'disconnected') return;
    if (existing) { existing.stopped = true; clearTimeout(existing.reconnect); this.connections.delete(clanTag); }
    this.pending.add(clanTag);
    try {
      const clan = await prisma.clan.findUniqueOrThrow({ where: { tag: clanTag } });
      if (!clan.whatsappEnabled) throw new Error('Habilitá WhatsApp para este clan primero.');
      const dir = path.join(process.cwd(), 'sessions', String(clan.id));
      await mkdir(dir, { recursive: true, mode: 0o700 });
      const { state, saveCreds } = await useMultiFileAuthState(dir);
      const socket = makeWASocket({ auth: state, printQRInTerminal: false, markOnlineOnConnect: false });
      const entry: Connection = { socket, state: 'connecting', stopped: false, attempts: 0 };
      this.connections.set(clanTag, entry);
      socket.ev.on('creds.update', () => { saveCreds().catch(() => logger.error('No se pudo guardar sesión WhatsApp')); });
      socket.ev.on('connection.update', update => {
        if (update.qr) { entry.qr = update.qr; entry.state = 'qr'; }
        if (update.connection === 'open') { this.retries.delete(clanTag); entry.state = 'connected'; entry.qr = undefined; entry.attempts = 0; }
        if (update.connection === 'close') {
          entry.qr = undefined; entry.state = 'disconnected';
          const status = (update.lastDisconnect?.error as { output?: { statusCode?: number } })?.output?.statusCode;
          if (!entry.stopped && status !== DisconnectReason.loggedOut && (this.retries.get(clanTag) || 0) < 5) {
            entry.attempts = (this.retries.get(clanTag) || 0) + 1;
            this.retries.set(clanTag, entry.attempts);
            entry.reconnect = setTimeout(() => {
              if (entry.stopped) return;
              this.connections.delete(clanTag);
              this.connect(clanTag).catch(() => logger.warn('Reconexión WhatsApp fallida'));
            }, Math.min(60000, 5000 * 2 ** entry.attempts));
          }
        }
      });
      socket.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify' || entry.stopped) return;
        for (const message of messages) {
          if (!message.key.remoteJid?.endsWith('@g.us')) continue;
          const text = message.message?.conversation || message.message?.extendedTextMessage?.text || '';
          if (!text.startsWith('!') && !text.startsWith('/')) continue;
          try {
            const current = await prisma.clan.findUniqueOrThrow({ where: { tag: clanTag } });
            if (!current.whatsappEnabled || current.whatsappGroup !== message.key.remoteJid) continue;
            const sender = jidNormalizedUser(message.key.participant || (message.key.fromMe ? socket.user?.id || '' : ''));
            if (!sender) continue;
            const now = Date.now();
            for (const [key, until] of this.recent) if (until <= now) this.recent.delete(key);
            if (this.recent.has(`${clanTag}:${sender}`) || this.recent.size >= 10000) continue;
            this.recent.set(`${clanTag}:${sender}`, now + 3000);
            const metadata = await socket.groupMetadata(current.whatsappGroup);
            const member = metadata.participants.find(p => jidNormalizedUser(p.id) === sender);
            const player = await prisma.jugador.findFirst({ where: { clanTag, estado: 'active', idWhatsapp: sender } });
            const publicCommand = /^[/!](ayuda|clan|ranking|guerra)(\s|$)/.test(text);
            const reply = !member?.admin && !player && !publicCommand ? 'Pedile al administrador que vincule tu número a tu jugador desde la web.' :
              await executeCommand({ id: `whatsapp:${sender}`, clanTag, admin: !!member?.admin, playerTag: player?.tag }, text);
            await socket.sendMessage(current.whatsappGroup, { text: reply.slice(0, 12000) });
          } catch (error) {
            const text = error instanceof Error ? error.message : 'No se pudo ejecutar el comando.';
            await socket.sendMessage(message.key.remoteJid, { text }).catch(() => {});
          }
        }
      });
    } finally { this.pending.delete(clanTag); }
  }
  async groups(clanTag: string) {
    const entry = this.connections.get(clanTag);
    if (entry?.state !== 'connected') throw new Error('Conectá el número primero.');
    const groups = await entry.socket.groupFetchAllParticipating();
    return Object.values(groups).map(g => ({ id: g.id, name: g.subject }));
  }
  async status(clanTag: string) {
    const entry = this.connections.get(clanTag);
    return { state: entry?.state || 'disconnected', qr: entry?.qr ? await QRCode.toDataURL(entry.qr) : null };
  }
  async send(clanTag: string, text: string): Promise<void> {
    const clan = await prisma.clan.findUniqueOrThrow({ where: { tag: clanTag } });
    const entry = this.connections.get(clanTag);
    if (!clan.whatsappEnabled || !clan.whatsappGroup || entry?.state !== 'connected') return;
    await entry.socket.sendMessage(clan.whatsappGroup, { text: text.slice(0, 12000) });
  }
  async disconnect(clanTag: string, logout = false): Promise<void> {
    this.retries.delete(clanTag);
    const entry = this.connections.get(clanTag);
    if (entry) {
      entry.stopped = true; clearTimeout(entry.reconnect);
      if (logout) await entry.socket.logout().catch(() => {});
      entry.socket.end(undefined); this.connections.delete(clanTag);
    }
    if (logout) {
      const clan = await prisma.clan.findUniqueOrThrow({ where: { tag: clanTag } });
      await rm(path.join(process.cwd(), 'sessions', String(clan.id)), { recursive: true, force: true });
    }
  }
  async restore(): Promise<void> {
    const clans = await prisma.clan.findMany({ where: { whatsappEnabled: true } });
    for (const clan of clans) await this.connect(clan.tag).catch(() => logger.warn(`No se pudo conectar WhatsApp para ${clan.tag}`));
  }
  async stop(): Promise<void> {
    await Promise.all([...this.connections.keys()].map(tag => this.disconnect(tag)));
  }
}
export const whatsapp = new WhatsAppManager();
