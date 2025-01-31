-- Create grant_applications table
CREATE TABLE IF NOT EXISTS grant_applications (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    applicant_name VARCHAR(255) NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create grant_reviews table
CREATE TABLE IF NOT EXISTS grant_reviews (
    id SERIAL PRIMARY KEY,
    application_id INTEGER REFERENCES grant_applications(id),
    reviewer_id VARCHAR(50) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'in_progress',
    blocker_reason TEXT,
    score INTEGER CHECK (score >= 1 AND score <= 5),
    comments TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create tasks table
CREATE TABLE IF NOT EXISTS tasks (
    id SERIAL PRIMARY KEY,
    description TEXT NOT NULL,
    assigned_to VARCHAR(50) NOT NULL,
    priority INTEGER DEFAULT 1,
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    due_date DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create assignments table
CREATE TABLE IF NOT EXISTS assignments (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(50) NOT NULL,
    task_id INTEGER REFERENCES tasks(id),
    status VARCHAR(50) NOT NULL DEFAULT 'active',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes
CREATE INDEX idx_grant_applications_status ON grant_applications(status);
CREATE INDEX idx_grant_reviews_status ON grant_reviews(status);
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_assignments_user_status ON assignments(user_id, status); 