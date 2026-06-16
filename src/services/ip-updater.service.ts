import axios from 'axios';
import prisma from '../database/prisma';
import logger from '../config/logger';

interface DevSession {
  token: string;
  expiresAt: number;
}

let cachedSession: DevSession | null = null;

export async function getPublicIP(): Promise<string> {
  const services = [
    'https://api.ipify.org',
    'https://ifconfig.me/ip',
    'https://icanhazip.com',
  ];

  for (const url of services) {
    try {
      const { data } = await axios.get<string>(url, { timeout: 5000 });
      const ip = data.trim();
      if (ip && /^\d+\.\d+\.\d+\.\d+$/.test(ip)) {
        return ip;
      }
    } catch {
      // try next service
    }
  }

  throw new Error('No se pudo obtener la IP pública');
}

async function loginToDevPortal(
  email: string,
  password: string,
): Promise<string> {
  if (cachedSession && cachedSession.expiresAt > Date.now()) {
    return cachedSession.token;
  }

  const { data } = await axios.post<{ token: string }>(
    'https://developer.clashroyale.com/api/login',
    { email, password },
    { timeout: 10000, headers: { 'Content-Type': 'application/json' } },
  );

  cachedSession = {
    token: data.token,
    expiresAt: Date.now() + 50 * 60 * 1000, // 50 min cache
  };

  return data.token;
}

async function listAPIKeys(token: string): Promise<{ id: string; name: string; cidrRanges: string[] }[]> {
  const { data } = await axios.get<{
    keys: { id: string; name: string; cidrRanges: string[] }[];
  }>('https://developer.clashroyale.com/api/apikey/list', {
    headers: { Authorization: `Bearer ${token}` },
    timeout: 10000,
  });
  return data.keys || [];
}

async function updateAPIKey(
  token: string,
  keyId: string,
  ip: string,
): Promise<void> {
  await axios.put(
    `https://developer.clashroyale.com/api/apikey/${keyId}`,
    { cidrRanges: [ip], scopes: ['royale'] },
    {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      timeout: 10000,
    },
  );
}

export async function checkAndUpdateIP(
  email?: string,
  password?: string,
  keyId?: string,
): Promise<{ changed: boolean; oldIP?: string; newIP: string; updated: boolean }> {
  const newIP = await getPublicIP();

  const storedCfg = await prisma.botConfig.findUnique({
    where: { key: 'last_public_ip' },
  });

  const oldIP = storedCfg?.value || '';

  if (newIP === oldIP) {
    logger.debug(`IP sin cambios: ${newIP}`);
    return { changed: false, newIP, updated: false };
  }

  logger.info(`IP cambió: ${oldIP || 'ninguna'} -> ${newIP}`);

  await prisma.botConfig.upsert({
    where: { key: 'last_public_ip' },
    update: { value: newIP },
    create: { key: 'last_public_ip', value: newIP },
  });

  let updated = false;

  if (email && password && keyId) {
    try {
      logger.info('Intentando actualizar CR API key...');
      const token = await loginToDevPortal(email, password);

      const keys = await listAPIKeys(token);
      const targetKey = keys.find((k) => k.id === keyId);

      if (!targetKey) {
        logger.warn(`No se encontró la API key con ID ${keyId}. Keys disponibles: ${keys.map(k => k.id).join(', ')}`);
      } else {
        await updateAPIKey(token, keyId, newIP);
        logger.info(`CR API key actualizada: IP ${newIP} agregada a key ${keyId}`);
        updated = true;
      }
    } catch (err) {
      logger.error('Error al actualizar CR API key:', (err as Error).message);
    }
  }

  return { changed: true, oldIP: oldIP || undefined, newIP, updated };
}
