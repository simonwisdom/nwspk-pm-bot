import pgPromise from 'pg-promise';

const pgp = pgPromise({
  // Initialization options
  capSQL: true, // capitalize SQL queries
  error: (error, e) => {
    if (e.cn) {
      // A connection-related error
      console.error('CN:', e.cn);
      console.error('EVENT:', error.message || error);
    }
  }
});

// Database connection configuration
const config = {
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.RAILWAY_ENVIRONMENT === 'production' ? {
    rejectUnauthorized: false
  } : false,
  max: 30 // max number of clients in the pool
};

// Create the database instance
export const db = pgp(config);

// Export daily update helper functions
export const dailyUpdates = {
  async getLatest() {
    return db.oneOrNone(
      'SELECT message_ts FROM daily_updates ORDER BY timestamp DESC LIMIT 1'
    );
  },
  
  async create(messageTs) {
    return db.none(
      'INSERT INTO daily_updates (timestamp, message_ts) VALUES (NOW(), $1)',
      [messageTs]
    );
  },
  
  async isDaily(messageTs) {
    return db.oneOrNone(
      'SELECT * FROM daily_updates WHERE message_ts = $1',
      [messageTs]
    );
  }
}; 