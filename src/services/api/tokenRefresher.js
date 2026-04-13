import { CORE_API_URL, CORE_AUTH_PATHS } from '../../config/api.config';

let refreshPromise = null;

async function corePost(path, body) {
    const url = `${CORE_API_URL.replace(/\/$/, '')}${path}`;
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, json };
}

export async function refreshAccessToken(refreshToken) {
    if (!refreshToken) return { success: false, error: 'No refresh token' };

    const { ok, json } = await corePost(CORE_AUTH_PATHS.refresh, {
        refresh_token: refreshToken,
    });

    if (!ok || json.code !== 200) {
        return { success: false, error: json.msg || 'Refresh failed' };
    }

    return {
        success: true,
        accessToken: json.data?.access_token,
        refreshToken: json.data?.refresh_token,
    };
}

export function createTokenRefresher(getRefreshToken, setAuthToken) {
    return async function ensureValidToken() {
        if (refreshPromise) {
            return refreshPromise;
        }

        refreshPromise = (async () => {
            const refreshToken = getRefreshToken();
            if (!refreshToken) {
                throw new Error('No refresh token available');
            }

            const result = await refreshAccessToken(refreshToken);
            if (result.success && result.accessToken) {
                setAuthToken(result.accessToken);
                return result.accessToken;
            }
            throw new Error(result.error || 'Token refresh failed');
        })();

        try {
            const token = await refreshPromise;
            return token;
        } finally {
            refreshPromise = null;
        }
    };
}