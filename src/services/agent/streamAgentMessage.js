import { createSseParser } from './sseParser';
import { API_CONFIG } from '../../config/api.config';

export function streamAgentMessage({
    url,
    token,
    body,
    signal,
    onEvent,
    onComplete,
    timeout = API_CONFIG.reportGenerationTimeout,  // ✅ Thêm timeout mặc định 15 phút
}) {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        const parser = createSseParser();
        let processed = 0;
        let settled = false;
        let aborted = false;
        let timeoutId = null;  // ✅ Thêm timeout ID

        const finish = (err) => {
            if (settled) return;
            settled = true;
            if (timeoutId) clearTimeout(timeoutId);  // ✅ Clear timeout
            if (err) reject(err);
            else resolve();
        };

        const onAbort = () => {
            aborted = true;
            if (timeoutId) clearTimeout(timeoutId);
            xhr.abort();
            finish(new Error('Aborted'));
        };

        // ✅ Set timeout cho toàn bộ request
        if (timeout > 0) {
            timeoutId = setTimeout(() => {
                if (!settled) {
                    onAbort();
                    finish(new Error('Request timeout - Yêu cầu mất quá nhiều thời gian (15 phút)'));
                }
            }, timeout);
        }

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

        // ✅ Thêm timeout cho XHR (network timeout)
        xhr.timeout = timeout;
        xhr.ontimeout = () => {
            onAbort();
            finish(new Error('Network timeout'));
        };

        xhr.onprogress = () => {
            const full = xhr.responseText || '';
            const chunk = full.slice(processed);
            processed = full.length;
            const events = parser.push(chunk);
            for (const ev of events) onEvent(ev);
        };

        xhr.onload = () => {
            if (signal) signal.removeEventListener('abort', onAbort);
            if (timeoutId) clearTimeout(timeoutId);  // ✅ Clear timeout

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
                const err = new Error(msg);
                err.status = xhr.status;
                err.body = full;
                finish(err);
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
            if (timeoutId) clearTimeout(timeoutId);  // ✅ Clear timeout
            if (aborted) return;
            const err = new Error(`Network request failed: ${url}`);
            err.status = xhr.status || 0;
            finish(err);
        };

        xhr.send(JSON.stringify(body));
    });
}