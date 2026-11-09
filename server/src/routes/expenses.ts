import { Router } from 'express';
import pool from '../db/pool.js';
import { isHouseholdMember } from '../services/authorization.js';

const router = Router();

router.post('/households/:householdId/expenses', async (req, res) => {
    const userId = req.session.userId;
    const householdId = req.params.householdId;

    if (userId === undefined) {
        return res.status(401).json({
            error: 'Not authenticated'
        });
    }

    const {
        description,
        amountCents,
        paidBy,
        splits
    } = req.body;

    if (
        typeof description !== 'string' ||
        description.trim().length === 0
    ) {
        return res.status(400).json({
            error: 'Valid description required'
        });
    }

    if (!Number.isInteger(amountCents) || amountCents <= 0) {
        return res.status(400).json({
            error: 'Valid amount required'
        });
    }

    if (!Number.isInteger(paidBy)) {
        return res.status(400).json({
            error: 'Valid payer required'
        });
    }

    if (!Array.isArray(splits) || splits.length === 0) {
        return res.status(400).json({
            error: 'At least one expense split is required'
        });
    }

    for (const split of splits) {
        if (
            typeof split !== 'object' ||
            split === null ||
            !Number.isInteger(split.userId) ||
            !Number.isInteger(split.amountCents) ||
            split.amountCents < 0
        ) {
            return res.status(400).json({
                error: 'Invalid expense split'
            });
        }
    }

    const creatorIsMember = await isHouseholdMember(
        userId,
        householdId
    );

    if (!creatorIsMember) {
        return res.status(403).json({
            error: 'Access denied'
        });
    }

    const payerIsMember = await isHouseholdMember(
        paidBy,
        householdId
    );

    if (!payerIsMember) {
        return res.status(400).json({
            error: 'Payer is not a household member'
        });
    }

    const splitUserIds = splits.map(split => split.userId);

    const uniqueUserIds = new Set(splitUserIds);

    if (uniqueUserIds.size !== splitUserIds.length) {
        return res.status(400).json({
            error: 'Duplicate users in expense splits'
        });
    }

    const splitMemberships = await Promise.all(
        splitUserIds.map(splitUserId =>
            isHouseholdMember(splitUserId, householdId)
        )
    );

    if (splitMemberships.some(isMember => !isMember)) {
        return res.status(400).json({
            error: 'All split users must belong to the household'
        });
    }

    const splitTotal = splits.reduce(
        (total, split) => total + split.amountCents,
        0
    );

    if (splitTotal !== amountCents) {
        return res.status(400).json({
            error: 'Expense splits must equal the total amount'
        });
    }

    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        const expenseResult = await client.query(
            `
            INSERT INTO expenses (
                household_id,
                description,
                amount_cents,
                paid_by,
                created_by
            )
            VALUES ($1, $2, $3, $4, $5)
            RETURNING *
            `,
            [
                householdId,
                description.trim(),
                amountCents,
                paidBy,
                userId
            ]
        );

        const expense = expenseResult.rows[0];

        for (const split of splits) {
            const isPayer = split.userId === paidBy;

            await client.query(
                `
                INSERT INTO expense_splits (
                    expense_id,
                    user_id,
                    amount_cents,
                    settled,
                    settled_at
                )
                VALUES (
                    $1,
                    $2,
                    $3,
                    $4,
                    CASE
                        WHEN $4 = TRUE THEN NOW()
                        ELSE NULL
                    END
                )
                `,
                [
                    expense.id,
                    split.userId,
                    split.amountCents,
                    isPayer
                ]
            );
        }

        await client.query('COMMIT');

        return res.status(201).json({
            ...expense,
            splits
        });

    } catch (error) {
        await client.query('ROLLBACK');

        console.error(error);

        return res.status(500).json({
            error: 'Failed to create expense'
        });

    } finally {
        client.release();
    }
});

