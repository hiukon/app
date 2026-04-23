import { ChatModel } from '../models/ChatModel';
import DataService from '../services/DataService';
import { USE_AGENT_CHAT, AGENT_API_URL, AGENT_CODE } from '../config/api.config';
import apiClient from '../services/api/apiClient';
import { streamAgentMessage } from '../services/agent/streamAgentMessage';
import { mapSnapshotToChatRows } from '../services/agent/snapshotMessages';
import AgentApiService from '../services/agent/AgentApiService';
import AuthService from '../services/AuthService';
import AsyncStorage from '@react-native-async-storage/async-storage';

function isLikelyAuthFailure(status, msg) {
    if (status === 401 || status === 403) return true;
    const t = `${msg || ''}`.toLowerCase();
    return /unauthoriz|token|expired|invalid|hết hạn|jwt|bearer/i.test(t);
}

function randomUuid() {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
    });
}

function readEventText(ev) {
    return (
        ev?.delta ??
        ev?.text ??
        ev?.content ??
        ev?.result ??
        ev?.data?.delta ??
        ev?.data?.text ??
        ev?.data?.content ??
        ev?.data?.result ??
        ev?.data?.message ??
        ''
    );
}

function extractInterruptAnswerText(payload, fallback = '') {
    const selected = Array.isArray(payload?.selected) ? payload.selected.filter(Boolean) : [];
    const custom = `${payload?.custom || ''}`.trim();
    const answer = `${payload?.answer || ''}`.trim();
    return (
        selected.join(', ').trim() ||
        custom ||
        answer ||
        `${fallback || ''}`.trim()
    );
}

function resolvedAgentCode() {
    return AGENT_CODE || 'default';
}

function defaultViewingContext() {
    return {
        viewing: {
            type: 'canvas',
            object: 'active session',
            context: 'empty',
        },
    };
}

class ChatController {
    constructor() {
        this.chatModel = new ChatModel();
        this.ensureWelcomeMessage();
        this.conversationId = null;
        this.runId = null;
        this.pendingInterrupt = null;
        this._streamAbort = null;
        this._epoch = 0;
        this._lastEventAt = 0;
        this._watchdogTimer = null;
        this._runActive = false;
        this._toolCalls = new Map();
        this._currentAssistantId = null;
        this._resumeInterruptContext = null;
        this._bgStreams = new Map();
    }

    _cleanupEmptyStreamingAssistants() {
        const rows = this.chatModel.getMessages();
        const removeIds = rows
            .filter((m) => !m.isUser && m.status === 'streaming' && !`${m.text || ''}`.trim())
            .map((m) => m.id);
        removeIds.forEach((id) => this.chatModel.removeMessage(id));
        if (this._currentAssistantId && removeIds.includes(this._currentAssistantId)) {
            this._currentAssistantId = null;
        }
    }

    // Called after _streamAgent resolves/rejects to ensure no streaming placeholder is left
    // visible when the server didn't send RUN_FINISHED or TEXT_MESSAGE_END.
    _finalizeStreamingState(onMessagesUpdate) {
        if (this._currentAssistantId) {
            const cur = this.chatModel.getMessages().find((m) => m.id === this._currentAssistantId);
            if (cur) {
                if (`${cur.text || ''}`.trim()) {
                    this.chatModel.updateMessage(this._currentAssistantId, { status: 'sent' });
                } else {
                    this.chatModel.removeMessage(this._currentAssistantId);
                }
            }
            this._currentAssistantId = null;
        }
        this._cleanupEmptyStreamingAssistants();
        // Only clear run state if RUN_FINISHED was never received (still marked active)
        if (this._runActive) {
            this._runActive = false;
            this.pendingInterrupt = null;
        }
        onMessagesUpdate?.();
    }

    // After loading a snapshot into chatModel, set answered/pending state for each interrupt message.
    // If there is any response (user or bot) after the interrupt → mark it answered (client-side flag).
    // If no response follows → treat it as still pending and restore pendingInterrupt.
    _applyInterruptStateFromRows(rows) {
        this.pendingInterrupt = null;
        for (let i = 0; i < rows.length; i++) {
            if (!rows[i].isInterruptMessage) continue;
            const hasAnswerAfter = rows.slice(i + 1).some(
                r => r.isUser || (!r.isUser && !r.isInterruptMessage && `${r.text || ''}`.trim())
            );
            const msg = this.chatModel.getMessages().find(m => m.id === rows[i].id);
            if (hasAnswerAfter) {
                if (msg) this.chatModel.updateMessage(rows[i].id, { meta: { ...(msg.meta || {}), answered: true } });
            } else if (rows[i].meta?.interruptData) {
                this.pendingInterrupt = rows[i].meta.interruptData;
                if (rows[i].meta.interruptData.run_id) this.runId = rows[i].meta.interruptData.run_id;
            }
        }
    }

    _mergeInterruptIntoSnapshot(rows) {
        const ctx = this._resumeInterruptContext;
        if (!ctx) return rows;

        const result = [...rows];

        const toInsert = [];
        for (const im of (ctx.interruptMsgs || [])) {
            const existingIdx = result.findIndex(r => !r.isUser && r.text === im.text);
            if (existingIdx >= 0) {
                // Merge our meta (including answered flag) into the snapshot row
                result[existingIdx] = {
                    ...result[existingIdx],
                    isInterruptMessage: true,
                    meta: { ...result[existingIdx].meta, ...im.meta },
                };
            } else {
                toInsert.push({ ...im });
            }
        }
        if (ctx.selectionMsg) {
            const alreadyIn = result.some(r => r.isUser && r.text === ctx.selectionMsg.text);
            if (!alreadyIn) toInsert.push({ ...ctx.selectionMsg });
        }
        if (toInsert.length === 0) return result;

        const lastBotIdx = result.reduce((acc, r, i) => (r.isUser ? acc : i), -1);
        const insertAt = lastBotIdx >= 0 ? lastBotIdx : result.length;
        result.splice(insertAt, 0, ...toInsert);
        return result;
    }

    _ensureStreamingPlaceholder() {
        if (this._currentAssistantId) return this._currentAssistantId;
        const model = this.chatModel.addMessage({
            text: '',
            isUser: false,
            status: 'streaming',
        });
        this._currentAssistantId = model.id;
        return model.id;
    }

    ensureWelcomeMessage() {
        if (this.chatModel.getMessages().length === 0) {
            this.chatModel.addMessage({
                text: 'Xin chào! Tôi có thể giúp gì cho bạn?',
                isUser: false,
            });
        }
    }

    _agentBaseUrl() {
        return (AGENT_API_URL || '').replace(/\/$/, '');
    }

    _bumpEpoch() {
        this._epoch += 1;
        return this._epoch;
    }

    _touchEvent() {
        this._lastEventAt = Date.now();
    }

    _clearWatchdog() {
        if (this._watchdogTimer) {
            clearInterval(this._watchdogTimer);
            this._watchdogTimer = null;
        }
    }

    _startWatchdog(epoch, onReconnect) {
        this._clearWatchdog();
        this._watchdogTimer = setInterval(() => {
            if (this._epoch !== epoch) return;
            if (!this._runActive) return;
            if (!this._lastEventAt) return;
            if (Date.now() - this._lastEventAt <= 60_000) return;
            onReconnect?.();
        }, 5_000);
    }

    async _sleep(ms) {
        return new Promise((r) => setTimeout(r, ms));
    }

