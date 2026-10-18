import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { APP_DIR, apiBase } from '../src/config.mjs';
import { readAuth, ensureStorage } from '../src/storage.mjs';
import { createBot } from '../vscode/lib/telegram-bot.js';

export async function runTelegramBot() {
  const auth = await readAuth();
  if (!auth?.access_token || auth.api_base !== apiBase()) throw new Error('Run dsh login for the configured Tvijo service first.');
  await ensureStorage();
  const stateFile = path.join(APP_DIR, 'telegram-state.json');
  const bot = createBot({ botToken: process.env.DSHREM_BOT_TOKEN, ownerId: process.env.DSHREM_BOT_OWNER_ID, apiBase: apiBase(), accessToken: auth.access_token, allowedServices: (process.env.DSHREM_BOT_SERVICES || '').split(',').map(value => value.trim()).filter(Boolean),
    load: async () => { try { return JSON.parse(await fs.readFile(stateFile, 'utf8')); } catch (error) { if (error.code === 'ENOENT') return {}; throw new Error('Bot state could not be read.'); } },
    save: async state => { const temp = stateFile + '.' + randomUUID() + '.tmp'; await fs.writeFile(temp, JSON.stringify(state), { mode: 0o600, flag: 'wx' }); await fs.rename(temp, stateFile); } });
  process.once('SIGINT', () => bot.stop()); process.once('SIGTERM', () => bot.stop());
  const result = await bot.start();
  console.log(`Tvijo bot @${result.username}: owner-only private commands. No startup messages sent.`);
  await bot.poll();
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) runTelegramBot().catch(error => { console.error(error.message); process.exitCode = 1; });
