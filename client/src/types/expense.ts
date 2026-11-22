export type HouseholdMember = {
    id: number;
    name: string;
    email: string;
    role: string;
};

export type ExpenseSplit = {
    userId: number;
    name: string;
    amountCents: number;
    settled: boolean;
    settledAt: string | null;
};

export type Expense = {
    id: number;
    household_id: number;

    description: string;
    amount_cents: number;

    paid_by: number;
    paid_by_name: string;

    created_by: number;
    created_by_name: string;

    created_at: string;

    splits: ExpenseSplit[];
};

export type Balance = {
    debtor_id: number;
    debtor_name: string;

    creditor_id: number;
    creditor_name: string;

    amount_cents: number;
};