import { sql } from '../db.js';

// Common classes and common timetable slots are tied together by a group id that
// is just the first member's own id, with no foreign key behind it. When members
// are deleted those ids can be left naming a row that no longer exists, or a
// "group" of one. Both repairs are the same shape, so they share one helper.
//
// Called after any delete that can remove part of a group.
async function normalize(table, column, groupIds) {
  const ids = [...new Set((groupIds || []).filter(Boolean))];
  for (const gid of ids) {
    const members = await sql.query(
      `SELECT id FROM ${table} WHERE ${column} = $1 ORDER BY id`, [gid],
    );
    if (members.length === 0) continue;
    if (members.length === 1) {
      // One member left — it is not shared with anything any more.
      await sql.query(`UPDATE ${table} SET ${column} = NULL WHERE id = $1`, [members[0].id]);
      continue;
    }
    if (!members.some((m) => m.id === gid)) {
      // The row the group was named after is gone; re-point at a survivor.
      await sql.query(
        `UPDATE ${table} SET ${column} = $1 WHERE ${column} = $2`, [members[0].id, gid],
      );
    }
  }
}

export const normalizeSlotGroups = (groupIds) => normalize('timetable_slots', 'slot_group_id', groupIds);
export const normalizeClassGroups = (groupIds) => normalize('class_entries', 'class_group_id', groupIds);
export const normalizeNiosSlotGroups = (groupIds) => normalize('nios_timetable_slots', 'nios_slot_group_id', groupIds);
export const normalizeNiosClassGroups = (groupIds) => normalize('nios_class_entries', 'nios_class_group_id', groupIds);