router.get('/households/:householdId/expenses', async (req, res) => {
    try {
        const userId = req.session.userId;
        const householdId = req.params.householdId;

        if (userId === undefined) {
            return res.status(401).json({
                error: 'Not authenticated'
            });
        }

        const isMember = await isHouseholdMember(
            userId,
            householdId
        );

        if (!isMember) {
            return res.status(403).json({
                error: 'Access denied'
            });
        }

        const result = await pool.query(
            `
            SELECT
                expenses.id,
                expenses.household_id,
                expenses.description,
                expenses.amount_cents,
                expenses.paid_by,
                payer.name AS paid_by_name,
                expenses.created_by,
                creator.name AS created_by_name,
                expenses.created_at,

                COALESCE(
                    json_agg(
                        json_build_object(
                            'userId', expense_splits.user_id,
                            'name', split_user.name,
                            'amountCents', expense_splits.amount_cents,
                            'settled', expense_splits.settled,
                            'settledAt', expense_splits.settled_at
                        )
                    ) FILTER (
                        WHERE expense_splits.user_id IS NOT NULL
                    ),
                    '[]'::json
                ) AS splits

            FROM expenses

            JOIN users AS payer
                ON expenses.paid_by = payer.id

            JOIN users AS creator
                ON expenses.created_by = creator.id

            LEFT JOIN expense_splits
                ON expenses.id = expense_splits.expense_id

            LEFT JOIN users AS split_user
                ON expense_splits.user_id = split_user.id

            WHERE expenses.household_id = $1

            GROUP BY
                expenses.id,
                expenses.household_id,
                expenses.description,
                expenses.amount_cents,
                expenses.paid_by,
                payer.name,
                expenses.created_by,
                creator.name,
                expenses.created_at

            ORDER BY expenses.created_at DESC
            `,
            [householdId]
        );

        return res.status(200).json(result.rows);

    } catch (error) {
        console.error(error);

        return res.status(500).json({
            error: 'Failed to load expenses'
        });
    }
});

router.patch(
    '/expenses/:expenseId/splits/:splitUserId/status',
    async (req, res) => {
        try {
            const userId = req.session.userId;
            const expenseId = req.params.expenseId;
            const splitUserId = req.params.splitUserId;
            const { settled } = req.body;

            // 1. Must be logged in
            if (userId === undefined) {
                return res.status(401).json({
                    error: 'Not authenticated'
                });
            }

            // 2. settled must specifically be true or false
            if (typeof settled !== 'boolean') {
                return res.status(400).json({
                    error: 'Settled must be true or false'
                });
            }

            // 3. Find the expense and the household it belongs to
            const expenseResult = await pool.query(
                `
                SELECT household_id, paid_by
                FROM expenses
                WHERE id = $1
                `,
                [expenseId]
            );

            if (expenseResult.rows.length === 0) {
                return res.status(404).json({
                    error: 'Expense not found'
                });
            }

            const expense = expenseResult.rows[0];
            const householdId = expense.household_id;

            // 4. Logged-in user must belong to this household
            const isMember = await isHouseholdMember(
                userId,
                householdId
            );

            if (!isMember) {
                return res.status(403).json({
                    error: 'Access denied'
                });
            }

            // 5. Make sure this split actually exists
            const splitResult = await pool.query(
                `
                SELECT
                    expense_id,
                    user_id,
                    amount_cents,
                    settled,
                    settled_at
                FROM expense_splits
                WHERE expense_id = $1
                  AND user_id = $2
                `,
                [expenseId, splitUserId]
            );

            if (splitResult.rows.length === 0) {
                return res.status(404).json({
                    error: 'Expense split not found'
                });
            }

            // 6. Payer's own split should always remain settled
            if (
                Number(splitUserId) === expense.paid_by &&
                settled === false
            ) {
                return res.status(400).json({
                    error: 'Payer split cannot be marked unsettled'
                });
            }

            // 7. Update settlement status
            const updatedSplit = await pool.query(
                `
                UPDATE expense_splits
                SET
                    settled = $1,
                    settled_at = CASE
                        WHEN $1 = TRUE THEN NOW()
                        ELSE NULL
                    END
                WHERE expense_id = $2
                  AND user_id = $3
                RETURNING
                    expense_id,
                    user_id,
                    amount_cents,
                    settled,
                    settled_at
                `,
                [
                    settled,
                    expenseId,
                    splitUserId
                ]
            );

            return res.status(200).json(
                updatedSplit.rows[0]
            );

        } catch (error) {
            console.error(error);

            return res.status(500).json({
                error: 'Failed to update expense split'
            });
        }
    }
);

export default router;