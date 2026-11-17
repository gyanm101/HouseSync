import {
    createContext,
    useContext,
    useEffect,
    useState,
    type ReactNode
} from 'react';

import type { User } from '../types/auth';

const API_URL = 'http://localhost:3000';

type AuthContextType = {
    user: User | null;
    loading: boolean;

    login: (
        email: string,
        password: string
    ) => Promise<void>;

    register: (
        name: string,
        email: string,
        password: string
    ) => Promise<void>;

    logout: () => Promise<void>;

    refreshUser: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(
    undefined
);

type AuthProviderProps = {
    children: ReactNode;
};

export function AuthProvider({
                                 children
                             }: AuthProviderProps) {

    const [user, setUser] = useState<User | null>(null);

    const [loading, setLoading] = useState(true);

    async function refreshUser() {
        try {
            const response = await fetch(
                `${API_URL}/auth/me`,
                {
                    credentials: 'include'
                }
            );

            if (response.ok) {
                const data: User = await response.json();

                setUser(data);
            } else {
                setUser(null);
            }

        } catch (error) {
            console.error(
                'Failed to load current user:',
                error
            );

            setUser(null);

        } finally {
            setLoading(false);
        }
    }

    async function login(
        email: string,
        password: string
    ) {
        const response = await fetch(
            `${API_URL}/auth/login`,
            {
                method: 'POST',

                headers: {
                    'Content-Type': 'application/json'
                },

                credentials: 'include',

                body: JSON.stringify({
                    email,
                    password
                })
            }
        );

        const data = await response.json();

        if (!response.ok) {
            throw new Error(
                data.error || 'Login failed'
            );
        }

        setUser(data);
    }

    async function register(
        name: string,
        email: string,
        password: string
    ) {
        const response = await fetch(
            `${API_URL}/auth/register`,
            {
                method: 'POST',

                headers: {
                    'Content-Type': 'application/json'
                },

                credentials: 'include',

                body: JSON.stringify({
                    name,
                    email,
                    password
                })
            }
        );

        const data = await response.json();

        if (!response.ok) {
            throw new Error(
                data.error || 'Registration failed'
            );
        }

        // Registration currently creates the user,
        // but does not create a login session.
        // So log the new user in immediately afterward.
        await login(email, password);
    }

    async function logout() {
        const response = await fetch(
            `${API_URL}/auth/logout`,
            {
                method: 'POST',

                credentials: 'include'
            }
        );

        if (!response.ok) {
            throw new Error('Logout failed');
        }

        setUser(null);
    }

    useEffect(() => {
        refreshUser();
    }, []);

    return (
        <AuthContext.Provider
            value={{
                user,
                loading,
                login,
                register,
                logout,
                refreshUser
            }}
        >
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);

    if (context === undefined) {
        throw new Error(
            'useAuth must be used inside AuthProvider'
        );
    }

    return context;
}