# Stocky - Stock Rewards Platform

Stocky is a platform where users can earn shares of Indian stocks (e.g., Reliance, TCS, Infosys) as incentives for actions like onboarding, referrals, or trading milestones.

## Features

- **Stock Rewards System**: Users receive full stock units with no deductions
- **Real-time Portfolio Tracking**: Hourly stock price updates
- **Double-entry Ledger**: Complete financial tracking with fees
- **Historical Analytics**: Track portfolio value over time
- **Modern UI**: React-based dashboard with Material-UI

## Tech Stack

- **Backend**: Node.js, Express.js, MySQL
- **Frontend**: React, TypeScript, Material-UI
- **Database**: MySQL with comprehensive schema
- **APIs**: RESTful endpoints with validation

## Quick Start

### Prerequisites

- Node.js (v16 or higher)
- MySQL (v8.0 or higher)
- npm

### Installation

1. **Clone and install dependencies**:
   ```bash
   git clone <repository-url>
   cd stocky-app
   npm run install-all
   ```

2. **Database Setup**:
   ```bash
   # Create MySQL database
   mysql -u root -p
   CREATE DATABASE stocky_db;
   
   # Run schema initialization
   mysql -u root -p stocky_db < server/schema/init.sql
   ```

3. **Environment Configuration**:
   ```bash
   cp env.example .env
   # Edit .env with your database credentials
   ```

4. **Start the application**:
   ```bash
   # Development mode (both frontend and backend)
   npm run dev
   
   # Or start individually
   npm start          # Backend only
   cd client && npm start  # Frontend only
   ```

5. **Access the application**:
   - Frontend: http://localhost:3000
   - Backend API: http://localhost:5000
   - Health Check: http://localhost:5000/health

## API Documentation

### Base URL
```
http://localhost:5000/api
```

### Endpoints

#### 1. Create Reward
**POST** `/reward`

Records a new stock reward for a user.

#### 2. Get Today's Rewards
**GET** `/today-stocks/{userId}`

Returns all stock rewards for the user for today.


#### 3. Get Historical INR Valuations
**GET** `/historical-inr/{userId}`

Returns the INR value of the user's stock rewards for all past days.


#### 4. Get User Statistics
**GET** `/stats/{userId}`

Returns comprehensive user statistics including today's rewards and current portfolio value.


#### 5. Get User Portfolio (Bonus)
**GET** `/portfolio/{userId}`

Returns detailed portfolio holdings with current INR values.



### Key Features

- **Fractional Shares**: `NUMERIC(18, 6)` for precise stock quantities
- **Precise Currency**: `NUMERIC(18, 4)` for INR amounts
- **Double-entry Ledger**: Tracks all financial transactions
- **Audit Trail**: Complete transaction history
- **Performance Indexes**: Optimized for common queries

## Edge Cases Handled

### 1. Duplicate Reward Prevention
- **Replay Attack Protection**: Checks for similar rewards within 60 seconds
- **Unique Constraints**: Database-level duplicate prevention
- **Idempotency**: Safe to retry failed requests

### 2. Stock Price Management
- **API Downtime**: Falls back to cached prices
- **Stale Data Detection**: Identifies prices older than 1 hour
- **Default Prices**: Uses realistic base prices when API fails

### 3. Financial Accuracy
- **Rounding Errors**: Uses precise decimal arithmetic
- **Fee Calculations**: Transparent fee breakdown
- **Currency Precision**: 4 decimal places for INR amounts

### 4. Stock Corporate Actions
- **Stock Splits**: Adjustment factor tracking
- **Mergers**: Historical data preservation
- **Delisting**: Graceful handling of inactive stocks

### 5. Data Integrity
- **Foreign Key Constraints**: Referential integrity
- **Transaction Safety**: ACID compliance
- **Audit Logging**: Complete transaction trail

## System Architecture

### Backend Services
- **Express.js API**: RESTful endpoints with validation
- **MySQL Database**: ACID-compliant data storage
- **Cron Jobs**: Automated stock price updates
- **Rate Limiting**: API protection
- **Error Handling**: Comprehensive error management

### Frontend Components
- **React Dashboard**: Modern user interface
- **Material-UI**: Consistent design system
- **Real-time Updates**: Live portfolio tracking
- **Responsive Design**: Mobile-friendly interface




## Production Deployment

### Environment Variables
```env
# Database
DB_HOST=your-db-host
DB_USER=your-db-user
DB_PASSWORD=your-db-password
DB_NAME=stocky_db
DB_PORT=3306

# Server
PORT=5000
NODE_ENV=production

# Stock API
STOCK_API_URL=https://your-stock-api.com
STOCK_API_KEY=your-api-key
```




