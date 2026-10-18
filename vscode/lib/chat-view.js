'use strict';

const { randomBytes } = require('node:crypto');
const { THEME_CSS, COPY } = require('./product-theme');

function chatHtml(webview) {
  const nonce = randomBytes(16).toString('base64');
  const csp = `default-src 'none'; img-src data:; style-src ${webview.cspSource} 'nonce-${nonce}'; script-src 'nonce-${nonce}';`;
  return `<!doctype html>
<html lang="en"><head><title>Tvijo DSHREM</title><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<style nonce="${nonce}">
${THEME_CSS}
</style></head><body>
<header><strong id="brand"><span id="brand-mark" aria-hidden="true">›_</span>DSHREM</strong><button id="lang" class="mini-select" type="button" title="Switch language">EN / RU</button><button id="theme" class="icon" type="button" title="Toggle light/dark theme" aria-label="Toggle light/dark theme">◐</button><button id="signin" type="button">Sign in</button><button id="new" class="icon" type="button" title="New session" aria-label="New session">＋</button><button id="commands" class="icon" type="button" title="Commands" aria-label="Commands">···</button><button id="settings" class="icon" type="button" title="Settings" aria-label="Settings">⚙</button></header>
<nav aria-label="Workspace"><button id="tab-chat" type="button" aria-selected="true">Chat</button><button id="tab-context" type="button" aria-selected="false">Context</button><button id="tab-terminal" type="button" aria-selected="false">Terminal</button></nav>
<main id="messages" aria-live="polite"></main><section id="context-panel" aria-label="Context"><div id="context-items"></div><div id="terminal-info" hidden></div><button id="clear-context" type="button">Clear context</button></section><div id="state" role="status">Connecting…</div>
<div id="account-status" role="status"><span class="dot">●</span><span id="connection-label">Limited free preview</span><span id="budget"></span></div>
<form id="form"><div id="attachments" aria-label="Attached context"></div><p id="ocrnote" hidden></p><textarea id="question" aria-label="Ask Tvijo" placeholder="Ask about your project…" maxlength="20000"></textarea><input id="file" type="file" multiple hidden><div class="composer-actions"><button id="plus" class="icon" type="button" title="Add context" aria-label="Add context" aria-haspopup="menu" aria-expanded="false">＋</button><button id="workflow" class="mini-select" type="button" title="Model &amp; workflow"><span>◆</span><span id="workflow-label">Model &amp; workflow</span></button><span class="spacer"></span><button id="cancel" class="mini-select" type="button" title="Cancel task" hidden>Cancel</button><button id="send" type="submit" title="Send message" aria-label="Send message">➤</button></div></form>
<div id="plus-menu" role="menu" aria-label="Add context"><button id="attach" type="button" role="menuitem">Add file…</button><button id="workspace" type="button" role="menuitem">Choose workspace file…</button><button id="selection" type="button" role="menuitem">Use editor selection</button><button id="path" type="button" role="menuitem">Paste workspace path…</button></div>
<script nonce="${nonce}">
  const COPY = ${JSON.stringify(COPY)};
  const vscode = acquireVsCodeApi();
  const messages = document.getElementById('messages');
  const state = document.getElementById('state');
  const send = document.getElementById('send');
  const question = document.getElementById('question');
  const newConversation = document.getElementById('new');
  const attached = document.getElementById('attachments');
  const fileInput = document.getElementById('file');
  const plusMenu = document.getElementById('plus-menu');
  let locale = 'en';
  let submitting = false;
  let running = false;
  let preparing = false;
  let uploading = false;
  let attachmentCount = 0;
  let lastMessages = null;
  const queue = [];
  const saved = vscode.getState?.();
  if (typeof saved?.draft === 'string') question.value = saved.draft;
  locale = saved?.locale === 'ru' ? 'ru' : 'en';
  let theme = ['dark','light','system'].includes(saved?.theme) ? saved.theme : 'system';
  document.body.setAttribute('data-theme', theme);
  const t = key => COPY[locale][key] || COPY.en[key] || key;
  const saveState = () => vscode.setState?.({draft:question.value,locale,theme});
  const saveDraft = () => saveState();
  function updateThemeButton() {
    const label = t(theme === 'dark' ? 'themeDark' : theme === 'light' ? 'themeLight' : 'themeSystem');
    document.getElementById('theme').textContent = theme === 'light' ? '☼' : '◐';
    document.getElementById('theme').title = t('theme') + ': ' + label;
    document.getElementById('theme').setAttribute('aria-label', t('theme') + ': ' + label);
  }
  function setLocale(next) {
    locale = next; document.documentElement.lang = locale;
    document.getElementById('lang').textContent = locale === 'en' ? 'EN / RU' : 'RU / EN';
    document.getElementById('tab-chat').textContent = t('chat');
    document.getElementById('tab-context').textContent = t('context');
    document.getElementById('tab-terminal').textContent = t('terminal');
    document.getElementById('signin').textContent = t(lastSignedIn ? 'signedIn' : 'signIn');
    document.getElementById('new').title = t('new');
    document.getElementById('settings').title = t('settings');
    document.getElementById('question').placeholder = t('ask');
    document.getElementById('question').setAttribute('aria-label', t('ask'));
    document.getElementById('send').title = t('send');
    document.getElementById('send').setAttribute('aria-label', t('send'));
    document.getElementById('plus').title = t('plus');
    document.getElementById('plus').setAttribute('aria-label', t('plus'));
    document.getElementById('attach').textContent = t('addFile');
    document.getElementById('workspace').textContent = t('workspace');
    document.getElementById('selection').textContent = t('selection');
    document.getElementById('path').textContent = t('path');
    document.getElementById('clear-context').textContent = t('clear');
    document.getElementById('workflow-label').textContent = window.tvijoWorkflow || t('model');
    updateThemeButton();
    document.getElementById('ocrnote').textContent = t('imageNote');
    document.getElementById('context-panel').setAttribute('aria-label', t('context'));
    if (!running && !preparing && !submitting) state.textContent = lastStatus || t('ready');
    const previous = lastMessages ? JSON.parse(lastMessages) : [];
    lastMessages = null; render(previous); renderBudget(lastAccount);
    renderAttachments(lastAttachments);
    saveState();
  }
  let lastSignedIn = false;
  let lastStatus = '';
  let lastAttachments = [];
  let lastAccount = null;
  function setTheme(next) { theme = next; document.body.setAttribute('data-theme', theme); updateThemeButton(); saveState(); }
  function renderBudget(account) {
    const budget = document.getElementById('budget');
    const preview = { ...(account?.budget || {}), ...(account?.preview || {}) };
    const values = [];
    if (Number.isFinite(preview?.tasks_remaining)) values.push(preview.tasks_remaining + ' ' + (locale === 'ru' ? 'задач' : 'tasks'));
    if (Number.isFinite(preview?.tokens_remaining)) values.push(preview.tokens_remaining.toLocaleString() + ' ' + (locale === 'ru' ? 'токенов' : 'tokens'));
    if (preview?.remaining_usd !== undefined && Number.isFinite(Number(preview.remaining_usd))) values.push('$' + Number(preview.remaining_usd).toFixed(3));
    budget.textContent = values.join(' · ');
    document.getElementById('connection-label').textContent = lastSignedIn ? (lastStatus || t('ready')) : t('limited');
  }
  function setTab(tab) {
    for (const name of ['chat','context','terminal']) document.getElementById('tab-' + name).setAttribute('aria-selected', String(name === tab));
    messages.hidden = tab !== 'chat';
    document.getElementById('context-panel').className = tab === 'context' || tab === 'terminal' ? 'visible' : '';
    document.getElementById('context-items').hidden = tab !== 'context';
    document.getElementById('clear-context').hidden = tab !== 'context';
    document.getElementById('terminal-info').hidden = tab !== 'terminal';
    document.getElementById('terminal-info').textContent = t('terminalInfo');
    if (tab === 'terminal') vscode.postMessage({type:'terminal'});
  }
  question.addEventListener('input', saveDraft);
  function controls() {
    const blocked = running || preparing || submitting || uploading;
    send.disabled = blocked; newConversation.disabled = blocked;
    for (const id of ['attach','workspace','selection','path','plus','workflow']) document.getElementById(id).disabled = blocked;
    document.getElementById('cancel').hidden = !running;
    document.getElementById('clear-context').disabled = blocked;
    for (const button of attached.querySelectorAll('button')) button.disabled = blocked;
  }
  function render(items) {
    const key = JSON.stringify(items); if (key === lastMessages) return; lastMessages = key;
    messages.replaceChildren();
    if (!items.length) {
      const welcome = document.createElement('section'); welcome.className = 'welcome';
      const mark = document.createElement('div'); mark.className = 'welcome-mark'; mark.textContent = '›_';
      const title = document.createElement('strong'); title.textContent = t('title');
      const body = document.createElement('p'); body.textContent = t('intro');
      welcome.append(mark, title, body); messages.append(welcome);
    }
    for (const [index, item] of items.entries()) {
      const block = document.createElement('article');
      block.className = 'message ' + (item.role === 'assistant' ? 'assistant' : 'user');
      const role = document.createElement('div'); role.className = 'role'; role.textContent = item.role === 'assistant' ? t('assistant') : t('user');
      const content = document.createElement('div'); content.textContent = item.content || '';
      block.append(role, content); messages.append(block);
      if (item.role === 'assistant') {
        const actions = document.createElement('div'); actions.className = 'answer-actions';
        for (const [type, label] of [['copy',t('copy')],['openAnswer',t('openAnswer')]]) {
          const button = document.createElement('button'); button.type = 'button'; button.textContent = label;
          button.addEventListener('click', () => vscode.postMessage({type,index})); actions.append(button);
        }
        block.append(actions);
      }
    }
    messages.scrollTop = messages.scrollHeight;
  }
  function renderAttachments(items) {
    lastAttachments = items;
    attachmentCount = items.length;
    attached.replaceChildren();
    document.getElementById('ocrnote').hidden = !items.some(item => item.kind === 'image');
    const contextItems = document.getElementById('context-items'); contextItems.replaceChildren();
    if (!items.length) { const empty = document.createElement('div'); empty.textContent = t('empty'); contextItems.append(empty); }
    for (const item of items) {
      const row = document.createElement('div'); row.className = 'attachment';
      if (typeof item.preview === 'string' && (item.preview.startsWith('data:image/png;base64,') || item.preview.startsWith('data:image/jpeg;base64,'))) {
        const preview = document.createElement('img'); preview.src = item.preview; preview.alt = item.name; row.append(preview);
      }
      const label = document.createElement('div'); label.className = 'label'; label.textContent = item.name;
      const detail = document.createElement('small'); detail.textContent = (item.kind === 'image' ? t('ocr') : t('fileContext')) + ' · ' + Math.ceil(item.size / 1024) + ' KiB'; label.append(detail);
      const inspect = document.createElement('button'); inspect.type = 'button'; inspect.textContent = t('preview'); inspect.disabled = running || submitting || preparing;
      inspect.addEventListener('click', () => vscode.postMessage({type:'previewAttachment',id:item.id})); label.append(inspect);
      const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = '×'; remove.title = 'Remove ' + item.name; remove.setAttribute('aria-label', remove.title); remove.disabled = running || submitting || preparing;
      remove.addEventListener('click', () => vscode.postMessage({type:'removeAttachment',id:item.id}));
      row.append(label, remove); attached.append(row);
      const contextRow = document.createElement('div'); contextRow.className = 'context-row';
      const contextLabel = document.createElement('span'); contextLabel.textContent = item.name;
      const removeContext = document.createElement('button'); removeContext.type = 'button'; removeContext.textContent = '×'; removeContext.title = t('remove'); removeContext.setAttribute('aria-label', t('remove') + ' ' + item.name); removeContext.addEventListener('click', () => vscode.postMessage({type:'removeAttachment',id:item.id}));
      contextRow.append(contextLabel, removeContext); contextItems.append(contextRow);
    }
  }
  function uploadNext() {
    if (uploading || !queue.length) return;
    uploading = true; controls();
    const file = queue.shift();
    state.textContent = t('preparing');
    const reader = new FileReader();
    reader.onerror = () => { uploading = false; state.textContent = t('readError'); controls(); uploadNext(); };
    reader.onload = () => vscode.postMessage({type:'attach', name:file.name || 'file', base64:String(reader.result).split(',')[1] || ''});
    reader.readAsDataURL(file);
  }
  function addFiles(list) {
    if (running || preparing || submitting || uploading) { state.textContent = t('wait'); return; }
    for (const file of Array.from(list)) {
      if (!file.size || file.size > 2 * 1024 * 1024) { state.textContent = t('tooLarge'); continue; }
      queue.push(file);
    }
    uploadNext();
  }
  window.addEventListener('message', event => {
    const data = event.data;
    if (data.type === 'state') {
      if (data.workflow) { window.tvijoWorkflow = data.workflow; document.getElementById('workflow-label').textContent = data.workflow; }
      render(data.messages || []);
      lastStatus = data.status || '';
      state.textContent = lastStatus;
      running = !!data.busy;
      preparing = !!data.attaching;
      controls(); renderAttachments(data.attachments || []);
      lastSignedIn = !!data.signedIn;
      lastAccount = data.account || null;
      document.getElementById('signin').textContent = t(lastSignedIn ? 'signedIn' : 'signIn');
      renderBudget(lastAccount);
    } else if (data.type === 'submission') {
      submitting = false;
      controls();
      if (data.ok && question.value.trim() === data.question) { question.value = ''; saveDraft(); }
      if (!data.ok) question.focus();
    } else if (data.type === 'attachmentDone') {
      uploading = false; controls(); uploadNext();
    }
  });
  document.getElementById('form').addEventListener('submit', event => {
    event.preventDefault(); const text = question.value.trim() || (attachmentCount ? t('attachmentOnly') : ''); if (!text || send.disabled) return;
    submitting = true; controls();
    vscode.postMessage({type:'ask', question:text});
  });
  question.addEventListener('keydown', event => {
    if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); document.getElementById('form').requestSubmit(); }
  });
  document.getElementById('signin').addEventListener('click', () => vscode.postMessage({type:lastSignedIn ? 'account' : 'account'}));
  document.getElementById('new').addEventListener('click', () => vscode.postMessage({type:'new'}));
  document.getElementById('cancel').addEventListener('click', () => vscode.postMessage({type:'cancel'}));
  for (const type of ['commands','workspace','selection','path','workflow']) document.getElementById(type).addEventListener('click', () => { plusMenu.className = ''; document.getElementById('plus').setAttribute('aria-expanded','false'); vscode.postMessage({type}); });
  document.getElementById('settings').addEventListener('click', () => vscode.postMessage({type:'settings'}));
  document.getElementById('tab-chat').addEventListener('click', () => setTab('chat'));
  document.getElementById('tab-context').addEventListener('click', () => setTab('context'));
  document.getElementById('tab-terminal').addEventListener('click', () => setTab('terminal'));
  document.getElementById('clear-context').addEventListener('click', () => vscode.postMessage({type:'clearAttachments'}));
  document.getElementById('lang').addEventListener('click', () => setLocale(locale === 'en' ? 'ru' : 'en'));
  document.getElementById('theme').addEventListener('click', () => setTheme(theme === 'system' ? 'light' : theme === 'light' ? 'dark' : 'system'));
  document.body.addEventListener('keydown', event => { if (event.key === 'Escape' && plusMenu.className === 'open') { plusMenu.className = ''; document.getElementById('plus').setAttribute('aria-expanded','false'); document.getElementById('plus').focus(); } });
  document.getElementById('plus').addEventListener('click', () => { plusMenu.className = plusMenu.className ? '' : 'open'; document.getElementById('plus').setAttribute('aria-expanded', plusMenu.className === 'open' ? 'true' : 'false'); });
  document.getElementById('attach').addEventListener('click', () => { plusMenu.className = ''; document.getElementById('plus').setAttribute('aria-expanded','false'); fileInput.click(); });
  fileInput.addEventListener('change', () => { addFiles(fileInput.files); fileInput.value = ''; });
  question.addEventListener('paste', event => {
    const images = Array.from(event.clipboardData?.files || []).filter(file => file.type.startsWith('image/'));
    if (images.length) { event.preventDefault(); addFiles(images); }
  });
  document.body.addEventListener('dragover', event => event.preventDefault());
  document.body.addEventListener('drop', event => { event.preventDefault(); if (event.dataTransfer?.files?.length) addFiles(event.dataTransfer.files); });
  setLocale(locale);
  updateThemeButton();
  renderBudget(lastAccount);
  vscode.postMessage({type:'ready'});
</script></body></html>`;
}

module.exports = { chatHtml };
