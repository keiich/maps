import { createHash } from 'node:crypto';

/** レート制限・重複通報の判定に使う利用者識別子。生の IP は保存しない。 */
export function getIpHash(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for') ?? '';
  const ip =
    req.headers.get('x-real-ip') ??
    forwarded.split(',')[0]?.trim() ??
    '';
  const salt = process.env.IP_HASH_SALT || 'chian-map-dev-salt';
  return createHash('sha256').update(`${salt}:${ip || 'unknown'}`).digest('hex').slice(0, 32);
}

export function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function jsonError(status: number, message: string, extra?: Record<string, unknown>) {
  return Response.json({ error: message, ...extra }, { status });
}
