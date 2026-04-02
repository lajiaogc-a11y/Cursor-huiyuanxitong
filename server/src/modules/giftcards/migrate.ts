/**
 * Ensure the `cards` table exists as a physical table (not a view).
 * Previously, fix_columns.sql created `cards` as a VIEW over `gift_cards`,
 * but `cards` (card types like "Steam Card") and `gift_cards` (individual card records)
 * are different entities. INSERT into the VIEW fails because gift_cards has
 * NOT NULL columns (card_number, currency, denomination) that cards does not use.
 */
import { execute, query } from '../../database/index.js';

export async function migrateCardsTable(): Promise<void> {
  // Check if 'cards' physical table already exists — if so, do nothing
  const tableCheck = await query<{ cnt: number }>(
    `SELECT COUNT(*) AS cnt FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cards' AND TABLE_TYPE = 'BASE TABLE'`
  );
  const tableExists = Number(tableCheck[0]?.cnt ?? 0) > 0;

  if (tableExists) {
    // Physical table already exists, nothing to do
    return;
  }

  // Check if 'cards' is currently a VIEW
  const viewCheck = await query<{ cnt: number }>(
    `SELECT COUNT(*) AS cnt FROM information_schema.VIEWS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cards'`
  );
  const isView = Number(viewCheck[0]?.cnt ?? 0) > 0;

  if (isView) {
    console.log('[migrate] Dropping VIEW `cards` to replace with physical TABLE');
    await execute('DROP VIEW IF EXISTS cards');
  }

  console.log('[migrate] Creating physical `cards` table');
  await execute(`
    CREATE TABLE cards (
      id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      type VARCHAR(100) NULL,
      status VARCHAR(50) NOT NULL DEFAULT 'active',
      remark TEXT NULL,
      card_vendors JSON NULL,
      sort_order INT NOT NULL DEFAULT 0,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}
