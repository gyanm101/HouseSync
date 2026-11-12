import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import session from 'express-session';
import pool from './db/pool.js';
import expensesRouter from './routes/expenses.js';
import groceriesRouter from './routes/groceries.js';
import maintenanceRouter from './routes/maintenance.js';

const app = express();
const port = 3000;

async function isHouseholdMember(
    userId: number,
    householdId: string | number
): Promise<boolean> {
    const result = await pool.query(
        `
        SELECT 1
        FROM household_members
        WHERE user_id = $1
          AND household_id = $2
        LIMIT 1
        `,
        [userId, householdId]
    );

    return result.rows.length > 0;
}

app.use(
    cors({
        origin: 'http://localhost:5173'
    })
);

app.use(express.json());

app.use(
    session({
        secret: 'development-secret',
        resave: false,
        saveUninitialized: false,
        cookie: {
            httpOnly: true,
            secure: false
        }
    })
);

app.use(expensesRouter);
app.use(groceriesRouter);
app.use(maintenanceRouter);

app.get('/', (req, res) => {
    res.json({ 
        message: 'Hello from the backend!' 
    });
});

app.get('/pg', async (req, res) => {
    try{
        const result = await pool.query(
            "SELECT current_database();"
        );

        res.json(result.rows[0]);
    } catch(error) {
        console.error(error);
        res.status(500).json({
            error: 'Database query failed'
        });
    }
});

app.get('/households', async (req, res) => {
    try {
        const userId = req.session.userId;

        if (userId === undefined) {
            return res.status(401).json({
                error: 'Not authenticated'
            });
        }

        const result = await pool.query(
            `
            SELECT
                households.id,
                households.name,
                households.created_at,
                household_members.role
            FROM household_members
            JOIN households
                ON household_members.household_id = households.id
            WHERE household_members.user_id = $1
            ORDER BY households.created_at DESC
            `,
            [userId]
        );

        res.status(200).json(result.rows);

    } catch (error) {
        console.error(error);

        res.status(500).json({
            error: 'Database query failed'
        });
    }
});


app.get('/households/:householdId/members', async (req, res) => {
    const householdId = req.params.householdId;

    try{
        const userId = req.session.userId;
        if(userId === undefined){
            return res.status(401).json({
                error: 'Not logged in'
            });
        }

        const check = await pool.query(
            `SELECT 1
            FROM household_members
            WHERE user_id = $1
            AND household_id = $2`,
            [userId, householdId]
        );

        if(check.rows.length === 0){
            return res.status(403).json({
                error: 'Access denied'
            });
        }

        const result = await pool.query(
            `SELECT users.id, users.name, users.email, household_members.role
            FROM household_members
            JOIN users
                ON household_members.user_id = users.id
            WHERE household_members.household_id = $1;
            `, [householdId]
        );
        res.json(result.rows)
    } catch (error){
        console.error(error);
        res.status(500).json({
            error: 'Database query failed'
        });
    }
});


app.get('/auth/me', async (req, res) => {
    try{
        if(req.session.userId === undefined){
            return res.status(401).json({
                error: 'Not Authenticated'
            });
        }

        const result = await pool.query(
            `SELECT users.id, users.name, users.email, users.created_at
            FROM users
            WHERE users.id = $1`,
            [req.session.userId]
        );
        if(result.rows.length === 0){
            return res.status(401).json({
                error: 'Not Authenticated'
            })
        }
        res.json(result.rows[0]);

    } catch (error){
        console.error(error);
        res.status(500).json({
            error: 'Database query failed'
        });
    }

});

app.get('/households/:householdId/chores', async (req, res) => {
    try {
        const userId = req.session.userId;
        const householdId = req.params.householdId;

        if (userId === undefined) {
            return res.status(401).json({
                error: 'Not authenticated'
            });
        }

        const isMember = await isHouseholdMember(userId, householdId);

        if (!isMember) {
            return res.status(403).json({
                error: 'Access denied'
            });
        }

        const result = await pool.query(
            `
            SELECT
                chores.id,
                chores.title,
                chores.description,
                chores.assigned_to,
                users.name AS assigned_to_name,
                chores.created_by,
                chores.due_date,
                chores.status,
                chores.completed_at,
                chores.created_at
            FROM chores
            LEFT JOIN users
                ON chores.assigned_to = users.id
            WHERE chores.household_id = $1
            ORDER BY chores.created_at DESC
            `,
            [householdId]
        );

        res.status(200).json(result.rows);

    } catch (error) {
        console.error(error);

        res.status(500).json({
            error: 'Failed to load chores'
        });
    }
});

