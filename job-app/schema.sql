-- Job Search Platform Schema
-- Run against existing Railway PostgreSQL database

-- Master resume (single row for single user)
CREATE TABLE IF NOT EXISTS job_resume (
  id SERIAL PRIMARY KEY,
  content TEXT NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Job applications
CREATE TABLE IF NOT EXISTS job_applications (
  id SERIAL PRIMARY KEY,
  company_name TEXT,
  company_url TEXT,
  role_title TEXT,
  job_description TEXT NOT NULL,
  tailored_resume TEXT,
  cover_letter TEXT,
  interview_questions JSONB,
  status TEXT DEFAULT 'saved' CHECK (status IN ('saved', 'applied', 'interviewing', 'offer', 'rejected', 'withdrawn', 'ghosted')),
  notes TEXT,
  salary_range TEXT,
  applied_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_job_applications_status ON job_applications(status);
CREATE INDEX IF NOT EXISTS idx_job_applications_created ON job_applications(created_at DESC);
