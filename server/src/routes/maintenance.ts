import { Router } from 'express';
import pool from '../db/pool.js';
import { isHouseholdMember } from '../services/authorization.js';

const router = Router();

router.post(
    '/households/:householdId/maintenance',
    async (req, res) => {
        try {
            const userId = req.session.userId;
            const householdId = req.params.householdId;

            if (userId === undefined) {
                return res.status(401).json({
                    error: 'Not authenticated'
                });
            }

            const {
                title,
                description,
                assignedTo
            } = req.body;

            // Validate title
            if (
                typeof title !== 'string' ||
                title.trim().length === 0
            ) {
                return res.status(400).json({
                    error: 'Valid title required'
                });
            }

            // Validate optional description
            if (
                description !== undefined &&
                description !== null &&
                typeof description !== 'string'
            ) {
                return res.status(400).json({
                    error: 'Description must be a string'
                });
            }

            // Logged-in user must belong to household
            const isMember = await isHouseholdMember(
                userId,
                householdId
            );

            if (!isMember) {
                return res.status(403).json({
                    error: 'Access denied'
                });
            }

            // If assignedTo is provided, that user must also belong
            if (assignedTo !== undefined && assignedTo !== null) {
                if (!Number.isInteger(assignedTo)) {
                    return res.status(400).json({
                        error: 'Invalid assigned user'
                    });
                }

                const assigneeIsMember = await isHouseholdMember(
                    assignedTo,
                    householdId
                );

                if (!assigneeIsMember) {
                    return res.status(400).json({
                        error: 'Assigned user must belong to the household'
                    });
                }
            }

            const result = await pool.query(
                `
                INSERT INTO maintenance_requests (
                    household_id,
                    title,
                    description,
                    reported_by,
                    assigned_to
                )
                VALUES ($1, $2, $3, $4, $5)
                RETURNING *
                `,
                [
                    householdId,
                    title.trim(),
                    description?.trim() || null,
                    userId,
                    assignedTo ?? null
                ]
            );

            return res.status(201).json(result.rows[0]);

        } catch (error) {
            console.error(error);

            return res.status(500).json({
                error: 'Failed to create maintenance request'
            });
        }
    }
);

