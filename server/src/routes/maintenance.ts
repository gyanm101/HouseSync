import { Router } from 'express';
import pool from '../db/pool.js';
import { isHouseholdMember } from '../services/authorization.js';
import multer from 'multer';
import { randomUUID } from 'node:crypto';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
    PutObjectCommand,
    GetObjectCommand,
    DeleteObjectCommand
} from '@aws-sdk/client-s3';
import {
    s3Client,
    s3Bucket
} from '../services/s3.js';

const router = Router();

const storage = multer.memoryStorage();

const upload = multer({
    storage,

    limits: {
        fileSize: 5 * 1024 * 1024,
        files: 1
    },

    fileFilter: (_req, file, callback) => {
        const allowedTypes = [
            'image/jpeg',
            'image/png',
            'image/webp'
        ];

        if (!allowedTypes.includes(file.mimetype)) {
            return callback(
                new Error('Only JPEG, PNG, and WebP images are allowed')
            );
        }

        callback(null, true);
    }
});

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

router.post(
    '/maintenance/:requestId/attachments',
    upload.single('file'),

    async (req, res) => {
        const userId = req.session.userId;
        const requestId = req.params.requestId;

        if (userId === undefined) {
            return res.status(401).json({
                error: 'Not authenticated'
            });
        }

        if (!req.file) {
            return res.status(400).json({
                error: 'Image file required'
            });
        }

        try {
            // 1. Find the maintenance request
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

            // 2. Verify household authorization
            const isMember = await isHouseholdMember(
                userId,
                householdId
            );

            if (!isMember) {
                return res.status(403).json({
                    error: 'Access denied'
                });
            }

            // 3. Determine safe extension
            const extensionByMimeType: Record<string, string> = {
                'image/jpeg': 'jpg',
                'image/png': 'png',
                'image/webp': 'webp'
            };

            const extension =
                extensionByMimeType[req.file.mimetype];

            // 4. Generate unique S3 key
            const s3Key =
                `maintenance/${requestId}/${randomUUID()}.${extension}`;

            // 5. Upload actual bytes to S3
            const uploadCommand = new PutObjectCommand({
                Bucket: s3Bucket,
                Key: s3Key,
                Body: req.file.buffer,
                ContentType: req.file.mimetype
            });

            await s3Client.send(uploadCommand);

            try {
                // 6. Store metadata in PostgreSQL
                const attachmentResult = await pool.query(
                    `
                    INSERT INTO maintenance_attachments (
                        maintenance_request_id,
                        s3_key,
                        original_name,
                        mime_type,
                        size_bytes,
                        uploaded_by
                    )
                    VALUES ($1, $2, $3, $4, $5, $6)

                    RETURNING *
                    `,
                    [
                        requestId,
                        s3Key,
                        req.file.originalname,
                        req.file.mimetype,
                        req.file.size,
                        userId
                    ]
                );

                return res.status(201).json(
                    attachmentResult.rows[0]
                );

            } catch (databaseError) {
                // DB failed after S3 succeeded:
                // remove orphaned S3 object
                await s3Client.send(
                    new DeleteObjectCommand({
                        Bucket: s3Bucket,
                        Key: s3Key
                    })
                );

                throw databaseError;
            }

        } catch (error) {
            console.error(error);

            return res.status(500).json({
                error: 'Failed to upload maintenance attachment'
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

router.get(
    '/maintenance/:requestId/attachments',
    async (req, res) => {
        try {
            const userId = req.session.userId;
            const requestId = req.params.requestId;

            if (userId === undefined) {
                return res.status(401).json({
                    error: 'Not authenticated'
                });
            }

            // 1. Find maintenance request
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

            // 2. Verify user belongs to household
            const isMember = await isHouseholdMember(
                userId,
                householdId
            );

            if (!isMember) {
                return res.status(403).json({
                    error: 'Access denied'
                });
            }

            // 3. Get attachment metadata from PostgreSQL
            const attachmentResult = await pool.query(
                `
                SELECT
                    maintenance_attachments.id,
                    maintenance_attachments.s3_key,
                    maintenance_attachments.original_name,
                    maintenance_attachments.mime_type,
                    maintenance_attachments.size_bytes,
                    maintenance_attachments.uploaded_by,
                    users.name AS uploaded_by_name,
                    maintenance_attachments.created_at

                FROM maintenance_attachments

                JOIN users
                    ON maintenance_attachments.uploaded_by = users.id

                WHERE maintenance_attachments.maintenance_request_id = $1

                ORDER BY maintenance_attachments.created_at DESC
                `,
                [requestId]
            );

            // 4. Generate temporary S3 URL for each attachment
            const attachments = await Promise.all(
                attachmentResult.rows.map(async attachment => {
                    const command = new GetObjectCommand({
                        Bucket: s3Bucket,
                        Key: attachment.s3_key
                    });

                    const url = await getSignedUrl(
                        s3Client,
                        command,
                        {
                            expiresIn: 900
                        }
                    );

                    return {
                        ...attachment,
                        url
                    };
                })
            );

            return res.status(200).json(attachments);

        } catch (error) {
            console.error(error);

            return res.status(500).json({
                error: 'Failed to load maintenance attachments'
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
    const userId = req.session.userId;
    const requestId = req.params.requestId;

    if (userId === undefined) {
        return res.status(401).json({
            error: 'Not authenticated'
        });
    }

    try {
        // 1. Find the maintenance request
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

        // 2. Check authorization
        const isMember = await isHouseholdMember(
            userId,
            householdId
        );

        if (!isMember) {
            return res.status(403).json({
                error: 'Access denied'
            });
        }

        // 3. Find every S3 attachment belonging to this request
        const attachmentResult = await pool.query(
            `
            SELECT s3_key
            FROM maintenance_attachments
            WHERE maintenance_request_id = $1
            `,
            [requestId]
        );

        // 4. Delete all attachment objects from S3
        await Promise.all(
            attachmentResult.rows.map(attachment =>
                s3Client.send(
                    new DeleteObjectCommand({
                        Bucket: s3Bucket,
                        Key: attachment.s3_key
                    })
                )
            )
        );

        // 5. Delete the maintenance request from PostgreSQL
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

router.delete(
    '/maintenance/attachments/:attachmentId',
    async (req, res) => {
        const userId = req.session.userId;
        const attachmentId = req.params.attachmentId;

        if (userId === undefined) {
            return res.status(401).json({
                error: 'Not authenticated'
            });
        }

        try {
            // 1. Find attachment + maintenance request household
            const attachmentResult = await pool.query(
                `
                SELECT
                    maintenance_attachments.id,
                    maintenance_attachments.s3_key,
                    maintenance_requests.household_id

                FROM maintenance_attachments

                JOIN maintenance_requests
                    ON maintenance_attachments.maintenance_request_id
                    = maintenance_requests.id

                WHERE maintenance_attachments.id = $1
                `,
                [attachmentId]
            );

            if (attachmentResult.rows.length === 0) {
                return res.status(404).json({
                    error: 'Attachment not found'
                });
            }

            const attachment = attachmentResult.rows[0];

            // 2. Check household authorization
            const isMember = await isHouseholdMember(
                userId,
                attachment.household_id
            );

            if (!isMember) {
                return res.status(403).json({
                    error: 'Access denied'
                });
            }

            // 3. Delete actual file from S3
            await s3Client.send(
                new DeleteObjectCommand({
                    Bucket: s3Bucket,
                    Key: attachment.s3_key
                })
            );

            // 4. Delete metadata row from PostgreSQL
            await pool.query(
                `
                DELETE FROM maintenance_attachments
                WHERE id = $1
                `,
                [attachmentId]
            );

            return res.status(200).json({
                message: 'Attachment deleted successfully'
            });

        } catch (error) {
            console.error(error);

            return res.status(500).json({
                error: 'Failed to delete maintenance attachment'
            });
        }
    }
);

export default router;