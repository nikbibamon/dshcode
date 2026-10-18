'use strict';

const THEME_CSS = `
  body{color-scheme:dark;--surface:#11151c;--raised:#171d27;--border:#2b3544;--accent:#699cff;--muted:#92a1b7;--good:#53d690;--bad:#fb7185;--text:#e7edf6;--input:#10151d;--hover:#202a38}
  body.vscode-light[data-theme="system"],body[data-theme="light"]{color-scheme:light;--surface:#f7f9fc;--raised:#fff;--border:#d7dfeb;--accent:#2868d8;--muted:#64748b;--good:#16834d;--bad:#c43f55;--text:#172235;--input:#fff;--hover:#edf3fb}
  body[data-theme="dark"]{color-scheme:dark;--surface:#11151c;--raised:#171d27;--border:#2b3544;--accent:#699cff;--muted:#92a1b7;--good:#53d690;--bad:#fb7185;--text:#e7edf6;--input:#10151d;--hover:#202a38}
  body{color:var(--text);background:var(--surface);font:12px/1.45 var(--vscode-font-family,system-ui,sans-serif);margin:0;display:flex;flex-direction:column;height:100vh;min-width:0}
  button{font:inherit;color:inherit;cursor:pointer;border:1px solid transparent;border-radius:6px;background:transparent;padding:5px 7px}
  button:hover{background:var(--hover)}button:disabled{opacity:.5;cursor:default}button:focus-visible,textarea:focus-visible{outline:1px solid var(--accent);outline-offset:1px}
  .icon{font-size:15px;line-height:1;min-width:28px;min-height:28px;padding:4px}.accent{color:var(--accent)}
  header{display:flex;align-items:center;gap:4px;padding:7px 9px;border-bottom:1px solid var(--border);min-height:30px}
  #brand{font-weight:650;letter-spacing:.02em;white-space:nowrap;flex:1}#brand-mark{color:var(--accent);font-size:15px;margin-right:5px}
  nav{display:flex;gap:2px;border-bottom:1px solid var(--border);padding:0 8px}
  nav button{padding:7px 9px;color:var(--muted);border-radius:0;border-bottom:2px solid transparent}nav button[aria-selected="true"]{color:var(--accent);border-bottom-color:var(--accent)}
  #messages{flex:1;overflow:auto;padding:12px 12px 6px}.message{margin:0 0 13px;white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.55}.role{font-weight:650;margin-bottom:3px;color:var(--muted)}.assistant{border-left:2px solid var(--accent);padding-left:9px}
  .answer-actions{display:flex;gap:4px;margin-top:6px}.answer-actions button{font-size:11px;color:var(--muted);padding:3px 6px}
  .welcome{margin:auto;max-width:260px;text-align:center;color:var(--muted);line-height:1.55}.welcome-mark{font-size:24px;color:var(--accent);margin-bottom:4px}.welcome strong{display:block;color:var(--text);font-size:16px;font-weight:600;margin-bottom:4px}.welcome p{margin:0}
  #context-panel{display:none;margin:4px 10px 8px;padding:8px;background:var(--raised);border:1px solid var(--border);border-radius:8px;color:var(--muted)}#context-panel.visible{display:block}.context-row{display:flex;align-items:center;gap:7px;padding:3px 0}.context-row span:first-child{flex:1;overflow-wrap:anywhere;color:var(--text)}
  #state{padding:2px 10px;color:var(--muted);font-size:11px;min-height:16px;white-space:pre-wrap;overflow-wrap:anywhere;max-height:16vh;overflow:auto}
  #account-status{display:flex;gap:6px;align-items:center;padding:4px 10px;color:var(--muted);font-size:10px;border-top:1px solid var(--border);min-height:17px}#account-status .dot{color:var(--good)}#budget{margin-left:auto;white-space:nowrap}
  form{border:1px solid var(--border);border-radius:9px;background:var(--raised);margin:3px 8px 8px;padding:7px;display:flex;flex-direction:column;gap:5px}
  #attachments{display:flex;flex-direction:column;gap:4px;max-height:20vh;overflow:auto}.attachment{display:flex;gap:6px;align-items:center;padding:5px;border:1px solid var(--border);border-radius:6px}.attachment img{width:34px;height:30px;object-fit:contain;background:var(--surface)}.attachment .label{flex:1;min-width:0;overflow-wrap:anywhere}.attachment small{display:block;color:var(--muted);font-size:10px}.attachment button{color:var(--muted);padding:3px}
  #ocrnote{margin:0;color:var(--muted);font-size:10px;line-height:1.35}
  textarea{font:inherit;resize:vertical;min-height:42px;max-height:30vh;background:var(--input);color:var(--text);border:1px solid var(--border);padding:7px;border-radius:6px;box-sizing:border-box;width:100%}textarea::placeholder{color:var(--muted)}
  .composer-actions{display:flex;align-items:center;gap:5px}.composer-actions .spacer{flex:1}.mini-select{font-size:10px;color:var(--muted);padding:4px 6px}.mini-select span{color:var(--accent);margin-right:3px}#send{background:var(--accent);color:#fff;width:29px;height:29px;padding:3px;font-size:16px}
  #plus-menu{position:absolute;bottom:73px;left:12px;display:none;flex-direction:column;min-width:170px;padding:4px;background:var(--raised);border:1px solid var(--border);border-radius:8px;box-shadow:0 6px 22px #0005;z-index:2}#plus-menu.open{display:flex}#plus-menu button{text-align:left;padding:7px}
  #messages:has(.welcome){display:flex;flex-direction:column;justify-content:center}
  @media(max-width:340px){header{flex-wrap:wrap}#brand{min-width:75px}#account-status{flex-wrap:wrap}#budget{white-space:normal;overflow-wrap:anywhere;margin-left:0}#signin{font-size:11px;padding:4px}header .icon{min-width:23px;padding:3px}#lang{padding:4px 2px}}
  nav{flex-wrap:wrap}.product-links{display:flex;gap:3px;padding:2px 8px;border-top:1px solid var(--border)}.product-links button{font-size:10px;color:var(--accent);padding:3px 6px}#usage-items{font-size:11px;overflow-wrap:anywhere}#usage-items p{margin:7px 0}#context-panel:has(#usage-items:not([hidden])){flex:1;overflow:auto;max-height:70vh}
  [hidden]{display:none!important}
  .toolbar-hidden{display:none!important}.view-panel{display:none}#context-panel.visible{display:block}
`;

