import express from 'express';
import cors from 'cors';
import { Pool } from 'pg';
import bcrypt from 'bcryptjs';
import session from 'express-session';


const app = express();
const port = 3000;
const pool = new Pool({
    database: 'housesync'
});


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
    try{
        const result = await pool.query(
            "SELECT * FROM households;"
        );

        res.json(result.rows);
    } catch(error) {
        console.error(error);
        res.status(500).json({
            error: 'Database query failed'
        });
    }
});

app.get('/households/:householdId/members', async (req, res) => {
    const householdId = req.params.householdId;
    try{
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

app.post('/households', async (req, res) => {
    try{
        const name = req.body?.name;
        if(typeof name !== 'string' || name.trim().length === 0){
            return res.status(400).json({
                error: 'Valid name required'
            });
        }

        const house = await pool.query(
            'INSERT INTO households (name) VALUES ($1) RETURNING *',
            [name.trim()],
        )
        res.status(201).json(house.rows[0]);

    } catch (error){
        console.error(error);
        res.status(500).json({
            error: 'Database query failed'
        });
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





app.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`);
});
