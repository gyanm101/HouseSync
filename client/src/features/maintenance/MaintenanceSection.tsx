import {
    useEffect,
    useState
} from 'react';

import type { MaintenanceRequest }
    from '../../types/maintenance';

import MaintenanceAttachments
    from './MaintenanceAttachments';

const API_URL = 'http://localhost:3000';

type MaintenanceSectionProps = {
    householdId: number;
};

export default function MaintenanceSection({
       householdId
   }: MaintenanceSectionProps) {

    const [requests, setRequests] =
        useState<MaintenanceRequest[]>([]);

    const [loading, setLoading] =
        useState(true);

    const [error, setError] =
        useState('');

    const [title, setTitle] =
        useState('');

    const [description, setDescription] =
        useState('');

    const [creating, setCreating] =
        useState(false);

    const [createError, setCreateError] =
        useState('');

    useEffect(() => {
        async function loadMaintenance() {
            try {
                const response = await fetch(
                    `${API_URL}/households/${householdId}/maintenance`,
                    {
                        credentials: 'include'
                    }
                );

                const data = await response.json();

                if (!response.ok) {
                    throw new Error(
                        data.error ||
                        'Failed to load maintenance requests'
                    );
                }

                setRequests(data);

            } catch (error) {
                if (error instanceof Error) {
                    setError(error.message);
                } else {
                    setError(
                        'Failed to load maintenance requests'
                    );
                }

            } finally {
                setLoading(false);
            }
        }

        loadMaintenance();

    }, [householdId]);

    async function handleCreateRequest(
        event: React.FormEvent<HTMLFormElement>
    ) {
        event.preventDefault();

        setCreateError('');
        setCreating(true);

        try {
            const response = await fetch(
                `${API_URL}/households/${householdId}/maintenance`,
                {
                    method: 'POST',

                    headers: {
                        'Content-Type': 'application/json'
                    },

                    credentials: 'include',

                    body: JSON.stringify({
                        title,
                        description,
                        assignedTo: null
                    })
                }
            );

            const data = await response.json();

            if (!response.ok) {
                throw new Error(
                    data.error ||
                    'Failed to create maintenance request'
                );
            }

            setRequests(currentRequests => [
                data,
                ...currentRequests
            ]);

            setTitle('');
            setDescription('');

        } catch (error) {
            if (error instanceof Error) {
                setCreateError(error.message);
            } else {
                setCreateError(
                    'Failed to create maintenance request'
                );
            }

        } finally {
            setCreating(false);
        }
    }

    async function handleStatusChange(
        requestId: number,
        status:
            | 'open'
            | 'in_progress'
            | 'resolved'
    ) {
        try {
            const response = await fetch(
                `${API_URL}/maintenance/${requestId}/status`,
                {
                    method: 'PATCH',

                    headers: {
                        'Content-Type': 'application/json'
                    },

                    credentials: 'include',

                    body: JSON.stringify({
                        status
                    })
                }
            );

            const updatedRequest =
                await response.json();

            if (!response.ok) {
                throw new Error(
                    updatedRequest.error ||
                    'Failed to update status'
                );
            }

            setRequests(currentRequests =>
                currentRequests.map(request =>
                    request.id === updatedRequest.id
                        ? {
                            ...request,
                            ...updatedRequest
                        }
                        : request
                )
            );

        } catch (error) {
            console.error(error);
        }
    }

    async function handleDeleteRequest(
        requestId: number
    ) {
        try {
            const response = await fetch(
                `${API_URL}/maintenance/${requestId}`,
                {
                    method: 'DELETE',
                    credentials: 'include'
                }
            );

            const data = await response.json();

            if (!response.ok) {
                throw new Error(
                    data.error ||
                    'Failed to delete maintenance request'
                );
            }

            setRequests(currentRequests =>
                currentRequests.filter(
                    request =>
                        request.id !== requestId
                )
            );

        } catch (error) {
            console.error(error);
        }
    }

    if (loading) {
        return (
            <p>
                Loading maintenance requests...
            </p>
        );
    }

    if (error) {
        return <p>{error}</p>;
    }

    return (
        <section>
            <h2>Maintenance</h2>

            <form onSubmit={handleCreateRequest}>
                <h3>New Maintenance Request</h3>

                <div>
                    <label>
                        Title
                    </label>

                    <input
                        type="text"
                        value={title}
                        onChange={(event) =>
                            setTitle(event.target.value)
                        }
                        placeholder="Leaking sink"
                        required
                    />
                </div>

                <div>
                    <label>
                        Description
                    </label>

                    <textarea
                        value={description}
                        onChange={(event) =>
                            setDescription(
                                event.target.value
                            )
                        }
                        placeholder="Water is leaking under the kitchen sink."
                        required
                    />
                </div>

                {createError && (
                    <p>{createError}</p>
                )}

                <button
                    type="submit"
                    disabled={creating}
                >
                    {creating
                        ? 'Creating...'
                        : 'Create request'}
                </button>
            </form>

            {requests.length === 0 && (
                <p>
                    No maintenance requests yet.
                </p>
            )}

            {requests.map(request => (
                <div key={request.id}>
                    <h3>
                        {request.title}
                    </h3>

                    <p>
                        {request.description}
                    </p>

                    <p>
                        Status:{' '}
                        {request.status}
                    </p>

                    <p>
                        Reported by:{' '}
                        {request.reported_by_name}
                    </p>

                    <p>
                        Assigned to:{' '}
                        {request.assigned_to_name ??
                            'Unassigned'}
                    </p>

                    <select
                        value={request.status}
                        onChange={(event) =>
                            handleStatusChange(
                                request.id,
                                event.target.value as
                                    | 'open'
                                    | 'in_progress'
                                    | 'resolved'
                            )
                        }
                    >

                        <option value="open">
                            Open
                        </option>

                        <option value="in_progress">
                            In Progress
                        </option>

                        <option value="resolved">
                            Resolved
                        </option>
                    </select>

                    <MaintenanceAttachments
                        requestId={request.id}
                    />

                    <button
                        onClick={() =>
                            handleDeleteRequest(
                                request.id
                            )
                        }
                    >
                        Delete request
                    </button>
                </div>
            ))}


        </section>
    );
}