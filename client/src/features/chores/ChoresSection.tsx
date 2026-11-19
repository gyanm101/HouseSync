import {
    useEffect,
    useState
} from 'react';

import type { Chore } from '../../types/chore';

const API_URL = 'http://localhost:3000';

type ChoresSectionProps = {
    householdId: number;
};

export default function ChoresSection({
                                          householdId
                                      }: ChoresSectionProps) {

    const [chores, setChores] =
        useState<Chore[]>([]);

    const [loading, setLoading] =
        useState(true);

    const [error, setError] =
        useState('');

    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [creating, setCreating] = useState(false);
    const [createError, setCreateError] = useState('');

    async function handleCreateChore(
        event: React.FormEvent<HTMLFormElement>
    ) {
        event.preventDefault();

        setCreateError('');
        setCreating(true);

        try {
            const response = await fetch(
                `${API_URL}/households/${householdId}/chores`,
                {
                    method: 'POST',

                    headers: {
                        'Content-Type': 'application/json'
                    },

                    credentials: 'include',

                    body: JSON.stringify({
                        title,
                        description:
                            description.trim() === ''
                                ? null
                                : description
                    })
                }
            );

            const data = await response.json();

            if (!response.ok) {
                throw new Error(
                    data.error || 'Failed to create chore'
                );
            }

            setChores(currentChores => [
                data,
                ...currentChores
            ]);

            setTitle('');
            setDescription('');

        } catch (error) {
            if (error instanceof Error) {
                setCreateError(error.message);
            } else {
                setCreateError(
                    'Failed to create chore'
                );
            }

        } finally {
            setCreating(false);
        }
    }

    async function handleToggleStatus(chore: Chore) {
        const newStatus =
            chore.status === 'open'
                ? 'completed'
                : 'open';

        try {
            const response = await fetch(
                `${API_URL}/chores/${chore.id}/status`,
                {
                    method: 'PATCH',

                    headers: {
                        'Content-Type': 'application/json'
                    },

                    credentials: 'include',

                    body: JSON.stringify({
                        status: newStatus
                    })
                }
            );

            const updatedChore = await response.json();

            if (!response.ok) {
                throw new Error(
                    updatedChore.error ||
                    'Failed to update chore'
                );
            }

            setChores(currentChores =>
                currentChores.map(currentChore =>
                    currentChore.id === updatedChore.id
                        ? {
                            ...currentChore,
                            ...updatedChore
                        }
                        : currentChore
                )
            );

        } catch (error) {
            console.error(error);
        }
    }

    async function handleDeleteChore(choreId: number) {
        try {
            const response = await fetch(
                `${API_URL}/chores/${choreId}`,
                {
                    method: 'DELETE',
                    credentials: 'include'
                }
            );

            const data = await response.json();

            if (!response.ok) {
                throw new Error(
                    data.error ||
                    'Failed to delete chore'
                );
            }

            setChores(currentChores =>
                currentChores.filter(
                    chore => chore.id !== choreId
                )
            );

        } catch (error) {
            console.error(error);
        }
    }

    useEffect(() => {
        async function loadChores() {
            try {
                const response = await fetch(
                    `${API_URL}/households/${householdId}/chores`,
                    {
                        credentials: 'include'
                    }
                );

                const data = await response.json();

                if (!response.ok) {
                    throw new Error(
                        data.error ||
                        'Failed to load chores'
                    );
                }

                setChores(data);

            } catch (error) {
                if (error instanceof Error) {
                    setError(error.message);
                } else {
                    setError(
                        'Failed to load chores'
                    );
                }

            } finally {
                setLoading(false);
            }
        }



        loadChores();

    }, [householdId]);

    if (loading) {
        return <p>Loading chores...</p>;
    }

    if (error) {
        return <p>{error}</p>;
    }

    return (
        <section>
            <h2>Chores</h2>

            {chores.length === 0 && (
                <p>No chores yet.</p>
            )}

            <form onSubmit={handleCreateChore}>
                <input
                    type="text"
                    placeholder="Chore title"
                    value={title}
                    onChange={(event) =>
                        setTitle(event.target.value)
                    }
                    required
                />

                <input
                    type="text"
                    placeholder="Description"
                    value={description}
                    onChange={(event) =>
                        setDescription(event.target.value)
                    }
                />

                <button
                    type="submit"
                    disabled={creating}
                >
                    {creating
                        ? 'Adding...'
                        : 'Add chore'}
                </button>

                {createError && (
                    <p>{createError}</p>
                )}
            </form>

            {chores.map(chore => (
                <div key={chore.id}>
                    <h3>
                        {chore.title}
                    </h3>

                    {chore.description && (
                        <p>
                            {chore.description}
                        </p>
                    )}

                    <p>
                        Status: {chore.status}
                    </p>

                    <p>
                        Assigned to:{' '}
                        {chore.assigned_to_name ??
                            'Unassigned'}
                    </p>

                    <button
                        onClick={() =>
                            handleToggleStatus(chore)
                        }
                    >
                        {chore.status === 'open'
                            ? 'Complete'
                            : 'Reopen'}
                    </button>

                    <button
                        onClick={() =>
                            handleDeleteChore(chore.id)
                        }
                    >
                        Delete
                    </button>
                </div>
            ))}
        </section>
    );
}