    async _reconnectWithBackoff(epoch, onMessagesUpdate) {
        if (!USE_AGENT_CHAT) return;
        if (!this.conversationId) return;
        if (this._epoch !== epoch) return;
        if (!this._runActive) return;

        const token = apiClient.getAuthToken();
        if (!token) return;

        let attempt = 0;
        const maxAttempts = 10;

        while (attempt < maxAttempts) {
            if (this._epoch !== epoch) return;
            if (!this._runActive) return;
            const delay = Math.min(500 * 2 ** attempt, 30_000);
            await this._sleep(delay);
            if (this._epoch !== epoch) return;
            if (!this._runActive) return;

            try {
                await this._streamAgent({
                    epoch,
                    token,
                    body: this._buildJoinBody(),
                    onMessagesUpdate,
                    allowReconnect: false,
                    onSnapshot: (list) => {
                        const rows = this._mergeInterruptIntoSnapshot(mapSnapshotToChatRows(list));
                        this.chatModel.clearMessages();
                        rows.forEach((r) => this.chatModel.addMessage(r));
                        onMessagesUpdate?.();
                    },
                });
                return;
            } catch {
                attempt += 1;
            }
        }
    }

    _buildJoinBody() {
        return {
            conversation_id: this.conversationId,
            agent_type: "single",
        };
    }

    async _streamAgent({
        epoch,
        token,
        body,
        customUrl,
        onMessagesUpdate,
        allowReconnect,
        onSnapshot,
        onBeforeEvent,
        onAfterEvent,
        customOptions = {},
    }) {
        if (this._streamAbort) this._streamAbort.abort();
        const ac = new AbortController();
        this._streamAbort = ac;

        this._touchEvent();
        this._startWatchdog(epoch, () => {
            if (this._streamAbort) this._streamAbort.abort();
            this._reconnectWithBackoff(epoch, onMessagesUpdate);
        });

        const url = customUrl || `${this._agentBaseUrl()}/api/v1/messages`;

        try {
            await streamAgentMessage({
                url,
                token,
                body,
                signal: ac.signal,
                onEvent: (ev) => {
                    if (this._epoch !== epoch) {
                        if (this._bgStreams.has(epoch)) {
                            this._handleBgAgentEvent(ev, epoch);
                        }
                        return;
                    }
                    this._touchEvent();
                    onBeforeEvent?.(ev);
                    this._handleAgentEvent(ev, {
                        onMessagesUpdate,
                        onSnapshot,
                    });
                    onAfterEvent?.(ev);
                },
                ...customOptions,
            });
        } catch (e) {
            if (e.message === 'Aborted') throw e;
            if (isLikelyAuthFailure(e.status, e.message)) {
                const refreshed = await AuthService.refreshAccessToken();
                if (refreshed.success) {
                    const nextToken = apiClient.getAuthToken();
                    if (nextToken) {
                        await this._streamAgent({
                            epoch,
                            token: nextToken,
                            body,
                            customUrl,
                            onMessagesUpdate,
                            allowReconnect,
                            onSnapshot,
                            onBeforeEvent,
                            onAfterEvent,
                        });
                        return;
                    }
                }
            }
            if (allowReconnect && this._epoch === epoch && this._runActive && this.conversationId) {
                await this._reconnectWithBackoff(epoch, onMessagesUpdate);
                return;
            }
            throw e;
        } finally {
            if (this._epoch === epoch) this._clearWatchdog();
            // Only clear if it's still our own AbortController (bg streams must not clobber the new stream's ref)
            if (this._streamAbort === ac) this._streamAbort = null;
        }
    }

    // Bump this when message mapping logic changes to invalidate stale caches
    static CACHE_VERSION = 'v5';

    async _saveConversationToCache() {
        if (!this.conversationId) return;
        try {
            const messages = this.chatModel.getMessages();
            if (messages.length === 0) return;
            const key = `conv_${ChatController.CACHE_VERSION}_${this.conversationId}`;
            const cacheData = {
                messages,
                pendingInterrupt: this.pendingInterrupt || null,
                runId: this.runId || null,
                conversationId: this.conversationId || null,
            };
            // DEBUG
            const interruptMsgs = messages.filter(m => m.isInterruptMessage);
            if (interruptMsgs.length > 0) {
                console.log('💾 SAVE CACHE - Interrupt messages:', {
                    total: messages.length,
                    interruptCount: interruptMsgs.length,
                    interruptMsgs: interruptMsgs.map(m => ({
                        id: m.id,
                        text: m.text?.substring(0, 50),
                        hasMeta: !!m.meta,
                        metaKeys: m.meta ? Object.keys(m.meta) : [],
                    })),
                });
            }
            await AsyncStorage.setItem(key, JSON.stringify(cacheData));
        } catch (error) {
            console.error('Cache error:', error);
        }
    }

    async _loadConversationFromCache(conversationId) {
        try {
            const key = `conv_${ChatController.CACHE_VERSION}_${conversationId}`;
            const cached = await AsyncStorage.getItem(key);
            if (cached) {
                const cacheData = JSON.parse(cached);
                const messages = Array.isArray(cacheData) ? cacheData : (cacheData.messages || []);
                // DEBUG
                const interruptMsgs = messages.filter(m => m.isInterruptMessage);
                if (interruptMsgs.length > 0) {
                    console.log('📂 LOAD CACHE - Interrupt messages:', {
                        total: messages.length,
                        interruptCount: interruptMsgs.length,
                        interruptMsgs: interruptMsgs.map(m => ({
                            id: m.id,
                            text: m.text?.substring(0, 50),
                            hasMeta: !!m.meta,
                            metaKeys: m.meta ? Object.keys(m.meta) : [],
                        })),
                    });
                }
                this.chatModel.clearMessages();
                messages.forEach(msg => this.chatModel.addMessage(msg));

                // ✅ Restore runId từ cache
                this.runId = cacheData.runId || null;

                // ✅ Restore pendingInterrupt từ cache hoặc tái tạo từ interrupt message metadata
                if (cacheData.pendingInterrupt !== undefined) {
                    this.pendingInterrupt = cacheData.pendingInterrupt;
                } else {
                    // Tìm interrupt message và tái tạo pendingInterrupt từ meta.interruptData
                    const interruptMsg = messages.find(m => m.isInterruptMessage);
                    if (interruptMsg && interruptMsg.meta?.interruptData) {
                        this.pendingInterrupt = interruptMsg.meta.interruptData;
                    } else {
                        this.pendingInterrupt = null;
                    }
                }
                return true;
            }
        } catch (error) {
            console.error('Load cache error:', error);
        }
        return false;
    }

    async joinConversation(onMessagesUpdate) {
        if (!USE_AGENT_CHAT) {
            return { messages: this.chatModel.getMessages() };
        }

        const token = apiClient.getAuthToken();
        if (!token) {
            return { messages: this.chatModel.getMessages(), error: 'Chưa đăng nhập (token).' };
        }

        if (!this.conversationId) {
            return { messages: this.chatModel.getMessages(), error: 'Chưa có conversation_id.' };
        }

        const cached = await this._loadConversationFromCache(this.conversationId);
        if (cached) {
            onMessagesUpdate?.();
            return { messages: this.chatModel.getMessages() };
        }

        const epoch = this._bumpEpoch();

        try {
            await this._streamAgent({
                epoch,
                token,
                body: {
                    conversation_id: this.conversationId,
                    message: "",
                    agent_type: "single",
                },
                onMessagesUpdate,
                allowReconnect: true,
                onSnapshot: (list) => {
                    if (list && list.length > 0) {
                        const rows = mapSnapshotToChatRows(list);
                        this.chatModel.clearMessages();
                        rows.forEach((r) => this.chatModel.addMessage(r));
                        this._applyInterruptStateFromRows(rows);
                        this._saveConversationToCache();
                    } else {
                        this.chatModel.clearMessages();
                        this.ensureWelcomeMessage();
                    }
                    onMessagesUpdate?.();
                },
            });
        } catch (error) {
            console.error('Join error:', error);
            this.chatModel.clearMessages();
            this.ensureWelcomeMessage();
            onMessagesUpdate?.();
        }

        return { messages: this.chatModel.getMessages() };
    }

