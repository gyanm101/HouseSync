export type GroceryItem = {
    id: number;
    household_id: number;
    name: string;
    quantity: number;

    purchased: boolean;

    added_by: number;
    added_by_name: string;

    purchased_by: number | null;
    purchased_by_name: string | null;

    purchased_at: string | null;
    created_at: string;
};