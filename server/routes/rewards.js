const express = require('express');
const Joi = require('joi');
const RewardModel = require('../models/RewardModel');
const { v4: uuidv4 } = require('uuid');

const router = express.Router();

// Validation schemas
const rewardSchema = Joi.object({
  userId: Joi.string().uuid().required(),
  stockSymbol: Joi.string().max(20).required(),
  quantity: Joi.number().positive().precision(6).required(),
  rewardType: Joi.string().valid('onboarding', 'referral', 'trading_milestone', 'other').required(),
  eventTimestamp: Joi.date().iso().optional()
});

const userIdSchema = Joi.object({
  userId: Joi.string().uuid().required()
});

// POST /reward - Record a reward event
router.post('/reward', async (req, res) => {
  try {
    // Validate request body
    const { error, value } = rewardSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        error: 'Validation error',
        details: error.details[0].message
      });
    }

    const { userId, stockSymbol, quantity, rewardType, eventTimestamp } = value;
    const timestamp = eventTimestamp || new Date();

    // Check for duplicate rewards (replay attack prevention)
    // TODO: This check might be too strict, consider adjusting time window
    const isDuplicate = await RewardModel.checkDuplicateReward(
      userId, stockSymbol, quantity, timestamp
    );
    
    if (isDuplicate) {
      console.log('Duplicate reward detected for user:', userId); // Debug log
      return res.status(409).json({
        success: false,
        error: 'Duplicate reward detected',
        message: 'A similar reward was already processed recently'
      });
    }

    // Create the reward
    const reward = await RewardModel.createReward(
      userId, stockSymbol, quantity, rewardType, timestamp
    );

    res.status(201).json({
      success: true,
      message: 'Reward created successfully',
      data: {
        rewardId: reward.rewardId,
        userId: reward.userId,
        stockSymbol: reward.stockSymbol,
        quantity: reward.quantity,
        rewardType: reward.rewardType,
        eventTimestamp: reward.eventTimestamp,
        fees: reward.ledgerEntries.filter(entry => 
          ['brokerage_fee', 'stt_fee', 'gst_fee', 'sebi_fee'].includes(entry.accountType)
        )
      }
    });

  } catch (error) {
    console.error('Error creating reward:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: 'Failed to create reward'
    });
  }
});

// GET /today-stocks/{userId} - Get today's rewards for a user
router.get('/today-stocks/:userId', async (req, res) => {
  try {
    // Validate userId
    const { error } = userIdSchema.validate({ userId: req.params.userId });
    if (error) {
      return res.status(400).json({
        success: false,
        error: 'Invalid user ID format'
      });
    }

    const rewards = await RewardModel.getTodayRewards(req.params.userId);

    res.json({
      success: true,
      data: {
        userId: req.params.userId,
        date: new Date().toISOString().split('T')[0],
        rewards: rewards.map(reward => ({
          rewardId: reward.id,
          stockSymbol: reward.stock_symbol,
          stockName: reward.stock_name,
          quantity: parseFloat(reward.quantity),
          rewardType: reward.reward_type,
          eventTimestamp: reward.event_timestamp
        })),
        totalRewards: rewards.length
      }
    });

  } catch (error) {
    console.error('Error fetching today\'s rewards:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: 'Failed to fetch today\'s rewards'
    });
  }
});

// GET /historical-inr/{userId} - Get historical INR valuations
router.get('/historical-inr/:userId', async (req, res) => {
  try {
    // Validate userId
    const { error } = userIdSchema.validate({ userId: req.params.userId });
    if (error) {
      return res.status(400).json({
        success: false,
        error: 'Invalid user ID format'
      });
    }

    const valuations = await RewardModel.getHistoricalValuations(req.params.userId);

    res.json({
      success: true,
      data: {
        userId: req.params.userId,
        valuations: valuations.map(valuation => ({
          date: valuation.valuation_date,
          totalInrValue: parseFloat(valuation.total_inr_value)
        })),
        totalDays: valuations.length
      }
    });

  } catch (error) {
    console.error('Error fetching historical valuations:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: 'Failed to fetch historical valuations'
    });
  }
});

// GET /stats/{userId} - Get user statistics
router.get('/stats/:userId', async (req, res) => {
  try {
    // Validate userId
    const { error } = userIdSchema.validate({ userId: req.params.userId });
    if (error) {
      return res.status(400).json({
        success: false,
        error: 'Invalid user ID format'
      });
    }

    const stats = await RewardModel.getUserStats(req.params.userId);

    res.json({
      success: true,
      data: {
        userId: req.params.userId,
        date: new Date().toISOString().split('T')[0],
        todayRewards: stats.todayRewards.map(reward => ({
          stockSymbol: reward.stock_symbol,
          stockName: reward.stock_name,
          totalQuantity: parseFloat(reward.total_quantity)
        })),
        portfolio: {
          holdings: stats.portfolioValue.map(holding => ({
            stockSymbol: holding.stock_symbol,
            stockName: holding.stock_name,
            quantity: parseFloat(holding.total_quantity),
            currentPrice: parseFloat(holding.price || 0),
            currentValue: parseFloat(holding.current_value || 0)
          })),
          totalValue: parseFloat(stats.totalPortfolioValue)
        }
      }
    });

  } catch (error) {
    console.error('Error fetching user stats:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: 'Failed to fetch user statistics'
    });
  }
});

// GET /portfolio/{userId} - Get user portfolio (bonus endpoint)
router.get('/portfolio/:userId', async (req, res) => {
  try {
    // Validate userId
    const { error } = userIdSchema.validate({ userId: req.params.userId });
    if (error) {
      return res.status(400).json({
        success: false,
        error: 'Invalid user ID format'
      });
    }

    const portfolio = await RewardModel.getUserPortfolio(req.params.userId);

    res.json({
      success: true,
      data: {
        userId: req.params.userId,
        portfolio: portfolio.map(holding => ({
          stockSymbol: holding.stock_symbol,
          stockName: holding.stock_name,
          quantity: parseFloat(holding.total_quantity),
          currentPrice: parseFloat(holding.current_price || 0),
          currentInrValue: parseFloat(holding.current_inr_value || 0)
        })),
        totalValue: portfolio.reduce((sum, holding) => 
          sum + parseFloat(holding.current_inr_value || 0), 0
        )
      }
    });

  } catch (error) {
    console.error('Error fetching user portfolio:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: 'Failed to fetch user portfolio'
    });
  }
});

module.exports = router;
