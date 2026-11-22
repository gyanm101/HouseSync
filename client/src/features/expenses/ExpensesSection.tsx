import {
    useEffect,
    useState,
    type FormEvent
} from 'react';

import type {
    HouseholdMember,
    Expense,
    Balance
} from '../../types/expense';

const API_URL = 'http://localhost:3000';

type ExpensesSectionProps = {
    householdId: number;
};

export default function ExpensesSection({
                                            householdId
                                        }: ExpensesSectionProps) {

    const [members, setMembers] =
        useState<HouseholdMember[]>([]);

    const [expenses, setExpenses] =
        useState<Expense[]>([]);

    const [balances, setBalances] =
        useState<Balance[]>([]);

    const [loading, setLoading] =
        useState(true);

    const [error, setError] =
        useState('');

    const [description, setDescription] =
        useState('');

    const [amount, setAmount] =
        useState('');

    const [paidBy, setPaidBy] =
        useState<number | ''>('');

    const [splitAmounts, setSplitAmounts] =
        useState<Record<number, string>>({});

    const [creating, setCreating] =
        useState(false);

    const [createError, setCreateError] =
        useState('');

    function formatMoney(amountCents: number) {
        return `$${(amountCents / 100).toFixed(2)}`;
    }

    function dollarsToCents(value: string) {
        const normalized = value.trim();

        if (!/^\d+(\.\d{1,2})?$/.test(normalized)) {
            return NaN;
        }

        const [dollars, cents = ''] =
            normalized.split('.');

        return (
            Number(dollars) * 100 +
            Number(cents.padEnd(2, '0'))
        );
    }

    function createEmptySplits(
        memberList: HouseholdMember[]
    ) {
        const emptySplits: Record<number, string> = {};

        memberList.forEach(member => {
            emptySplits[member.id] = '';
        });

        return emptySplits;
    }

    async function refreshExpensesAndBalances() {
        const [
            expensesResponse,
            balancesResponse
        ] = await Promise.all([
            fetch(
                `${API_URL}/households/${householdId}/expenses`,
                {
                    credentials: 'include'
                }
            ),

            fetch(
                `${API_URL}/households/${householdId}/balances`,
                {
                    credentials: 'include'
                }
            )
        ]);

        const [
            expensesData,
            balancesData
        ] = await Promise.all([
            expensesResponse.json(),
            balancesResponse.json()
        ]);

        if (!expensesResponse.ok) {
            throw new Error(
                expensesData.error ||
                'Failed to refresh expenses'
            );
        }

        if (!balancesResponse.ok) {
            throw new Error(
                balancesData.error ||
                'Failed to refresh balances'
            );
        }

        setExpenses(expensesData);
        setBalances(balancesData);
    }

    useEffect(() => {
        async function loadExpenseData() {
            setLoading(true);
            setError('');

            try {
                const [
                    membersResponse,
                    expensesResponse,
                    balancesResponse
                ] = await Promise.all([
                    fetch(
                        `${API_URL}/households/${householdId}/members`,
                        {
                            credentials: 'include'
                        }
                    ),

                    fetch(
                        `${API_URL}/households/${householdId}/expenses`,
                        {
                            credentials: 'include'
                        }
                    ),

                    fetch(
                        `${API_URL}/households/${householdId}/balances`,
                        {
                            credentials: 'include'
                        }
                    )
                ]);

                const [
                    membersData,
                    expensesData,
                    balancesData
                ] = await Promise.all([
                    membersResponse.json(),
                    expensesResponse.json(),
                    balancesResponse.json()
                ]);

                if (!membersResponse.ok) {
                    throw new Error(
                        membersData.error ||
                        'Failed to load household members'
                    );
                }

                if (!expensesResponse.ok) {
                    throw new Error(
                        expensesData.error ||
                        'Failed to load expenses'
                    );
                }

                if (!balancesResponse.ok) {
                    throw new Error(
                        balancesData.error ||
                        'Failed to load balances'
                    );
                }

                setMembers(membersData);
                setExpenses(expensesData);
                setBalances(balancesData);

                if (membersData.length > 0) {
                    setPaidBy(membersData[0].id);

                    setSplitAmounts(
                        createEmptySplits(membersData)
                    );
                }

            } catch (error) {
                if (error instanceof Error) {
                    setError(error.message);
                } else {
                    setError(
                        'Failed to load expense information'
                    );
                }

            } finally {
                setLoading(false);
            }
        }

        loadExpenseData();

    }, [householdId]);

    function handleSplitEqually() {
        const totalCents =
            dollarsToCents(amount);

        if (
            !Number.isInteger(totalCents) ||
            totalCents <= 0 ||
            members.length === 0
        ) {
            setCreateError(
                'Enter a valid total amount first.'
            );

            return;
        }

        setCreateError('');

        const baseAmount =
            Math.floor(
                totalCents / members.length
            );

        const remainder =
            totalCents % members.length;

        const newSplits: Record<number, string> = {};

        members.forEach((member, index) => {
            const memberAmount =
                baseAmount +
                (index < remainder ? 1 : 0);

            newSplits[member.id] =
                (memberAmount / 100).toFixed(2);
        });

        setSplitAmounts(newSplits);
    }

    async function handleCreateExpense(
        event: FormEvent<HTMLFormElement>
    ) {
        event.preventDefault();

        setCreateError('');

        const totalCents =
            dollarsToCents(amount);

        if (
            !Number.isInteger(totalCents) ||
            totalCents <= 0
        ) {
            setCreateError(
                'Enter a valid expense amount.'
            );

            return;
        }

        if (paidBy === '') {
            setCreateError(
                'Choose who paid.'
            );

            return;
        }

        const splits = members.map(member => ({
            userId: member.id,

            amountCents:
                dollarsToCents(
                    splitAmounts[member.id] ?? ''
                )
        }));

        const invalidSplit =
            splits.some(split =>
                !Number.isInteger(
                    split.amountCents
                ) ||
                split.amountCents < 0
            );

        if (invalidSplit) {
            setCreateError(
                'Enter a valid split for every member.'
            );

            return;
        }

        const splitTotal =
            splits.reduce(
                (sum, split) =>
                    sum + split.amountCents,
                0
            );

        if (splitTotal !== totalCents) {
            setCreateError(
                'Splits must equal the total expense.'
            );

            return;
        }

        setCreating(true);

        try {
            const response = await fetch(
                `${API_URL}/households/${householdId}/expenses`,
                {
                    method: 'POST',

                    headers: {
                        'Content-Type':
                            'application/json'
                    },

                    credentials: 'include',

                    body: JSON.stringify({
                        description,
                        amountCents: totalCents,
                        paidBy,
                        splits
                    })
                }
            );

            const data =
                await response.json();

            if (!response.ok) {
                throw new Error(
                    data.error ||
                    'Failed to create expense'
                );
            }

            await refreshExpensesAndBalances();

            setDescription('');
            setAmount('');

            setSplitAmounts(
                createEmptySplits(members)
            );

        } catch (error) {
            if (error instanceof Error) {
                setCreateError(
                    error.message
                );
            } else {
                setCreateError(
                    'Failed to create expense'
                );
            }

        } finally {
            setCreating(false);
        }
    }

    async function handleToggleSettlement(
        expenseId: number,
        splitUserId: number,
        currentlySettled: boolean
    ) {
        try {
            const response = await fetch(
                `${API_URL}/expenses/${expenseId}/splits/${splitUserId}/status`,
                {
                    method: 'PATCH',

                    headers: {
                        'Content-Type': 'application/json'
                    },

                    credentials: 'include',

                    body: JSON.stringify({
                        settled: !currentlySettled
                    })
                }
            );

            const data = await response.json();

            if (!response.ok) {
                throw new Error(
                    data.error ||
                    'Failed to update settlement'
                );
            }

            await refreshExpensesAndBalances();

        } catch (error) {
            console.error(error);
        }
    }

    async function handleDeleteExpense(
        expenseId: number
    ) {
        try {
            const response = await fetch(
                `${API_URL}/expenses/${expenseId}`,
                {
                    method: 'DELETE',
                    credentials: 'include'
                }
            );

            const data = await response.json();

            if (!response.ok) {
                throw new Error(
                    data.error ||
                    'Failed to delete expense'
                );
            }

            await refreshExpensesAndBalances();

        } catch (error) {
            console.error(error);
        }
    }

    if (loading) {
        return <p>Loading expenses...</p>;
    }

    if (error) {
        return <p>{error}</p>;
    }

    return (
        <section>
            <h2>Expenses</h2>

            <form onSubmit={handleCreateExpense}>
                <h3>Add Expense</h3>

                <div>
                    <label>
                        Description
                    </label>

                    <input
                        type="text"
                        value={description}
                        onChange={(event) =>
                            setDescription(
                                event.target.value
                            )
                        }
                        placeholder="Dinner"
                        required
                    />
                </div>

                <div>
                    <label>
                        Total Amount
                    </label>

                    <input
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={amount}
                        onChange={(event) =>
                            setAmount(
                                event.target.value
                            )
                        }
                        placeholder="60.00"
                        required
                    />
                </div>

                <div>
                    <label>
                        Paid By
                    </label>

                    <select
                        value={paidBy}
                        onChange={(event) =>
                            setPaidBy(
                                Number(
                                    event.target.value
                                )
                            )
                        }
                        required
                    >
                        {members.map(member => (
                            <option
                                key={member.id}
                                value={member.id}
                            >
                                {member.name}
                            </option>
                        ))}
                    </select>
                </div>

                <h4>
                    Split Between Members
                </h4>

                <button
                    type="button"
                    onClick={handleSplitEqually}
                >
                    Split equally
                </button>

                {members.map(member => (
                    <div key={member.id}>
                        <label>
                            {member.name}
                        </label>

                        <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={
                                splitAmounts[
                                    member.id
                                    ] ?? ''
                            }
                            onChange={(event) =>
                                setSplitAmounts(
                                    current => ({
                                        ...current,

                                        [member.id]:
                                        event.target.value
                                    })
                                )
                            }
                            placeholder="0.00"
                            required
                        />
                    </div>
                ))}

                {createError && (
                    <p>{createError}</p>
                )}

                <button
                    type="submit"
                    disabled={creating}
                >
                    {creating
                        ? 'Adding expense...'
                        : 'Add expense'}
                </button>
            </form>

            <h3>Balances</h3>

            {balances.length === 0 ? (
                <p>
                    Everyone is settled up.
                </p>
            ) : (
                balances.map(balance => (
                    <p
                        key={
                            `${balance.debtor_id}-${balance.creditor_id}`
                        }
                    >
                        {balance.debtor_name}
                        {' owes '}
                        {balance.creditor_name}
                        {' '}
                        {formatMoney(
                            balance.amount_cents
                        )}
                    </p>
                ))
            )}

            <h3>Household Members</h3>

            {members.map(member => (
                <p key={member.id}>
                    {member.name} — {member.role}
                </p>
            ))}

            <h3>Expense History</h3>

            {expenses.length === 0 && (
                <p>No expenses yet.</p>
            )}

            {expenses.map(expense => (
                <div key={expense.id}>
                    <h4>
                        {expense.description}
                    </h4>

                    <p>
                        Total:{' '}
                        {formatMoney(
                            expense.amount_cents
                        )}
                    </p>

                    <p>
                        Paid by:{' '}
                        {expense.paid_by_name}
                    </p>

                    <p>
                        Added by:{' '}
                        {expense.created_by_name}
                    </p>

                    <h5>Splits</h5>

                    {expense.splits.map(split => (
                        <div key={split.userId}>
                            <p>
                                {split.name}:{' '}

                                {formatMoney(
                                    split.amountCents
                                )}

                                {' — '}

                                {split.settled
                                    ? 'Settled'
                                    : 'Owes'}
                            </p>

                            <button
                                onClick={() =>
                                    handleToggleSettlement(
                                        expense.id,
                                        split.userId,
                                        split.settled
                                    )
                                }
                            >
                                {split.settled
                                    ? 'Mark unsettled'
                                    : 'Mark settled'}
                            </button>
                        </div>
                    ))}

                    <button
                        onClick={() =>
                            handleDeleteExpense(expense.id)
                        }
                    >
                        Delete expense
                    </button>
                </div>
            ))}
        </section>
    );
}