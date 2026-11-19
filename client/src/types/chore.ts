export type Chore = {
    id: number;
    household_id: number;
    title: string;
    description: string | null;

    assigned_to: number | null;
    assigned_to_name: string | null;

    created_by: number;

    due_date: string | null;

    status: 'open' | 'completed';

    completed_at: string | null;
    created_at: string;
};