    _handleAgentEvent(ev, ctx) {
        const { onMessagesUpdate, onSnapshot } = ctx || {};

        switch (ev.type) {
            case 'RUN_STARTED':
                if (ev.thread_id) this.conversationId = ev.thread_id;
                if (ev.run_id) this.runId = ev.run_id;
                this._runActive = true;
                this._currentAssistantId = null;
                break;

            case 'STATE_SNAPSHOT': {
                const run = ev.data?.run;
                if (run?.id) this.runId = run.id;
                const state = run?.state;
                this._runActive = state === 'running' || state === 'pending' || state === 'interrupted';
                break;
            }

            case 'STATE_DELTA': {
                const run = ev.data?.run;
                const state = run?.state;
                if (state) {
                    this._runActive = state === 'running' || state === 'pending' || state === 'interrupted';
                }
                break;
            }

            case 'TEXT_MESSAGE_START':
                this._ensureStreamingPlaceholder();
                onMessagesUpdate?.();
                break;

            case 'TEXT_MESSAGE_CONTENT': {
                if (ev.is_from_sub_run) {
                    const piece = readEventText(ev);
                    if (piece && ev.tool_call_id) {
                        const tc = this._toolCalls.get(ev.tool_call_id);
                        if (tc) {
                            const newResult = (tc.resultText || '') + piece;
                            this._toolCalls.set(ev.tool_call_id, { ...tc, resultText: newResult });
                            this._syncDelegateToLastAssistant(ev.tool_call_id, onMessagesUpdate);
                        }
                    }
                    break;
                }
                const piece = readEventText(ev);
                if (!piece) break;

                // ✅ LỌC CHUNK LOG
                const lowerPiece = piece.toLowerCase();
                const isLogChunk =
                    lowerPiece.includes('người dùng muốn biết') ||
                    lowerPiece.includes('tìm kiếm thông tin') ||
                    lowerPiece.includes('tìm kiếm kỹ năng') ||
                    lowerPiece.includes('observe the result') ||
                    lowerPiece.includes('dựa trên kết quả') ||
                    lowerPiece.includes('theo hướng dẫn') ||
                    lowerPiece.includes('tôi sẽ tổng hợp') ||
                    lowerPiece.includes('tôi cần tìm kiếm') ||
                    /^\d{1,2}:\d{2}:\d{2}\s*(am|pm)/i.test(lowerPiece);

                if (isLogChunk) {
                    break;
                }

                this._ensureStreamingPlaceholder();
                const cur = this.chatModel.getMessages().find((m) => m.id === this._currentAssistantId);
                const currentText = `${cur?.text || ''}${piece}`;

                this.chatModel.updateMessage(this._currentAssistantId, {
                    text: currentText,
                    status: 'streaming',
                });
                onMessagesUpdate?.();
                break;
            }

            case 'TEXT_MESSAGE_END': {
                const finalText = `${readEventText(ev) || ''}`.trim();
                if (!this._currentAssistantId) {
                    if (!finalText) break;
                    const model = this.chatModel.addMessage({
                        text: finalText,
                        isUser: false,
                        status: 'sent',
                    });
                    this._currentAssistantId = model.id;
                } else {
                    const cur = this.chatModel.getMessages().find((m) => m.id === this._currentAssistantId);
                    const nextText = `${cur?.text || ''}${finalText || ''}`.trim();
                    if (nextText) {
                        this.chatModel.updateMessage(this._currentAssistantId, {
                            text: nextText,
                            status: 'sent',
                        });
                    } else {
                        this.chatModel.removeMessage(this._currentAssistantId);
                    }
                }
                this._currentAssistantId = null;
                this._cleanupEmptyStreamingAssistants();
                this._saveConversationToCache();
                onMessagesUpdate?.();
                break;
            }

            case 'TEXT_MESSAGE': {
                const txt = `${readEventText(ev) || ''}`.trim();
                if (!txt) break;
                this.chatModel.addMessage({
                    text: txt,
                    isUser: false,
                    status: 'sent',
                });
                this._currentAssistantId = null;
                this._cleanupEmptyStreamingAssistants();
                onMessagesUpdate?.();
                break;
            }

            case 'THINKING_TEXT_MESSAGE_CONTENT': {
                break;
            }

            case 'TOOL_CALL_START': {
                const id = ev.tool_call_id || ev.toolCallId || ev.data?.tool_call_id;
                const name = ev.tool_name || ev.toolName || ev.data?.tool_name;
                if (!id) break;
                this._toolCalls.set(id, { id, name, argsText: '', resultText: '', is_error: false });
                this._syncToolCallToLastAssistant(id, onMessagesUpdate);
                break;
            }

            case 'TOOL_CALL_ARGS': {
                const id = ev.tool_call_id || ev.toolCallId || ev.data?.tool_call_id;
                const tc = id ? this._toolCalls.get(id) : null;
                if (!tc) break;
                const piece = readEventText(ev);
                this._toolCalls.set(id, { ...tc, argsText: `${tc.argsText || ''}${piece}` });
                this._syncToolCallToLastAssistant(id, onMessagesUpdate);
                break;
            }

            case 'TOOL_CALL_RESULT': {
                const id = ev.tool_call_id || ev.toolCallId || ev.data?.tool_call_id;
                const tc = id ? this._toolCalls.get(id) : null;
                if (!tc) break;
                const resultText = ev.result != null ? String(ev.result) : tc.resultText || '';
                this._toolCalls.set(id, { ...tc, resultText, is_error: !!ev.is_error });
                this._syncToolCallToLastAssistant(id, onMessagesUpdate);
                break;
            }

            case 'TOOL_CALL_END': {
                const id = ev.tool_call_id || ev.toolCallId || ev.data?.tool_call_id;
                if (!id) break;
                this._syncToolCallToLastAssistant(id, onMessagesUpdate);
                break;
            }

            case 'DELEGATE_AGENT_START': {
                const id = ev.tool_call_id || ev.toolCallId;
                const name = ev.tool_name || ev.toolName || ev.agent;
                if (!id) break;
                this._toolCalls.set(id, { id, name, type: 'delegate', argsText: '', resultText: '', is_error: false });
                this._syncDelegateToLastAssistant(id, onMessagesUpdate);
                break;
            }

            case 'DELEGATE_AGENT_RESULT': {
                const id = ev.tool_call_id || ev.toolCallId;
                const tc = id ? this._toolCalls.get(id) : null;
                if (!tc) break;
                const resultText = ev.result != null ? String(ev.result) : tc.resultText || '';
                this._toolCalls.set(id, { ...tc, resultText, is_error: !!ev.is_error });
                this._syncDelegateToLastAssistant(id, onMessagesUpdate);
                break;
            }

            case 'DELEGATE_AGENT_END': {
                const id = ev.tool_call_id || ev.toolCallId;
                if (!id) break;
                const tc = this._toolCalls.get(id);
                if (tc) {
                    tc.status = 'completed';
                    this._toolCalls.set(id, tc);
                    this._syncDelegateToLastAssistant(id, onMessagesUpdate);
                }
                break;
            }

            case 'THINKING_ARTIFACTS':
            case 'TEXT_MESSAGE_ARTIFACTS': {
                const artifacts = ev.artifacts || ev.data?.artifacts;
                if (!Array.isArray(artifacts) || artifacts.length === 0) break;
                const rows = this.chatModel.getMessages();
                const last = rows.slice().reverse().find((m) => !m.isUser);
                if (!last) break;
                const meta = last.meta || {};
                const list = Array.isArray(meta.artifacts) ? meta.artifacts.slice() : [];
                const token = apiClient.getAuthToken();
                for (const a of artifacts) {
                    const base = { ...a };
                    if (!base.url && this.conversationId && base.type && base.name && base.content) {
                        base.url = AgentApiService.buildArtifactGetUrl(this.conversationId, base);
                    }
                    list.push(base);
                    if (token && this.conversationId && base.type && base.name && base.content) {
                        AgentApiService.artifactSignedUrl(token, this.conversationId, base)
                            .then((resp) => {
                                const signed = resp?.data?.url || resp?.data?.signed_url || resp?.data?.signedUrl;
                                if (!signed) return;
                                const now = this.chatModel.getMessages();
                                const cur = now.find((m) => m.id === last.id);
                                if (!cur) return;
                                const curMeta = cur.meta || {};
                                const curList = Array.isArray(curMeta.artifacts) ? curMeta.artifacts.slice() : [];
                                const idx = curList.findIndex((x) => x.name === base.name && x.content === base.content);
                                if (idx >= 0) curList[idx] = { ...curList[idx], url: signed };
                                this.chatModel.updateMessage(last.id, {
                                    meta: { ...curMeta, artifacts: curList },
                                });
                                onMessagesUpdate?.();
                            })
                            .catch(() => { });
                    }
                }
                this.chatModel.updateMessage(last.id, { meta: { ...meta, artifacts: list } });
                onMessagesUpdate?.();
                break;
            }

            case 'MESSAGES_SNAPSHOT': {
                const list = ev.data?.messages;
                if (list?.length) {
                    if (typeof onSnapshot === 'function') {
                        onSnapshot(list);
                    } else {
                        const rows = mapSnapshotToChatRows(list);
                        this.chatModel.clearMessages();
                        rows.forEach((r) => this.chatModel.addMessage(r));
                        onMessagesUpdate?.();
                    }
                }
                break;
            }

            case 'RUN_FINISHED':
                console.log('RUN_FINISHED event:', {
                    outcome: ev.outcome,
                    hasInterrupt: !!ev.interrupt,
                    hasArtifacts: ev.artifacts?.length,
                    hasCitations: ev.metadata?.citations?.length,
                    textLength: readEventText(ev).length,
                    runId: this.runId
                });

                this._runActive = false;

                // ==================== XỬ LÝ INTERRUPT ====================
                if (ev.outcome === 'interrupt') {
                    // Clean up any in-progress streaming message
                    if (this._currentAssistantId) {
                        const cur = this.chatModel.getMessages().find(m => m.id === this._currentAssistantId);
                        if (cur && `${cur.text || ''}`.trim()) {
                            this.chatModel.updateMessage(this._currentAssistantId, { status: 'sent' });
                        } else if (cur) {
                            this.chatModel.removeMessage(this._currentAssistantId);
                        }
                        this._currentAssistantId = null;
                    }

                    if (ev.interrupt && !this.pendingInterrupt) {
                        // HITL_INTERRUPT_MESSAGE didn't fire — handle interrupt here
                        if (!ev.interrupt.question && !ev.interrupt.options) {
                            ev.interrupt.question = 'Vui lòng cung cấp thông tin:';
                        }
                        this.pendingInterrupt = ev.interrupt;
                        // ✅ Cập nhật runId từ interrupt.run_id
                        if (ev.interrupt.run_id) {
                            this.runId = ev.interrupt.run_id;
                        }
                        const q = ev.interrupt.question || 'Cần xác nhận từ bạn.';
                        this.chatModel.addMessage({ text: q, isUser: false, status: 'sent', isInterruptMessage: true });
                        this._saveConversationToCache();
                    }
                    // else: HITL_INTERRUPT_MESSAGE already set pendingInterrupt and added the question message
                }
                // ==================== XỬ LÝ RUN THÀNH CÔNG ====================
                else {
                    this.pendingInterrupt = null;

                    // Xử lý message hiện tại
                    if (this._currentAssistantId) {
                        const cur = this.chatModel.getMessages().find((m) => m.id === this._currentAssistantId);
                        const fallbackText = readEventText(ev);
                        let rawText = `${cur?.text || ''}`.trim() || `${fallbackText || ''}`.trim();

                        // Lọc bỏ log kỹ thuật nhưng giữ nội dung báo cáo
                        const excludePatterns = [
                            'tìm kiếm kỹ năng', 'observe the result', 'người dùng muốn biết',
                            'tìm kiếm thông tin', 'tôi cần tìm kiếm', 'tôi đã tìm kiếm',
                            'sau khi tìm kiếm', 'tôi sẽ tổng hợp', 'dựa trên kết quả',
                            'theo hướng dẫn', 'để tôi thử lại', 'tôi đã trả về phản hồi không hợp lệ',
                            '🔍', '📢', 'cortex',
                        ];
                        const lines = rawText.split('\n');
                        const filteredLines = lines.filter(line => {
                            const trimmed = line.trim();
                            if (!trimmed) return true; // giữ dòng trống để giữ paragraph break
                            const lower = trimmed.toLowerCase();
                            if (excludePatterns.some(p => lower.includes(p))) return false;
                            if (/^\d{1,2}:\d{2}:\d{2}\s*(am|pm)?$/i.test(lower)) return false;
                            return true;
                        });

                        let safeText = filteredLines.join('\n').replace(/\n{3,}/g, '\n\n').trim();

                        // Nếu sau khi lọc không còn gì, giữ lại raw text gốc
                        if (!safeText && rawText.length > 0) {
                            safeText = rawText.replace(/\d{1,2}:\d{2}:\d{2}\s*(AM|PM)/gi, '').trim();
                        }

                        // Lấy artifacts từ event
                        const artifacts = ev.artifacts || [];
                        const hasArtifacts = artifacts.length > 0;

                        // Lấy citations từ metadata nếu có
                        const citations = ev.metadata?.citations || [];
                        const hasCitations = citations.length > 0;

                        if (safeText) {
                            const updateData = {
                                status: 'sent',
                                text: safeText,
                            };

                            // Thêm meta nếu có artifacts hoặc citations
                            if (hasArtifacts || hasCitations) {
                                updateData.meta = {};
                                if (hasArtifacts) {
                                    updateData.meta.artifacts = artifacts;
                                }
                                if (hasCitations) {
                                    updateData.meta.citations = citations;
                                }
                            }

                            this.chatModel.updateMessage(this._currentAssistantId, updateData);
                        } else if (hasArtifacts) {
                            this.chatModel.updateMessage(this._currentAssistantId, {
                                status: 'sent',
                                text: '📎 Đã nhận được file đính kèm.',
                                meta: { artifacts }
                            });
                        } else {
                            this.chatModel.removeMessage(this._currentAssistantId);
                        }
                        this._currentAssistantId = null;
                    }

                    // Kiểm tra có message assistant nào có text không
                    const hasAssistantText = this.chatModel.getMessages().some(
                        (m) => !m.isUser && `${m.text || ''}`.trim().length > 0
                    );

                    if (!hasAssistantText) {
                        const hasAnyArtifact = this.chatModel.getMessages().some(
                            (m) => !m.isUser && m.meta?.artifacts?.length > 0
                        );

                        if (!hasAnyArtifact) {
                            this.chatModel.addMessage({
                                text: 'Xin lỗi, không nhận được câu trả lời từ hệ thống. Vui lòng thử lại.',
                                isUser: false,
                                status: 'error',
                            });
                        }
                    }

                    // ==================== FETCH CITATIONS & ARTIFACTS ====================
                    const token = apiClient.getAuthToken();
                    const last = this.chatModel.getMessages().slice().reverse().find((m) => !m.isUser);

                    if (token && this.runId && last) {
                        const hasExistingCitations = last.meta?.citations?.passages?.length > 0;
                        const hasExistingArtifacts = last.meta?.artifacts?.length > 0;

                        // Fetch artifacts nếu chưa có
                        if (!hasExistingArtifacts) {
                            AgentApiService.fetchArtifacts(token, this.runId)
                                .then((resp) => {
                                    const artifacts = resp?.data?.artifacts || resp?.data || [];
                                    if (artifacts.length > 0) {
                                        const now = this.chatModel.getMessages();
                                        const cur = now.find((m) => m.id === last.id);
                                        if (cur) {
                                            const curMeta = cur.meta || {};
                                            this.chatModel.updateMessage(last.id, {
                                                meta: {
                                                    ...curMeta,
                                                    artifacts: artifacts.map(art => ({
                                                        ...art,
                                                        url: art.url || art.signed_url || null,
                                                    })),
                                                },
                                            });
                                            onMessagesUpdate?.();
                                        }
                                    }
                                })
                                .catch(() => { /* 404 = run không có artifacts, bình thường */ });
                        }

                        // Fetch citations nếu chưa có
                        if (!hasExistingCitations) {
                            AgentApiService.fetchCitations(token, this.runId)
                                .then((resp) => {
                                    // API returns { passages: [...], files: [...] }
                                    const citationsData = resp?.data;
                                    if (!citationsData?.passages?.length) return;
                                    const now = this.chatModel.getMessages();
                                    const cur = now.find((m) => m.id === last.id);
                                    if (!cur) return;
                                    const curMeta = cur.meta || {};
                                    this.chatModel.updateMessage(last.id, {
                                        meta: { ...curMeta, citations: citationsData },
                                    });
                                    // Save cache AFTER citations are populated
                                    this._saveConversationToCache();
                                    onMessagesUpdate?.();
                                })
                                .catch(() => { /* 404 = run không có citations, bình thường */ });
                        }
                    }

                    this._saveConversationToCache();
                }

                this._cleanupEmptyStreamingAssistants();
                onMessagesUpdate?.();
                break;
            case 'RUN_ERROR':
            case 'ERROR': {
                const errText = ev.result || ev.text || ev.data?.message || 'Đã xảy ra lỗi.';
                console.log('❌ SERVER ERROR EVENT:', JSON.stringify(ev, null, 2));
                this._runActive = false;
                this._currentAssistantId = null;
                this._cleanupEmptyStreamingAssistants();
                this.chatModel.addMessage({
                    text: errText,
                    isUser: false,
                    status: 'error',
                });
                onMessagesUpdate?.();
                break;
            }
            case 'HITL_INTERRUPT_MESSAGE': {
                console.log('HITL_INTERRUPT_MESSAGE:', JSON.stringify(ev, null, 2));

                const interruptData = ev.interrupt || ev.data || {
                    id: ev.interrupt_id,
                    run_id: ev.run_id,
                    question: ev.text || ev.data?.text || 'Cần xác nhận từ bạn.',
                    options: ev.options || ev.data?.options || [],
                    reason: ev.reason || 'information_gathering',
                };

                // Preserve options from RUN_FINISHED if this event has none
                const newOptions = interruptData.options || [];
                if (newOptions.length === 0 && this.pendingInterrupt?.options?.length > 0) {
                    interruptData.options = this.pendingInterrupt.options;
                }
                if (!interruptData.question && this.pendingInterrupt?.question) {
                    interruptData.question = this.pendingInterrupt.question;
                }

                this.pendingInterrupt = interruptData;
                // ✅ Cập nhật runId từ interruptData.run_id (từ HITL_INTERRUPT_MESSAGE)
                if (interruptData.run_id) {
                    this.runId = interruptData.run_id;
                }

                // Finalize any in-progress streaming message before adding interrupt question
                if (this._currentAssistantId) {
                    const cur = this.chatModel.getMessages().find(m => m.id === this._currentAssistantId);
                    if (cur && `${cur.text || ''}`.trim()) {
                        this.chatModel.updateMessage(this._currentAssistantId, { status: 'sent' });
                    } else if (cur) {
                        this.chatModel.removeMessage(this._currentAssistantId);
                    }
                    this._currentAssistantId = null;
                }

                // Attach interrupt to the last TEXT_MESSAGE if it already ends with '?'
                // (the bot already embedded the question in its response — no need for a duplicate bubble)
                const existingMsgs = this.chatModel.getMessages();
                const lastBotMsg = existingMsgs.slice().reverse().find(m => !m.isUser);
                const lastBotText = (lastBotMsg?.text || '').trim();
                if (lastBotMsg && !lastBotMsg.isInterruptMessage && lastBotText.endsWith('?')) {
                    this.chatModel.updateMessage(lastBotMsg.id, {
                        isInterruptMessage: true,
                        meta: { ...lastBotMsg.meta, interruptData }
                    });
                } else {
                    const q = interruptData.question || 'Cần xác nhận từ bạn.';
                    if (!lastBotMsg?.isInterruptMessage || lastBotMsg.text !== q) {
                        this.chatModel.addMessage({
                            text: q,
                            isUser: false,
                            status: 'sent',
                            isInterruptMessage: true,
                            meta: { interruptData }
                        });
                    }
                }
                this._saveConversationToCache();
                onMessagesUpdate?.();
                break;
            }

            case 'HITL_ANSWER_RECEIVED': {
                this._hitlAnswerReceived = true;
                this.pendingInterrupt = null;

                const interruptPayload = ev.interrupt?.payload || ev.data?.payload || {};
                const answerText = extractInterruptAnswerText(interruptPayload, readEventText(ev));

                if (answerText) {
                    const rows = this.chatModel.getMessages();
                    const existingSelection = [...rows].reverse().find((m) => m.isUser && m.isInterruptSelection);
                    if (existingSelection) {
                        this.chatModel.updateMessage(existingSelection.id, {
                            text: answerText,
                            meta: { ...(existingSelection.meta || {}), serverConfirmed: true },
                        });
                    } else {
                        this.chatModel.addMessage({
                            text: answerText,
                            isUser: true,
                            isInterruptSelection: true,
                            meta: { serverConfirmed: true },
                        });
                    }
                }

                for (const im of this.chatModel.getMessages().filter(m => m.isInterruptMessage)) {
                    this.chatModel.updateMessage(im.id, { meta: { ...(im.meta || {}), answered: true } });
                }

                this._saveConversationToCache();
                onMessagesUpdate?.();
                break;
            }

            case 'USER_CANCELLED':
                this._runActive = false;
                this._currentAssistantId = null;
                this._cleanupEmptyStreamingAssistants();
                onMessagesUpdate?.();
                break;

            default:
                if (/TEXT/i.test(ev.type)) {
                    const txt = `${readEventText(ev) || ''}`.trim();
                    if (txt) {
                        this.chatModel.addMessage({
                            text: txt,
                            isUser: false,
                            status: 'sent',
                        });
                        onMessagesUpdate?.();
                    }
                }
                break;
        }
    }

