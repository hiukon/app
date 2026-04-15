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
                        const rows = mapSnapshotToChatRows(list);
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
                    if (this._epoch !== epoch) return;
                    this._touchEvent();
                    onBeforeEvent?.(ev);
                    this._handleAgentEvent(ev, {
                        onMessagesUpdate,
                        onSnapshot,
                    });
                    onAfterEvent?.(ev);
                },
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
            this._streamAbort = null;
        }
    }

    async _saveConversationToCache() {
        if (!this.conversationId) return;
        try {
            const messages = this.chatModel.getMessages();
            if (messages.length === 0) return;
            await AsyncStorage.setItem(`conv_${this.conversationId}`, JSON.stringify(messages));
            
        } catch (error) {
            console.error('Cache error:', error);
        }
    }

    async _loadConversationFromCache(conversationId) {
        try {
            const cached = await AsyncStorage.getItem(`conv_${conversationId}`);
            if (cached) {
                const messages = JSON.parse(cached);
                this.chatModel.clearMessages();
                messages.forEach(msg => this.chatModel.addMessage(msg));
                
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
                this._ensureStreamingPlaceholder();
                const cur = this.chatModel.getMessages().find((m) => m.id === this._currentAssistantId);
                this.chatModel.updateMessage(this._currentAssistantId, {
                    text: `${cur?.text || ''}${piece}`,
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
                const piece = readEventText(ev);
                if (!piece) break;
                const rows = this.chatModel.getMessages();
                const last = rows.slice().reverse().find((m) => !m.isUser);
                const id = last && last.status === 'streaming'
                    ? last.id
                    : this.chatModel.addMessage({ text: '', isUser: false, status: 'streaming' }).id;
                const current = this.chatModel.getMessages().find((m) => m.id === id);
                const meta = current?.meta || {};
                const thinkingText = `${meta.thinkingText || ''}${piece}`;
                this.chatModel.updateMessage(id, { meta: { ...meta, thinkingText } });
                onMessagesUpdate?.();
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
                this._runActive = false;
                if (ev.outcome === 'interrupt' && ev.interrupt) {
                    this.pendingInterrupt = ev.interrupt;
                    const q = ev.interrupt.question || 'Cần xác nhận từ bạn.';
                    const opts = ev.interrupt.options?.length
                        ? `\n${ev.interrupt.options.map((o, i) => `${i + 1}. ${o}`).join('\n')}`
                        : '';
                    this.chatModel.addMessage({
                        text: `${q}${opts}`,
                        isUser: false,
                        status: 'sent',
                    });
                } else {
                    this.pendingInterrupt = null;
                    if (this._currentAssistantId) {
                        const cur = this.chatModel.getMessages().find((m) => m.id === this._currentAssistantId);
                        const fallbackText = readEventText(ev);
                        const safeText = `${cur?.text || ''}`.trim() || `${fallbackText || ''}`.trim();
                        if (safeText) {
                            this.chatModel.updateMessage(this._currentAssistantId, {
                                status: 'sent',
                                text: safeText,
                            });
                        } else {
                            this.chatModel.removeMessage(this._currentAssistantId);
                        }
                        this._currentAssistantId = null;
                    }
                    const hasAssistantText = this.chatModel.getMessages().some((m) => !m.isUser && `${m.text || ''}`.trim().length > 0);
                    if (!hasAssistantText && ev.outcome === 'success') {
                        this.chatModel.addMessage({
                            text: 'Run hoàn tất nhưng server không trả TEXT_MESSAGE_CONTENT/TEXT_MESSAGE_END.',
                            isUser: false,
                            status: 'error',
                        });
                    }
                    const token = apiClient.getAuthToken();
                    const last = this.chatModel.getMessages().slice().reverse().find((m) => !m.isUser);
                    if (token && this.runId && last) {
                        AgentApiService.fetchCitations(token, this.runId)
                            .then((resp) => {
                                const cites = resp?.data?.citations || resp?.data || [];
                                const now = this.chatModel.getMessages();
                                const cur = now.find((m) => m.id === last.id);
                                if (!cur) return;
                                const curMeta = cur.meta || {};
                                this.chatModel.updateMessage(last.id, {
                                    meta: { ...curMeta, citations: Array.isArray(cites) ? cites : [] },
                                });
                                onMessagesUpdate?.();
                            })
                            .catch(() => { });
                    }
                    this._saveConversationToCache();
                }
                this._cleanupEmptyStreamingAssistants();
                onMessagesUpdate?.();
                break;

            case 'RUN_ERROR':
            case 'ERROR': {
                const errText = ev.result || ev.text || ev.data?.message || 'Đã xảy ra lỗi.';
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
        } catch (e) {
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
        if (!USE_AGENT_CHAT) return { messages: this.chatModel.getMessages() };
        const intr = this.pendingInterrupt;
        if (!intr || !this.conversationId || !this.runId) {
            this.chatModel.addMessage({
                text: 'Không có yêu cầu xác nhận đang chờ.',
                isUser: false,
            });
            onMessagesUpdate?.();
            return { messages: this.chatModel.getMessages() };
        }

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
            agent: resolvedAgentCode(),
            agent_type: 'single',
            conversation_id: this.conversationId,
            run_id: this.runId,
            resume: { interrupt_id: intr.id || intr.interrupt_id, payload: resumePayload },
            message_id: randomUuid(),
            context: defaultViewingContext(),
            user_time_zone: Intl.DateTimeFormat?.().resolvedOptions?.().timeZone || 'Asia/Ho_Chi_Minh',
        };
        const epoch = this._bumpEpoch();

        try {
            await this._streamAgent({
                epoch,
                token,
                body,
                onMessagesUpdate,
                allowReconnect: true,
            });
        } catch (e) {
            if (e.message !== 'Aborted') {
                this.chatModel.addMessage({
                    text: `Xin lỗi, ${e.message}`,
                    isUser: false,
                    status: 'error',
                });
                onMessagesUpdate?.();
            }
        }

        return { messages: this.chatModel.getMessages() };
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
                        this._saveConversationToCache();
                    } else {
                        this.chatModel.clearMessages();
                        this.ensureWelcomeMessage();
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

    startNewConversation() {
        if (this._streamAbort) {
            this._streamAbort.abort();
            this._streamAbort = null;
        }
        this._runActive = false;
        this._currentAssistantId = null;
        this._clearWatchdog();
        this.conversationId = null;
        this.runId = null;
        this.pendingInterrupt = null;
        this.chatModel.clearMessages();
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
        // 🔧 FIX: Không set conversationId = null, giữ conversation cũ để update thay vì tạo mới
        // this.conversationId = null;  // REMOVED: Điều này làm tạo conversation mới thay vì update cũ
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
        if (this._streamAbort) {
            this._streamAbort.abort();
            this._streamAbort = null;
        }
        this._runActive = false;
        this._currentAssistantId = null;
        this._clearWatchdog();
        this._cleanupEmptyStreamingAssistants();

        if (!USE_AGENT_CHAT) return { success: true };
        const token = apiClient.getAuthToken();
        if (token && this.conversationId) {
            try {
                await AgentApiService.cancelConversation(token, this.conversationId);
            } catch {
                // ignore
            }
        }
        onMessagesUpdate?.();
        return { success: true };
    }
}

export default ChatController;