/**
 * Incremental SSE line parser (Seinetime / text/event-stream).
 * @see sse_flow_conversation_message 1.md §4.2
 */
export function createSseParser() {
    let buffer = '';

    return {
        /**
         * @param {string} chunk
         * @returns {object[]} Parsed JSON events (excluding [DONE])
         */
        push(chunk) {
            buffer += chunk;
            const lines = buffer.split('\n');
            buffer = lines.pop() ?? '';
            const events = [];
            for (const raw of lines) {
                const line = raw.trim();
                if (!line || line === 'data: [DONE]') continue;
                if (line.startsWith('data: ')) {
                    const jsonStr = line.slice(6);
                    try {
                        events.push(JSON.parse(jsonStr));
                    } catch {
                        // ignore malformed line
                    }
                }
            }
            return events;
        },

        /** Flush trailing buffer as final lines (call when stream ends). */
        end() {
            const rest = buffer;
            buffer = '';
            return rest ? this.push(rest + '\n') : [];
        },
    };
}
