# DSHREM client help

## Commands

- `dsh --help` or `dshrem --help`: show the command summary.
- `dsh --version`: print the client version.
- `dsh login`: request a device code, open the displayed verification address in a browser, and enter the code. The client polls until approval, denial, or expiry, then stores the bearer token locally.
- `dsh logout`: ask the service to revoke the saved token, then remove the local credential file.
- `dsh status`: show the account response from the service.
- `dsh models`: show the service's available logical model aliases. Prompts use the `coding` alias; backend model identifiers are not part of this client.
- `dsh doctor`: make a read-only health request.
- `dsh tasks`: show the server's account task board from `GET /tasks`, including the service's `external_agents` field as returned. The client does not infer or fabricate activity for external agents.
- `dsh task ID`: show one public task from `GET /tasks/ID`.
- `dsh stop ID`: request cancellation with `POST /tasks/ID/cancel` and print the service response.
- `dsh chat [--session ID]`: start an interactive chat, optionally continuing a local transcript.
- `dsh run TASK [--json]`: send one prompt and exit. `--json` prints the assistant text, usage, task accounting, and local session id as JSON.
- `dsh sessions`: list locally saved sessions.
- `dsh list`: alias for `dsh sessions`.
- `dsh resume SESSION_ID`: resume a saved session in interactive chat.
- `dsh resume`: choose a saved session interactively, or use `dsh sessions` when not in a terminal.
- `dsh reconcile SESSION_ID [--cancel]`: recover an uncertain task grant by resending only its saved idempotency key, then inspect task status. `--cancel` also requests task cancellation before checking status again. This command never resends inference. The session remains blocked until task status is terminal and held budget is zero.
- `dsh kb add FILE`: explicitly upload one UTF-8 regular file from the current directory tree to the account knowledge base. Files over 512 KiB, symlinks, binary/invalid UTF-8 files, common credential file names, and files matching common inline credential patterns are rejected.
- `dsh kb search QUERY`: search the account knowledge base.
- `dsh kb map`: show the account knowledge base map.

Inside chat, use `/help`, `/new`, `/cost`, or `/exit`. `/new` starts a separate local transcript; `/cost` displays usage and task accounting returned for turns. Use Ctrl+C during a request to ask the service to cancel that task. Cancellation is best effort if the network is unavailable.

## Task and transcript behavior

Each submitted prompt creates one new remote task with an idempotency key, the server's logical `coding` alias, and a USD 1 maximum requested budget. A continued conversation sends its saved messages with the next prompt, but still creates a distinct task for that turn. The server is the authority for actual budget enforcement and accounting. The client does not retry a paid request automatically. If a turn's result is uncertain, its task id and latest status are kept in the local session; no further paid turn can start in that session until `GET /tasks/{id}` reports a terminal state and zero held budget. A per-session lock prevents parallel resumes from overwriting a transcript.

Sessions are local JSON files below `~/.config/dshrempub/sessions`, saved atomically with mode `0600`. They include prompts, answers, returned usage, and task ids. Keep them private when prompts may contain sensitive information. This client is not a local code runner: it cannot inspect a repository, edit files, or execute model generated tool calls. The saved login is bound to the API base URL used during login; changing it requires logging in separately for that service URL.

## Development endpoint

Set `DSHREM_API_BASE` to an HTTPS base URL. For an explicit loopback HTTP endpoint, set both `DSHREM_API_BASE=http://localhost:PORT/...` and `DSHREM_ALLOW_LOCALHOST=1`. Remote HTTP endpoints are rejected. No API key or provider credential is accepted by the client.

## Licensing

The package is marked `UNLICENSED`. The public licensing decision is pending; no grant is made. A possible future 1–2 year/$1M threshold and all other licensing terms remain undecided.
