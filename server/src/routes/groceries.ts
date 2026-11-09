import { Router } from 'express';
import pool from '../db/pool.js';
import { isHouseholdMember } from '../services/authorization.js';

const router = Router();

router.post('/households/:householdId/groceries', async (req, res) => {
    try {
        const userId = req.session.userId;
        const householdId = req.params.householdId;

        if (userId === undefined) {
            return res.status(401).json({
                error: 'Not authenticated'
            });
        }

        const { name, quantity = 1 } = req.body;

        if (
            typeof name !== 'string' ||
            name.trim().length === 0
        ) {
            return res.status(400).json({
                error: 'Valid item name required'
            });
        }

        if (
            !Number.isInteger(quantity) ||
            quantity <= 0
        ) {
            return res.status(400).json({
                error: 'Quantity must be a positive integer'
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
            INSERT INTO grocery_items (
                household_id,
                name,
                quantity,
                added_by
            )
            VALUES ($1, $2, $3, $4)
            RETURNING *
            `,
            [
                householdId,
                name.trim(),
                quantity,
                userId
            ]
        );

        return res.status(201).json(result.rows[0]);

    } catch (error) {
        console.error(error);

        return res.status(500).json({
            error: 'Failed to create grocery item'
        });
    }
});

router.get('/households/:householdId/groceries', async (req, res) => {
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
                grocery_items.id,
                grocery_items.household_id,
                grocery_items.name,
                grocery_items.quantity,
                grocery_items.purchased,
                grocery_items.added_by,
                added_user.name AS added_by_name,
                grocery_items.purchased_by,
                purchased_user.name AS purchased_by_name,
                grocery_items.purchased_at,
                grocery_items.created_at

            FROM grocery_items

            JOIN users AS added_user
                ON grocery_items.added_by = added_user.id

            LEFT JOIN users AS purchased_user
                ON grocery_items.purchased_by = purchased_user.id

            WHERE grocery_items.household_id = $1

            ORDER BY
                grocery_items.purchased ASC,
                grocery_items.created_at DESC
            `,
            [householdId]
        );

        return res.status(200).json(result.rows);

    } catch (error) {
        console.error(error);

        return res.status(500).json({
            error: 'Failed to load grocery items'
        });
    }
});

router.patch('/groceries/:itemId/status', async (req, res) => {
    try {
        const userId = req.session.userId;
        const itemId = req.params.itemId;
        const { purchased } = req.body;

        // 1. Must be logged in
        if (userId === undefined) {
            return res.status(401).json({
                error: 'Not authenticated'
            });
        }

        // 2. purchased must specifically be true or false
        if (typeof purchased !== 'boolean') {
            return res.status(400).json({
                error: 'Purchased must be true or false'
            });
        }

        // 3. Find the grocery item
        const itemResult = await pool.query(
            `
            SELECT household_id
            FROM grocery_items
            WHERE id = $1
            `,
            [itemId]
        );

        if (itemResult.rows.length === 0) {
            return res.status(404).json({
                error: 'Grocery item not found'
            });
        }

        const householdId = itemResult.rows[0].household_id;

        // 4. Must belong to this household
        const isMember = await isHouseholdMember(
            userId,
            householdId
        );

        if (!isMember) {
            return res.status(403).json({
                error: 'Access denied'
            });
        }

        // 5. Update purchased status
        const updatedItem = await pool.query(
            `
                UPDATE grocery_items
                SET
                    purchased = $1::boolean,

        purchased_by = CASE
            WHEN $1::boolean = TRUE THEN $2::integer
                    ELSE NULL
                END,

        purchased_at = CASE
            WHEN $1::boolean = TRUE THEN NOW()
                ELSE NULL
                END

                WHERE id = $3::integer

                RETURNING *
            `,
            [
                purchased,
                userId,
                itemId
            ]
        );

        return res.status(200).json(
            updatedItem.rows[0]
        );

    } catch (error) {
        console.error(error);

        return res.status(500).json({
            error: 'Failed to update grocery item'
        });
    }
});

router.delete('/groceries/:itemId', async (req, res) => {
    try {
        const userId = req.session.userId;
        const itemId = req.params.itemId;

        if (userId === undefined) {
            return res.status(401).json({
                error: 'Not authenticated'
            });
        }

        const itemResult = await pool.query(
            `
            SELECT household_id
            FROM grocery_items
            WHERE id = $1
            `,
            [itemId]
        );

        if (itemResult.rows.length === 0) {
            return res.status(404).json({
                error: 'Grocery item not found'
            });
        }

        const householdId = itemResult.rows[0].household_id;

        const isMember = await isHouseholdMember(
            userId,
            householdId
        );

        if (!isMember) {
            return res.status(403).json({
                error: 'Access denied'
            });
        }

        await pool.query(
            `
            DELETE FROM grocery_items
            WHERE id = $1
            `,
            [itemId]
        );

        return res.status(200).json({
            message: 'Grocery item deleted successfully'
        });

    } catch (error) {
        console.error(error);

        return res.status(500).json({
            error: 'Failed to delete grocery item'
        });
    }
});

export default router;