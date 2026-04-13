CREATE DATABASE IF NOT EXISTS metadatamgmt;
USE metadatamgmt;

CREATE TABLE IF NOT EXISTS roles (
    id   INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(50) NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS users (
    id            INT AUTO_INCREMENT PRIMARY KEY,
    username      VARCHAR(100) NOT NULL UNIQUE,
    email         VARCHAR(255),
    password_hash VARCHAR(255) NOT NULL,
    is_active     TINYINT(1)   NOT NULL DEFAULT 1,
    role_id       INT          NOT NULL,
    created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (role_id) REFERENCES roles(id)
);

-- Seed roles
INSERT IGNORE INTO roles (id, name) VALUES (1, 'admin'), (2, 'user');

-- Seed default admin user  (password: admin123)
INSERT IGNORE INTO users (id, username, email, password_hash, is_active, role_id)
VALUES (1, 'admin', 'admin@sgs.ai',
        '$pbkdf2-sha256$29000$7x1DKEUIwThHKGWMMWaMUQ$WQFt.58qHlTCWQUjpmOv1ahCTUiEhHiGKICYgYcrwW4',
        1, 1);

-- Seed default regular user  (password: user123)
INSERT IGNORE INTO users (id, username, email, password_hash, is_active, role_id)
VALUES (2, 'user', 'user@sgs.ai',
        '$pbkdf2-sha256$29000$31srhVCqFULoXavV.j.nNA$XN4XHVkdK4K6cMQ6YOnu/g.wQE1GnxIdt8k4kTChL5I',
        1, 2);
