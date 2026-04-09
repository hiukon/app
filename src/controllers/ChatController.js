import { ChatModel } from '../models/ChatModel';
import DataService from '../services/DataService';
import { USE_AGENT_CHAT, AGENT_API_URL, AGENT_CODE } from '../config/api.config';
import apiClient from '../services/api/apiClient';
import { streamAgentMessage } from '../services/agent/streamAgentMessage';
import { mapSnapshotToChatRows } from '../services/agent/snapshotMessages';

function randomUuid() {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
    });
}

class ChatController {
    constructor() {
        this.chatModel = new ChatModel();
        this.ensureWelcomeMessage();
        this.conversationId = null;
        this.runId = null;
        this.pendingInterrupt = null;
        this._streamAbort = null;
    }

    ensureWelcomeMessage() {
        if (this.chatModel.getMessages().length === 0) {
            this.chatModel.addMessage({
                text: 'Xin chào! Tôi là trợ lý ảo HaNoiBrain. Tôi có thể giúp gì cho bạn?',
                isUser: false,
            });
        }
    }

    _agentBaseUrl() {
        return (AGENT_API_URL || '').replace(/\/$/, '');
    }

    /**
     * POST /messages không có message — nhận MESSAGES_SNAPSHOT + STATE_SNAPSHOT (§5.3).
     * Không gọi từ UI mặc định; dùng khi cần đồng bộ thread.
     */
    async joinConversation(onMessagesUpdate) {
        if (!USE_AGENT_CHAT) return { messages: this.chatModel.getMessages() };
        const token = apiClient.getAuthToken();
        if (!token) {
            return { messages: this.chatModel.getMessages(), error: 'Chưa đăng nhập (token).' };
        }
        if (!this.conversationId) {
            return { messages: this.chatModel.getMessages(), error: 'Chưa có conversation_id.' };
        }

        const ref = { assistantId: null, buffer: '' };

        const body = {
            conversation_id: this.conversationId,
            message_id: randomUuid(),
            user_time_zone:
                Intl.DateTimeFormat?.().resolvedOptions?.().timeZone || 'Asia/Ho_Chi_Minh',
        };
        if (AGENT_CODE) body.agent = AGENT_CODE;

        if (this._streamAbort) this._streamAbort.abort();
        const ac = new AbortController();
        this._streamAbort = ac;

        try {
            await streamAgentMessage({
                url: `${this._agentBaseUrl()}/api/v1/messages`,
                token,
                body,
                signal: ac.signal,
                onEvent: (ev) => {
                    if (ev.type === 'TEXT_MESSAGE_CONTENT' && !ev.is_from_sub_run) {
                        if (!ref.assistantId) {
                            ref.assistantId = this.chatModel.addMessage({
                                text: '',
                                isUser: false,
                                status: 'streaming',
                            }).id;
                        }
                    }
                    this._handleAgentEvent(ev, {
                        getAssistantId: () => ref.assistantId,
                        getBuffer: () => ref.buffer,
                        setBuffer: (v) => {
                            ref.buffer = v;
                        },
                        onMessagesUpdate,
                        onSnapshot: (list) => {
                            const rows = mapSnapshotToChatRows(list);
                            this.chatModel.clearMessages();
                            rows.forEach((r) => this.chatModel.addMessage(r));
                            ref.assistantId = null;
                            ref.buffer = '';
                            onMessagesUpdate?.();
                        },
                    });
                },
            });
        } catch (e) {
            if (e.message !== 'Aborted' && ref.assistantId) {
                this.chatModel.updateMessage(ref.assistantId, {
                    text: ref.buffer || e.message,
                    status: 'error',
                });
                onMessagesUpdate?.();
            }
        } finally {
            if (ref.assistantId) {
                this._finalizeAssistantMessage(
                    ref.assistantId,
                    () => ref.buffer,
                    onMessagesUpdate
                );
            }
            this._streamAbort = null;
        }

        return { messages: this.chatModel.getMessages() };
    }

