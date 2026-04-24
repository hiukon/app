/**
 * Collapse consecutive bot messages per turn to only the last meaningful one.
 * Intermediate agent steps (thinking, retries, planning) are discarded;
 * only the final answer per turn is kept — matching web behaviour.
 */
function collapseAssistantTurns(rows) {
    if (rows.length === 0) return rows;

    const result = [];
    let pending = [];

    const flush = () => {
        if (pending.length === 0) return;

        // Last bot message that has real text content
        const lastText = [...pending].reverse().find(m => m.text?.trim().length > 0);

        if (lastText) {
            // Merge artifacts from ALL messages in this turn
            const artifacts = pending.flatMap(m => m.meta?.artifacts || []);
            // Citations are a { passages, files } object — take from the last message that has them
            const lastWithCitations = [...pending].reverse().find(m => m.meta?.citations);
            const citations = lastWithCitations?.meta?.citations || null;

            // Preserve earlier messages that look like interrupt questions
            // (ends with '?' and short enough to be a question, not a long streaming response)
            for (const msg of pending) {
                if (msg === lastText) break; // stop before the final message
                const t = (msg.text || '').trim();
                if (t.length >= 20 && t.endsWith('?')) {
                    result.push({ ...msg });
                }
            }

            const final = { ...lastText };
            if (artifacts.length || citations) {
                final.meta = {
                    ...(final.meta || {}),
                    ...(artifacts.length ? { artifacts } : {}),
                    ...(citations ? { citations } : {}),
                };
            }
            result.push(final);
        } else {
            // No text — keep last message only if it has artifacts
            const withArtifacts = [...pending].reverse().find(m => m.meta?.artifacts?.length);
            if (withArtifacts) result.push(withArtifacts);
        }

        pending = [];
    };

    for (const row of rows) {
        if (row.isUser) {
            flush();
            result.push(row);
        } else if (row.isInterruptMessage) {
            // Interrupt questions are always kept as standalone items, never collapsed
            flush();
            result.push(row);
        } else {
            pending.push(row);
        }
    }
    flush();

    return result;
}

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
                // Detect interrupt: server sends type="interrupt" or metadata.interrupt_payload
                const interruptPayload = m.metadata?.interrupt_payload || null;
                const isInterrupt = !!(
                    m.type === 'interrupt' ||
                    interruptPayload ||
                    m.metadata?.is_interrupt ||
                    m.metadata?.interrupt_id ||
                    Array.isArray(m.metadata?.options)
                );
                const interruptExtra = isInterrupt ? {
                    interruptData: {
                        id: m.id || m.metadata?.interrupt_id || id,
                        run_id: m.metadata?.run_id || null,
                        original_message_id: m.metadata?.original_message_id || m.original_message_id || null,
                        question: interruptPayload?.question || m.content,
                        options: Array.isArray(interruptPayload?.options) ? interruptPayload.options
                            : (Array.isArray(m.metadata?.options) ? m.metadata.options : []),
                        reason: interruptPayload?.reason || m.metadata?.reason || 'information_gathering',
                    },
                } : {};
                rows.push({
                    id,
                    text: m.content,
                    isUser: false,
                    timestamp,
                    status: 'sent',
                    meta: {
                        ...(m.metadata || {}),
                        ...((m.metadata?.run_id || m.run_id)
                            ? { run_id: m.metadata?.run_id || m.run_id, runId: m.metadata?.run_id || m.run_id }
                            : {}),
                        ...interruptExtra
                    },
                    ...(isInterrupt ? { isInterruptMessage: true } : {}),
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

        // §6.4.3: System message — skip, not user-facing
        if (m.role === 'system') {
            continue;
        }
    }

    // Only show the final answer per bot turn, discarding intermediate steps
    return collapseAssistantTurns(rows);
}
