import { useState, useEffect } from 'react';
import StatController from '../controllers/StatController';

export function useStatistics() {
    const [stats, setStats] = useState([]);
    const [overview, setOverview] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        fetchStats();
    }, []);

    const fetchStats = async () => {
        setLoading(true);
        const result = await StatController.loadStatistics();
        if (result.success) {
            setStats(result.data);
            setOverview(result.overview);
            setError(null);
        } else {
            setError(result.error);
        }
        setLoading(false);
    };

    const refresh = () => fetchStats();

    return { stats, overview, loading, error, refresh };
}