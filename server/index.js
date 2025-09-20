const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cron = require('node-cron');
require('dotenv').config();

// TODO: Move this to a separate config file
// The rate limiting was causing issues in development

const { testConnection } = require('./config/database');
const StockPriceService = require('./services/StockPriceService');
const rewardsRouter = require('./routes/rewards');

const app = express();
const PORT = process.env.PORT || 5000;

// Security middleware
app.use(helmet());

// CORS configuration
app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? ['https://yourdomain.com'] 
    : ['http://localhost:3000'],
  credentials: true
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100, // limit each IP to 100 requests per windowMs
  message: {
    success: false,
    error: 'Too many requests',
    message: 'Please try again later'
  }
});

app.use(limiter);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'Stocky API is running',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// API routes
app.use('/api', rewardsRouter);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    message: 'An unexpected error occurred'
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'Not found',
    message: 'The requested endpoint does not exist'
  });
});

// Initialize stock price service
const stockPriceService = new StockPriceService();

// Schedule hourly stock price updates
// NOTE: This was originally every 15 minutes but that was too aggressive
cron.schedule('0 * * * *', async () => {
  console.log('🔄 Running hourly stock price update...');
  try {
    const prices = await stockPriceService.getPricesWithFallback();
    await stockPriceService.storeStockPrices(prices);
    await stockPriceService.updateHistoricalValuations();
    console.log('✅ Stock price update completed');
  } catch (error) {
    console.error('❌ Stock price update failed:', error.message);
    // TODO: Add alerting for failed price updates
  }
});

// Schedule daily historical valuation updates (at midnight)
cron.schedule('0 0 * * *', async () => {
  console.log('🔄 Running daily historical valuation update...');
  try {
    await stockPriceService.updateHistoricalValuations();
    console.log('✅ Historical valuation update completed');
  } catch (error) {
    console.error('❌ Historical valuation update failed:', error.message);
  }
});

// Initialize server
const startServer = async () => {
  try {
    // Test database connection
    await testConnection();
    
    // Initial stock price fetch
    console.log('🔄 Fetching initial stock prices...');
    try {
      const prices = await stockPriceService.getPricesWithFallback();
      await stockPriceService.storeStockPrices(prices);
      console.log('✅ Initial stock prices loaded');
    } catch (error) {
      console.warn('⚠️  Initial stock price fetch failed, will retry on next cron run');
    }
    
    // Start server
    app.listen(PORT, () => {
      console.log(`🚀 Stocky API server running on port ${PORT}`);
      console.log(`📊 Health check: http://localhost:${PORT}/health`);
      console.log(`📈 API endpoints: http://localhost:${PORT}/api`);
      console.log(`⏰ Stock price updates scheduled every hour`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('🛑 SIGINT received, shutting down gracefully');
  process.exit(0);
});

// Start the server
startServer();

module.exports = app;
