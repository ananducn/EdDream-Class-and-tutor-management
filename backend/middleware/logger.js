import { sql } from '../db.js';

export async function logActivity(userId, userName, userRole, action, recordType, recordId, details) {
  try {
    await sql`
      INSERT INTO activity_logs (user_id, user_name, user_role, action, record_type, record_id, details)
      VALUES (${userId}, ${userName}, ${userRole}, ${action}, ${recordType}, ${recordId}, ${details})
    `;
  } catch (err) {
    console.error('Failed to log activity:', err);
  }
}
