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