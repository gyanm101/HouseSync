import {
    useEffect,
    useState,
    type FormEvent
} from 'react';

import type { GroceryItem } from '../../types/grocery';

const API_URL = 'http://localhost:3000';

type GroceriesSectionProps = {
    householdId: number;
};

export default function GroceriesSection({
                                             householdId
                                         }: GroceriesSectionProps) {

    const [items, setItems] =
        useState<GroceryItem[]>([]);

    const [loading, setLoading] =
        useState(true);

    const [error, setError] =
        useState('');

    const [name, setName] =
        useState('');

    const [quantity, setQuantity] =
        useState(1);

    const [creating, setCreating] =
        useState(false);

    const [createError, setCreateError] =
        useState('');

    useEffect(() => {
        async function loadGroceries() {
            try {
                const response = await fetch(
                    `${API_URL}/households/${householdId}/groceries`,
                    {
                        credentials: 'include'
                    }
                );

                const data = await response.json();

                if (!response.ok) {
                    throw new Error(
                        data.error ||
                        'Failed to load groceries'
                    );
                }

                setItems(data);

            } catch (error) {
                if (error instanceof Error) {
                    setError(error.message);
                } else {
                    setError(
                        'Failed to load groceries'
                    );
                }

            } finally {
                setLoading(false);
            }
        }

        loadGroceries();

    }, [householdId]);

    async function handleCreateItem(
        event: FormEvent<HTMLFormElement>
    ) {
        event.preventDefault();

        setCreateError('');
        setCreating(true);

        try {
            const response = await fetch(
                `${API_URL}/households/${householdId}/groceries`,
                {
                    method: 'POST',

                    headers: {
                        'Content-Type': 'application/json'
                    },

                    credentials: 'include',

                    body: JSON.stringify({
                        name,
                        quantity
                    })
                }
            );

            const data = await response.json();

            if (!response.ok) {
                throw new Error(
                    data.error ||
                    'Failed to create grocery item'
                );
            }

            setItems(currentItems => [
                data,
                ...currentItems
            ]);

            setName('');
            setQuantity(1);

        } catch (error) {
            if (error instanceof Error) {
                setCreateError(error.message);
            } else {
                setCreateError(
                    'Failed to create grocery item'
                );
            }

        } finally {
            setCreating(false);
        }
    }

    async function handleTogglePurchased(
        item: GroceryItem
    ) {
        try {
            const response = await fetch(
                `${API_URL}/groceries/${item.id}/status`,
                {
                    method: 'PATCH',

                    headers: {
                        'Content-Type': 'application/json'
                    },

                    credentials: 'include',

                    body: JSON.stringify({
                        purchased: !item.purchased
                    })
                }
            );

            const updatedItem = await response.json();

            if (!response.ok) {
                throw new Error(
                    updatedItem.error ||
                    'Failed to update grocery item'
                );
            }

            setItems(currentItems =>
                currentItems.map(currentItem =>
                    currentItem.id === updatedItem.id
                        ? {
                            ...currentItem,
                            ...updatedItem
                        }
                        : currentItem
                )
            );

        } catch (error) {
            console.error(error);
        }
    }

    async function handleDeleteItem(
        itemId: number
    ) {
        try {
            const response = await fetch(
                `${API_URL}/groceries/${itemId}`,
                {
                    method: 'DELETE',
                    credentials: 'include'
                }
            );

            const data = await response.json();

            if (!response.ok) {
                throw new Error(
                    data.error ||
                    'Failed to delete grocery item'
                );
            }

            setItems(currentItems =>
                currentItems.filter(
                    item => item.id !== itemId
                )
            );

        } catch (error) {
            console.error(error);
        }
    }

    if (loading) {
        return <p>Loading groceries...</p>;
    }

    if (error) {
        return <p>{error}</p>;
    }

    return (
        <section>
            <h2>Groceries</h2>

            <form onSubmit={handleCreateItem}>
                <input
                    type="text"
                    placeholder="Item name"
                    value={name}
                    onChange={(event) =>
                        setName(event.target.value)
                    }
                    required
                />

                <input
                    type="number"
                    min={1}
                    value={quantity}
                    onChange={(event) =>
                        setQuantity(
                            Number(event.target.value)
                        )
                    }
                    required
                />

                <button
                    type="submit"
                    disabled={creating}
                >
                    {creating
                        ? 'Adding...'
                        : 'Add item'}
                </button>

                {createError && (
                    <p>{createError}</p>
                )}
            </form>

            {items.length === 0 && (
                <p>No grocery items yet.</p>
            )}

            {items.map(item => (
                <div key={item.id}>
                    <h3>
                        {item.name}
                    </h3>

                    <p>
                        Quantity: {item.quantity}
                    </p>

                    <p>
                        Added by: {item.added_by_name}
                    </p>

                    <p>
                        Status:{' '}
                        {item.purchased
                            ? 'Purchased'
                            : 'Needed'}
                    </p>

                    {item.purchased && (
                        <p>
                            Purchased by:{' '}
                            {item.purchased_by_name ??
                                'Unknown'}
                        </p>
                    )}

                    <button
                        onClick={() =>
                            handleTogglePurchased(item)
                        }
                    >
                        {item.purchased
                            ? 'Mark as needed'
                            : 'Mark purchased'}
                    </button>

                    <button
                        onClick={() =>
                            handleDeleteItem(item.id)
                        }
                    >
                        Delete
                    </button>
                </div>
            ))}
        </section>
    );
}