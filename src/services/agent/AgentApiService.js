import { AGENT_API_URL } from '../../config/api.config';
import apiClient from '../api/apiClient';

class AgentApiService {
    baseUrl() {
        return (AGENT_API_URL || '').replace(/\/$/, '');
    }

    async listConversations(token, query = {}) {
        const qs = Object.entries(query)
            .filter(([, v]) => v !== undefined && v !== null && v !== '')
            .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
            .join('&');
        const url = `${this.baseUrl()}/api/v1/conversations${qs ? `?${qs}` : ''}`;

        try {
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                }
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`HTTP ${response.status}: ${errorText}`);
            }

            const data = await response.json();
            return data;
        } catch (error) {
            console.error('listConversations error:', error.message);
            throw error;
        }
    }

    async deleteConversation(token, conversationId) {
        const url = `${this.baseUrl()}/api/v1/conversation/${conversationId}`;

        try {
            const response = await fetch(url, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                }
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`HTTP ${response.status}: ${errorText}`);
            }

            const data = await response.json();
            return data;
        } catch (error) {
            console.error('deleteConversation error:', error.message);
            throw error;
        }
    }

    async cancelConversation(token, conversationId) {
        const url = `${this.baseUrl()}/api/v1/conversation/${conversationId}/cancel`;

        console.log('🔗 cancelConversation URL:', url);

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                },
                body: JSON.stringify({})
            });

            console.log('🔗 cancelConversation response status:', response.status);

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`HTTP ${response.status}: ${errorText}`);
            }

            return await response.json();
        } catch (error) {
            console.error('🔗 cancelConversation error:', error);
            throw error;
        }
    }

    async fetchCitations(token, runId) {
        const url = `${this.baseUrl()}/api/v1/run/${runId}/citations`;

        try {
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                }
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`HTTP ${response.status}: ${errorText}`);
            }

            return await response.json();
        } catch (error) {
            throw error;
        }
    }

    async artifactSignedUrl(token, conversationId, { type, name, content }) {
        const url = `${this.baseUrl()}/api/v1/conversation/${conversationId}/artifact/signed-url`;

        console.log('🔗 artifactSignedUrl URL:', url);

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                },
                body: JSON.stringify({ type, name, content })
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`HTTP ${response.status}: ${errorText}`);
            }

            return await response.json();
        } catch (error) {
            console.error('🔗 artifactSignedUrl error:', error);
            throw error;
        }
    }

    buildArtifactGetUrl(conversationId, { type, name, content }) {
        const qs = [
            `type=${encodeURIComponent(type)}`,
            `name=${encodeURIComponent(name)}`,
            `content=${encodeURIComponent(content)}`,
        ].join('&');
        return `${this.baseUrl()}/api/v1/conversation/${conversationId}/artifact?${qs}`;
    }

    async getConversationMessages(token, conversationId) {
        console.log('🔗 getConversationMessages conversationId:', conversationId);

        // Try endpoint 1
        const url1 = `${this.baseUrl()}/api/v1/conversations/${conversationId}/messages`;
        try {
            console.log('🔗 Trying endpoint 1:', url1);
            const response = await fetch(url1, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                }
            });

            if (!response.ok) {
                throw new Error(`Endpoint 1 failed: HTTP ${response.status}`);
            }

            return await response.json();
        } catch (error) {
            console.log('🔗 Endpoint 1 failed:', error.message, 'trying endpoint 2...');

            // Try endpoint 2
            const url2 = `${this.baseUrl()}/api/v1/threads/${conversationId}/messages`;
            try {
                console.log('🔗 Trying endpoint 2:', url2);
                const response = await fetch(url2, {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json',
                        'Accept': 'application/json',
                    }
                });

                if (!response.ok) {
                    throw new Error(`Endpoint 2 failed: HTTP ${response.status}`);
                }

                return await response.json();
            } catch (error2) {
                console.error('🔗 Both endpoints failed:', error2);
                throw error; // Throw original error
            }
        }
    }

    async uploadAttachment(token, file, displayName) {
        const form = new FormData();
        form.append('file', {
            uri: file.uri,
            name: file.name || 'upload',
            type: file.type || 'application/octet-stream',
        });
        if (displayName) form.append('name', displayName);

        // Upload cần dùng fetch trực tiếp vì FormData
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