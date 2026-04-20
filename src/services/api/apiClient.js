import { API_ENDPOINTS, API_CONFIG } from '../../config/api.config';

class ApiClient {
    constructor() {
        this.baseURL = API_ENDPOINTS.BASE_URL;
        this.headers = { ...API_CONFIG.headers };
        this.defaultTimeout = API_CONFIG.timeout;
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
        // ✅ Cho phép truyền timeout riêng cho từng request
        const requestTimeout = options.timeout || this.defaultTimeout;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), requestTimeout);

        try {
            const response = await fetch(`${this.baseURL}${endpoint}`, {
                ...options,
                headers: { ...this.headers, ...options.headers },
                signal: controller.signal,
            });

            clearTimeout(timeoutId);

            // Xử lý response không phải JSON
            const contentType = response.headers.get('content-type');

            if (!response.ok) {
                let errorMessage = `HTTP ${response.status}`;
                try {
                    if (contentType && contentType.includes('application/json')) {
                        const error = await response.json();
                        errorMessage = error.message || error.msg || errorMessage;
                    } else {
                        const errorText = await response.text();
                        if (errorText) errorMessage = errorText;
                    }
                } catch (e) {
                    // Ignore parse error
                }
                throw new Error(errorMessage);
            }

            // Nếu response là JSON
            if (contentType && contentType.includes('application/json')) {
                return await response.json();
            }

            // Nếu response là text
            return await response.text();
        } catch (error) {
            clearTimeout(timeoutId);
            if (error.name === 'AbortError') {
                throw new Error('Request timeout - Yêu cầu mất quá nhiều thời gian');
            }
            throw error;
        }
    }

    get(endpoint, params = {}, options = {}) {
        const query = Object.keys(params)
            .filter((key) => params[key] !== undefined && params[key] !== null && params[key] !== '')
            .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(String(params[key]))}`)
            .join('&');
        const sep = endpoint.includes('?') ? '&' : '?';
        const finalEndpoint = query ? `${endpoint}${sep}${query}` : endpoint;
        return this.request(finalEndpoint, { method: 'GET', ...options });
    }

    post(endpoint, data, options = {}) {
        return this.request(endpoint, {
            method: 'POST',
            body: JSON.stringify(data),
            ...options,
        });
    }

    put(endpoint, data, options = {}) {
        return this.request(endpoint, {
            method: 'PUT',
            body: JSON.stringify(data),
            ...options,
        });
    }

    delete(endpoint, options = {}) {
        return this.request(endpoint, { method: 'DELETE', ...options });
    }

    // ✅ Thêm method upload file với timeout tùy chỉnh
    upload(endpoint, formData, options = {}) {
        return this.request(endpoint, {
            method: 'POST',
            body: formData,
            headers: {
                // Không set Content-Type khi upload file
                'Content-Type': undefined,
            },
            ...options,
        });
    }
}

export default new ApiClient();