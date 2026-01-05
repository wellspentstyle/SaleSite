-- Database Schema for SaleSite
-- Run this in Railway PostgreSQL to create all tables

-- ============================================
-- COMPANIES TABLE (Brands/Shops)
-- ============================================
CREATE TABLE IF NOT EXISTS companies (
  id SERIAL PRIMARY KEY,
  airtable_id VARCHAR(255) UNIQUE,
  name VARCHAR(255) NOT NULL,
  type VARCHAR(50),
  price_range VARCHAR(10),
  category TEXT[],
  values TEXT[],
  max_womens_size VARCHAR(50),
  description TEXT,
  website VARCHAR(500),
  shopmy_url VARCHAR(500),
  urls TEXT[],
  priority VARCHAR(50) DEFAULT 'Normal',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_companies_name ON companies(name);
CREATE INDEX IF NOT EXISTS idx_companies_airtable_id ON companies(airtable_id);
CREATE INDEX IF NOT EXISTS idx_companies_priority ON companies(priority);

-- ============================================
-- SALES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS sales (
  id SERIAL PRIMARY KEY,
  airtable_id VARCHAR(255) UNIQUE,
  company_id INTEGER REFERENCES companies(id) ON DELETE SET NULL,
  original_company_name VARCHAR(255),
  sale_name VARCHAR(500),
  percent_off DECIMAL(5,2),
  promo_code VARCHAR(100),
  start_date DATE,
  end_date DATE,
  sale_url TEXT,
  clean_url TEXT,
  live VARCHAR(10) DEFAULT 'NO',
  featured VARCHAR(10) DEFAULT 'NO',
  featured_asset_url TEXT,
  featured_asset_date TIMESTAMP,
  extra_discount DECIMAL(5,2),
  image_url TEXT,
  description TEXT,
  original_created_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sales_company_id ON sales(company_id);
CREATE INDEX IF NOT EXISTS idx_sales_airtable_id ON sales(airtable_id);
CREATE INDEX IF NOT EXISTS idx_sales_live ON sales(live);
CREATE INDEX IF NOT EXISTS idx_sales_created_at ON sales(created_at);

-- ============================================
-- PICKS TABLE (Products in Sales)
-- ============================================
CREATE TABLE IF NOT EXISTS picks (
  id SERIAL PRIMARY KEY,
  airtable_id VARCHAR(255) UNIQUE,
  sale_id INTEGER REFERENCES sales(id) ON DELETE CASCADE,
  product_name VARCHAR(500),
  brand VARCHAR(255),
  product_url TEXT,
  image_url TEXT,
  original_price DECIMAL(10,2),
  sale_price DECIMAL(10,2),
  percent_off DECIMAL(5,2),
  percent_off_override DECIMAL(5,2),
  shopmy_url TEXT,
  confidence DECIMAL(3,2),
  entry_type VARCHAR(50) DEFAULT 'manual',
  sizes TEXT[],
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_picks_sale_id ON picks(sale_id);
CREATE INDEX IF NOT EXISTS idx_picks_airtable_id ON picks(airtable_id);
CREATE INDEX IF NOT EXISTS idx_picks_created_at ON picks(created_at);

-- ============================================
-- DONE
-- ============================================
-- Tables created successfully!
-- You can now import your data from Replit or start fresh.
