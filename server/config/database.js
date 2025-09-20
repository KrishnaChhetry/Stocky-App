const mysql = require('mysql2/promise');
require('dotenv').config();

// TODO: Consider using connection pooling for better performance
// Had some issues with connection timeouts in production
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'stocky_db',
  port: process.env.DB_PORT || 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  acquireTimeout: 60000,
  timeout: 60000,
  reconnect: true
};

const pool = mysql.createPool(dbConfig);

// Test database connection
// This was a pain to get working with the new MySQL setup
const testConnection = async () => {
  try {
    const connection = await pool.getConnection();
    console.log('Database connected successfully');
    connection.release();
  } catch (error) {
    console.error('Database connection failed:', error.message);
    // FIXME: Should probably retry a few times before giving up
    process.exit(1);
  }
};

module.exports = { pool, testConnection };
