# Tvijo connection and receipt contract

The active hosted mode is `managed`. `openrouter` and `direct` are saved pilot preferences, not activated connections. POST `/workspace/connection` accepts exactly `{"mode":"managed|openrouter|direct"}` with an account token or protected same-origin cookie. API keys and arbitrary provider endpoints are rejected. No fallback, extra model request or payment is triggered.

GET `/workspace/usage` returns account-scoped recent task details, native provider/model receipts when available, and lifetime account budget. It never exposes transport credentials or another tenant’s task. Provider cost and service difference are separate; missing or uncertain receipts return null. Task elapsed includes preparation. Provider details cover only the loaded recent history; no total subscription quota or cache-saving percentage is inferred.

`/usage` opens private data using the browser service account. The VS Code Usage tab uses its own SecretStorage account credential. They must be signed in as the same service account to display the same data; the extension does not put its token into a browser URL.

Commercial direction: model-aware customers can request BYOK; a future separate workspace/service plan must be priced and accepted before activation. No BYOK charge is currently enabled.
