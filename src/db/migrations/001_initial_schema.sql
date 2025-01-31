-- Create daily_updates table
CREATE TABLE IF NOT EXISTS daily_updates (
    id SERIAL PRIMARY KEY,
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    message_ts VARCHAR(50) NOT NULL UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create index for daily updates
CREATE INDEX idx_daily_updates_message_ts ON daily_updates(message_ts); 