import { API_ENDPOINTS, API_CONFIG } from '../../config/api.config';

class ApiClient {
    constructor() {
        this.baseURL = API_ENDPOINTS.BASE_URL;
        this.headers = { ...API_CONFIG.headers };
        this.timeout = API_CONFIG.timeout;
    }

    setAuthToken(token) {
        if (token) {
            this.headers['Authorization'] = `Bearer ${token}`;
        } else {
            delete this.headers['Authorization'];
        }
    }

    getAuthToken() {
        const auth = this.headers['Authorization'];
        if (!auth || typeof auth !== 'string') return null;
        const m = auth.match(/^Bearer\s+(.+)$/i);
        return m ? m[1].trim() : null;
    }

    async request(endpoint, options = {}) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeout);

        try {
            const response = await fetch(`${this.baseURL}${endpoint}`, {
                ...options,
                headers: { ...this.headers, ...options.headers },
                signal: controller.signal,
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.message || `HTTP ${response.status}`);
            }

            return await response.json();
        } catch (error) {
            clearTimeout(timeoutId);
            if (error.name === 'AbortError') {
                throw new Error('Request timeout');
            }
            throw error;
        }
    }

    get(endpoint, params = {}) {
        const query = Object.keys(params)
            .filter((key) => params[key] !== undefined && params[key] !== null && params[key] !== '')
            .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(String(params[key]))}`)
            .join('&');
        const sep = endpoint.includes('?') ? '&' : '?';
        const finalEndpoint = query ? `${endpoint}${sep}${query}` : endpoint;
        return this.request(finalEndpoint, { method: 'GET' });
    }

    post(endpoint, data) {
        return this.request(endpoint, {
            method: 'POST',
            body: JSON.stringify(data),
        });
    }

    put(endpoint, data) {
        return this.request(endpoint, {
            method: 'PUT',
            body: JSON.stringify(data),
        });
    }

    delete(endpoint) {
        return this.request(endpoint, { method: 'DELETE' });
    }
}

export default new ApiClient();