    _syncDelegateToLastAssistant(toolCallId, onMessagesUpdate) {
        const tc = this._toolCalls.get(toolCallId);
        if (!tc) return;
        const rows = this.chatModel.getMessages();
        const last = rows.slice().reverse().find((m) => !m.isUser);
        if (!last) return;
        const meta = last.meta || {};
        const list = Array.isArray(meta.delegateLog) ? meta.delegateLog.slice() : [];
        const idx = list.findIndex((x) => x.id === toolCallId);
        if (idx >= 0) list[idx] = { ...list[idx], ...tc };
        else list.push({ ...tc, status: tc.status || 'running' });
        this.chatModel.updateMessage(last.id, { meta: { ...meta, delegateLog: list } });
        onMessagesUpdate?.();
    }

    _syncToolCallToLastAssistant(toolCallId, onMessagesUpdate) {
        const tc = this._toolCalls.get(toolCallId);
        if (!tc) return;
        const rows = this.chatModel.getMessages();
        const last = rows.slice().reverse().find((m) => !m.isUser);
        if (!last) return;
        const meta = last.meta || {};
        const list = Array.isArray(meta.toolCalls) ? meta.toolCalls.slice() : [];
        const idx = list.findIndex((x) => x.id === toolCallId);
        if (idx >= 0) list[idx] = { ...list[idx], ...tc };
        else list.push(tc);
        this.chatModel.updateMessage(last.id, { meta: { ...meta, toolCalls: list } });
        onMessagesUpdate?.();
    }

