# DSHREM code analysis in a LangGraph workflow

DSHREM provides a terminal and VS Code entry to a shared, account-scoped analysis
service. A workflow can submit an explicit question, receive an answer with
source evidence and inspect the task's cost. You retain control over which code
you submit. The remote client does not execute tools on your machine.

## Preview available

- Terminal client with device sign-in, task status and reconciliation.
- VS Code extension with selection questions, explicit knowledge uploads and
  SecretStorage for its login token.
- An async analysis node usable from LangGraph and LangChain, with a separate
  preparation node to persist the request identity before network I/O.
- Server-side account credits and per-task limits; clients never receive the
  operator's model-provider keys or subscription credentials.

Version 0.1.1 fixes response buffering and timeout coverage in the editor's
protocol client. Its tests cover a streaming response exceeding the size limit,
a stalled response after headers, cancellation, device authorization, budgeted
task creation and private error handling. The adapter has offline tests for
request identity, cancellation and the absence of an automatic paid retry.

These are scoped code and protocol checks. They do not certify every editor,
customer deployment, production workflow or provider.

## LangGraph supplies orchestration; DSHREM supplies one analysis step

LangGraph is a stateful orchestration runtime with persistence, streaming and
human oversight. DSHREM can be one service node in that graph. This integration
does not replace the graph runtime and has no measured superiority claim.

See the [integration example](../integrations/LANGGRAPH.md). Keep tenant tokens
out of graph state, enable a persistent checkpointer and reconcile unresolved
tasks before creating new work. A generic automatic retry must not replay a
paid analysis without checking the service's task state.

## Try the preview

Install the terminal from this repository or the editor's `.vsix` from a tagged
preview release. Run `dsh login` or **Tvijo: Sign in** and approve the displayed
code in the browser. An account with provisioned service credit is required.
The current editor client requests a maximum USD1 per task; the service may
apply a lower account or daily limit.

Sponsored trials and a self-service credit pool are not enabled by installing
the extension. Availability and limits must be confirmed in the account. This
preview does not promise unlimited tokens, free capacity or a Marketplace listing.

## Data and product boundaries

The extension sends explicit questions, conversation history and selected code;
knowledge uploads are a separate confirmed action. Read the
[data flow](../vscode/PRIVACY.md). Submitted content can be processed by upstream
services; production retention and deletion terms must be agreed separately.

The terminal research client and this extension return reviewable text. They
do not claim autonomous local editing, a Copilot replacement, a hosted app
builder or a public management console for private operator runs.

## Sources and verification

- [Public source and tests](https://github.com/nikbibamon/dshrempub)
- [LangGraph overview](https://docs.langchain.com/oss/javascript/langgraph/overview)
- [VS Code publishing process](https://code.visualstudio.com/api/working-with-extensions/publishing-extension)
- Offline verification: `npm test` in the repository root.

The client and integration remain previews. No customer activation rate,
profitability, benchmark win or production acceptance is inferred from unit tests.
