import os from 'node:os';
import path from 'node:path';

export const API_BASE = 'https://dsh.tvijo.com/api/dshrem/v1';
export const APP_DIR = path.join(os.homedir(), '.config', 'dshrempub');
export const AUTH_FILE = path.join(APP_DIR, 'auth.json');
export const SESSIONS_DIR = path.join(APP_DIR, 'sessions');

export function apiBase(allowLocalhost = false) {
  allowLocalhost = allowLocalhost || process.env.DSHREM_ALLOW_LOCALHOST === '1';
  const override = process.env.DSHREM_API_BASE;
  if (!override) return API_BASE;
  let parsed;
  try { parsed = new URL(override); } catch { throw new Error('DSHREM_API_BASE must be an https URL'); }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname);
  if (parsed.protocol !== 'https:' && !(allowLocalhost && local && parsed.protocol === 'http:')) {
    throw new Error('DSHREM_API_BASE must use https (http is allowed only for explicit localhost development)');
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) throw new Error('DSHREM_API_BASE cannot contain credentials, query, or fragment');
  return parsed.toString().replace(/\/$/, '');
}
