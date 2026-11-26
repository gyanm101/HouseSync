export type MaintenanceRequest = {
    id: number;
    household_id: number;

    title: string;
    description: string;

    status:
        | 'open'
        | 'in_progress'
        | 'resolved';

    reported_by: number;
    reported_by_name: string;

    assigned_to: number | null;
    assigned_to_name: string | null;

    resolved_at: string | null;
    created_at: string;
};

export type MaintenanceAttachment = {
    id: number;

    maintenance_request_id: number;

    original_name: string;
    mime_type: string;
    size_bytes: number;

    uploaded_by: number;
    uploaded_by_name: string;

    created_at: string;

    url: string;
};