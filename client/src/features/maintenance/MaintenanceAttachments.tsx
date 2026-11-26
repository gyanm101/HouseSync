import {
    useEffect,
    useState,
    type ChangeEvent,
    type FormEvent
} from 'react';

import type {
    MaintenanceAttachment
} from '../../types/maintenance';

const API_URL = 'http://localhost:3000';

type MaintenanceAttachmentsProps = {
    requestId: number;
};

export default function MaintenanceAttachments({
                                                   requestId
                                               }: MaintenanceAttachmentsProps) {

    const [attachments, setAttachments] =
        useState<MaintenanceAttachment[]>([]);

    const [selectedFile, setSelectedFile] =
        useState<File | null>(null);

    const [loading, setLoading] =
        useState(true);

    const [uploading, setUploading] =
        useState(false);

    const [error, setError] =
        useState('');

    async function loadAttachments() {
        try {
            const response = await fetch(
                `${API_URL}/maintenance/${requestId}/attachments`,
                {
                    credentials: 'include'
                }
            );

            const data =
                await response.json();

            if (!response.ok) {
                throw new Error(
                    data.error ||
                    'Failed to load attachments'
                );
            }

            setAttachments(data);

        } catch (error) {
            if (error instanceof Error) {
                setError(error.message);
            } else {
                setError(
                    'Failed to load attachments'
                );
            }

        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        loadAttachments();
    }, [requestId]);

    async function handleDeleteAttachment(
        attachmentId: number
    ) {
        try {
            const response = await fetch(
                `${API_URL}/maintenance/attachments/${attachmentId}`,
                {
                    method: 'DELETE',
                    credentials: 'include'
                }
            );

            const data = await response.json();

            if (!response.ok) {
                throw new Error(
                    data.error ||
                    'Failed to delete attachment'
                );
            }

            setAttachments(currentAttachments =>
                currentAttachments.filter(
                    attachment =>
                        attachment.id !== attachmentId
                )
            );

        } catch (error) {
            if (error instanceof Error) {
                setError(error.message);
            } else {
                setError(
                    'Failed to delete attachment'
                );
            }
        }
    }

    function handleFileChange(
        event: ChangeEvent<HTMLInputElement>
    ) {
        const file =
            event.target.files?.[0];

        if (!file) {
            setSelectedFile(null);
            return;
        }

        setSelectedFile(file);
    }

    async function handleUpload(
        event: FormEvent<HTMLFormElement>
    ) {
        event.preventDefault();

        if (!selectedFile) {
            setError(
                'Choose a file first.'
            );

            return;
        }

        setUploading(true);
        setError('');

        try {
            const formData =
                new FormData();

            formData.append(
                'file',
                selectedFile
            );

            const response = await fetch(
                `${API_URL}/maintenance/${requestId}/attachments`,
                {
                    method: 'POST',

                    credentials: 'include',

                    body: formData
                }
            );

            const data =
                await response.json();

            if (!response.ok) {
                throw new Error(
                    data.error ||
                    'Failed to upload attachment'
                );
            }

            setSelectedFile(null);

            await loadAttachments();

        } catch (error) {
            if (error instanceof Error) {
                setError(error.message);
            } else {
                setError(
                    'Failed to upload attachment'
                );
            }

        } finally {
            setUploading(false);
        }
    }

    if (loading) {
        return (
            <p>
                Loading attachments...
            </p>
        );
    }

    return (
        <div>
            <h4>Attachments</h4>

            <form onSubmit={handleUpload}>
                <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={handleFileChange}
                />

                <button
                    type="submit"
                    disabled={
                        uploading ||
                        !selectedFile
                    }
                >
                    {uploading
                        ? 'Uploading...'
                        : 'Upload image'}
                </button>
            </form>

            {error && (
                <p>{error}</p>
            )}

            {attachments.length === 0 && (
                <p>
                    No attachments yet.
                </p>
            )}

            {attachments.map(
                attachment => (
                    <div key={attachment.id}>
                        <p>
                            {
                                attachment.original_name
                            }
                        </p>

                        <img
                            src={attachment.url}
                            alt={
                                attachment.original_name
                            }
                            width="300"
                        />

                        <button
                            onClick={() =>
                                handleDeleteAttachment(
                                    attachment.id
                                )
                            }
                        >
                            Delete attachment
                        </button>
                    </div>
                )
            )}
        </div>
    );
}