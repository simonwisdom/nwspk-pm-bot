import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { db } from '../index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runMigrations() {
  try {
    // Create migrations table if it doesn't exist
    await db.none(`
      CREATE TABLE IF NOT EXISTS migrations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        executed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Get all SQL files in the migrations directory
    const files = await fs.readdir(__dirname);
    const sqlFiles = files
      .filter(f => f.endsWith('.sql'))
      .sort(); // Ensure migrations run in order

    // Run each migration
    for (const file of sqlFiles) {
      const migrationExists = await db.oneOrNone(
        'SELECT id FROM migrations WHERE name = $1',
        file
      );

      if (!migrationExists) {
        console.log(`Running migration: ${file}`);
        const sql = await fs.readFile(
          path.join(__dirname, file),
          'utf8'
        );

        await db.tx(async t => {
          await t.none(sql);
          await t.none(
            'INSERT INTO migrations(name) VALUES($1)',
            file
          );
        });

        console.log(`Completed migration: ${file}`);
      } else {
        console.log(`Skipping migration: ${file} (already executed)`);
      }
    }

    console.log('All migrations completed successfully');
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await db.$pool.end();
  }
}

runMigrations(); 