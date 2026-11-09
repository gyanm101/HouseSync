import { Pool } from 'pg';

const pool = new Pool({
    database: 'housesync'
});

export default pool;