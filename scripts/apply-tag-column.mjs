import pg from 'pg';
import fs from 'node:fs';

const env = JSON.parse(fs.readFileSync('.env.deployment.local', 'utf8'));

async function applyTo(name, url) {
  const pool = new pg.Pool({
    connectionString: url,
    ssl: { rejectUnauthorized: false }
  });
  const client = await pool.connect();
  try {
    console.log(`Connected to ${name}...`);
    await client.query(`ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "tag" TEXT;`);
    console.log(`Column 'tag' added to ${name}.`);
    await client.query(`CREATE INDEX IF NOT EXISTS "Product_tag_idx" ON "Product"("tag");`);
    console.log(`Index 'Product_tag_idx' created in ${name}.`);
  } finally {
    client.release();
    await pool.end();
  }
}

async function run() {
  if (env.directUrl) await applyTo("Production DB", env.directUrl);
  if (env.testDirectUrl) await applyTo("Test DB", env.testDirectUrl);
}

run().catch(err => {
  console.error("Migration error:", err);
  process.exit(1);
});
