import apiClient from './api/apiClient';
import * as SecureStore from 'expo-secure-store';

import { CORE_API_URL, CORE_AUTH_PATHS, USE_MOCK_AUTH } from '../config/api.config';



const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function coreBaseUrl() {
    return (CORE_API_URL || '').replace(/\/$/, '');
}

function normalizeUser(user, fallbackEmail) {
    if (!user || typeof user !== 'object') {
        const local = (fallbackEmail || '').split('@')[0] || 'Người dùng';
        return {
            name: local,
            email: fallbackEmail || '',
            role: '',
        };
    }
    const name =
        user.name ||
        user.full_name ||
        user.display_name ||
        (user.email || fallbackEmail || '').split('@')[0] ||
        'Người dùng';
    const role =
        (typeof user.role === 'object' && user.role?.name) ||
        user.role ||
        user.role_id ||
        '';
    return {
        ...user,
        name,
        email: user.email || fallbackEmail || '',
        role,
    };
}

class AuthService {
    constructor() {
        this._refreshToken = null;
        this._currentUser = null;
        this._sessionKey = 'hanobrain_auth_session_v1';
    }

    async _saveSession() {
        try {
            const payload = {
                accessToken: apiClient.getAuthToken(),
                refreshToken: this._refreshToken,
                user: this._currentUser,
            };
            await SecureStore.setItemAsync(this._sessionKey, JSON.stringify(payload));
        } catch {
            // ignore persistence errors
        }
    }

    async _clearSessionStorage() {
        try {
            await SecureStore.deleteItemAsync(this._sessionKey);
        } catch {
            // ignore persistence errors
        }
    }

    async _postCore(path, body) {
        const url = `${coreBaseUrl()}${path}`;
        const res = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json',
            },
            body: JSON.stringify(body),
        });
        const json = await res.json().catch(() => ({}));
        return { ok: res.ok, status: res.status, json };
    }

    _applyTokenBundle(data) {
        const access = data?.access_token;
        if (!access) return false;
        this._refreshToken = data.refresh_token || this._refreshToken;
        apiClient.setAuthToken(access);
        return true;
    }

    /**
     * @param {string} email - Core API dùng email (§2.1). Mock vẫn cho phép "admin".
     * @param {string} password
     * @param {{ role_id?: string, partner_id?: string }} [options]
     */
    async login(email, password, options = {}) {
        const id = (email || '').trim();
        const secret = password || '';

        const { ok, json } = await this._postCore(CORE_AUTH_PATHS.login, {
            email: id,
            password: secret,
            ...(options.role_id ? { role_id: options.role_id } : {}),
            ...(options.partner_id ? { partner_id: options.partner_id } : {}),
        });

        if (!ok || json.code !== 200) {
            const err = json.msg || json.message || `Lỗi đăng nhập (${json.code ?? '?'})`;
            return { success: false, error: err };
        }

        const data = json.data;
        if (!this._applyTokenBundle(data)) {
            return { success: false, error: 'Phản hồi không có access_token' };
        }

        this._currentUser = {
            ...normalizeUser(data.user, id),
            role_id: data.role_id || data.user?.role_id,
            partner_id: data.partner_id || data.user?.partner_id,
            user_id: data.user?.id || data.user_id,
        };
        await this._saveSession();
        return {
            success: true,
            data: this._currentUser,
        };
    }

    /**
     * Đăng ký: path mặc định có thể khác từng hệ thống — chỉnh CORE_AUTH_PATHS.register.
     * Nếu server trả luôn access_token (giống login), token được gán vào apiClient.
     */
    async register(email, password, extra = {}) {
        const id = (email || '').trim();
        const secret = password || '';

        if (USE_MOCK_AUTH) {
            return {
                success: false,
                error: 'Tắt USE_MOCK_AUTH trong api.config.js để đăng ký qua API thật.',
            };
        }

        const { ok, json } = await this._postCore(CORE_AUTH_PATHS.register, {
            email: id,
            password: secret,
            ...extra,
        });

        const codeOk = json.code === 200 || json.code === 201;
        if (!ok || !codeOk) {
            const err = json.msg || json.message || `Đăng ký thất bại (${json.code ?? '?'})`;
            return { success: false, error: err };
        }

        const data = json.data;
        if (data?.access_token && this._applyTokenBundle(data)) {
            this._currentUser = {
                ...normalizeUser(data.user, id),
                role_id: data.role_id || data.user?.role_id,
                partner_id: data.partner_id || data.user?.partner_id,
                user_id: data.user?.id || data.user_id,
            };
            await this._saveSession();
            return {
                success: true,
                data: this._currentUser,
                loggedIn: true,
            };
        }

        return {
            success: true,
            data: null,
            loggedIn: false,
            message: json.msg || 'Đăng ký thành công. Vui lòng đăng nhập.',
        };
    }

    /** §2.2 — cần đã login và server đã trả refresh_token. */
    async refreshAccessToken() {
        if (!this._refreshToken) {
            return { success: false, error: 'Không có refresh_token' };
        }

        if (USE_MOCK_AUTH) {
            return { success: true };
        }

        const { ok, json } = await this._postCore(CORE_AUTH_PATHS.refresh, {
            refresh_token: this._refreshToken,
        });

        if (!ok || json.code !== 200) {
            const err = json.msg || json.message || 'Refresh thất bại';
            return { success: false, error: err };
        }

        if (!this._applyTokenBundle(json.data)) {
            return { success: false, error: 'Phản hồi refresh không có access_token' };
        }
        await this._saveSession();

        return { success: true };
    }

    async bootstrapSession() {
        try {
            const raw = await SecureStore.getItemAsync(this._sessionKey);
            if (!raw) return { success: false };
            const data = JSON.parse(raw);
            if (data?.accessToken) apiClient.setAuthToken(data.accessToken);
            this._refreshToken = data?.refreshToken || null;
            this._currentUser = data?.user || null;
            if (!data?.accessToken || !this._currentUser) return { success: false };
            return { success: true, data: this._currentUser };
        } catch {
            return { success: false };
        }
    }

    async logout() {
        apiClient.setAuthToken(null);
        this._refreshToken = null;
        this._currentUser = null;
        await this._clearSessionStorage();
        return { success: true };
    }

    getCurrentUser() {
        return this._currentUser;
    }
}

export default new AuthService();
