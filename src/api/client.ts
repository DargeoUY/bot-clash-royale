import axios, { AxiosError } from 'axios';
import { config } from '../config';
import { crQueue } from '../services/request-queue.service';
import logger from '../config/logger';

export class CRApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = 'CRApiError';
  }
}

function createClient(apiKey: string) {
  return axios.create({
    baseURL: config.CR_API_BASE_URL,
    timeout: 10_000,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: 'application/json',
    },
  });
}

export async function crGet<T>(
  path: string,
  apiKey?: string,
  params?: Record<string, string>,
): Promise<T> {
  const key = apiKey || config.CR_API_KEY;
  const client = createClient(key);

  const response = await crQueue.enqueue(async () => {
    try {
      const res = await client.get<T>(path, { params });
      return res;
    } catch (error) {
      if (error instanceof AxiosError && error.response) {
        const { status, data } = error.response;
        const message = (data as { message?: string })?.message || 'Unknown API error';
        const code = (data as { reason?: string })?.reason || 'UNKNOWN';
        logger.error(`CR API Error [${status}]: ${message}`, {
          url: error.config?.url,
          method: error.config?.method,
        });
        throw new CRApiError(status, code, message);
      }
      logger.error('CR API Network Error', { message: (error as Error).message });
      throw error;
    }
  }, `${path}`);

  return response.data;
}