    _handleAgentEvent(ev, ctx) {
        const { getAssistantId, assistantId: fixedAssistantId, getBuffer, setBuffer, onMessagesUpdate, onSnapshot } =
            ctx;
        const assistantId =
            typeof getAssistantId === 'function' ? getAssistantId() : fixedAssistantId;
        let assistantBuffer = getBuffer();

        switch (ev.type) {
            case 'RUN_STARTED':
                if (ev.thread_id) this.conversationId = ev.thread_id;
                if (ev.run_id) this.runId = ev.run_id;
                break;
            case 'TEXT_MESSAGE_CONTENT': {
                if (!assistantId) break;
                if (ev.is_from_sub_run) break;
                const piece = ev.delta != null ? ev.delta : ev.text || '';
                if (!piece) break;
                assistantBuffer += piece;
                setBuffer(assistantBuffer);
                this.chatModel.updateMessage(assistantId, {
                    text: assistantBuffer,
                    status: 'streaming',
                });
                onMessagesUpdate?.();
                break;
            }
            case 'MESSAGES_SNAPSHOT': {
                const list = ev.data?.messages;
                if (list?.length) {
                    if (typeof onSnapshot === 'function') onSnapshot(list);
                    else {
                        const rows = mapSnapshotToChatRows(list);
                        this.chatModel.clearMessages();
                        rows.forEach((r) => this.chatModel.addMessage(r));
                        onMessagesUpdate?.();
                    }
                }
                break;
            }
            case 'RUN_FINISHED':
                if (!assistantId) {
                    onMessagesUpdate?.();
                    break;
                }
                if (ev.outcome === 'interrupt' && ev.interrupt) {
                    this.pendingInterrupt = ev.interrupt;
                    const q = ev.interrupt.question || 'Cần xác nhận từ bạn.';
                    const opts = ev.interrupt.options?.length
                        ? `\n${ev.interrupt.options.map((o, i) => `${i + 1}. ${o}`).join('\n')}`
                        : '';
                    assistantBuffer += (assistantBuffer ? '\n\n' : '') + q + opts;
                    setBuffer(assistantBuffer);
                    this.chatModel.updateMessage(assistantId, {
                        text: assistantBuffer,
                        status: 'sent',
                    });
                } else {
                    this.pendingInterrupt = null;
                    this.chatModel.updateMessage(assistantId, {
                        text: assistantBuffer,
                        status: 'sent',
                    });
                }
                onMessagesUpdate?.();
                break;
            case 'RUN_ERROR':
            case 'ERROR': {
                if (!assistantId) break;
                const errText =
                    ev.result || ev.text || ev.data?.message || 'Đã xảy ra lỗi.';
                assistantBuffer += (assistantBuffer ? '\n\n' : '') + errText;
                setBuffer(assistantBuffer);
                this.chatModel.updateMessage(assistantId, {
                    text: assistantBuffer,
                    status: 'error',
                });
                onMessagesUpdate?.();
                break;
            }
            case 'USER_CANCELLED':
                if (!assistantId) break;
                this.chatModel.updateMessage(assistantId, {
                    text: assistantBuffer || 'Đã dừng.',
                    status: 'sent',
                });
                onMessagesUpdate?.();
                break;
            default:
                break;
        }
    }

    _finalizeAssistantMessage(assistantId, getBuffer, onMessagesUpdate) {
        const rows = this.chatModel.getMessages();
        const row = rows.find((m) => m.id === assistantId);
        if (row && row.status === 'streaming') {
            const text = getBuffer();
            this.chatModel.updateMessage(assistantId, {
                text,
                status: 'sent',
            });
            onMessagesUpdate?.();
        }
    }

    async sendUserMessage(text, onMessagesUpdate) {
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

        const userMessage = this.chatModel.addMessage({
            text,
            isUser: true,
        });
        onMessagesUpdate?.();

        const assistantModel = this.chatModel.addMessage({
            text: '',
            isUser: false,
            status: 'streaming',
        });
        const assistantId = assistantModel.id;
        let assistantBuffer = '';

        const body = {
            message: text,
            message_id: randomUuid(),
            user_time_zone:
                Intl.DateTimeFormat?.().resolvedOptions?.().timeZone || 'Asia/Ho_Chi_Minh',
        };
        if (this.conversationId) body.conversation_id = this.conversationId;
        if (AGENT_CODE) body.agent = AGENT_CODE;

        if (this._streamAbort) this._streamAbort.abort();
        const ac = new AbortController();
        this._streamAbort = ac;

        try {
            await streamAgentMessage({
                url: `${this._agentBaseUrl()}/api/v1/messages`,
                token,
                body,
                signal: ac.signal,
                onEvent: (ev) => {
                    this._handleAgentEvent(ev, {
                        getAssistantId: () => assistantId,
                        getBuffer: () => assistantBuffer,
                        setBuffer: (v) => {
                            assistantBuffer = v;
                        },
                        onMessagesUpdate,
                    });
                },
            });
        } catch (e) {
            if (e.message === 'Aborted') {
                this.chatModel.updateMessage(assistantId, {
                    text: assistantBuffer || 'Đã dừng.',
                    status: 'sent',
                });
                onMessagesUpdate?.();
            } else {
                this.chatModel.updateMessage(assistantId, {
                    text: assistantBuffer
                        ? `${assistantBuffer}\n\n${e.message}`
                        : `Xin lỗi, ${e.message}`,
                    status: 'error',
                });
                onMessagesUpdate?.();
            }
        } finally {
            this._finalizeAssistantMessage(assistantId, () => assistantBuffer, onMessagesUpdate);
            this._streamAbort = null;
        }

        return {
            userMessage: userMessage.toJSON(),
            messages: this.chatModel.getMessages(),
        };
    }

