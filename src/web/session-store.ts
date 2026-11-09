import { Store, SessionData } from 'express-session';
import prisma from '../database/prisma';
export class DatabaseSessionStore extends Store {
  get(id: string, callback: (error: unknown, session?: SessionData | null) => void): void {
    prisma.webSession.findUnique({ where: { id } }).then((row) => {
      callback(null, row && row.expiresAt > new Date() ? JSON.parse(row.data) : null);
    }).catch(callback);
  }
  set(id: string, data: SessionData, callback: (error?: unknown) => void = () => {}): void {
    const expiresAt = new Date(data.cookie.expires || Date.now() + 86400000);
    prisma.webSession.upsert({ where: { id }, create: { id, data: JSON.stringify(data), expiresAt },
      update: { data: JSON.stringify(data), expiresAt } }).then(() => callback()).catch(callback);
  }
  destroy(id: string, callback: (error?: unknown) => void = () => {}): void {
    prisma.webSession.deleteMany({ where: { id } }).then(() => callback()).catch(callback);
  }
}
