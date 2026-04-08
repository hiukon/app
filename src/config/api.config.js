// ===== CHỈ CẦN SỬA DÒNG NÀY ĐỂ CHUYỂN SANG API THẬT =====
export const USE_MOCK_DATA = true;  // false khi có API thật

// API Endpoints
export const API_ENDPOINTS = {
    BASE_URL: 'https://api.hanobrain.vn/v1',
    LOGIN: '/auth/login',
    STATISTICS: '/statistics',
    OVERVIEW: '/statistics/overview',
    NEWS: '/news',
    USER_INFO: '/user/info',
    CHAT_SEND: '/chat/send',
    CHAT_HISTORY: '/chat/history',
};

// Cấu hình request
export const API_CONFIG = {
    timeout: 30000,
    retryCount: 3,
    retryDelay: 1000,
    headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
    }
};