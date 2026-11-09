import pool from '../db/pool.js';

export async function isHouseholdMember(
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