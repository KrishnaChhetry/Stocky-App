const axios = require('axios');
const { pool } = require('../config/database');
const { v4: uuidv4 } = require('uuid');

class StockPriceService {
  constructor() {
    this.apiUrl = process.env.STOCK_API_URL || 'https://api.stockprices.com';
    this.apiKey = process.env.STOCK_API_KEY || 'demo_key';
  }

  // Fetch current stock prices from API
  async fetchStockPrices() {
    try {
      // In a real implementation, this would call an actual stock price API
      // For now, we'll simulate with random prices
      const stockSymbols = ['RELIANCE', 'TCS', 'INFOSYS', 'HDFCBANK', 'ICICIBANK', 
                           'BHARTIARTL', 'ITC', 'SBIN', 'KOTAKBANK', 'LT'];
      
      const prices = {};
      const timestamp = new Date();
      
      for (const symbol of stockSymbols) {
        // Generate realistic random prices based on stock symbol
        const basePrice = this.getBasePrice(symbol);
        const variation = (Math.random() - 0.5) * 0.1; // ±5% variation
        const price = basePrice * (1 + variation);
        
        prices[symbol] = {
          price: Math.round(price * 100) / 100, // Round to 2 decimal places
          timestamp
        };
      }
      
      return prices;
    } catch (error) {
      console.error('Error fetching stock prices:', error);
      throw new Error('Failed to fetch stock prices');
    }
  }

  // Get base price for a stock symbol (for simulation)
  // TODO: These prices are hardcoded, should fetch from real API
  getBasePrice(symbol) {
    const basePrices = {
      'RELIANCE': 2500,
      'TCS': 3500,
      'INFOSYS': 1500,
      'HDFCBANK': 1600,
      'ICICIBANK': 900,
      'BHARTIARTL': 800,
      'ITC': 450,
      'SBIN': 600,
      'KOTAKBANK': 1800,
      'LT': 2200
    };
    // FIXME: Default price of 100 is too low, should be more realistic
    return basePrices[symbol] || 100;
  }

  // Store stock prices in database
  async storeStockPrices(prices) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      
      for (const [symbol, data] of Object.entries(prices)) {
        const priceId = uuidv4();
        await connection.execute(
          `INSERT INTO stock_prices (id, stock_symbol, price, price_timestamp) 
           VALUES (?, ?, ?, ?)`,
          [priceId, symbol, data.price, data.timestamp]
        );
      }
      
      await connection.commit();
      console.log(`✅ Stored prices for ${Object.keys(prices).length} stocks`);
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  // Get latest price for a stock
  async getLatestPrice(symbol) {
    const [rows] = await pool.execute(
      `SELECT price, price_timestamp 
       FROM stock_prices 
       WHERE stock_symbol = ? 
       ORDER BY price_timestamp DESC 
       LIMIT 1`,
      [symbol]
    );
    return rows[0] || null;
  }

  // Get latest prices for all stocks
  async getLatestPrices() {
    const [rows] = await pool.execute(
      `SELECT sp.stock_symbol, sp.price, sp.price_timestamp, ss.name
       FROM stock_prices sp
       JOIN stock_symbols ss ON sp.stock_symbol = ss.symbol
       WHERE sp.price_timestamp = (
         SELECT MAX(price_timestamp) 
         FROM stock_prices sp2 
         WHERE sp2.stock_symbol = sp.stock_symbol
       )
       ORDER BY sp.stock_symbol`
    );
    return rows;
  }

  // Update historical valuations for all users
  async updateHistoricalValuations() {
    const connection = await pool.getConnection();
    try {
      // Get all users with holdings
      const [users] = await connection.execute(
        `SELECT DISTINCT user_id FROM user_holdings WHERE total_quantity > 0`
      );

      const today = new Date().toISOString().split('T')[0];
      
      for (const user of users) {
        // Get user's current holdings with latest prices
        const [holdings] = await connection.execute(
          `SELECT uh.stock_symbol, uh.total_quantity, sp.price
           FROM user_holdings uh
           LEFT JOIN (
             SELECT stock_symbol, price, ROW_NUMBER() OVER (PARTITION BY stock_symbol ORDER BY price_timestamp DESC) as rn
             FROM stock_prices
           ) sp ON uh.stock_symbol = sp.stock_symbol AND sp.rn = 1
           WHERE uh.user_id = ? AND uh.total_quantity > 0`,
          [user.user_id]
        );

        const totalValue = holdings.reduce((sum, holding) => {
          return sum + (holding.total_quantity * (holding.price || 0));
        }, 0);

        // Insert or update historical valuation
        await connection.execute(
          `INSERT INTO historical_valuations (id, user_id, valuation_date, total_inr_value)
           VALUES (?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE total_inr_value = ?`,
          [uuidv4(), user.user_id, today, totalValue, totalValue]
        );
      }
      
      console.log(`✅ Updated historical valuations for ${users.length} users`);
    } catch (error) {
      console.error('Error updating historical valuations:', error);
      throw error;
    } finally {
      connection.release();
    }
  }

  // Check if prices are stale (older than 1 hour)
  async arePricesStale() {
    const [rows] = await pool.execute(
      `SELECT MAX(price_timestamp) as latest_timestamp 
       FROM stock_prices`
    );
    
    if (rows.length === 0 || !rows[0].latest_timestamp) {
      return true;
    }
    
    const latestTimestamp = new Date(rows[0].latest_timestamp);
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    
    return latestTimestamp < oneHourAgo;
  }

  // Handle API downtime gracefully
  async getPricesWithFallback() {
    try {
      const prices = await this.fetchStockPrices();
      await this.storeStockPrices(prices);
      return prices;
    } catch (error) {
      console.warn('Stock price API failed, using cached prices');
      
      // Return cached prices if available
      const cachedPrices = await this.getLatestPrices();
      if (cachedPrices.length > 0) {
        return cachedPrices.reduce((acc, row) => {
          acc[row.stock_symbol] = {
            price: row.price,
            timestamp: row.price_timestamp
          };
          return acc;
        }, {});
      }
      
      // If no cached prices, use default prices
      throw new Error('No stock price data available');
    }
  }
}

module.exports = StockPriceService;
