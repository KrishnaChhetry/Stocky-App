const { pool } = require('../config/database');
const { v4: uuidv4 } = require('uuid');

// TODO: This class is getting too big, should split into smaller modules
class RewardModel {
  // Create a new reward event
  static async createReward(userId, stockSymbol, quantity, rewardType, eventTimestamp) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const rewardId = uuidv4();
      
      // Insert reward event
      await connection.execute(
        `INSERT INTO reward_events (id, user_id, stock_symbol, quantity, reward_type, event_timestamp) 
         VALUES (?, ?, ?, ?, ?, ?)`,
        [rewardId, userId, stockSymbol, quantity, rewardType, eventTimestamp]
      );

      // Update user holdings
      await connection.execute(
        `INSERT INTO user_holdings (user_id, stock_symbol, total_quantity) 
         VALUES (?, ?, ?) 
         ON DUPLICATE KEY UPDATE 
         total_quantity = total_quantity + ?`,
        [userId, stockSymbol, quantity, quantity]
      );

      // Create ledger entries for double-entry bookkeeping
      const ledgerEntries = await this.createLedgerEntries(connection, rewardId, stockSymbol, quantity);
      
      await connection.commit();
      
      return {
        rewardId,
        userId,
        stockSymbol,
        quantity,
        rewardType,
        eventTimestamp,
        ledgerEntries
      };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  // Create ledger entries for double-entry bookkeeping
  // This was tricky to get right - had to research accounting principles
  static async createLedgerEntries(connection, rewardId, stockSymbol, quantity) {
    const entries = [];
    
    // Get current stock price for calculations
    // FIXME: This could be optimized with a join
    const [priceRows] = await connection.execute(
      `SELECT price FROM stock_prices 
       WHERE stock_symbol = ? 
       ORDER BY price_timestamp DESC LIMIT 1`,
      [stockSymbol]
    );
    
    const currentPrice = priceRows[0]?.price || 100; // Default price if not available
    const totalValue = quantity * currentPrice;
    
    // Calculate fees (hypothetical rates)
    const brokerageRate = 0.0003; // 0.03%
    const sttRate = 0.0001; // 0.01%
    const gstRate = 0.18; // 18%
    const sebiRate = 0.0001; // 0.01%
    
    const brokerageFee = totalValue * brokerageRate;
    const sttFee = totalValue * sttRate;
    const gstFee = brokerageFee * gstRate;
    const sebiFee = totalValue * sebiRate;
    const totalFees = brokerageFee + sttFee + gstFee + sebiFee;
    
    // Debit: Stock units (what user receives)
    entries.push({
      accountType: 'stock_units',
      stockSymbol,
      amount: quantity,
      entryType: 'debit',
      description: `Stock units credited to user`
    });
    
    // Credit: Cash outflow (what company pays)
    entries.push({
      accountType: 'cash_outflow',
      amount: totalValue,
      entryType: 'credit',
      description: `Cash paid for stock purchase`
    });
    
    // Credit: Various fees
    if (brokerageFee > 0) {
      entries.push({
        accountType: 'brokerage_fee',
        amount: brokerageFee,
        entryType: 'credit',
        description: `Brokerage fee`
      });
    }
    
    if (sttFee > 0) {
      entries.push({
        accountType: 'stt_fee',
        amount: sttFee,
        entryType: 'credit',
        description: `Securities Transaction Tax`
      });
    }
    
    if (gstFee > 0) {
      entries.push({
        accountType: 'gst_fee',
        amount: gstFee,
        entryType: 'credit',
        description: `GST on brokerage`
      });
    }
    
    if (sebiFee > 0) {
      entries.push({
        accountType: 'sebi_fee',
        amount: sebiFee,
        entryType: 'credit',
        description: `SEBI charges`
      });
    }
    
    // Insert ledger entries
    for (const entry of entries) {
      const entryId = uuidv4();
      await connection.execute(
        `INSERT INTO ledger_entries 
         (id, reward_event_id, account_type, stock_symbol, amount, entry_type, description) 
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [entryId, rewardId, entry.accountType, entry.stockSymbol, entry.amount, entry.entryType, entry.description]
      );
    }
    
    return entries;
  }

  // Get today's rewards for a user
  static async getTodayRewards(userId) {
    const [rows] = await pool.execute(
      `SELECT re.id, re.stock_symbol, re.quantity, re.reward_type, re.event_timestamp,
              ss.name as stock_name
       FROM reward_events re
       JOIN stock_symbols ss ON re.stock_symbol = ss.symbol
       WHERE re.user_id = ? 
       AND DATE(re.event_timestamp) = CURDATE()
       ORDER BY re.event_timestamp DESC`,
      [userId]
    );
    return rows;
  }

  // Get historical INR valuations
  static async getHistoricalValuations(userId) {
    const [rows] = await pool.execute(
      `SELECT valuation_date, total_inr_value
       FROM historical_valuations
       WHERE user_id = ?
       ORDER BY valuation_date DESC`,
      [userId]
    );
    return rows;
  }

  // Get user stats
  static async getUserStats(userId) {
    // Get today's rewards grouped by stock
    const [todayRewards] = await pool.execute(
      `SELECT re.stock_symbol, ss.name as stock_name, SUM(re.quantity) as total_quantity
       FROM reward_events re
       JOIN stock_symbols ss ON re.stock_symbol = ss.symbol
       WHERE re.user_id = ? 
       AND DATE(re.event_timestamp) = CURDATE()
       GROUP BY re.stock_symbol, ss.name`,
      [userId]
    );

    // Get current portfolio value
    const [portfolioValue] = await pool.execute(
      `SELECT uh.stock_symbol, ss.name as stock_name, uh.total_quantity, sp.price,
              (uh.total_quantity * sp.price) as current_value
       FROM user_holdings uh
       JOIN stock_symbols ss ON uh.stock_symbol = ss.symbol
       LEFT JOIN (
         SELECT stock_symbol, price, ROW_NUMBER() OVER (PARTITION BY stock_symbol ORDER BY price_timestamp DESC) as rn
         FROM stock_prices
       ) sp ON uh.stock_symbol = sp.stock_symbol AND sp.rn = 1
       WHERE uh.user_id = ? AND uh.total_quantity > 0`,
      [userId]
    );

    const totalPortfolioValue = portfolioValue.reduce((sum, holding) => sum + (holding.current_value || 0), 0);

    return {
      todayRewards,
      portfolioValue,
      totalPortfolioValue
    };
  }

  // Get user portfolio
  static async getUserPortfolio(userId) {
    const [rows] = await pool.execute(
      `SELECT uh.stock_symbol, ss.name as stock_name, uh.total_quantity, 
              sp.price as current_price,
              (uh.total_quantity * sp.price) as current_inr_value
       FROM user_holdings uh
       JOIN stock_symbols ss ON uh.stock_symbol = ss.symbol
       LEFT JOIN (
         SELECT stock_symbol, price, ROW_NUMBER() OVER (PARTITION BY stock_symbol ORDER BY price_timestamp DESC) as rn
         FROM stock_prices
       ) sp ON uh.stock_symbol = sp.stock_symbol AND sp.rn = 1
       WHERE uh.user_id = ? AND uh.total_quantity > 0
       ORDER BY current_inr_value DESC`,
      [userId]
    );
    return rows;
  }

  // Check for duplicate rewards (replay attack prevention)
  static async checkDuplicateReward(userId, stockSymbol, quantity, eventTimestamp) {
    const [rows] = await pool.execute(
      `SELECT id FROM reward_events 
       WHERE user_id = ? AND stock_symbol = ? AND quantity = ? 
       AND ABS(TIMESTAMPDIFF(SECOND, event_timestamp, ?)) < 60`,
      [userId, stockSymbol, quantity, eventTimestamp]
    );
    return rows.length > 0;
  }
}

module.exports = RewardModel;
