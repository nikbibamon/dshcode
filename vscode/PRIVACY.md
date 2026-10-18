# Data sent by Tvijo DSHREM

The extension sends a question, conversation history, selected code and explicitly
attached text to the configured service when you press **Ask**. It does not scan your
workspace automatically. A file chosen, pasted or dropped from your computer is first
transferred to the VS Code extension host (the SSH server in a Remote SSH window).
Image text is extracted there with Tesseract, without an upstream model call. Images
are not sent to a vision model. Only extracted text is submitted with the question.
Avoid selecting credentials or private data you are not authorized to send.

Unsubmitted attachments and image previews remain in extension-host memory until sent,
removed, or the host reloads. They are not written to temporary files by this extension.
After submission, file contents and OCR text are part of conversation history; original
image bytes are not. The composer draft is kept in VS Code webview state. A separate
**Add file to my knowledge base** command requires confirmation and stores the file's
text in the service knowledge base. Attaching a file to a question does not add it there.

The login token is stored in VS Code SecretStorage. Conversation history is kept
in the extension workspace state. Signing out removes the local login token;
starting a new conversation clears local conversation state. Neither action
claims to delete records already stored by the service.

The service processes submitted content to answer the request and may retain
uploaded knowledge, account records, task identifiers, usage, cost and error
records. Requests may be processed by upstream model services. Server retention,
deletion and upstream data terms must be agreed for a production deployment;
this preview makes no zero-retention, training-exclusion or certification claim.

This extension adds no independent advertising or analytics SDK. The service
accounts for tasks and usage. It never asks for a model-provider API key.

Customers can create a service account with zero initial credit. Free trials, when offered, are
finite service credits, not unlimited tokens or access to the operator's account.

The optional Telegram connector sends and receives bot messages through Telegram.
Your BotFather token stays in SecretStorage in the editor; the standalone connector
reads it from your process environment. Only the configured owner's private chat is
accepted. `/status` discloses this host's name and resource counters to that owner.
Requests and pending-task metadata are retained locally for recovery. `/ask` sends
the question to the configured Tvijo service and selected upstream model services.
No proactive Telegram notifications or arbitrary shell commands are implemented.

The service stores a salted password hash for web accounts and records unpaid credit
orders and verified settlement events. Exact answer caching is private to your account,
lasts up to one hour and keeps at most 32 entries per account. Signing out does not
delete the service's ledger, uploaded knowledge or this cache. Payment collection
requires an independently configured merchant integration; orders are not payments.

If you explicitly allow named systemd services, the bot can return their state and
restart one after a fresh owner confirmation valid for 60 seconds. The allowlist is
empty by default. Service names, requests and outcomes remain in local bot state;
no arbitrary shell text is executed.


## Sponsored preview and product feedback (0.4.0, 2026-10-18)
Self-service accounts receive an idempotent sponsored preview, capped at five tasks, 50,000 model tokens and USD0.05 per account, with a shared USD1 daily pool. This is not a payment or revenue. Task reservations and usage persist across restarts. Browser questions, explicit context and answers are stored in the tenant-private task history; do not submit secrets. The operator can read submitted feedback and account/credit requests. Optional feedback contact details and verified Google email on subsequent sign-in are stored privately for account support; email never merges accounts automatically. No unsolicited email/Telegram notification is sent. The web UI stores theme/language preferences locally. Own-project terminals run on the user's VS Code extension host and use separate local authentication.
