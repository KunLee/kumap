import type { VercelRequest, VercelResponse } from '@vercel/node';
import { LandgateError } from './types';

export function queryString(req: VercelRequest, key: string): string {
  const value = req.query[key];
  if (Array.isArray(value)) {
    return String(value[0] ?? '').trim();
  }
  return String(value ?? '').trim();
}

export function sendJson(res: VercelResponse, status: number, body: unknown): void {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.status(status).json(body);
}

export function sendError(res: VercelResponse, error: unknown): void {
  if (error instanceof LandgateError) {
    const status =
      error.code === 'NOT_FOUND'
        ? 404
        : error.code === 'INVALID' ||
            error.code === 'INVALID_LOT' ||
            error.code === 'INVALID_PLAN' ||
            error.code === 'UNSUPPORTED_FIELDS'
          ? 400
          : 502;
    sendJson(res, status, { error: error.message, code: error.code });
    return;
  }
  const message = error instanceof Error ? error.message : 'Unexpected server error.';
  sendJson(res, 500, { error: message, code: 'SERVER' });
}

export async function readJsonBody<T>(req: VercelRequest): Promise<T> {
  if (req.body && typeof req.body === 'object') {
    return req.body as T;
  }
  if (typeof req.body === 'string' && req.body.trim()) {
    return JSON.parse(req.body) as T;
  }
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  if (chunks.length === 0) {
    return {} as T;
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as T;
}
