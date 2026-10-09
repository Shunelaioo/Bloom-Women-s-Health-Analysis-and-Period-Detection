import { useState, useEffect, useCallback } from "react";

export interface CurrentUser {
    _id: string;
    email: string;
    isEmailVerified: boolean;
    profile?: {
        displayName?: string;
        avatarUrl?: string;
        lifeStage?: string;
    };
}

const API_ORIGIN =
    (import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "") || "http://localhost:5000").replace(
        /\/api$/,
        ""
    );

export function useCurrentUser() {
    const [user, setUser] = useState<CurrentUser | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchUser = useCallback(async () => {
        const token = localStorage.getItem("token");
        if (!token) {
            setUser(null);
            return null;
        }
        setIsLoading(true);
        setError(null);
        try {
            const res = await fetch(`${API_ORIGIN}/api/user/me`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (res.status === 401) {
                setUser(null);
                return null;
            }
            if (!res.ok) throw new Error(`Failed to fetch user (${res.status})`);
            const data: CurrentUser = await res.json();
            setUser(data);
            return data;
        } catch (err: any) {
            setError(err?.message || "Failed to fetch user");
            return null;
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchUser();
    }, [fetchUser]);

    const isVerified = user?.isEmailVerified ?? null;

    return { user, isVerified, isLoading, error, refetch: fetchUser };
}