    async sendUserMessage(text, onMessagesUpdate, options = {}) {
        if (!USE_AGENT_CHAT) {
            return this._sendUserMessageLegacy(text, onMessagesUpdate);
        }

        const token = apiClient.getAuthToken();
        if (!token) {
            this.chatModel.addMessage({
                text: 'Cần đăng nhập để dùng chat Agent (Bearer token).',
                isUser: false,
            });
            onMessagesUpdate?.();
            return { messages: this.chatModel.getMessages() };
        }

        let userMessage = null;
        if (!options?.skipUserMessage) {
            const userMeta = options?.attachments?.length ? { attachments: options.attachments } : null;
            userMessage = this.chatModel.addMessage({
                text,
                isUser: true,
                ...(userMeta ? { meta: userMeta } : {}),
            });
            onMessagesUpdate?.();
        }

        const AGENT_MODEL_MAPPING = {
            'intelligent': 'default',
            'document': 'doc_assistant',
            'data': 'data_analyst',
        };
        const selectedModel = options?.agentModel || options?.model || 'intelligent';
        const mappedAgent = AGENT_MODEL_MAPPING[selectedModel] || 'default';

        const body = {
            agent: mappedAgent,
            agent_type: 'single',
            message: text,
            message_id: randomUuid(),
            context: defaultViewingContext(),
            user_time_zone: Intl.DateTimeFormat?.().resolvedOptions?.().timeZone || 'Asia/Ho_Chi_Minh',
        };

        if (options?.attachments?.length) {
            body.context = {
                ...(body.context || {}),
                attachments: options.attachments,
            };
        }
        if (!options?.forceNewConversation && this.conversationId) {
            body.conversation_id = this.conversationId;
        }

        const epoch = this._bumpEpoch();

        try {
            this._ensureStreamingPlaceholder();
            onMessagesUpdate?.();
            await this._streamAgent({
                epoch,
                token,
                body,
                onMessagesUpdate,
                allowReconnect: true,
            });
            this._finalizeStreamingState(onMessagesUpdate);
        } catch (e) {
            this._finalizeStreamingState(onMessagesUpdate);
            if (e.message !== 'Aborted') {
                this.chatModel.addMessage({
                    text: `Xin lỗi, ${e.message}`,
                    isUser: false,
                    status: 'error',
                });
                onMessagesUpdate?.();
            }
        }

        return {
            userMessage: userMessage ? userMessage.toJSON() : null,
            messages: this.chatModel.getMessages(),
        };
    }

