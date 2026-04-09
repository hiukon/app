/**
 * Map MESSAGES_SNAPSHOT items to UI messages { id, text, isUser, timestamp, status }.
 * @see sse_flow_conversation_message 1.md §6.4
 */
export function mapSnapshotToChatRows(messages) {
    if (!Array.isArray(messages)) return [];
    const rows = [];
    for (const m of messages) {
        const id = m.id || `snap-${rows.length}`;
        if (m.role === 'user' && typeof m.content === 'string') {
            rows.push({
                id,
                text: m.content,
                isUser: true,
                timestamp: new Date(),
                status: 'sent',
            });
            continue;
        }
        if (m.role === 'assistant') {
            const text =
                typeof m.content === 'string'
                    ? m.content
                    : m.toolCalls?.length
                      ? ''
                      : '';
            if (text) {
                rows.push({
                    id,
                    text,
                    isUser: false,
                    timestamp: new Date(),
                    status: 'sent',
                });
            }
            continue;
        }
        if (m.role === 'system' && typeof m.content === 'string') {
            rows.push({
                id,
                text: m.content,
                isUser: false,
                timestamp: new Date(),
                status: 'sent',
            });
        }
    }
    return rows;
}