    /**
     * HITL: POST với resume sau RUN_FINISHED outcome interrupt (§9.5).
     * Gọi từ code tùy chỉnh (UI mặc định chưa có nút).
     */
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

        const assistantModel = this.chatModel.addMessage({
            text: '',
            isUser: false,
            status: 'streaming',
        });
        const assistantId = assistantModel.id;
        let assistantBuffer = '';

        const body = {
            conversation_id: this.conversationId,
            run_id: this.runId,
            resume: { interrupt_id: intr.id, payload: resumePayload },
            message_id: randomUuid(),
            user_time_zone:
                Intl.DateTimeFormat?.().resolvedOptions?.().timeZone || 'Asia/Ho_Chi_Minh',
        };
        if (AGENT_CODE) body.agent = AGENT_CODE;

        if (this._streamAbort) this._streamAbort.abort();
        const ac = new AbortController();
        this._streamAbort = ac;

        try {
            await streamAgentMessage({
                url: `${this._agentBaseUrl()}/api/v1/messages`,
                token,
                body,
                signal: ac.signal,
                onEvent: (ev) => {
                    this._handleAgentEvent(ev, {
                        getAssistantId: () => assistantId,
                        getBuffer: () => assistantBuffer,
                        setBuffer: (v) => {
                            assistantBuffer = v;
                        },
                        onMessagesUpdate,
                    });
                },
            });
        } catch (e) {
            if (e.message === 'Aborted') {
                this.chatModel.updateMessage(assistantId, {
                    text: assistantBuffer || 'Đã dừng.',
                    status: 'sent',
                });
                onMessagesUpdate?.();
            } else {
                this.chatModel.updateMessage(assistantId, {
                    text: assistantBuffer
                        ? `${assistantBuffer}\n\n${e.message}`
                        : `Xin lỗi, ${e.message}`,
                    status: 'error',
                });
                onMessagesUpdate?.();
            }
        } finally {
            this._finalizeAssistantMessage(assistantId, () => assistantBuffer, onMessagesUpdate);
            this._streamAbort = null;
        }

        return { messages: this.chatModel.getMessages() };
    }

    /** Gán thread để joinConversation / tiếp tục hội thoại. */
    setConversationId(id) {
        this.conversationId = id || null;
    }

    async _sendUserMessageLegacy(text, onMessagesUpdate) {
        const userMessage = this.chatModel.addMessage({
            text,
            isUser: true,
        });

        const response = await DataService.sendChatMessage(text);

        if (response.success) {
            const botMessage = this.chatModel.addMessage({
                text: response.data.reply,
                isUser: false,
            });
            const out = {
                userMessage: userMessage.toJSON(),
                botMessage: botMessage.toJSON(),
                messages: this.chatModel.getMessages(),
            };
            onMessagesUpdate?.();
            return out;
        }

        const errorMessage = this.chatModel.addMessage({
            text: 'Xin lỗi, có lỗi xảy ra. Vui lòng thử lại sau.',
            isUser: false,
        });

        const failOut = {
            userMessage: userMessage.toJSON(),
            botMessage: errorMessage.toJSON(),
            messages: this.chatModel.getMessages(),
        };
        onMessagesUpdate?.();
        return failOut;
    }

    getMessages() {
        return this.chatModel.getMessages();
    }

    clearChat() {
        if (this._streamAbort) {
            this._streamAbort.abort();
            this._streamAbort = null;
        }
        this.conversationId = null;
        this.runId = null;
        this.pendingInterrupt = null;
        this.chatModel.clearMessages();
        this.ensureWelcomeMessage();
    }
}

export default ChatController;
