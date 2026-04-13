import React, { createContext, useState, useContext, useEffect } from 'react';
import AuthService from '../services/AuthService';
import apiClient from '../services/api/apiClient';

const AuthContext = createContext();

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        let mounted = true;
        (async () => {
            setIsLoading(true);
            const res = await AuthService.bootstrapSession();
            // Only set user if bootstrap succeeded AND token is actually in memory
            if (mounted && res.success && res.data && apiClient.getAuthToken()) {
                setUser(res.data);
            }
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
        // Verify token was actually set before marking user as logged in
        if (result.success && apiClient.getAuthToken()) {
            setUser(result.data);
        }
        setIsLoading(false);
        return result;
    };

    const register = async (email, password) => {
        setIsLoading(true);
        const result = await AuthService.register(email, password);
        // Verify token was actually set before marking user as logged in
        if (result.success && result.data && apiClient.getAuthToken()) {
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