import type { Household } from '../types/household';
import { useState } from 'react';
import ChoresSection
    from '../features/chores/ChoresSection';

type HouseholdPageProps = {
    household: Household;
    onBack: () => void;
};

type Feature =
    | 'overview'
    | 'chores'
    | 'expenses'
    | 'groceries'
    | 'maintenance';

export default function HouseholdPage({
      household,
      onBack
  }: HouseholdPageProps) {

    const [activeFeature, setActiveFeature] =
        useState<Feature>('overview');

    return (
        <div>
            <header>
                <button onClick={onBack}>
                    Back to households
                </button>

                <h1>
                    {household.name}
                </h1>

                <p>
                    Role: {household.role}
                </p>
            </header>

            <nav>
                <button
                    onClick={() =>
                        setActiveFeature('chores')
                    }
                >
                    Chores
                </button>

                <button
                    onClick={() =>
                        setActiveFeature('expenses')
                    }
                >
                    Expenses
                </button>

                <button
                    onClick={() =>
                        setActiveFeature('groceries')
                    }
                >
                    Groceries
                </button>

                <button
                    onClick={() =>
                        setActiveFeature('maintenance')
                    }
                >
                    Maintenance
                </button>
            </nav>

            <main>
                {activeFeature === 'overview' && (
                    <div>
                        <h2>Household Overview</h2>

                        <p>
                            Choose a feature above.
                        </p>
                    </div>
                )}

                {activeFeature === 'chores' && (
                    <ChoresSection
                        householdId={household.id}
                    />
                )}

                {activeFeature === 'expenses' && (
                    <p>Expenses coming next.</p>
                )}

                {activeFeature === 'groceries' && (
                    <p>Groceries coming next.</p>
                )}

                {activeFeature === 'maintenance' && (
                    <p>Maintenance will be Chunk 3.</p>
                )}
            </main>
        </div>
    );
}