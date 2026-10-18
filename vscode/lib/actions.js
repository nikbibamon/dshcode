'use strict';

const path = require('node:path');
const { fileURLToPath } = require('node:url');

const ACTIONS = [
  ['tvijo.terminal', 'Open project terminal', '/terminal'],
  ['tvijo.learn', 'Learn DSHREM', '/learn'],
  ['tvijo.feedback', 'Send feedback', '/feedback'],
  ['tvijo.chooseWorkflow', 'Choose model and workflow', '/workflow'],
  ['tvijo.configureBot', 'Configure Telegram bot', '/botsetup'],
  ['tvijo.startBot', 'Start Telegram bot', '/botstart'],
  ['tvijo.stopBot', 'Stop Telegram bot', '/botstop'],
  ['tvijo.botGuide', 'Telegram bot setup guide', '/bot'],
  ['tvijo.buyCredit', 'Request $10 service credit', '/credit'],
  ['tvijo.openChat', 'Open chat', ''],
  ['tvijo.attachFile', 'Attach workspace file', '/attach'],
  ['tvijo.attachPath', 'Attach by path', '/attach path/to/file'],
  ['tvijo.attachSelection', 'Attach selected code', '/selection'],
  ['tvijo.clearAttachments', 'Clear attachments', '/clear'],
  ['tvijo.addFileToKnowledge', 'Add current file to knowledge base', 'explicit upload with confirmation'],
  ['tvijo.newConversation', 'New conversation', '/new'],
  ['tvijo.cancelPending', 'Cancel pending task', '/cancel'],
  ['tvijo.account', 'Account and credit', '/account'],
  ['tvijo.tasks', 'Recent tasks and spending', '/tasks'],
  ['tvijo.status', 'Check service connection', '/status'],
  ['tvijo.export', 'Export conversation', '/export'],
  ['tvijo.signIn', 'Sign in', '/signin'],
  ['tvijo.signOut', 'Sign out', '/signout'],
  ['tvijo.settings', 'Settings', '/settings'],
  ['tvijo.help', 'Help and commands', '/help']
];

const SLASH = {
  terminal: 'tvijo.terminal', learn: 'tvijo.learn', feedback: 'tvijo.feedback',
  workflow: 'tvijo.chooseWorkflow', botsetup: 'tvijo.configureBot', botstart: 'tvijo.startBot', botstop: 'tvijo.stopBot', bot: 'tvijo.botGuide', credit: 'tvijo.buyCredit',
  help: 'tvijo.help', new: 'tvijo.newConversation', attach: 'tvijo.attachFile', selection: 'tvijo.attachSelection',
  clear: 'tvijo.clearAttachments', cancel: 'tvijo.cancelPending', account: 'tvijo.account', tasks: 'tvijo.tasks',
  status: 'tvijo.status', export: 'tvijo.export', signin: 'tvijo.signIn', signout: 'tvijo.signOut', settings: 'tvijo.settings'
};

function slashAction(question) {
  if (!question.trim().startsWith('/')) return null;
  const match = question.trim().match(/^\/(\S+)(?:\s+([\s\S]*))?$/);
  const command = match && SLASH[match[1].toLowerCase()];
  return { command: command || null, argument: match?.[2]?.trim() || '' };
}

function fileReference(question) {
  if (slashAction(question)?.command) return null;
  let value = question.trim();
  if (!value || value.length > 4096 || /[\r\n]/.test(value)) return null;
  const markdown = value.match(/^\[[^\]]*\]\((?:<([^>]+)>|([^)]*))\)$/);
  if (markdown) value = markdown[1] || markdown[2];
  value = value.replace(/^(["'`])(.*)\1$/, '$2');
  if (value.startsWith('file://')) {
    try { value = fileURLToPath(value); } catch { return null; }
  }
  if (/^[a-z]+:\/\//i.test(value)) return null;
  if (!/\.[a-z0-9_-]{1,12}$/i.test(value)) return null;
  return path.isAbsolute(value) || /^\.{1,2}[\/\\]/.test(value) || /^[\w.@-]+\/.+/.test(value) ? value : null;
}

module.exports = { ACTIONS, slashAction, fileReference };