router.get(
    '/households/:householdId/maintenance',
    async (req, res) => {
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
                    maintenance_requests.id,
                    maintenance_requests.household_id,
                    maintenance_requests.title,
                    maintenance_requests.description,
                    maintenance_requests.status,

                    maintenance_requests.reported_by,
                    reporter.name AS reported_by_name,

                    maintenance_requests.assigned_to,
                    assignee.name AS assigned_to_name,

                    maintenance_requests.resolved_at,
                    maintenance_requests.created_at

                FROM maintenance_requests

                JOIN users AS reporter
                    ON maintenance_requests.reported_by = reporter.id

                LEFT JOIN users AS assignee
                    ON maintenance_requests.assigned_to = assignee.id

                WHERE maintenance_requests.household_id = $1

                ORDER BY maintenance_requests.created_at DESC
                `,
                [householdId]
            );

            return res.status(200).json(result.rows);

        } catch (error) {
            console.error(error);

            return res.status(500).json({
                error: 'Failed to load maintenance requests'
            });
        }
    }
);

router.patch('/maintenance/:requestId/status', async (req, res) => {
    try {
        const userId = req.session.userId;
        const requestId = req.params.requestId;
        const { status } = req.body;

        if (userId === undefined) {
            return res.status(401).json({
                error: 'Not authenticated'
            });
        }

        const validStatuses = ['open', 'in_progress', 'resolved'];

        if (
            typeof status !== 'string' ||
            !validStatuses.includes(status)
        ) {
            return res.status(400).json({
                error: 'Invalid maintenance status'
            });
        }

        // Find request
        const requestResult = await pool.query(
            `
            SELECT household_id
            FROM maintenance_requests
            WHERE id = $1
            `,
            [requestId]
        );

        if (requestResult.rows.length === 0) {
            return res.status(404).json({
                error: 'Maintenance request not found'
            });
        }

        const householdId =
            requestResult.rows[0].household_id;

        // Check household access
        const isMember = await isHouseholdMember(
            userId,
            householdId
        );

        if (!isMember) {
            return res.status(403).json({
                error: 'Access denied'
            });
        }

        // Update status
        const updatedRequest = await pool.query(
            `
            UPDATE maintenance_requests
            SET
                status = $1,

                resolved_at = CASE
                    WHEN $1 = 'resolved' THEN NOW()
                    ELSE NULL
                END

            WHERE id = $2

            RETURNING *
            `,
            [
                status,
                requestId
            ]
        );

        return res.status(200).json(
            updatedRequest.rows[0]
        );

    } catch (error) {
        console.error(error);

        return res.status(500).json({
            error: 'Failed to update maintenance status'
        });
    }
});

router.patch('/maintenance/:requestId', async (req, res) => {
    try {
        const userId = req.session.userId;
        const requestId = req.params.requestId;

        if (userId === undefined) {
            return res.status(401).json({
                error: 'Not authenticated'
            });
        }

        const requestResult = await pool.query(
            `
            SELECT household_id
            FROM maintenance_requests
            WHERE id = $1
            `,
            [requestId]
        );

        if (requestResult.rows.length === 0) {
            return res.status(404).json({
                error: 'Maintenance request not found'
            });
        }

        const householdId =
            requestResult.rows[0].household_id;

        const isMember = await isHouseholdMember(
            userId,
            householdId
        );

        if (!isMember) {
            return res.status(403).json({
                error: 'Access denied'
            });
        }

        const {
            title,
            description,
            assignedTo
        } = req.body;

        const updates: string[] = [];
        const values: unknown[] = [];

        if (title !== undefined) {
            if (
                typeof title !== 'string' ||
                title.trim().length === 0
            ) {
                return res.status(400).json({
                    error: 'Valid title required'
                });
            }

            values.push(title.trim());

            updates.push(
                `title = $${values.length}`
            );
        }

        if (description !== undefined) {
            if (
                description !== null &&
                typeof description !== 'string'
            ) {
                return res.status(400).json({
                    error: 'Description must be a string or null'
                });
            }

            values.push(
                description === null
                    ? null
                    : description.trim() || null
            );

            updates.push(
                `description = $${values.length}`
            );
        }

        if (assignedTo !== undefined) {
            if (assignedTo !== null) {
                if (!Number.isInteger(assignedTo)) {
                    return res.status(400).json({
                        error: 'Invalid assigned user'
                    });
                }

                const assigneeIsMember =
                    await isHouseholdMember(
                        assignedTo,
                        householdId
                    );

                if (!assigneeIsMember) {
                    return res.status(400).json({
                        error: 'Assigned user must belong to the household'
                    });
                }
            }

            values.push(assignedTo);

            updates.push(
                `assigned_to = $${values.length}`
            );
        }

        if (updates.length === 0) {
            return res.status(400).json({
                error: 'No fields provided to update'
            });
        }

        values.push(requestId);

        const updatedRequest = await pool.query(
            `
            UPDATE maintenance_requests
            SET ${updates.join(', ')}
            WHERE id = $${values.length}
            RETURNING *
            `,
            values
        );

        return res.status(200).json(
            updatedRequest.rows[0]
        );

    } catch (error) {
        console.error(error);

        return res.status(500).json({
            error: 'Failed to update maintenance request'
        });
    }
});

router.delete('/maintenance/:requestId', async (req, res) => {
    try {
        const userId = req.session.userId;
        const requestId = req.params.requestId;

        if (userId === undefined) {
            return res.status(401).json({
                error: 'Not authenticated'
            });
        }

        const requestResult = await pool.query(
            `
            SELECT household_id
            FROM maintenance_requests
            WHERE id = $1
            `,
            [requestId]
        );

        if (requestResult.rows.length === 0) {
            return res.status(404).json({
                error: 'Maintenance request not found'
            });
        }

        const householdId =
            requestResult.rows[0].household_id;

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
            DELETE FROM maintenance_requests
            WHERE id = $1
            `,
            [requestId]
        );

        return res.status(200).json({
            message: 'Maintenance request deleted successfully'
        });

    } catch (error) {
        console.error(error);

        return res.status(500).json({
            error: 'Failed to delete maintenance request'
        });
    }
});

export default router;