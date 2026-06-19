/**
 * Database wrapper using sql.js (pure JavaScript/WebAssembly SQLite)
 * Provides an API similar to better-sqlite3
 */
const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

class DatabaseWrapper {
  constructor(dbPath) {
    this.dbPath = dbPath;
    this.db = null;
    this.saveInterval = null;
  }

  async init() {
    const SQL = await initSqlJs();
    if (fs.existsSync(this.dbPath)) {
      const buffer = fs.readFileSync(this.dbPath);
      this.db = new SQL.Database(buffer);
    } else {
      this.db = new SQL.Database();
    }

    // Auto-save every 5 seconds
    this.saveInterval = setInterval(() => this.save(), 5000);

    return this;
  }

  save() {
    if (!this.db) return;
    const data = this.db.export();
    const buffer = Buffer.from(data);
    // Write to temp first, then rename (atomic write)
    const tmpPath = this.dbPath + '.tmp';
    fs.writeFileSync(tmpPath, buffer);
    fs.renameSync(tmpPath, this.dbPath);
  }

  exec(sql) {
    this.db.run(sql);
    this.save();
  }

  pragma(str) {
    try {
      this.db.run(`PRAGMA ${str}`);
    } catch (e) {}
  }

  prepare(sql) {
    const db = this.db;
    return {
      get: (...params) => {
        try {
          const stmt = db.prepare(sql);
          if (params.length > 0) stmt.bind(params);
          if (stmt.step()) {
            const row = stmt.getAsObject();
            stmt.free();
            return row;
          }
          stmt.free();
          return undefined;
        } catch (e) {
          console.error('[DB] prepare.get error:', e.message, 'SQL:', sql.substring(0, 100));
          return undefined;
        }
      },
      all: (...params) => {
        const results = [];
        try {
          const stmt = db.prepare(sql);
          if (params.length > 0) stmt.bind(params);
          while (stmt.step()) {
            results.push(stmt.getAsObject());
          }
          stmt.free();
        } catch (e) {
          console.error('[DB] prepare.all error:', e.message, 'SQL:', sql.substring(0, 100));
        }
        return results;
      },
      run: (...params) => {
        try {
          if (params.length > 0 && Array.isArray(params[0])) {
            db.run(sql, params[0]);
          } else {
            db.run(sql, params.length > 0 ? params : undefined);
          }
          // Get last insert rowid
          const result = db.exec("SELECT last_insert_rowid() as id");
          const lastInsertRowid = result.length > 0 && result[0].values.length > 0
            ? result[0].values[0][0]
            : 0;
          const changes = db.getRowsModified();
          this.save();
          return { lastInsertRowid, changes };
        } catch (e) {
          console.error('[DB] prepare.run error:', e.message, 'SQL:', sql.substring(0, 100));
          throw e;
        }
      }
    };
  }

  transaction(fn) {
    return (...args) => {
      this.db.run('BEGIN TRANSACTION');
      try {
        fn(...args);
        this.db.run('COMMIT');
        this.save();
      } catch (e) {
        this.db.run('ROLLBACK');
        throw e;
      }
    };
  }

  close() {
    if (this.saveInterval) clearInterval(this.saveInterval);
    this.save();
    if (this.db) this.db.close();
  }
}

module.exports = DatabaseWrapper;
