import DataService from '../services/DataService';

class StatController {
    async loadStatistics(filters = {}) {
        try {
            const statsRes = await DataService.getStatistics(filters);
            const overviewRes = await DataService.getOverviewStats(filters);

            if (statsRes.success && overviewRes.success) {
                const normalizedStats = statsRes.data.map((item) => ({
                    ...item,
                    title: item.name,
                    chtQuaHan: item.cthQuaHan,
                    chtSapQuaHan: item.cthSapQuaHan,
                    chtTrongHan: item.cthTrongHan,
                    color: item.status === 'danger' ? '#ef4444' : item.status === 'warning' ? '#f59e0b' : '#2563eb',
                }));

                return {
                    success: true,
                    data: normalizedStats,
                    overview: overviewRes.data
                };
            }
            const err =
                statsRes.error ||
                overviewRes.error ||
                'Không thể tải dữ liệu (statistics/overview)';
            console.error('loadStatistics failed', { statsRes, overviewRes });
            return { success: false, error: err, statsRes, overviewRes };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    getStatById(stats, id) {
        return stats.find(stat => stat.id === id);
    }

    filterStatsByStatus(stats, status) {
        switch (status) {
            case 'overdue':
                return stats.filter(s => s.cthQuaHan > 0);
            case 'warning':
                return stats.filter(s => s.cthSapQuaHan > 0);
            case 'normal':
                return stats.filter(s => s.cthQuaHan === 0 && s.cthSapQuaHan === 0);
            default:
                return stats;
        }
    }

    async loadAssignTasks(filters = {}) {
        try {
            const assignRes = await DataService.getAssignTasks(filters);

            if (assignRes.success) {
                const normalizedTasks = assignRes.data.map((item) => ({
                    ...item,
                    title: item.name,
                    chtQuaHan: item.cthQuaHan,
                    chtSapQuaHan: item.cthSapQuaHan,
                    chtTrongHan: item.cthTrongHan,
                    color: item.status === 'danger' ? '#ef4444' : item.status === 'warning' ? '#f59e0b' : '#2563eb',
                }));

                return {
                    success: true,
                    data: normalizedTasks
                };
            }
            const err = assignRes.error || 'Không thể tải dữ liệu (assign tasks)';
            console.error('loadAssignTasks failed', { assignRes });
            return { success: false, error: err, assignRes };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    getTotalStats(stats) {
        return stats.reduce((acc, curr) => ({
            cthQuaHan: acc.cthQuaHan + curr.cthQuaHan,
            cthSapQuaHan: acc.cthSapQuaHan + curr.cthSapQuaHan,
            cthTrongHan: acc.cthTrongHan + curr.cthTrongHan,
            htQuaHan: acc.htQuaHan + curr.htQuaHan,
            htDangKy: acc.htDangKy + curr.htDangKy,
        }), { cthQuaHan: 0, cthSapQuaHan: 0, cthTrongHan: 0, htQuaHan: 0, htDangKy: 0 });
    }
}

export default new StatController();