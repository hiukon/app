import { AGENT_API_URL } from '../../config/api.config';

function authHeaders(token) {
    return {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
    };
}

/**
 * REST helpers for Agent API (Seinetime protocol).
 * SSE send lives in streamAgentMessage.js
 */
class AgentApiService {
    baseUrl() {
        return (AGENT_API_URL || '').replace(/\/$/, '');
    }

    /**
     * @param {string} token
     * @param {object} query
     * @returns {Promise<{ code?: number, message?: string, data?: any, pagination?: any }>}
     */
    async listConversations(token, query = {}) {
        const qs = Object.entries(query)
            .filter(([, v]) => v !== undefined && v !== null && v !== '')
            .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
            .join('&');
        const url = `${this.baseUrl()}/api/v1/conversations${qs ? `?${qs}` : ''}`;
        const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.message || json.msg || `HTTP ${res.status}`);
        return json;
    }

    async deleteConversation(token, conversationId) {
        const res = await fetch(`${this.baseUrl()}/api/v1/conversation/${conversationId}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token}` },
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.message || json.msg || `HTTP ${res.status}`);
        return json;
    }

    async cancelConversation(token, conversationId) {
        const res = await fetch(`${this.baseUrl()}/api/v1/conversation/${conversationId}/cancel`, {
            method: 'POST',
            headers: authHeaders(token),
            body: '{}',
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.message || json.msg || `HTTP ${res.status}`);
        return json;
    }

    async fetchCitations(token, runId) {
        const res = await fetch(`${this.baseUrl()}/api/v1/run/${runId}/citations`, {
            headers: { Authorization: `Bearer ${token}` },
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.message || json.msg || `HTTP ${res.status}`);
        return json;
    }

    async artifactSignedUrl(token, conversationId, { type, name, content }) {
        const res = await fetch(
            `${this.baseUrl()}/api/v1/conversation/${conversationId}/artifact/signed-url`,
            {
                method: 'POST',
                headers: authHeaders(token),
                body: JSON.stringify({ type, name, content }),
            }
        );
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.message || json.msg || `HTTP ${res.status}`);
        return json;
    }

    /**
     * @param {string} token
     * @param {{ uri: string, name?: string, type?: string }} file - RN file shape
     * @param {string} [displayName]
     */
    buildArtifactGetUrl(conversationId, { type, name, content }) {
        const qs = [
            `type=${encodeURIComponent(type)}`,
            `name=${encodeURIComponent(name)}`,
            `content=${encodeURIComponent(content)}`,
        ].join('&');
        return `${this.baseUrl()}/api/v1/conversation/${conversationId}/artifact?${qs}`;
    }

    async uploadAttachment(token, file, displayName) {
        const form = new FormData();
        form.append('file', {
            uri: file.uri,
            name: file.name || 'upload',
            type: file.type || 'application/octet-stream',
        });
        if (displayName) form.append('name', displayName);

        const res = await fetch(`${this.baseUrl()}/api/v1/messages/attachment`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` },
            body: form,
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.msg || json.message || `HTTP ${res.status}`);
        return json;
    }
}

export default new AgentApiService();
