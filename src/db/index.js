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

// Export query helper functions
export const queries = {
  async getGrantReviews(date) {
    return db.any('SELECT * FROM grant_reviews WHERE DATE(created_at) = $1', [date]);
  },
  
  async getNewApplications(date) {
    return db.any('SELECT * FROM grant_applications WHERE DATE(created_at) = $1', [date]);
  },
  
  async getBlockedReviews() {
    return db.any('SELECT * FROM grant_reviews WHERE status = $1', ['blocked']);
  },
  
  async getPendingTasks() {
    return db.any('SELECT * FROM tasks WHERE status = $1 ORDER BY priority DESC', ['pending']);
  },
  
  async getUserAssignments(userId) {
    return db.any('SELECT * FROM assignments WHERE user_id = $1 AND status = $2', [userId, 'active']);
  }
}; 