app.post('/households', async (req, res) => {
    const userId = req.session.userId;

    if (userId === undefined) {
        return res.status(401).json({
            error: 'Not authenticated'
        });
    }

    const name = req.body?.name;

    if (typeof name !== 'string' || name.trim().length === 0) {
        return res.status(400).json({
            error: 'Valid name required'
        });
    }

    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        const householdResult = await client.query(
            `
            INSERT INTO households (name)
            VALUES ($1)
            RETURNING id, name, created_at
            `,
            [name.trim()]
        );

        const household = householdResult.rows[0];

        await client.query(
            `
            INSERT INTO household_members (
                user_id,
                household_id,
                role
            )
            VALUES ($1, $2, $3)
            `,
            [userId, household.id, 'owner']
        );

        await client.query('COMMIT');

        res.status(201).json({
            ...household,
            role: 'owner'
        });

    } catch (error) {
        await client.query('ROLLBACK');

        console.error(error);

        res.status(500).json({
            error: 'Failed to create household'
        });

    } finally {
        client.release();
    }
});


app.post('/auth/register', async (req, res) => {
    try {
        const name = req.body?.name;
        const email = req.body?.email;
        const password = req.body?.password;

        if(typeof name !== 'string' || name.trim().length === 0){
            return res.status(400).json({
                error: 'Valid name required'
            });
        }

        if(typeof email !== 'string' || email.trim().length === 0){
            return res.status(400).json({
                error: 'Valid email required'
            });
        }

        if(typeof password !== 'string' || password.length < 8){
            return res.status(400).json({
                error: 'Valid password required'
            });
        }

        const normalizedName = name.trim();
        const normalizedEmail = email.trim().toLowerCase();
        const hashedPassword = await bcrypt.hash(password, 10);

        const result = await pool.query(
            'INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3) RETURNING id, name, email, created_at',
            [normalizedName, normalizedEmail, hashedPassword]
        );

        res.status(201).json(result.rows[0]);
    } catch (error) {
        if (
            typeof error === 'object' &&
            error !== null &&
            'code' in error &&
            'constraint' in error &&
            error.code === '23505' &&
            error.constraint === 'users_email_key'
        ) {
            return res.status(409).json({
                error: 'Email already registered'
            });
        }

        console.error(error);

        res.status(500).json({
            error: 'Database query failed'
        });
    }
});

app.post('/auth/login', async (req, res) => {
    try{
        const email = req.body?.email;
        const password = req.body?.password;

        if(typeof email !== 'string' || email.trim().length === 0){
            return res.status(400).json({
                error: 'Valid email required'
            });
        }

        if(typeof password !== 'string' || password.length === 0){
            return res.status(400).json({
                error: 'Valid password required'
            });
        }

        const normEmail = email.trim().toLowerCase();

        const result = await pool.query(
            `SELECT id, name, email, password_hash, created_at
            FROM users
            WHERE email = $1`,
            [normEmail]
        )

        if(result.rows.length === 0){
            return res.status(401).json({
                error: 'Invalid email or password'
            })
        }

        const matches = await bcrypt.compare(password, result.rows[0].password_hash);

        if(!matches){
            return res.status(401).json({
                error: 'Invalid email or password'
            })
        }

        const {password_hash, ...updatedResult} = result.rows[0];

        req.session.userId = result.rows[0].id;

        res.status(200).json(updatedResult);
    } catch (error){
        console.error(error);
        res.status(500).json({
            error: 'Database query failed'
        });
    }
})

app.post('/auth/logout', (req, res) => {
    req.session.destroy((error) => {
        if (error){
            console.error(error);
            return res.status(500).json({
                error: 'Failed to logout'
            });
        }
        res.status(200).json({
            message: 'Logged out successfully'
        });
    });
});


app.post('/households/:householdId/chores', async (req, res) => {
    try {
        const userId = req.session.userId;
        const householdId = req.params.householdId;

        if (userId === undefined) {
            return res.status(401).json({
                error: 'Not authenticated'
            });
        }

        const { title, description, assignedTo, dueDate } = req.body;

        if (typeof title !== 'string' || title.trim().length === 0) {
            return res.status(400).json({
                error: 'Valid title required'
            });
        }

        const isMember = await isHouseholdMember(userId, householdId);

        if (!isMember) {
            return res.status(403).json({
                error: 'Access denied'
            });
        }

        if (assignedTo !== undefined && assignedTo !== null) {
            const assigneeMembership = await pool.query(
                `
                SELECT 1
                FROM household_members
                WHERE user_id = $1
                  AND household_id = $2
                LIMIT 1
                `,
                [assignedTo, householdId]
            );

            if (assigneeMembership.rows.length === 0) {
                return res.status(400).json({
                    error: 'Assigned user is not a household member'
                });
            }
        }

        const result = await pool.query(
            `
            INSERT INTO chores (
                household_id,
                title,
                description,
                assigned_to,
                created_by,
                due_date
            )
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING *
            `,
            [
                householdId,
                title.trim(),
                description ?? null,
                assignedTo ?? null,
                userId,
                dueDate ?? null
            ]
        );

        res.status(201).json(result.rows[0]);

    } catch (error) {
        console.error(error);

        res.status(500).json({
            error: 'Failed to create chore'
        });
    }
});