    async resumeAgentInterrupt(resumePayload, onMessagesUpdate) {
        console.log('🔁 RESUME PAYLOAD:', JSON.stringify(resumePayload));
        console.log('🔁 CONVERSATION ID:', this.conversationId);
        console.log('🔁 RUN ID:', this.runId);
        console.log('🔁 INTERRUPT ID:', this.pendingInterrupt?.id);
        if (!USE_AGENT_CHAT) return { messages: this.chatModel.getMessages() };

        const intr = this.pendingInterrupt;
        // Recover runId from interrupt data if missing
        if (!this.runId && intr) {
            this.runId = intr.run_id || intr.runId || null;
        }
        if (!intr || !this.conversationId) {
            this.chatModel.addMessage({
                text: 'Không có yêu cầu xác nhận đang chờ.',
                isUser: false,
            });
            onMessagesUpdate?.();
            return { messages: this.chatModel.getMessages() };
        }

        // Clear immediately so bump() callbacks during streaming don't restore the interrupt UI
        this.pendingInterrupt = null;
        this._hitlAnswerReceived = false;

        const token = apiClient.getAuthToken();
        if (!token) {
            this.chatModel.addMessage({
                text: 'Cần đăng nhập để tiếp tục (Bearer token).',
                isUser: false,
            });
            onMessagesUpdate?.();
            return { messages: this.chatModel.getMessages() };
        }

        const body = {
            conversation_id: this.conversationId,
            run_id: this.runId,
            resume: { interrupt_id: intr.id || intr.interrupt_id, payload: resumePayload },
            message_id: intr.id || intr.interrupt_id || randomUuid(),
        };
        console.log('🔁 RESUME BODY:', JSON.stringify(body));
        const epoch = this._bumpEpoch();

        // Remove previous interrupt selection AND everything after it (old bot response)
        const allMsgs = this.chatModel.getMessages();
        const prevSelIdx = allMsgs.reduce((found, m, i) => m.isUser && m.isInterruptSelection ? i : found, -1);
        if (prevSelIdx >= 0) {
            allMsgs.slice(prevSelIdx).forEach(m => this.chatModel.removeMessage(m.id));
        }

        const selectionText =
            extractInterruptAnswerText(resumePayload) ||
            (resumePayload.action === 'approve' ? 'Đồng ý' :
                resumePayload.action === 'reject' ? 'Từ chối' :
                    resumePayload.action === 'retry' ? 'Thử lại' :
                        resumePayload.action === 'skip' ? 'Bỏ qua' :
                            resumePayload.action === 'abort' ? 'Hủy' : null);
        if (selectionText) {
            this.chatModel.addMessage({ text: selectionText, isUser: true, isInterruptSelection: true });
            this._saveConversationToCache();
            onMessagesUpdate?.();
        }

        // Mark interrupt messages as answered so the UI locks immediately
        const answeredInterruptIds = [];
        for (const im of this.chatModel.getMessages().filter(m => m.isInterruptMessage)) {
            this.chatModel.updateMessage(im.id, { meta: { ...im.meta, answered: true } });
            answeredInterruptIds.push(im.id);
        }

        const allMsgsBeforeStream = this.chatModel.getMessages();
        this._resumeInterruptContext = {
            interruptMsgs: allMsgsBeforeStream.filter(m => m.isInterruptMessage).map(m => ({ ...m })),
            selectionMsg: selectionText
                ? (() => { const m = [...allMsgsBeforeStream].reverse().find(m => m.isUser && m.text === selectionText); return m ? { ...m } : null; })()
                : null,
        };

        // Show placeholder so user sees the bot is thinking
        this._ensureStreamingPlaceholder();
        onMessagesUpdate?.();

        try {
            await this._streamAgent({
                epoch,
                token,
                body,
                onMessagesUpdate,
                allowReconnect: true,
                onSnapshot: (list) => {
                    const rows = this._mergeInterruptIntoSnapshot(mapSnapshotToChatRows(list));
                    this.chatModel.clearMessages();
                    rows.forEach((r) => this.chatModel.addMessage(r));
                    onMessagesUpdate?.();
                },
                customOptions: {
                    timeout: 900000,
                },
            });

            this._finalizeStreamingState(onMessagesUpdate);

            // Re-apply answered flag in case MESSAGES_SNAPSHOT rebuilt messages without it
            for (const id of answeredInterruptIds) {
                const msg = this.chatModel.getMessages().find(m => m.id === id);
                if (msg && !msg.meta?.answered) {
                    this.chatModel.updateMessage(id, { meta: { ...msg.meta, answered: true } });
                }
            }
            this._saveConversationToCache();

            // If server never confirmed the answer and there's no new bot response, restore interrupt
            if (!this._hitlAnswerReceived && !this.pendingInterrupt) {
                const msgs = this.chatModel.getMessages();
                const selIdx = msgs.findIndex(m => m.isUser && m.isInterruptSelection);
                const hasBotResponseAfter = selIdx >= 0
                    ? msgs.slice(selIdx + 1).some(m => !m.isUser && `${m.text || ''}`.trim())
                    : msgs.some(m => !m.isUser && !m.isInterruptMessage && `${m.text || ''}`.trim());
                if (!hasBotResponseAfter) {
                    console.log('⚠️ Resume: no bot response received, restoring interrupt for retry');
                    this.pendingInterrupt = intr;
                    onMessagesUpdate?.();
                }
            }
        } catch (e) {
            this._finalizeStreamingState(onMessagesUpdate);
            if (e.message !== 'Aborted') {
                if (!this.pendingInterrupt) this.pendingInterrupt = intr;
                // Restore interrupt messages to interactive so user can retry
                for (const id of answeredInterruptIds) {
                    const msg = this.chatModel.getMessages().find(m => m.id === id);
                    if (msg) {
                        const newMeta = { ...msg.meta };
                        delete newMeta.answered;
                        this.chatModel.updateMessage(id, { meta: newMeta });
                    }
                }
                this.chatModel.addMessage({
                    text: `❌ Có lỗi khi gửi câu trả lời: ${e.message}. Vui lòng thử lại.`,
                    isUser: false,
                    status: 'error',
                });
                onMessagesUpdate?.();
            }
        } finally {
            this._resumeInterruptContext = null;
            this._hitlAnswerReceived = false;
        }

        return { messages: this.chatModel.getMessages() };
    }

