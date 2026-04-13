/**
 * Map MESSAGES_SNAPSHOT items to UI messages { id, text, isUser, timestamp, status, meta }.
 * @see Assistant — API & Data Protocol Reference §6.4
 */
export function mapSnapshotToChatRows(messages) {
    if (!Array.isArray(messages)) return [];
    const rows = [];

    for (const m of messages) {
        const id = m.id || `snap-${rows.length}`;
        const timestamp = m.created_at ? new Date(m.created_at) : new Date();

        // §6.4.1: Text Message (user / assistant / system)
        if (m.role === 'user' && typeof m.content === 'string') {
            rows.push({
                id,
                text: m.content,
                isUser: true,
                timestamp,
                status: 'sent',
                meta: m.metadata || null,
            });
            continue;
        }

        // §6.4.1: Assistant text message
        if (m.role === 'assistant') {
            // Case 1: Assistant with content text
            if (typeof m.content === 'string' && m.content.trim()) {
                rows.push({
                    id,
                    text: m.content,
                    isUser: false,
                    timestamp,
                    status: 'sent',
                    meta: m.metadata || null,
                });
                continue;
            }

            // Case 2: Assistant with toolCalls (§6.4.4)
            if (m.toolCalls && Array.isArray(m.toolCalls) && m.toolCalls.length > 0) {
                // Create a special message for tool calls
                rows.push({
                    id,
                    text: '',
                    isUser: false,
                    timestamp,
                    status: 'sent',
                    meta: {
                        toolCalls: m.toolCalls.map(tc => ({
                            id: tc.id,
                            name: tc.function?.name || tc.name,
                            argsText: tc.function?.arguments || '',
                            resultText: '',
                            is_error: false,
                        })),
                    },
                });
                continue;
            }

            // Empty assistant message - skip
            continue;
        }

        // §6.4.2: Activity messages (thinking, notify, error, tool_call, delegate_agent)
        if (m.role === 'activity') {
            const activityType = m.activityType || m.type;
            const content = m.content || {};

            // Tool call activity
            if (activityType === 'tool_call') {
                const existingRow = rows[rows.length - 1];
                if (existingRow && !existingRow.isUser) {
                    // Append to last assistant message
                    const meta = existingRow.meta || {};
                    const toolCalls = meta.toolCalls || [];
                    toolCalls.push({
                        id: content.tool_call_id,
                        name: content.tool_name,
                        argsText: content.tool_args ? JSON.stringify(content.tool_args) : '',
                        resultText: content.result || '',
                        is_error: content.is_error || false,
                    });
                    existingRow.meta = { ...meta, toolCalls };
                } else {
                    // Create new message for tool call
                    rows.push({
                        id,
                        text: '',
                        isUser: false,
                        timestamp,
                        status: 'sent',
                        meta: {
                            toolCalls: [{
                                id: content.tool_call_id,
                                name: content.tool_name,
                                argsText: content.tool_args ? JSON.stringify(content.tool_args) : '',
                                resultText: content.result || '',
                                is_error: content.is_error || false,
                            }],
                        },
                    });
                }
                continue;
            }

            // Delegate agent activity (§8)
            if (activityType === 'delegate_agent') {
                const existingRow = rows[rows.length - 1];
                if (existingRow && !existingRow.isUser) {
                    const meta = existingRow.meta || {};
                    const delegateLog = meta.delegateLog || [];
                    delegateLog.push({
                        agentName: content.tool_name,
                        status: content.sub_event === 'delegate_result' ? 'completed' : 'running',
                        result: content.result || '',
                    });
                    existingRow.meta = { ...meta, delegateLog };
                }
                continue;
            }

            // Thinking activity
            if (activityType === 'thinking') {
                const thinkingText = content.text || '';
                if (thinkingText) {
                    const existingRow = rows[rows.length - 1];
                    if (existingRow && !existingRow.isUser) {
                        const meta = existingRow.meta || {};
                        meta.thinkingText = (meta.thinkingText || '') + thinkingText;
                        existingRow.meta = meta;
                    }
                }
                continue;
            }

            // Notify / Error activity
            if (activityType === 'notify' || activityType === 'error') {
                rows.push({
                    id,
                    text: content.text || content.message || '',
                    isUser: false,
                    timestamp,
                    status: activityType === 'error' ? 'error' : 'sent',
                    meta: { level: content.level || 'info' },
                });
                continue;
            }
        }

        // §6.4.3: System message
        if (m.role === 'system' && typeof m.content === 'string') {
            rows.push({
                id,
                text: m.content,
                isUser: false,
                timestamp,
                status: 'sent',
                meta: m.metadata || null,
            });
        }
    }

    return rows;
}