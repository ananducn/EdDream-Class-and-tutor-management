import pg from 'pg';
import 'dotenv/config';

const { Pool, types } = pg;

// Return PostgreSQL DATE columns (OID 1082) as plain 'YYYY-MM-DD' strings.
// By default the driver parses them into JS Date objects at LOCAL midnight,
// which in a non-UTC timezone shifts the value back a day once serialized to
// UTC JSON (e.g. 2026-05-29 -> "2026-05-28T18:30:00Z"). Keeping the raw string
// avoids that off-by-one and keeps dates stable across read/write round-trips.
types.setTypeParser(1082, (value) => value);

// DATABASE_URL points at Railway's private network (…railway.internal), which
// only resolves from inside Railway — from a laptop every query dies with
// ENOTFOUND. So use the internal URL only when actually running on Railway, and
// fall back to the public proxy URL locally. That makes `npm run dev` work
// without anyone having to hand-edit .env.
const onRailway = Boolean(process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_PROJECT_ID);
const connectionString = onRailway
  ? process.env.DATABASE_URL
  : (process.env.DATABASE_PUBLIC_URL || process.env.DATABASE_URL);

// Railway's private networking (…railway.internal) does not use TLS. The public
// proxy URL does, but with a self-signed cert, so disable verification there.
const isInternal = /railway\.internal/.test(connectionString || '');

const pool = new Pool({
  connectionString,
  ssl: isInternal ? false : { rejectUnauthorized: false },
  // Railway's public proxy drops connections that look idle, which killed
  // long sequential runs (the sample seeder) mid-way with "Connection
  // terminated unexpectedly". TCP keepalives hold the socket open.
  keepAlive: true,
  idleTimeoutMillis: 30000,
});

// An idle client dropped by the network emits 'error' on the pool. Unhandled,
// that is an uncaught exception and takes the whole server down — the pool
// discards the dead client on its own, so logging is the right response.
pool.on('error', (err) => {
  console.error('Idle database client error:', err.message);
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
