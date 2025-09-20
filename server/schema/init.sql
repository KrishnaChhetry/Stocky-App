-- Stocky Database Schema
-- This script creates all necessary tables for the stock rewards system

-- Create database if it doesn't exist
CREATE DATABASE IF NOT EXISTS stocky_db;
USE stocky_db;

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(36) PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_email (email)
);

-- Stock symbols table (master data)
CREATE TABLE IF NOT EXISTS stock_symbols (
    symbol VARCHAR(20) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Reward events table
CREATE TABLE IF NOT EXISTS reward_events (
    id VARCHAR(36) PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL,
    stock_symbol VARCHAR(20) NOT NULL,
    quantity NUMERIC(18, 6) NOT NULL,
    reward_type ENUM('onboarding', 'referral', 'trading_milestone', 'other') NOT NULL,
    event_timestamp TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (stock_symbol) REFERENCES stock_symbols(symbol) ON DELETE RESTRICT,
    INDEX idx_user_timestamp (user_id, event_timestamp),
    INDEX idx_stock_timestamp (stock_symbol, event_timestamp)
);

-- Double-entry ledger for tracking all financial transactions
CREATE TABLE IF NOT EXISTS ledger_entries (
    id VARCHAR(36) PRIMARY KEY,
    reward_event_id VARCHAR(36) NOT NULL,
    account_type ENUM('stock_units', 'cash_outflow', 'brokerage_fee', 'stt_fee', 'gst_fee', 'sebi_fee', 'other_fee') NOT NULL,
    stock_symbol VARCHAR(20),
    amount NUMERIC(18, 4) NOT NULL,
    entry_type ENUM('debit', 'credit') NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (reward_event_id) REFERENCES reward_events(id) ON DELETE CASCADE,
    FOREIGN KEY (stock_symbol) REFERENCES stock_symbols(symbol) ON DELETE RESTRICT,
    INDEX idx_reward_event (reward_event_id),
    INDEX idx_account_type (account_type),
    INDEX idx_stock_symbol (stock_symbol)
);

-- Stock prices table (updated hourly)
CREATE TABLE IF NOT EXISTS stock_prices (
    id VARCHAR(36) PRIMARY KEY,
    stock_symbol VARCHAR(20) NOT NULL,
    price NUMERIC(18, 4) NOT NULL,
    price_timestamp TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (stock_symbol) REFERENCES stock_symbols(symbol) ON DELETE CASCADE,
    INDEX idx_symbol_timestamp (stock_symbol, price_timestamp),
    INDEX idx_timestamp (price_timestamp)
);

-- User holdings summary (denormalized for performance)
CREATE TABLE IF NOT EXISTS user_holdings (
    user_id VARCHAR(36) NOT NULL,
    stock_symbol VARCHAR(20) NOT NULL,
    total_quantity NUMERIC(18, 6) NOT NULL DEFAULT 0,
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, stock_symbol),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (stock_symbol) REFERENCES stock_symbols(symbol) ON DELETE CASCADE,
    INDEX idx_user (user_id)
);

-- Historical INR valuations (daily snapshots)
CREATE TABLE IF NOT EXISTS historical_valuations (
    id VARCHAR(36) PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL,
    valuation_date DATE NOT NULL,
    total_inr_value NUMERIC(18, 4) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE KEY unique_user_date (user_id, valuation_date),
    INDEX idx_user_date (user_id, valuation_date)
);

-- Stock price adjustments (for splits, mergers, etc.)
CREATE TABLE IF NOT EXISTS stock_adjustments (
    id VARCHAR(36) PRIMARY KEY,
    stock_symbol VARCHAR(20) NOT NULL,
    adjustment_type ENUM('split', 'merger', 'delisting', 'bonus', 'other') NOT NULL,
    adjustment_factor NUMERIC(18, 6) NOT NULL,
    effective_date DATE NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (stock_symbol) REFERENCES stock_symbols(symbol) ON DELETE CASCADE,
    INDEX idx_symbol_date (stock_symbol, effective_date)
);

-- Reward adjustments/refunds
CREATE TABLE IF NOT EXISTS reward_adjustments (
    id VARCHAR(36) PRIMARY KEY,
    original_reward_id VARCHAR(36) NOT NULL,
    adjustment_type ENUM('refund', 'correction', 'cancellation') NOT NULL,
    quantity_adjustment NUMERIC(18, 6) NOT NULL,
    reason TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (original_reward_id) REFERENCES reward_events(id) ON DELETE CASCADE,
    INDEX idx_original_reward (original_reward_id)
);

-- Insert initial stock symbols
INSERT IGNORE INTO stock_symbols (symbol, name) VALUES
('RELIANCE', 'Reliance Industries Limited'),
('TCS', 'Tata Consultancy Services Limited'),
('INFOSYS', 'Infosys Limited'),
('HDFCBANK', 'HDFC Bank Limited'),
('ICICIBANK', 'ICICI Bank Limited'),
('BHARTIARTL', 'Bharti Airtel Limited'),
('ITC', 'ITC Limited'),
('SBIN', 'State Bank of India'),
('KOTAKBANK', 'Kotak Mahindra Bank Limited'),
('LT', 'Larsen & Toubro Limited');

-- Create indexes for better performance
CREATE INDEX idx_reward_events_user_date ON reward_events(user_id, event_timestamp);
CREATE INDEX idx_ledger_entries_date ON ledger_entries(created_at);
CREATE INDEX idx_stock_prices_latest ON stock_prices(stock_symbol, price_timestamp DESC);