    pruneAfterInterruptSelection() {
        const msgs = this.chatModel.getMessages();
        const prevSelIdx = msgs.reduce((found, m, i) => m.isUser && m.isInterruptSelection ? i : found, -1);
        if (prevSelIdx >= 0) {
            msgs.slice(prevSelIdx).forEach(m => this.chatModel.removeMessage(m.id));
        }
    }

    setConversationId(id) {
        this.conversationId = id || null;
    }

    getPendingInterrupt() {
        return this.pendingInterrupt;
    }

    async listConversations() {
        const token = apiClient.getAuthToken();
        if (!token) return { success: false, error: 'Chưa đăng nhập (token).', data: [] };
        const u = AuthService.getCurrentUser?.() || {};
        try {
            const json = await AgentApiService.listConversations(token, {
                limit: 100,
                offset: 0,
                order: 'created_at',
                direction: 'desc',
                include_deleted: false,
                user_id: u.user_id || u.id || undefined,
                partner_id: u.partner_id || undefined,
            });
            const list = Array.isArray(json?.data) ? json.data : [];
            return { success: true, data: list };
        } catch (e) {
            return { success: false, error: e.message, data: [] };
        }
    }

    async fetchConversationHistory(conversationId, onMessagesUpdate) {
        const token = apiClient.getAuthToken();
        if (!token) return;

        const epoch = this._bumpEpoch();

        try {
            await this._streamAgent({
                epoch,
                token,
                body: {},
                customUrl: `${this._agentBaseUrl()}/api/v1/conversation/${conversationId}`,
                onMessagesUpdate,
                allowReconnect: false,
                onSnapshot: (list) => {
                    if (list && list.length > 0) {
                        const rows = mapSnapshotToChatRows(list);
                        this.chatModel.clearMessages();
                        rows.forEach((r) => this.chatModel.addMessage(r));
                        this._applyInterruptStateFromRows(rows);
                        this._saveConversationToCache();
                    } else {
                        this.chatModel.clearMessages();
                        this.ensureWelcomeMessage();
                        this.pendingInterrupt = null;
                    }
                    onMessagesUpdate?.();
                },
            });
        } catch (error) {
            console.error('Fetch history error:', error);
            this.chatModel.clearMessages();
            this.ensureWelcomeMessage();
            onMessagesUpdate?.();
        }
    }

    async openConversation(conversationId, onMessagesUpdate) {
        this.setConversationId(conversationId);

        const cached = await this._loadConversationFromCache(conversationId);
        if (cached) {
            onMessagesUpdate?.();
            return { messages: this.chatModel.getMessages() };
        }

        await this.fetchConversationHistory(conversationId, onMessagesUpdate);
        return { messages: this.chatModel.getMessages() };
    }

    async deleteConversation(conversationId) {
        const token = apiClient.getAuthToken();
        if (!token) return { success: false, error: 'Chưa đăng nhập (token).' };
        try {
            await AgentApiService.deleteConversation(token, conversationId);
        } catch (e) {
            if (this.conversationId === conversationId) this.clearChat();
            return { success: false, error: e.message };
        }
        if (this.conversationId === conversationId) this.clearChat();
        return { success: true };
    }

