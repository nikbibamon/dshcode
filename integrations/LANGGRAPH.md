# DSHREM with LangGraph and LangChain

This adapter uses the existing tenant-scoped DSHREM service. It is a preview
integration tested against a fake service. It is not evidence of a production
workflow, a performance advantage, or a free-credit offer.

Use two nodes with a persistent LangGraph checkpointer. `prepareDshrem` creates
the idempotency key; the graph must persist that result before `analyse` performs
network I/O. Replaying an analysis must reuse the original request key. Service
idempotency and task-state checks remain authoritative; do not wrap the paid
node in an unconditional retry policy. Reconcile an unresolved task first.

```js
import {Annotation, StateGraph, START, END} from '@langchain/langgraph';
import {prepareDshrem, createDshremNode} from './langgraph.mjs';

const State = Annotation.Root({
  question: Annotation(), dshremRequest: Annotation(), dshremAnswer: Annotation()
});
const analyse = createDshremNode({
  token: process.env.DSHREM_TENANT_TOKEN,
  apiBase: 'https://dsh.tvijo.com/api/dshrem/v1',
  onTask: ({taskId, requestId}) => console.log({taskId, requestId})
});
const graph = new StateGraph(State)
  .addNode('prepare', prepareDshrem)
  .addNode('analyse', analyse)
  .addEdge(START, 'prepare').addEdge('prepare', 'analyse').addEdge('analyse', END)
  .compile({checkpointer}); // supply a persistent saver configured for your tenant
const answer = await graph.invoke({question: 'Review the code I explicitly supplied'},
  {configurable: {thread_id: 'tenant-scoped-workflow-id'}});
```

The same async analysis function can be used as a LangChain `RunnableLambda`:

```js
import {RunnableLambda} from '@langchain/core/runnables';
const runnable = RunnableLambda.from(analyse);
const requestState = {...input, ...prepareDshrem(input)};
// Persist requestState before invoke. A Runnable alone does not provide durability.
const result = await runnable.invoke(requestState);
```

Only the question and messages explicitly supplied to the adapter are sent. The
adapter does not inspect files. Keep the tenant token in a secret store and out
of graph state. `onTask` receives identifiers only; downstream log retention and
access controls are the integrator's responsibility. No content analytics is
enabled by this adapter.

The service currently provisions accounts through its operator and caps one task
at USD1. A missing credit grant, expired login or unresolved charge can refuse
execution. A provider's free tier does not by itself create customer credits.

References: [LangGraph](https://docs.langchain.com/oss/javascript/langgraph/overview),
[LangChain RunnableLambda](https://reference.langchain.com/javascript/classes/_langchain_core.runnables.RunnableLambda.html).
