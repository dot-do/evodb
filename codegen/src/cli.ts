#!/usr/bin/env node
/**
 * @evodb/codegen CLI
 *
 * Command-line interface for EvoDB schema code generation.
 *
 * Commands:
 *   evodb pull [--db <name>]   Generate .evodb/[db].d.ts
 *   evodb push [--db <name>]   Push schema changes
 *   evodb lock [--db <name>]   Lock schema at current version
 *   evodb diff [--db <name>]   Show schema diff
 */

import { Command } from 'commander';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pullCommand } from './commands/pull.js';
import { pushCommand } from './commands/push.js';
import { lockCommand } from './commands/lock.js';
import { diffCommand } from './commands/diff.js';
import type { Schema } from './types.js';

const program = new Command();

program
  .name('evodb')
  .description('EvoDB schema code generation CLI')
  .version('0.1.0-rc.1');

/**
 * Load schema from configuration file
 */
function loadSchema(cwd: string, db: string): Schema | null {
  // Try multiple config file locations
  const configPaths = [
    join(cwd, '.evodb', `${db}.schema.json`),
    join(cwd, `evodb.${db}.json`),
    join(cwd, 'evodb.config.json'),
  ];

  for (const configPath of configPaths) {
    if (existsSync(configPath)) {
      try {
        const content = readFileSync(configPath, 'utf8');
        const config = JSON.parse(content);
        return config.schema || config;
      } catch {
        // Continue to next config path
      }
    }
  }

  return null;
}

program
  .command('pull')
  .description('Generate TypeScript type definitions from schema')
  .option('--db <name>', 'Database name', 'default')
  .option('--schema <path>', 'Path to schema JSON file')
  .option('-o, --output <dir>', 'Output directory', '.evodb')
  .action(async (options) => {
    const cwd = process.cwd();
    const db = options.db;

    let schema: Schema | null = null;

    if (options.schema) {
      const schemaPath = resolve(cwd, options.schema);
      if (!existsSync(schemaPath)) {
        console.error(`Error: Schema file not found: ${schemaPath}`);
        process.exit(1);
      }
      schema = JSON.parse(readFileSync(schemaPath, 'utf8'));
    } else {
      schema = loadSchema(cwd, db);
    }

    if (!schema) {
      console.error(
        `Error: No schema found for database "${db}".`
      );
      console.error(
        'Provide --schema <path> or create .evodb/${db}.schema.json'
      );
      process.exit(1);
    }

    const result = await pullCommand({ db, cwd, schema });

    if (result.success) {
      console.log(`Generated type definitions for "${db}":`);
      result.files.forEach((f) => console.log(`  ${f}`));
    } else {
      console.error(`Error: ${result.error}`);
      process.exit(1);
    }
  });

program
  .command('push')
  .description('Push schema changes to database')
  .option('--db <name>', 'Database name', 'default')
  .option('--schema <path>', 'Path to schema JSON file')
  .option('--dry-run', 'Preview changes without applying', false)
  .action(async (options) => {
    const cwd = process.cwd();
    const db = options.db;

    let schema: Schema | null = null;

    if (options.schema) {
      const schemaPath = resolve(cwd, options.schema);
      if (!existsSync(schemaPath)) {
        console.error(`Error: Schema file not found: ${schemaPath}`);
        process.exit(1);
      }
      schema = JSON.parse(readFileSync(schemaPath, 'utf8'));
    } else {
      schema = loadSchema(cwd, db);
    }

    if (!schema) {
      console.error(`Error: No schema found for database "${db}".`);
      process.exit(1);
    }

    const result = await pushCommand({
      db,
      cwd,
      schema,
      dryRun: options.dryRun,
    });

    if (result.success) {
      if (result.dryRun) {
        console.log(`Dry run - migrations that would be applied for "${db}":`);
        result.migrations?.forEach((m) => console.log(`\n${m}`));
      } else {
        console.log(`Schema pushed successfully for "${db}".`);
      }
    } else {
      console.error(`Error: ${result.error}`);
      process.exit(1);
    }
  });

program
  .command('lock')
  .description('Lock schema at current version')
  .option('--db <name>', 'Database name', 'default')
  .option('--schema <path>', 'Path to schema JSON file')
  .action(async (options) => {
    const cwd = process.cwd();
    const db = options.db;

    let schema: Schema | null = null;

    if (options.schema) {
      const schemaPath = resolve(cwd, options.schema);
      if (!existsSync(schemaPath)) {
        console.error(`Error: Schema file not found: ${schemaPath}`);
        process.exit(1);
      }
      schema = JSON.parse(readFileSync(schemaPath, 'utf8'));
    } else {
      schema = loadSchema(cwd, db);
    }

    if (!schema) {
      console.error(`Error: No schema found for database "${db}".`);
      process.exit(1);
    }

    const result = await lockCommand({ db, cwd, schema });

    if (result.success) {
      console.log(`Schema locked for "${db}":`);
      console.log(`  Lock file: ${result.lockFile}`);
      console.log(`  Hash: ${result.schemaHash}`);
    } else {
      console.error(`Error: ${result.error}`);
      process.exit(1);
    }
  });

program
  .command('diff')
  .description('Show schema differences from locked version')
  .option('--db <name>', 'Database name', 'default')
  .option('--schema <path>', 'Path to schema JSON file')
  .action(async (options) => {
    const cwd = process.cwd();
    const db = options.db;

    let schema: Schema | null = null;

    if (options.schema) {
      const schemaPath = resolve(cwd, options.schema);
      if (!existsSync(schemaPath)) {
        console.error(`Error: Schema file not found: ${schemaPath}`);
        process.exit(1);
      }
      schema = JSON.parse(readFileSync(schemaPath, 'utf8'));
    } else {
      schema = loadSchema(cwd, db);
    }

    if (!schema) {
      console.error(`Error: No schema found for database "${db}".`);
      process.exit(1);
    }

    const result = await diffCommand({ db, cwd, schema });

    if (result.success) {
      if (!result.hasChanges) {
        console.log(`No schema changes detected for "${db}".`);
      } else {
        console.log(`Schema changes for "${db}":\n`);
        for (const change of result.changes) {
          switch (change.type) {
            case 'add_table':
              console.log(`  + ADD TABLE ${change.table}`);
              break;
            case 'remove_table':
              console.log(`  - REMOVE TABLE ${change.table}`);
              break;
            case 'add_column':
              console.log(
                `  + ADD COLUMN ${change.table}.${change.column} (${change.details?.type})`
              );
              break;
            case 'remove_column':
              console.log(
                `  - REMOVE COLUMN ${change.table}.${change.column}`
              );
              break;
            case 'modify_column':
              console.log(
                `  ~ MODIFY COLUMN ${change.table}.${change.column}: ${change.from?.type} -> ${change.to?.type}`
              );
              break;
          }
        }
      }
    } else {
      console.error(`Error: ${result.error}`);
      process.exit(1);
    }
  });

program.parse();
