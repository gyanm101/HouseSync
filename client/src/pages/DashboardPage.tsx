import {
    useEffect,
    useState
} from 'react';

import { useAuth } from '../context/AuthContext';

import type { Household } from '../types/household';

const API_URL = 'http://localhost:3000';

type DashboardPageProps = {
    onSelectHousehold: (household: Household) => void;
};

export default function DashboardPage({
          onSelectHousehold
      }: DashboardPageProps) {
    const {
        user,
        logout
    } = useAuth();

    const [households, setHouseholds] =
        useState<Household[]>([]);

    const [loadingHouseholds, setLoadingHouseholds] =
        useState(true);

    const [error, setError] =
        useState('');

    useEffect(() => {
        async function loadHouseholds() {
            try {
                const response = await fetch(
                    `${API_URL}/households`,
                    {
                        credentials: 'include'
                    }
                );

                const data = await response.json();

                if (!response.ok) {
                    throw new Error(
                        data.error ||
                        'Failed to load households'
                    );
                }

                setHouseholds(data);

            } catch (error) {
                if (error instanceof Error) {
                    setError(error.message);
                } else {
                    setError(
                        'Failed to load households'
                    );
                }

            } finally {
                setLoadingHouseholds(false);
            }
        }

        loadHouseholds();
    }, []);

    return (
        <div>
            <header>
                <h1>
                    HouseSync
                </h1>

                <p>
                    Welcome, {user?.name}
                </p>

                <button onClick={logout}>
                    Logout
                </button>
            </header>

            <main>
                <h2>
                    Your Households
                </h2>

                {loadingHouseholds && (
                    <p>
                        Loading households...
                    </p>
                )}

                {error && (
                    <p>
                        {error}
                    </p>
                )}

                {!loadingHouseholds &&
                    !error &&
                    households.length === 0 && (
                        <p>
                            You don't belong to any households yet.
                        </p>
                    )}

                {households.map(household => (
                    <div key={household.id}>
                        <h3>
                            {household.name}
                        </h3>

                        <p>
                            Role: {household.role}
                        </p>

                        <button
                            onClick={() =>
                                onSelectHousehold(household)
                            }
                        >
                            Open household
                        </button>
                    </div>
                ))}
            </main>
        </div>
    );
}