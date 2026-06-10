import axios, { AxiosError, AxiosInstance, InternalAxiosRequestConfig } from 'axios';
import { config } from '../config';
import logger from '../config/logger';

interface RateLimitState {
  remaining: number;
  resetAt: number;
}

const rateLimit: RateLimitState = {
  remaining: 300,
  resetAt: Date.now() + 60_000,
};

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

const client: AxiosInstance = axios.create({
  baseURL: config.CR_API_BASE_URL,
  timeout: 10_000,
  headers: {
    Authorization: `Bearer ${config.CR_API_KEY}`,
    Accept: 'application/json',
  },
});

// Response interceptor for rate limit handling
client.interceptors.response.use(
  (response) => {
    const remaining = response.headers['x-ratelimit-remaining'];
    const reset = response.headers['x-ratelimit-reset'];

    if (remaining !== undefined) {
      rateLimit.remaining = parseInt(remaining, 10);
    }
    if (reset !== undefined) {
      rateLimit.resetAt = parseInt(reset, 10) * 1000;
    }

    return response;
  },
  (error: AxiosError) => {
    if (error.response) {
      const { status, data } = error.response;
      const message = (data as { message?: string })?.message || 'Unknown API error';
      const code = (data as { reason?: string })?.reason || 'UNKNOWN';

      logger.error(`CR API Error [${status}]: ${message}`, {
        url: error.config?.url,
        method: error.config?.method,
      });

      throw new CRApiError(status, code, message);
    }

    logger.error('CR API Network Error', { message: error.message });
    throw error;
  },
);

// Request interceptor for rate limit awareness
client.interceptors.request.use(async (reqConfig: InternalAxiosRequestConfig) => {
  if (rateLimit.remaining <= 5 && Date.now() < rateLimit.resetAt) {
    const waitMs = rateLimit.resetAt - Date.now() + 500;
    logger.debug(`Rate limit casi alcanzado, esperando ${waitMs}ms`);
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }
  return reqConfig;
});

export async function crGet<T>(path: string, params?: Record<string, string>): Promise<T> {
  const response = await client.get<T>(path, { params });
  return response.data;
}

export default client;
