import pg from 'pg';
import 'dotenv/config';

const { Pool, types } = pg;

// Return PostgreSQL DATE columns (OID 1082) as plain 'YYYY-MM-DD' strings.
// By default the driver parses them into JS Date objects at LOCAL midnight,
// which in a non-UTC timezone shifts the value back a day once serialized to
// UTC JSON (e.g. 2026-05-29 -> "2026-05-28T18:30:00Z"). Keeping the raw string
// avoids that off-by-one and keeps dates stable across read/write round-trips.
types.setTypeParser(1082, (value) => value);

const connectionString = process.env.DATABASE_URL;

// Railway's private networking (…railway.internal) does not use TLS. The public
// proxy URL does, but with a self-signed cert, so disable verification there.
const isInternal = /railway\.internal/.test(connectionString || '');

const pool = new Pool({
  connectionString,
  ssl: isInternal ? false : { rejectUnauthorized: false },
});

// Tagged-template wrapper so existing `sql`...${x}...`` call sites keep working
// unchanged. It turns the template into a parameterized query and returns the
// rows array — matching the shape the Neon serverless driver used to return.
async function sql(strings, ...values) {
  let text = strings[0];
  for (let i = 0; i < values.length; i++) {
    text += `$${i + 1}${strings[i + 1]}`;
  }
  const result = await pool.query(text, values);
  return result.rows;
}

// Function-call form for dynamically-built queries: sql.query(text, params).
// Mirrors the Neon serverless driver's .query() method, returning the rows array.
sql.query = async (text, params = []) => {
  const result = await pool.query(text, params);
  return result.rows;
};

export { sql, pool };
