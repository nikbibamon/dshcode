# dshrempub

## 0.4.2 — one Tvijo workspace, visible usage

Tvijo AI is the workspace brand. Centavra is the simple browser entry, DSHREM is the technical/editor entry. Use the **Usage** tab for your private receipts, provider/model, token counts, task limits and spend. `/usage`, `/connections`, `/guide` are available from chat or the command palette.

Connection modes: managed Tvijo is active. OpenRouter and direct-provider BYOK currently save an explicit pilot preference only; no provider API key is collected and your route does not switch. Provider billing and any future Tvijo BYOK service plan must be agreed separately.

[Workspace guide](https://dsh.tvijo.com/workspace-guide) · [Connections and cost illustration](https://dsh.tvijo.com/connections) · [Private usage](https://dsh.tvijo.com/usage). Unknown provider costs, subscription quotas and cache savings are not replaced with fictional zeros or percentages.


## 0.4.0 — compact workspace and sponsored preview

Open **Tvijo → Chat**, or run **Tvijo: Open chat** from `Ctrl+Shift+P`. Use `+` for context, the model control for routing, and **Terminal** for your own project shell. EN/RU and light/dark/system preferences are available in the panel. Image upload is not promoted in the initial composer.

**Sign in:** the clipboard contains only the eight-character code. **Open browser** opens a prefilled approval link; after Google/password sign-in you return to the approval form. Approval is still explicit.

**Try first:** self-service accounts receive a sponsored preview of 5 tasks, 50,000 model tokens and USD0.05 total, whichever ends first. The shared preview pool is USD1 per UTC day. Preview supports the cheap Flash/Devstral routes; it is not a payment or revenue, and premium models require paid credit. No card, automatic debit or per-question operator approval. Failed attempts and unknown token usage may retain quota; the API never automatically retries.

The terminal opens on your VS Code extension host in the first open workspace folder. It does not start a model or run generated commands. Codex uses your own separate login/subscription. Read [terminal setup](https://dsh.tvijo.com/connect), [manual](https://dsh.tvijo.com/learn), [API](https://dsh.tvijo.com/dev), [feedback](https://dsh.tvijo.com/feedback), [privacy](https://dsh.tvijo.com/privacy). Source mirror: https://github.com/nikbibamon/dshcode.


`dshrempub` is a Node.js command-line client for remote DSHREM research and chat. It uses Node 22 or newer and the built-in `fetch`; it has no runtime dependencies.

The client sends prompts to `https://dsh.tvijo.com/api/dshrem/v1`. Each prompt obtains a separately budgeted remote task using the server's `coding` alias and a maximum budget of USD 1. The service remains responsible for enforcing the account's actual limits. Conversations are saved locally with owner-only file permissions.

This is a remote research/chat client. It does not execute generated code, modify local files, or run autonomous local tools. Suggested tool calls in a response are displayed but never executed.

## Install and use

```sh
npm install -g .
dsh --help
dsh login
dsh status
dsh models
dsh tasks
dsh task TASK_ID
dsh stop TASK_ID
dsh chat
dsh run "Explain this error message: ..." --json
dsh sessions
dsh resume SESSION_ID
dsh reconcile SESSION_ID --cancel
dsh kb add docs/notes.md
dsh kb search "deployment settings"
dsh kb map
dsh logout
```

The command is also available as `dshrem`. Run `dsh doctor` for a read-only service health check. Use `dsh reconcile SESSION_ID` to inspect an uncertain task or grant; append `--cancel` to request cancellation. This recovers grants with their saved idempotency key and never resends inference. For command details and local session behavior, see [docs/HELP.md](docs/HELP.md).

To point at a development endpoint, set `DSHREM_API_BASE`. HTTPS is required. Plain HTTP is accepted only for an explicit loopback URL such as `http://localhost:8080/api/dshrem/v1`, which must also be enabled with `DSHREM_ALLOW_LOCALHOST=1` in the current shell.

## VS Code

Preview data flow is documented in [vscode/PRIVACY.md](vscode/PRIVACY.md).
For graph orchestration, see the two-node [LangGraph/LangChain adapter](integrations/LANGGRAPH.md).

The `vscode/` folder holds the editor client: device sign-in, questions about a selection,
explicit knowledge-base upload and account credit, over the same service and the same rules
(no API keys in the editor, one capped task per question, no automatic paid retries).
See [vscode/README.md](vscode/README.md).

## Local data and security

Login data and transcripts are stored below `~/.config/dshrempub/`; credential and transcript files are written atomically with mode `0600`, and containing directories with mode `0700`. Credentials are bound to the service URL used at login. Do not share session files if they contain sensitive prompts. The client never prints access tokens or raw HTTP error bodies. It does not make automatic paid retries. Uncertain tasks remain saved and block further paid turns until the service reports a terminal state with no held budget.

Knowledge base upload is explicit: `dsh kb add FILE` accepts one UTF-8 regular file inside the current working directory, up to 512 KiB. It rejects symlinks, common credential file names, binary content, and likely inline credentials. It does not scan or upload files automatically.

## License

The package metadata is `UNLICENSED`. A public licensing decision is pending. No license grant is made here. A possible future 1–2 year/$1M threshold and all other licensing terms remain undecided.

## Own Telegram bot and workflows (0.3.0)

Download current builds and create a service account at https://dsh.tvijo.com/download.
New accounts have zero credit. Payment processing is not yet configured.
Read https://dsh.tvijo.com/bot for BotFather setup. After `dsh login`,
set `DSHREM_BOT_TOKEN` and `DSHREM_BOT_OWNER_ID` in a private process environment
and run `dshrembot`. Do not put secrets in a repository or a shell-history command.
One running connector per bot token; editor and standalone connectors are alternatives.
Commands: `/help`, `/status`, `/account`, `/models`, `/model ds41f`,
`/mode single|auto|council`, `/ask QUESTION`, `/cancel`. Server status is read-only.

For terminal questions use `DSHREM_MODEL`, `DSHREM_MODE`, `DSHREM_METHOD`
(evidence-first, plan-check, peer-review). All model calls in a task share its
$1 cap. Only admitted server routes are available; no automatic paid fallback.

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