    _handleBgAgentEvent(ev, epoch) {
        const bg = this._bgStreams.get(epoch);
        if (!bg || bg.finished) return;

        switch (ev.type) {
            case 'RUN_STARTED':
                if (ev.thread_id) bg.conversationId = ev.thread_id;
                if (ev.run_id) bg.runId = ev.run_id;
                break;

            case 'TEXT_MESSAGE_START':
                if (!bg.currentAssistantId) {
                    const msg = bg.chatModel.addMessage({ text: '', isUser: false, status: 'streaming' });
                    bg.currentAssistantId = msg.id;
                }
                break;

            case 'TEXT_MESSAGE_CONTENT': {
                const piece = readEventText(ev);
                if (!piece || ev.is_from_sub_run) break;
                if (!bg.currentAssistantId) {
                    const msg = bg.chatModel.addMessage({ text: '', isUser: false, status: 'streaming' });
                    bg.currentAssistantId = msg.id;
                }
                const cur = bg.chatModel.getMessages().find(m => m.id === bg.currentAssistantId);
                bg.chatModel.updateMessage(bg.currentAssistantId, {
                    text: (cur?.text || '') + piece,
                    status: 'streaming',
                });
                break;
            }

            case 'TEXT_MESSAGE_END': {
                if (!bg.currentAssistantId) break;
                const finalText = `${readEventText(ev) || ''}`.trim();
                const cur = bg.chatModel.getMessages().find(m => m.id === bg.currentAssistantId);
                const nextText = `${cur?.text || ''}${finalText}`.trim();
                if (nextText) {
                    bg.chatModel.updateMessage(bg.currentAssistantId, { text: nextText, status: 'sent' });
                } else {
                    bg.chatModel.removeMessage(bg.currentAssistantId);
                }
                bg.currentAssistantId = null;
                this._saveBgConversationToCache(bg);
                break;
            }

            case 'MESSAGES_SNAPSHOT': {
                const list = ev.data?.messages;
                if (list?.length) {
                    const rows = mapSnapshotToChatRows(list);
                    bg.chatModel.clearMessages();
                    rows.forEach(r => bg.chatModel.addMessage(r));
                }
                break;
            }

            case 'HITL_INTERRUPT_MESSAGE': {
                const interruptData = ev.interrupt || ev.data || {};
                bg.pendingInterrupt = interruptData;
                if (interruptData.run_id) bg.runId = interruptData.run_id;
                break;
            }

            case 'RUN_FINISHED': {
                bg.finished = true;
                if (ev.outcome === 'interrupt') {
                    if (bg.currentAssistantId) {
                        const cur = bg.chatModel.getMessages().find(m => m.id === bg.currentAssistantId);
                        if (cur && `${cur.text || ''}`.trim()) {
                            bg.chatModel.updateMessage(bg.currentAssistantId, { status: 'sent' });
                        } else if (cur) {
                            bg.chatModel.removeMessage(bg.currentAssistantId);
                        }
                        bg.currentAssistantId = null;
                    }
                    if (ev.interrupt && !bg.pendingInterrupt) {
                        bg.pendingInterrupt = ev.interrupt;
                        if (ev.interrupt.run_id) bg.runId = ev.interrupt.run_id;
                        const q = ev.interrupt.question || 'Cần xác nhận từ bạn.';
                        bg.chatModel.addMessage({
                            text: q, isUser: false, status: 'sent',
                            isInterruptMessage: true,
                            meta: { interruptData: ev.interrupt },
                        });
                    }
                } else {
                    bg.pendingInterrupt = null;
                    if (bg.currentAssistantId) {
                        const cur = bg.chatModel.getMessages().find(m => m.id === bg.currentAssistantId);
                        if (cur && `${cur.text || ''}`.trim()) {
                            bg.chatModel.updateMessage(bg.currentAssistantId, { status: 'sent' });
                        } else if (cur) {
                            bg.chatModel.removeMessage(bg.currentAssistantId);
                        }
                        bg.currentAssistantId = null;
                    }

                    // Fetch citations for the last bot message
                    const token = apiClient.getAuthToken();
                    const last = bg.chatModel.getMessages().slice().reverse().find(m => !m.isUser);
                    if (token && bg.runId && last) {
                        const chatModelRef = bg.chatModel;
                        const lastId = last.id;
                        const bgRef = bg;
                        AgentApiService.fetchCitations(token, bg.runId)
                            .then(resp => {
                                const citData = resp?.data;
                                if (!citData?.passages?.length) return;
                                const cur = chatModelRef.getMessages().find(m => m.id === lastId);
                                if (!cur) return;
                                chatModelRef.updateMessage(lastId, { meta: { ...(cur.meta || {}), citations: citData } });
                                this._saveBgConversationToCache(bgRef);
                            })
                            .catch(() => {});
                    }
                }
                this._saveBgConversationToCache(bg);
                this._bgStreams.delete(epoch);
                break;
            }

            case 'RUN_ERROR':
            case 'ERROR': {
                bg.finished = true;
                if (bg.currentAssistantId) {
                    bg.chatModel.removeMessage(bg.currentAssistantId);
                    bg.currentAssistantId = null;
                }
                const errText = ev.result || ev.text || ev.data?.message || 'Đã xảy ra lỗi.';
                bg.chatModel.addMessage({ text: errText, isUser: false, status: 'error' });
                this._saveBgConversationToCache(bg);
                this._bgStreams.delete(epoch);
                break;
            }

            default:
                break;
        }
    }

    async _saveBgConversationToCache(bg) {
        if (!bg.conversationId) return;
        try {
            const messages = bg.chatModel.getMessages();
            if (messages.length === 0) return;
            const key = `conv_${ChatController.CACHE_VERSION}_${bg.conversationId}`;
            await AsyncStorage.setItem(key, JSON.stringify({
                messages,
                pendingInterrupt: bg.pendingInterrupt || null,
                runId: bg.runId || null,
                conversationId: bg.conversationId,
            }));
        } catch (e) {
            console.error('BG cache save error:', e);
        }
    }

    startNewConversation() {
        if (this._streamAbort && this._runActive) {
            // Move the active stream to background instead of aborting it
            this._bgStreams.set(this._epoch, {
                chatModel: this.chatModel,
                conversationId: this.conversationId,
                runId: this.runId,
                pendingInterrupt: this.pendingInterrupt,
                abortController: this._streamAbort,
                currentAssistantId: this._currentAssistantId,
                finished: false,
            });
            this._streamAbort = null; // detach — do NOT abort
        } else if (this._streamAbort) {
            this._streamAbort.abort();
            this._streamAbort = null;
        }
        this._runActive = false;
        this._currentAssistantId = null;
        this._toolCalls = new Map();
        this._resumeInterruptContext = null;
        this._clearWatchdog();
        this.conversationId = null;
        this.runId = null;
        this.pendingInterrupt = null;
        this.chatModel = new ChatModel();
        this.ensureWelcomeMessage();
        return { success: true };
    }

    editUserMessage(messageId, newText) {
        const next = `${newText || ''}`.trim();
        if (!next) return { success: false, error: 'Nội dung trống' };
        const row = this.chatModel.getMessages().find((m) => m.id === messageId);
        if (!row || !row.isUser) return { success: false, error: 'Không tìm thấy tin nhắn user' };
        this.chatModel.updateMessage(messageId, { text: next, timestamp: new Date() });
        return { success: true };
    }

    editAndPruneFromMessage(messageId, newText) {
        const edited = this.editUserMessage(messageId, newText);
        if (!edited.success) return edited;
        const rows = this.chatModel.messages || [];
        const idx = rows.findIndex((m) => m.id === messageId);
        if (idx < 0) return { success: false, error: 'Không tìm thấy vị trí tin nhắn' };
        this.chatModel.messages = rows.slice(0, idx + 1);
        this.runId = null;
        this.pendingInterrupt = null;
        this._currentAssistantId = null;
        return { success: true };
    }

    async _sendUserMessageLegacy(text, onMessagesUpdate) {
        const userMessage = this.chatModel.addMessage({ text, isUser: true });
        const response = await DataService.sendChatMessage(text);

        if (response.success) {
            const botMessage = this.chatModel.addMessage({
                text: response.data.reply,
                isUser: false,
            });
            onMessagesUpdate?.();
            return {
                userMessage: userMessage.toJSON(),
                botMessage: botMessage.toJSON(),
                messages: this.chatModel.getMessages(),
            };
        }

        const errorMessage = this.chatModel.addMessage({
            text: `Lỗi chat fallback: ${response?.error || 'không rõ nguyên nhân'}. Bật EXPO_PUBLIC_USE_AGENT_CHAT=true để dùng SSE.`,
            isUser: false,
        });
        onMessagesUpdate?.();
        return {
            userMessage: userMessage.toJSON(),
            botMessage: errorMessage.toJSON(),
            messages: this.chatModel.getMessages(),
        };
    }

    getMessages() {
        return this.chatModel.getMessages();
    }

    clearChat() {
        for (const [, bg] of this._bgStreams) {
            bg.abortController?.abort();
        }
        this._bgStreams.clear();
        if (this._streamAbort) {
            this._streamAbort.abort();
            this._streamAbort = null;
        }
        this._clearWatchdog();
        this.conversationId = null;
        this.runId = null;
        this.pendingInterrupt = null;
        this._runActive = false;
        this._currentAssistantId = null;
        this._lastEventAt = 0;
        this.chatModel.clearMessages();
        this.ensureWelcomeMessage();
    }

    async cancelCurrentRun(onMessagesUpdate) {
        for (const [, bg] of this._bgStreams) {
            bg.abortController?.abort();
        }
        this._bgStreams.clear();
        if (this._streamAbort) {
            this._streamAbort.abort();
            this._streamAbort = null;
        }
        this._runActive = false;
        this._currentAssistantId = null;
        this._clearWatchdog();
        this._cleanupEmptyStreamingAssistants();
        this._saveConversationToCache();
        onMessagesUpdate?.();
        return { success: true };
    }
}

export default ChatController;