app.patch('/chores/:choreId/status', async (req, res) => {
    try {
        const userId = req.session.userId;
        const choreId = req.params.choreId;
        const status = req.body?.status;

        // 1. Must be logged in
        if (userId === undefined) {
            return res.status(401).json({
                error: 'Not authenticated'
            });
        }

        // 2. Only allow these two statuses
        if (status !== 'open' && status !== 'completed') {
            return res.status(400).json({
                error: 'Status must be open or completed'
            });
        }

        // 3. Find the chore and determine which household owns it
        const choreResult = await pool.query(
            `
            SELECT household_id
            FROM chores
            WHERE id = $1
            `,
            [choreId]
        );

        if (choreResult.rows.length === 0) {
            return res.status(404).json({
                error: 'Chore not found'
            });
        }

        const householdId = choreResult.rows[0].household_id;

        const isMember = await isHouseholdMember(userId, householdId);

        if (!isMember) {
            return res.status(403).json({
                error: 'Access denied'
            });
        }

        // 5. Update the chore
        const result = await pool.query(
            `
            UPDATE chores
            SET
                status = $1,
                completed_at = CASE
                    WHEN $1 = 'completed' THEN NOW()
                    ELSE NULL
                END
            WHERE id = $2
            RETURNING *
            `,
            [status, choreId]
        );

        return res.status(200).json(result.rows[0]);

    } catch (error) {
        console.error(error);

        return res.status(500).json({
            error: 'Failed to update chore status'
        });
    }
});

app.patch('/chores/:choreId', async (req, res) => {
    try {
        const userId = req.session.userId;
        const choreId = req.params.choreId;

        if (userId === undefined) {
            return res.status(401).json({
                error: 'Not authenticated'
            });
        }

        const choreResult = await pool.query(
            `
            SELECT household_id
            FROM chores
            WHERE id = $1
            `,
            [choreId]
        );

        if (choreResult.rows.length === 0) {
            return res.status(404).json({
                error: 'Chore not found'
            });
        }

        const householdId = choreResult.rows[0].household_id;

        const isMember = await isHouseholdMember(userId, householdId);

        if (!isMember) {
            return res.status(403).json({
                error: 'Access denied'
            });
        }

        const { title, description, assignedTo, dueDate } = req.body;

        const updates: string[] = [];
        const values: unknown[] = [];

        if (title !== undefined) {
            if (typeof title !== 'string' || title.trim().length === 0) {
                return res.status(400).json({
                    error: 'Valid title required'
                });
            }

            values.push(title.trim());
            updates.push(`title = $${values.length}`);
        }

        if (description !== undefined) {
            if (description !== null && typeof description !== 'string') {
                return res.status(400).json({
                    error: 'Invalid description'
                });
            }

            values.push(description);
            updates.push(`description = $${values.length}`);
        }

        if (assignedTo !== undefined) {
            if (assignedTo !== null) {
                const assigneeMembership = await pool.query(
                    `
                    SELECT 1
                    FROM household_members
                    WHERE user_id = $1
                      AND household_id = $2
                    LIMIT 1
                    `,
                    [assignedTo, householdId]
                );

                if (assigneeMembership.rows.length === 0) {
                    return res.status(400).json({
                        error: 'Assigned user is not a household member'
                    });
                }
            }

            values.push(assignedTo);
            updates.push(`assigned_to = $${values.length}`);
        }

        if (dueDate !== undefined) {
            values.push(dueDate);
            updates.push(`due_date = $${values.length}`);
        }

        if (updates.length === 0) {
            return res.status(400).json({
                error: 'No fields provided to update'
            });
        }

        values.push(choreId);

        const result = await pool.query(
            `
            UPDATE chores
            SET ${updates.join(', ')}
            WHERE id = $${values.length}
            RETURNING *
            `,
            values
        );

        return res.status(200).json(result.rows[0]);

    } catch (error) {
        console.error(error);

        return res.status(500).json({
            error: 'Failed to update chore'
        });
    }
});

app.delete('/chores/:choreId', async (req, res) => {
    try {
        const userId = req.session.userId;
        const choreId = req.params.choreId;

        if (userId === undefined) {
            return res.status(401).json({
                error: 'Not authenticated'
            });
        }

        const choreResult = await pool.query(
            `
            SELECT household_id
            FROM chores
            WHERE id = $1
            `,
            [choreId]
        );

        if (choreResult.rows.length === 0) {
            return res.status(404).json({
                error: 'Chore not found'
            });
        }

        const householdId = choreResult.rows[0].household_id;

        const isMember = await isHouseholdMember(userId, householdId);

        if (!isMember) {
            return res.status(403).json({
                error: 'Access denied'
            });
        }

        await pool.query(
            `
            DELETE FROM chores
            WHERE id = $1
            `,
            [choreId]
        );

        return res.status(200).json({
            message: 'Chore deleted successfully'
        });

    } catch (error) {
        console.error(error);

        return res.status(500).json({
            error: 'Failed to delete chore'
        });
    }
});

app.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`);
});
