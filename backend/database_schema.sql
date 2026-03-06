-- Users Table
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'developer',
    department VARCHAR(100),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Resource Quotas Table
CREATE TABLE resource_quotas (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    cpu_limit INTEGER DEFAULT 4,
    memory_limit_gb INTEGER DEFAULT 16,
    storage_limit_gb INTEGER DEFAULT 100,
    monthly_budget_usd DECIMAL(10,2) DEFAULT 100.00,
    environments_limit INTEGER DEFAULT 3
);

-- Environment Templates Table
CREATE TABLE environment_templates (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    template_type VARCHAR(100) NOT NULL,
    base_cost_usd DECIMAL(10,2) DEFAULT 0,
    resources JSONB,
    is_active BOOLEAN DEFAULT TRUE
);

-- Insert default templates
INSERT INTO environment_templates (name, description, template_type, base_cost_usd, resources) VALUES
('Web Application', 'EC2 instance with web server', 'web_app', 0.00, '{"instance_type": "t2.micro", "storage_gb": 20}'),
('Database Server', 'PostgreSQL RDS instance', 'database', 0.00, '{"instance_type": "db.t2.micro", "storage_gb": 20}'),
('Serverless API', 'Lambda + API Gateway', 'serverless', 0.00, '{"memory_mb": 512, "timeout_seconds": 30}');

-- Create default admin user (password: admin123)
INSERT INTO users (email, password_hash, full_name, role, department) VALUES
('admin@cloudportal.com', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewY5P.4zT9F9MGMS', 'System Administrator', 'admin', 'IT');

-- Create quota for admin
INSERT INTO resource_quotas (user_id, cpu_limit, memory_limit_gb, monthly_budget_usd, environments_limit)
SELECT id, 100, 256, 5000.00, 50 FROM users WHERE email = 'admin@cloudportal.com';
