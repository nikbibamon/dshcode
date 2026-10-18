# Tvijo DSHREM for VS Code

## 0.4.2 — one Tvijo workspace, visible usage

Tvijo AI is the workspace brand. Centavra is the simple browser entry, DSHREM is the technical/editor entry. Use the **Usage** tab for your private receipts, provider/model, token counts, task limits and spend. `/usage`, `/connections`, `/guide` are available from chat or the command palette.

Connection modes: managed Tvijo is active. OpenRouter and direct-provider BYOK currently save an explicit pilot preference only; no provider API key is collected and your route does not switch. Provider billing and any future Tvijo BYOK service plan must be agreed separately.

[Workspace guide](https://dsh.tvijo.com/workspace-guide) · [Connections and cost illustration](https://dsh.tvijo.com/connections) · [Private usage](https://dsh.tvijo.com/usage). Unknown provider costs, subscription quotas and cache savings are not replaced with fictional zeros or percentages.


## 0.4.0 — compact workspace and sponsored preview

Open **Tvijo → Chat**, or run **Tvijo: Open chat** from `Ctrl+Shift+P`. Use `+` for context, the model control for routing, and **Terminal** for your own project shell. EN/RU and light/dark/system preferences are available in the panel. Image upload is not promoted in the initial composer.

**Sign in:** the clipboard contains only the eight-character code. **Open browser** opens a prefilled approval link; after Google/password sign-in you return to the approval form. Approval is still explicit.

**Try first:** self-service accounts receive a sponsored preview of 5 tasks, 50,000 model tokens and USD0.05 total, whichever ends first. The shared preview pool is USD1 per UTC day. Preview supports the cheap Flash/Devstral routes; it is not a payment or revenue, and premium models require paid credit. No card, automatic debit or per-question operator approval. Failed attempts and unknown token usage may retain quota; the API never automatically retries.

The terminal opens on your VS Code extension host in the first open workspace folder. It does not start a model or run generated commands. Codex uses your own separate login/subscription. Read [terminal setup](https://dsh.tvijo.com/connect), [manual](https://dsh.tvijo.com/learn), [API](https://dsh.tvijo.com/dev), [feedback](https://dsh.tvijo.com/feedback), [privacy](https://dsh.tvijo.com/privacy). Source mirror: https://github.com/nikbibamon/dshcode.


Ask questions about your code from the editor. Answers cite the files you added to your
private knowledge base, and every question runs as one task with a hard 1 USD cap.

## What you get

- **A Tvijo chat in the VS Code sidebar.** Click the Tvijo icon in the Activity Bar,
  sign in, and ask from the chat field. The panel shows answers, source evidence,
  and the task's spent and held amounts. `Ctrl+Shift+P` → `Tvijo: Sign in` also works.
- **Sign in with your account, not an API key.** `Tvijo: Sign in` shows a short code; you
  approve it in the browser where you are already signed in. The token is kept in VS Code
  secret storage and works only with the service URL it was issued for.
- **Ask about a selection.** Select code, press `Ctrl+Alt+T` (`Cmd+Alt+T` on macOS) or use
  the context menu. These commands open the answer beside your code. Questions typed
  in the sidebar stay in the sidebar. A rejected question remains in the input for retry.
- **Your own knowledge base.** Right-click a file → `Tvijo: Add file to my knowledge base`.
  Upload is explicit and confirmed; credential files, binary files and files that look
  like they contain secrets are refused.
- **Account and credit.** Click the status bar item.

## Attach images and files

Use **Attach** for files on your computer, or paste/drop a PNG/JPG screenshot into
the chat. Use **Workspace** for files on the extension host (including SSH: biba2),
**Path** or `/attach path/to/file` for a workspace path, and **Selection** for selected
code. Workspace files also have **Tvijo: Attach workspace file** in their context menu.
Sending a standalone absolute/relative file path, `file://` link or Markdown file link
also attaches that workspace file without creating a model task. HTTP links are not fetched.
Attachments are shown before sending and can be removed individually. Click **Ask**
or use **Preview text** first to inspect the exact file/OCR text.
Ask sends them with your question; with no question text, Ask explains the attachment.

Images use **local OCR text extraction**, not visual reasoning. The preview shows the
original, but the model receives extracted text only. Colours, charts, object identity
and visual layout are not analysed. Tesseract must be installed on the extension host;
it is installed on SSH: biba2. `tvijo.ocrLanguages` defaults to `eng+rus`; use `eng`
on hosts with only English OCR data. OCR uses one thread with a 20-second bound.

Attach up to four files, at most 2 MiB each and 4 MiB combined. Text files are limited
to 64 KiB each; extracted and attached text together is limited to 80 KiB. Images are
limited to 8 megapixels and 8192 pixels per side. Credential files and detected secrets
are refused. Workspace paths must remain inside an open workspace folder; symlinks
are refused. Unsupported binary formats such as PDF are not silently converted.

Attachments are context for the next question, separate from your knowledge base.
Nothing is sent to the model until Ask. The draft and attachments remain after a failed
question. Successfully sent attachments are removed from the composer. Original files
and image previews are not stored in conversation history. Draft text survives hiding
or restoring the view; unsubmitted attachments are kept only in extension-host memory.

## Commands

Click **Commands** in the panel, or use `Ctrl+Shift+P` → `Tvijo: All commands`.
Open the panel directly with `Ctrl+Alt+Shift+T` (`Cmd+Alt+Shift+T` on macOS).

| Chat command | Action |
| --- | --- |
| `/attach path/to/file` | Attach a workspace file; quoted paths with spaces work |
| `/attach` | Choose a workspace file |
| `/selection` | Attach selected code |
| `/clear` | Remove unsent attachments |
| `/new` | Start a new conversation |
| `/signin`, `/signout` | Manage sign-in |
| `/account`, `/tasks` | Inspect credit or recent tasks |
| `/cancel` | Request cancellation of the pending task |
| `/status` | Check service connectivity without a model request |
| `/settings`, `/help` | Open settings or command help |
| `/export` | Open a Markdown copy of the conversation to save yourself |

Slash commands do not create paid model tasks. Unknown commands are refused. Each
assistant reply has **Copy** and **Open in editor** controls. Enter submits a question;
Shift+Enter adds a line. The client suggests code changes in text; shell execution and
automatic file editing are not part of this client.

## When it is not the right tool

- It does not edit files, run commands or act on its own. Suggested changes are text for
  you to review.
- One question is one task. A long conversation hits the per-task context bound; start a
  new conversation.
- If a previous task may still hold credit, the next question is refused until you cancel
  it (`Tvijo: Cancel pending task`) or it finishes. Nothing is retried automatically.

## Works in

VS Code 1.90+ and compatible editors that install `.vsix` packages.

## Development

```sh
npm test                      # protocol tests, no VS Code needed
npx @vscode/vsce package      # builds tvijo-dshrem-0.2.1.vsix
code --install-extension tvijo-dshrem-0.2.1.vsix
```

For a local service set `tvijo.apiBase` to `http://localhost:PORT/api/dshrem/v1`.

Read [PRIVACY.md](https://github.com/nikbibamon/dshrempub/blob/main/PRIVACY.md) before submitting private code. This is an
operator-provisioned preview; installation does not issue a credit grant.

## License

`UNLICENSED`. No license grant is made here; a public licensing decision is pending.

## Tvijo service, models and your Telegram bot (0.3.0)

The service is https://dsh.tvijo.com. Create an account there, then run
**Tvijo: Sign in** and approve the displayed code on the same domain. New accounts
start with zero credit. Installation itself is free; no permissive source license
is granted. **Tvijo: Request $10 service credit** creates an unpaid order.
Payment processing is not yet configured; creating an order never adds credit.

Run **Tvijo: Choose model and workflow** for single, automatic or council mode.
The council uses DeepSeek + GLM under one shared $1 task ceiling. Availability
comes from the server; unavailable routes are refused. Automatic routing is a
simple rule, not a proven quality optimization. Methods are structured prompts;
no measured savings or autonomous server changes are promised.

Create a bot with the official [@BotFather](https://t.me/BotFather) `/newbot`.
Run **Tvijo: Configure Telegram bot** and enter your numeric Telegram user ID
and BotFather token. The token goes into SecretStorage, never settings.json.
Run **Tvijo: Start Telegram bot**. Only your private chat is accepted.
`/help`, `/status`, `/account`, `/models`, `/model ds41f`, `/mode council`,
`/ask QUESTION` and `/cancel` are supported. `/ask` uses your funded Tvijo account.
The connector runs on this extension host, so the editor/SSH host must remain on.
Start only one connector per bot token; run **Tvijo: Stop Telegram bot** before
using the standalone connector. See [setup and CLI downloads](https://dsh.tvijo.com/bot).

Settings: `tvijo.model`, `tvijo.agentMode`, `tvijo.reasoningMethod`,
`tvijo.telegram.enabled`, `tvijo.telegram.ownerId`, `tvijo.apiBase`.
No arbitrary shell execution or Telegram payment collection is implemented.

### Explicit service control (0.3.1)

The default service allowlist is empty. To authorize specific units on this host,
set `tvijo.telegram.allowedServices` to exact names such as `["my-worker.service"]`
in VS Code machine settings. Restart the bot after changing this list.
For the standalone connector, set `DSHREM_BOT_SERVICES=my-worker.service` in its
private environment file. `/services` shows only those units.
`/restart my-worker.service` requests a one-time code; `/confirm CODE` within
60 seconds performs that exact restart. It consumes the confirmation before
running, never retries a restart, and still requires OS-level service permissions.
It cannot run arbitrary shell commands or restart units outside your allowlist.
