import { useState } from 'react';

import { useAuth } from './context/AuthContext';

import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import DashboardPage from './pages/DashboardPage';
import HouseholdPage from './pages/HouseholdPage';

import type { Household } from './types/household';


function App() {
    const {
        user,
        loading
    } = useAuth();

    const [selectedHousehold, setSelectedHousehold] =
        useState<Household | null>(null);

    const [authMode, setAuthMode] =
        useState<'login' | 'register'>('login');

    if (loading) {
        return (
            <p>
                Checking authentication...
            </p>
        );
    }

    if (!user) {
        if (authMode === 'register') {
            return (
                <RegisterPage
                    onShowLogin={() =>
                        setAuthMode('login')
                    }
                />
            );
        }

        return (
            <LoginPage
                onShowRegister={() =>
                    setAuthMode('register')
                }
            />
        );
    }

    if (selectedHousehold) {
        return (
            <HouseholdPage
                household={selectedHousehold}
                onBack={() =>
                    setSelectedHousehold(null)
                }
            />
        );
    }

    return (
        <DashboardPage
            onSelectHousehold={
                setSelectedHousehold
            }
        />
    );
}

export default App;