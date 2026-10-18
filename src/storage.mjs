import { chmod, mkdir, readFile, writeFile, readdir, rename, rm, rmdir } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { APP_DIR, AUTH_FILE, SESSIONS_DIR } from './config.mjs';

async function privateDir(dir) { await mkdir(dir, { recursive: true, mode: 0o700 }); await chmod(dir, 0o700); }
export async function ensureStorage() { await privateDir(APP_DIR); await privateDir(SESSIONS_DIR); }
export async function readAuth() {
  try { return JSON.parse(await readFile(AUTH_FILE, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return null; throw new Error('Saved login data could not be read'); }
}
export async function saveAuth(auth) {
  await ensureStorage();
  await atomicJson(AUTH_FILE, auth);
}
export async function removeAuth() {
  const { unlink } = await import('node:fs/promises');
  try { await unlink(AUTH_FILE); } catch (error) { if (error.code !== 'ENOENT') throw error; }
}
function sessionPath(id) { if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error('Invalid local session id'); return path.join(SESSIONS_DIR, `${id}.json`); }
export async function createSession(title) {
  await ensureStorage();
  const session = { id: randomUUID(), title, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), turns: [], task_ids: [] };
  await saveSession(session);
  return session;
}
export async function saveSession(session) {
  await ensureStorage();
  const file = sessionPath(session.id);
  await atomicJson(file, session);
}
async function atomicJson(file, value) {
  const temp = `${file}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
    await chmod(temp, 0o600);
    await rename(temp, file);
    await chmod(file, 0o600);
  } finally { try { await rm(temp); } catch (error) { if (error.code !== 'ENOENT') throw error; } }
}
export async function loadSession(id) {
  try { return JSON.parse(await readFile(sessionPath(id), 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') throw new Error(`No local session found for ${id}`); throw new Error('Local session could not be read'); }
}
export async function listSessions() {
  await ensureStorage();
  const names = await readdir(SESSIONS_DIR);
  const rows = [];
  for (const name of names.filter((item) => item.endsWith('.json'))) {
    try {
      const session = JSON.parse(await readFile(path.join(SESSIONS_DIR, name), 'utf8'));
      rows.push({ id: session.id, title: session.title, updated_at: session.updated_at, turns: session.turns?.length ?? 0 });
    } catch { /* Ignore malformed local session files in the listing. */ }
  }
  return rows.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
}

export async function withSessionLock(id, work) {
  const lock = `${sessionPath(id)}.lock`;
  try { await mkdir(lock, { mode: 0o700 }); }
  catch (error) {
    if (error.code === 'EEXIST') throw new Error(`Session ${id} is already active in another dsh process`);
    throw error;
  }
  try { return await work(); }
  finally { try { await rmdir(lock); } catch (error) { if (error.code !== 'ENOENT') throw error; } }
}