const COPY = {
  en: {
    chat:'Chat', context:'Context', terminal:'Terminal', new:'New session', settings:'Settings', account:'Account',
    title:'Build with context.', intro:'Ask about this file, your project, or a focused task.',
    hint:'Add private project context, then ask when you are ready.', empty:'No context attached yet.', terminalInfo:'Open your project terminal in VS Code. Commands use your own local credentials.',
    ask:'Ask about your project…', send:'Send message', plus:'Add context', addFile:'Add file…', workspace:'Choose workspace file…', selection:'Use editor selection', path:'Paste workspace path…',
    signIn:'Sign in', signedIn:'Account', limited:'Limited free preview', ready:'Ready', loading:'Connecting…', answering:'Answering…', preparing:'Preparing attachment…',
    theme:'Theme', themeDark:'Dark', themeLight:'Light', themeSystem:'System', language:'Switch language', model:'Model & workflow', cancel:'Cancel task', clear:'Remove all context', remove:'Remove', preview:'Preview text',
    copy:'Copy', openAnswer:'Open in editor', user:'You', assistant:'DSHREM', ocr:'Image text (OCR)', fileContext:'File context',
    attachmentOnly:'Explain the attached context.', wait:'Wait for the current question or attachment to finish.', tooLarge:'Each file must be non-empty and at most 2 MiB.', readError:'Could not read the file.',
    imageNote:'Images use local text extraction; visual layout is not analysed.', commands:'Commands', telegram:'Telegram'
  },
  ru: {
    chat:'Чат', context:'Контекст', terminal:'Терминал', new:'Новая сессия', settings:'Настройки', account:'Аккаунт',
    title:'Работайте с контекстом.', intro:'Спросите об этом файле, проекте или задаче.',
    hint:'Добавьте приватный контекст проекта и задайте вопрос.', empty:'Контекст пока не добавлен.', terminalInfo:'Откройте терминал проекта в VS Code. Команды используют ваши локальные учётные данные.',
    ask:'Спросите о проекте…', send:'Отправить сообщение', plus:'Добавить контекст', addFile:'Добавить файл…', workspace:'Выбрать файл проекта…', selection:'Использовать выделение', path:'Вставить путь в проекте…',
    signIn:'Войти', signedIn:'Аккаунт', limited:'Ограниченный бесплатный доступ', ready:'Готово', loading:'Подключение…', answering:'Отвечаю…', preparing:'Подготовка вложения…',
    theme:'Тема', themeDark:'Тёмная', themeLight:'Светлая', themeSystem:'Системная', language:'Сменить язык', model:'Модель и сценарий', cancel:'Отменить задачу', clear:'Удалить весь контекст', remove:'Удалить', preview:'Предпросмотр текста',
    copy:'Копировать', openAnswer:'Открыть в редакторе', user:'Вы', assistant:'DSHREM', ocr:'Текст изображения (OCR)', fileContext:'Контекст файла',
    attachmentOnly:'Объясните прикреплённый контекст.', wait:'Дождитесь завершения текущего вопроса или вложения.', tooLarge:'Файл должен быть непустым и не больше 2 МиБ.', readError:'Не удалось прочитать файл.',
    imageNote:'Изображения обрабатываются локально: анализ макета не выполняется.', commands:'Команды', telegram:'Telegram'
  }
};

module.exports = { THEME_CSS, COPY };
