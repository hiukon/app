// MOCK DATA - SAU NÀY THAY BẰNG API RESPONSE
export const MOCK_DATA = {
    // Thông tin user
    user: {
        id: 1,
        name: 'Nguyễn Văn A',
        email: 'nguyenvana@hanobrain.vn',
        avatar: null,
        role: 'Quản trị viên',
        department: 'Ban Nội chính'
    },

    // Thống kê tổng quan
    overview: {
        totalCHTSapQuaHan: 319,
        totalHTQuaHan: 22,
        totalCTHQuaHan: 30,
    },

    // Chi tiết thống kê từng đơn vị
    statistics: [
        {
            id: 1,
            name: 'UỶ BAN KIỂM TRA',
            cthQuaHan: 1,
            cthSapQuaHan: 0,
            cthTrongHan: 14,
            htQuaHan: 0,
            htDangKy: 1,
            total: 16,
            status: 'normal'
        },
        {
            id: 2,
            name: 'THƯỜNG TRỰC',
            cthQuaHan: 0,
            cthSapQuaHan: 0,
            cthTrongHan: 1,
            htQuaHan: 0,
            htDangKy: 0,
            total: 1,
            status: 'normal'
        },
        {
            id: 3,
            name: 'BAN TUYÊN GIÁO VÀ DÂN VẬN',
            cthQuaHan: 0,
            cthSapQuaHan: 0,
            cthTrongHan: 13,
            htQuaHan: 1,
            htDangKy: 9,
            total: 23,
            status: 'warning'
        },
        {
            id: 4,
            name: 'ĐẢNG BỘ TRỰC THUỘC',
            cthQuaHan: 56,
            cthSapQuaHan: 1,
            cthTrongHan: 1165,
            htQuaHan: 127,
            htDangKy: 1239,
            total: 2588,
            status: 'danger'
        },
        {
            id: 5,
            name: 'BAN NỘI CHÍNH',
            cthQuaHan: 1,
            cthSapQuaHan: 0,
            cthTrongHan: 12,
            htQuaHan: 3,
            htDangKy: 16,
            total: 32,
            status: 'normal'
        }
    ],

    // Tin tức mới nhất
    news: [
        {
            id: 1,
            title: 'Hà Nội đẩy mạnh chuyển đổi số trong quản lý hành chính',
            date: '2024-01-15',
            views: 1234
        },
        {
            id: 2,
            title: 'Triển khai hệ thống AI hỗ trợ xử lý công việc',
            date: '2024-01-14',
            views: 892
        },
        {
            id: 3,
            title: 'Nâng cao hiệu quả quản lý văn bản điện tử',
            date: '2024-01-13',
            views: 567
        }
    ],

    // Features khám phá
    exploreFeatures: [
        { id: 1, name: 'Báo cáo thống kê', icon: 'bar-chart', color: '#2563eb' },
        { id: 2, name: 'Quản lý công việc', icon: 'assignment', color: '#10b981' },
        { id: 3, name: 'Lịch họp', icon: 'event', color: '#f59e0b' },
        { id: 4, name: 'Tài liệu nội bộ', icon: 'folder', color: '#ef4444' },
        { id: 5, name: 'Thông báo', icon: 'notifications', color: '#8b5cf6' },
        { id: 6, name: 'Đánh giá hiệu suất', icon: 'trending-up', color: '#06b6d4' }
    ],

    // Thông tin ứng dụng
    appInfo: {
        version: '1.0.0',
        company: 'HaNoiBrain',
        supportEmail: 'support@hanobrain.vn',
        hotline: '1900 1234'
    }
};

// HÀM MÔ PHỎNG API DELAY
export const mockApiDelay = () => new Promise(resolve => setTimeout(resolve, 500));