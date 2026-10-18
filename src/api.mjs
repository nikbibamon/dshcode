import { apiBase } from './config.mjs';

function safePayload(response) {
  const details = {
    428: ['authorization_pending', 'Authorization is still pending. Check the browser approval and try again.'],
    403: ['authorization_denied', 'Authorization was denied by the account owner.'],
    410: ['request_expired', 'The authorization request or task has expired.'],
    401: ['unauthorized', 'Login is required or has expired. Run `dsh login`.'],
    429: ['rate_limited', 'The service rate limit was reached. No retry was attempted.']
  }[response.status] ?? ['remote_http_error', `Remote service returned HTTP ${response.status}. Response details were omitted.`];
  const error = new Error(details[1]);
  error.status = response.status;
  error.code = details[0];
  return error;
}

export async function request(path, { token, method = 'GET', body, allowLocalhost = false, signal, timeoutMs = 30_000 } = {}) {
  const base = apiBase(allowLocalhost);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error('Request timed out')), timeoutMs);
  const abortFromCaller = () => controller.abort(signal.reason);
  if (signal?.aborted) abortFromCaller();
  else signal?.addEventListener('abort', abortFromCaller, { once: true });
  let response;
  try {
    response = await fetch(`${base}${path}`, {
      method,
      headers: { ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...(token ? { authorization: `Bearer ${token}` } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: controller.signal,
      redirect: 'error'
    });
  } catch (error) {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abortFromCaller);
    if (signal?.aborted) throw signal.reason ?? new Error('Request interrupted');
    if (controller.signal.aborted) throw new Error(`Remote request timed out after ${Math.round(timeoutMs / 1000)} seconds`);
    if (error.name === 'AbortError') throw new Error('Remote request was interrupted');
    throw new Error('Could not reach the DSHREM service. Check your network and service URL.');
  }
  try {
    if (!response.ok) throw safePayload(response);
    if (response.status === 204) return null;
    const declared = Number(response.headers.get('content-length'));
    if (Number.isFinite(declared) && declared > 2 * 1024 * 1024) throw new Error('Remote response exceeded the 2 MiB limit');
    if (!response.body) return null;
    const reader = response.body.getReader();
    const chunks = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 2 * 1024 * 1024) { await reader.cancel(); throw new Error('Remote response exceeded the 2 MiB limit'); }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch (error) {
    if (controller.signal.aborted) throw new Error(`Remote request timed out after ${Math.round(timeoutMs / 1000)} seconds`);
    if (error.status) throw error;
    if (error.message.includes('2 MiB')) throw error;
    if (error.message.startsWith('Remote service returned HTTP')) throw error;
    throw new Error('Remote service returned an invalid or oversized JSON response');
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abortFromCaller);
  }
}

export async function currentAuth() {
  const { readAuth } = await import('./storage.mjs');
  const auth = await readAuth();
  if (!auth?.access_token) throw new Error('Login is required. Run `dsh login`.');
  const base = apiBase();
  if (auth.api_base !== base) throw new Error('Saved login belongs to a different service URL. Log out and log in again for this service.');
  if (auth.expires_at && Date.now() >= Date.parse(auth.expires_at)) throw new Error('Saved login has expired. Run `dsh login`.');
  return auth;
}
