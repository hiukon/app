import { createSseParser } from './sseParser';

/**
 * POST /api/v1/messages with Accept: text/event-stream; parse SSE via XHR (React Native friendly).
 * @param {object} options
 * @param {string} options.url - Full URL e.g. AGENT_API_URL + /api/v1/messages
 * @param {string} options.token - Bearer access token
 * @param {object} options.body - CreateMessageRequest JSON
 * @param {AbortSignal} [options.signal]
 * @param {(event: object) => void} options.onEvent
 * @param {() => void} [options.onComplete]
 */
export function streamAgentMessage({
    url,
    token,
    body,
    signal,
    onEvent,
    onComplete,
}) {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        const parser = createSseParser();
        let processed = 0;
        let settled = false;
        let aborted = false;

        const finish = (err) => {
            if (settled) return;
            settled = true;
            if (err) reject(err);
            else resolve();
        };

        const onAbort = () => {
            aborted = true;
            xhr.abort();
            finish(new Error('Aborted'));
        };

        if (signal) {
            if (signal.aborted) {
                finish(new Error('Aborted'));
                return;
            }
            signal.addEventListener('abort', onAbort, { once: true });
        }

        xhr.open('POST', url);
        xhr.setRequestHeader('Content-Type', 'application/json');
        xhr.setRequestHeader('Accept', 'text/event-stream');
        xhr.setRequestHeader('Authorization', `Bearer ${token}`);

        xhr.onprogress = () => {
            const full = xhr.responseText || '';
            const chunk = full.slice(processed);
            processed = full.length;
            const events = parser.push(chunk);
            for (const ev of events) onEvent(ev);
        };

        xhr.onload = () => {
            if (signal) signal.removeEventListener('abort', onAbort);
            const full = xhr.responseText || '';
            const chunk = full.slice(processed);
            processed = full.length;
            const fromChunk = parser.push(chunk);
            for (const ev of fromChunk) onEvent(ev);
            const tail = parser.end();
            for (const ev of tail) onEvent(ev);

            if (xhr.status < 200 || xhr.status >= 300) {
                let msg = `HTTP ${xhr.status}`;
                try {
                    const j = JSON.parse(full);
                    msg = j.message || j.msg || j.error || msg;
                } catch {
                    if (full) msg = full.slice(0, 200);
                }
                finish(new Error(msg));
                return;
            }
            try {
                onComplete?.();
            } catch (e) {
                finish(e);
                return;
            }
            finish();
        };

        xhr.onerror = () => {
            if (signal) signal.removeEventListener('abort', onAbort);
            if (aborted) return;
            finish(new Error('Network error'));
        };

        xhr.send(JSON.stringify(body));
    });
}
