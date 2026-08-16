const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const dbDir = path.join(__dirname, 'data');
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const dbPath = path.join(dbDir, 'database.sqlite');
const db = new sqlite3.Database(dbPath);

// Initialize DB schema
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS papers (
      id TEXT PRIMARY KEY,
      topic TEXT,
      originalTitle TEXT,
      catchyTitle TEXT,
      summary TEXT,
      authors TEXT,
      source TEXT,
      year INTEGER,
      venue TEXT,
      url TEXT,
      pdfUrl TEXT,
      fetchedAt DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  // Try to add venue column if it doesn't exist
  db.run(`ALTER TABLE papers ADD COLUMN venue TEXT`, (err) => {
    // Ignore error if column already exists
  });
});

/**
 * Inserts or ignores a paper into the database.
 */
function insertPaper(topic, paper) {
  return new Promise((resolve, reject) => {
    const stmt = db.prepare(`
      INSERT OR IGNORE INTO papers (
        id, topic, originalTitle, catchyTitle, summary, authors, source, year, venue, url, pdfUrl
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      paper.id,
      topic,
      paper.originalTitle,
      paper.catchyTitle,
      paper.summary,
      JSON.stringify(paper.authors || []),
      paper.source,
      paper.year,
      paper.venue,
      paper.url,
      paper.pdfUrl,
      function(err) {
        if (err) return reject(err);
        resolve(this.changes);
      }
    );
    stmt.finalize();
  });
}

/**
 * Gets the most recent X papers for a topic
 */
function getLatestPapersForTopic(topic, limit = 10) {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT * FROM papers WHERE topic = ? ORDER BY fetchedAt DESC LIMIT ?`,
      [topic, limit],
      (err, rows) => {
        if (err) return reject(err);
        const papers = rows.map(row => ({
          id: row.id,
          originalTitle: row.originalTitle,
          catchyTitle: row.catchyTitle,
          summary: row.summary,
          authors: JSON.parse(row.authors),
          source: row.source,
          year: row.year,
          venue: row.venue,
          url: row.url,
          pdfUrl: row.pdfUrl,
          topics: [row.topic], // Map DB structure to App type
          likes: 0
        }));
        resolve(papers);
      }
    );
  });
}

module.exports = {
  db,
  insertPaper,
  getLatestPapersForTopic
};
