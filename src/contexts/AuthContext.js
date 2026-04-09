import React, { createContext, useState, useContext, useEffect } from 'react';
import AuthService from '../services/AuthService';

const AuthContext = createContext();

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        let mounted = true;
        (async () => {
            setIsLoading(true);
            const res = await AuthService.bootstrapSession();
            if (mounted && res.success && res.data) setUser(res.data);
            if (mounted) setIsLoading(false);
        })();
        return () => {
            mounted = false;
        };
    }, []);

    /** @param {string} email - Theo Core API §2.1; mock chấp nhận admin / admin@hanobrain.vn */
    const login = async (email, password) => {
        setIsLoading(true);
        const result = await AuthService.login(email, password);
        if (result.success) {
            setUser(result.data);
        }
        setIsLoading(false);
        return result;
    };

    const register = async (email, password) => {
        setIsLoading(true);
        const result = await AuthService.register(email, password);
        if (result.success && result.data) {
            setUser(result.data);
        }
        setIsLoading(false);
        return result;
    };

    const logout = async () => {
        await AuthService.logout();
        setUser(null);
    };

    return (
        <AuthContext.Provider value={{ user, login, register, logout, isLoading }}>
            {children}
        </AuthContext.Provider>
    );
}

export const useAuth = () => useContext(AuthContext);