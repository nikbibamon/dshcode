# 0.4.3

Correct hidden-state styling so Usage and Context replace the welcome screen in narrow editor panels. Includes all 0.4.2 usage and connection features.

# 0.4.2

Private Usage tab with actual provider receipts and knowledge coverage, connections/pilot preferences and a shared Tvijo AI guide. No BYOK key ingestion or inference route changes.

# 0.4.1

Corrected narrow-panel wrapping and refreshed localization when switching languages. Preserves 0.4.0 preview and device approval features.

# 0.4.0

Compact EN/RU chat, blue-gray themes, + context menu, own-project terminal, visible preview quotas and prefilled device approval. Sponsored usage has durable per-account and shared daily limits.

## 0.3.1

- Explicit host service allowlist with read-only status and a fresh, single-use restart confirmation. Disabled by default.

## 0.3.0

- Branded dsh.tvijo.com service and zero-credit account onboarding.
- Model/workflow settings and shared-cap DeepSeek + GLM council.
- Owner-only Telegram connector, SecretStorage setup and read-only host status.
- Unpaid $10 credit requests; no automatic debit or fabricated settlement.
- Preserve unresolved grant requests for explicit cancellation/reconciliation.

# Changes

## 0.2.1

- Fix the packaged privacy link with an explicit URL to the public root privacy policy.

## 0.2.0

- Attach local or workspace files, selected code, and PNG/JPG screenshots from the picker, clipboard, or drag and drop.
- Extract screenshot text locally with bounded, single-threaded OCR; show previews and the explicit image-text limitation.
- Add a command menu, slash commands, service/task checks, conversation export, answer copying, and draft persistence.
- Keep attachments on failed questions and send only explicit file/OCR text through the existing capped route.

## 0.1.3

- Preserve a draft question when sign-in, credit, or pending-task checks reject it.
- Block new-conversation actions during an active question and dispose old view listeners.

## 0.1.2

- Add a dedicated Tvijo DSHREM sidebar chat with sign-in, questions, answers, new conversation, and pending-task controls.
- Keep the existing $1 per-task cap, pending-task guard, and explicit knowledge-base uploads.

## 0.1.1

- Enforce the response-size limit during streaming, including responses without
  a Content-Length header.
- Keep cancellation and request timeout active until the response body is read.
- Document the preview data flow and the boundary between customer credits and
  the operator's subscription.

The preview remains a remote code-analysis client. Marketplace publication and
production enrollment require separate verified release evidence.
