#!/usr/bin/env node
import { runTelegramBot } from '../integrations/telegram-bot.mjs';
runTelegramBot().catch(error => { console.error(error.message); process.exitCode = 1; });
