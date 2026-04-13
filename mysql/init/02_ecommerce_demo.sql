-- ============================================================
-- SGS.ai Demo: Ecommerce Database
-- 18 tables with sample data
-- ============================================================

CREATE DATABASE IF NOT EXISTS ecommerce_demo;
USE ecommerce_demo;

-- ───────────── Lookup / Reference tables ─────────────

CREATE TABLE categories (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    name        VARCHAR(100) NOT NULL,
    slug        VARCHAR(100) NOT NULL UNIQUE,
    parent_id   INT NULL,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (parent_id) REFERENCES categories(id)
);

CREATE TABLE brands (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    name        VARCHAR(100) NOT NULL,
    country     VARCHAR(60),
    website     VARCHAR(255),
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE warehouses (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    name        VARCHAR(100) NOT NULL,
    city        VARCHAR(100),
    state       VARCHAR(50),
    country     VARCHAR(60) DEFAULT 'US',
    capacity    INT,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE shipping_methods (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    name        VARCHAR(80) NOT NULL,
    carrier     VARCHAR(80),
    base_cost   DECIMAL(8,2),
    est_days    SMALLINT
);

CREATE TABLE payment_methods (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    name        VARCHAR(60) NOT NULL,
    provider    VARCHAR(60)
);

CREATE TABLE tax_rates (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    region      VARCHAR(60) NOT NULL,
    rate        DECIMAL(5,4) NOT NULL,
    description VARCHAR(120)
);

-- ───────────── Core entities ─────────────

CREATE TABLE customers (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    first_name      VARCHAR(60) NOT NULL,
    last_name       VARCHAR(60) NOT NULL,
    email           VARCHAR(180) NOT NULL UNIQUE,
    phone           VARCHAR(30),
    loyalty_points  INT DEFAULT 0,
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE addresses (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    customer_id INT NOT NULL,
    label       VARCHAR(30) DEFAULT 'home',
    line1       VARCHAR(200) NOT NULL,
    line2       VARCHAR(200),
    city        VARCHAR(100) NOT NULL,
    state       VARCHAR(50),
    zip         VARCHAR(20),
    country     VARCHAR(60) DEFAULT 'US',
    FOREIGN KEY (customer_id) REFERENCES customers(id)
);

CREATE TABLE products (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    sku             VARCHAR(40) NOT NULL UNIQUE,
    name            VARCHAR(200) NOT NULL,
    description     TEXT,
    brand_id        INT,
    category_id     INT,
    price           DECIMAL(10,2) NOT NULL,
    cost            DECIMAL(10,2),
    weight_kg       DECIMAL(6,3),
    is_active       TINYINT(1) DEFAULT 1,
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (brand_id)    REFERENCES brands(id),
    FOREIGN KEY (category_id) REFERENCES categories(id)
);

CREATE TABLE product_images (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    product_id  INT NOT NULL,
    url         VARCHAR(500) NOT NULL,
    alt_text    VARCHAR(200),
    sort_order  SMALLINT DEFAULT 0,
    FOREIGN KEY (product_id) REFERENCES products(id)
);

CREATE TABLE inventory (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    product_id      INT NOT NULL,
    warehouse_id    INT NOT NULL,
    quantity         INT NOT NULL DEFAULT 0,
    reorder_level   INT DEFAULT 10,
    last_restocked  DATETIME,
    UNIQUE KEY uq_prod_wh (product_id, warehouse_id),
    FOREIGN KEY (product_id)   REFERENCES products(id),
    FOREIGN KEY (warehouse_id) REFERENCES warehouses(id)
);

-- ───────────── Orders & transactions ─────────────

CREATE TABLE orders (
    id                  INT AUTO_INCREMENT PRIMARY KEY,
    customer_id         INT NOT NULL,
    shipping_address_id INT,
    shipping_method_id  INT,
    payment_method_id   INT,
    status              ENUM('pending','processing','shipped','delivered','cancelled','refunded')
                        DEFAULT 'pending',
    subtotal            DECIMAL(10,2) NOT NULL,
    tax_amount          DECIMAL(10,2) DEFAULT 0,
    shipping_cost       DECIMAL(8,2) DEFAULT 0,
    total               DECIMAL(10,2) NOT NULL,
    notes               TEXT,
    ordered_at          DATETIME DEFAULT CURRENT_TIMESTAMP,
    shipped_at          DATETIME,
    delivered_at        DATETIME,
    FOREIGN KEY (customer_id)         REFERENCES customers(id),
    FOREIGN KEY (shipping_address_id) REFERENCES addresses(id),
    FOREIGN KEY (shipping_method_id)  REFERENCES shipping_methods(id),
    FOREIGN KEY (payment_method_id)   REFERENCES payment_methods(id)
);

CREATE TABLE order_items (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    order_id    INT NOT NULL,
    product_id  INT NOT NULL,
    quantity    INT NOT NULL DEFAULT 1,
    unit_price  DECIMAL(10,2) NOT NULL,
    discount    DECIMAL(10,2) DEFAULT 0,
    FOREIGN KEY (order_id)  REFERENCES orders(id),
    FOREIGN KEY (product_id) REFERENCES products(id)
);

CREATE TABLE reviews (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    product_id  INT NOT NULL,
    customer_id INT NOT NULL,
    rating      TINYINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
    title       VARCHAR(200),
    body        TEXT,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id)  REFERENCES products(id),
    FOREIGN KEY (customer_id) REFERENCES customers(id)
);

CREATE TABLE coupons (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    code            VARCHAR(40) NOT NULL UNIQUE,
    discount_pct    DECIMAL(5,2),
    discount_amt    DECIMAL(10,2),
    min_order       DECIMAL(10,2) DEFAULT 0,
    max_uses        INT,
    times_used      INT DEFAULT 0,
    valid_from      DATE,
    valid_to        DATE,
    is_active       TINYINT(1) DEFAULT 1
);

CREATE TABLE wishlists (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    customer_id INT NOT NULL,
    product_id  INT NOT NULL,
    added_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_wish (customer_id, product_id),
    FOREIGN KEY (customer_id) REFERENCES customers(id),
    FOREIGN KEY (product_id)  REFERENCES products(id)
);

CREATE TABLE audit_log (
    id          BIGINT AUTO_INCREMENT PRIMARY KEY,
    table_name  VARCHAR(80) NOT NULL,
    record_id   INT,
    action      ENUM('INSERT','UPDATE','DELETE') NOT NULL,
    old_values  JSON,
    new_values  JSON,
    performed_by VARCHAR(80),
    performed_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- SEED DATA
-- ============================================================

-- Categories (with subcategories)
INSERT INTO categories (id, name, slug, parent_id) VALUES
(1,  'Electronics',      'electronics',       NULL),
(2,  'Laptops',          'laptops',           1),
(3,  'Smartphones',      'smartphones',       1),
(4,  'Accessories',      'accessories',       1),
(5,  'Clothing',         'clothing',          NULL),
(6,  'Men',              'men',               5),
(7,  'Women',            'women',             5),
(8,  'Home & Kitchen',   'home-kitchen',      NULL),
(9,  'Furniture',        'furniture',         8),
(10, 'Appliances',       'appliances',        8),
(11, 'Sports & Outdoors','sports-outdoors',   NULL),
(12, 'Books',            'books',             NULL);

-- Brands
INSERT INTO brands (id, name, country, website) VALUES
(1, 'TechNova',    'US',    'https://technova.example.com'),
(2, 'GalaxyWear',  'KR',    'https://galaxywear.example.com'),
(3, 'HomeComfort', 'DE',    'https://homecomfort.example.com'),
(4, 'SportMax',    'US',    'https://sportmax.example.com'),
(5, 'UrbanStyle',  'IT',    'https://urbanstyle.example.com'),
(6, 'BookWorld',   'UK',    'https://bookworld.example.com'),
(7, 'PowerEdge',   'TW',    'https://poweredge.example.com'),
(8, 'NatureGear',  'CA',    'https://naturegear.example.com');

-- Warehouses
INSERT INTO warehouses (id, name, city, state, country, capacity) VALUES
(1, 'East Coast Hub',   'Newark',       'NJ', 'US', 50000),
(2, 'West Coast Hub',   'Los Angeles',  'CA', 'US', 45000),
(3, 'Central Depot',    'Dallas',       'TX', 'US', 30000),
(4, 'Europe Warehouse', 'Rotterdam',    NULL,  'NL', 25000);

-- Shipping methods
INSERT INTO shipping_methods (id, name, carrier, base_cost, est_days) VALUES
(1, 'Standard Shipping',    'USPS',  5.99,  7),
(2, 'Express Shipping',     'FedEx', 12.99, 3),
(3, 'Next-Day Delivery',    'UPS',   24.99, 1),
(4, 'International Economy', 'DHL',  18.50, 14);

-- Payment methods
INSERT INTO payment_methods (id, name, provider) VALUES
(1, 'Credit Card',  'Stripe'),
(2, 'PayPal',       'PayPal'),
(3, 'Apple Pay',    'Apple'),
(4, 'Bank Transfer', 'Plaid');

-- Tax rates
INSERT INTO tax_rates (id, region, rate, description) VALUES
(1, 'CA', 0.0725, 'California state sales tax'),
(2, 'TX', 0.0625, 'Texas state sales tax'),
(3, 'NY', 0.0800, 'New York state sales tax'),
(4, 'NJ', 0.0663, 'New Jersey state sales tax'),
(5, 'EU', 0.2000, 'EU standard VAT');

-- Customers
INSERT INTO customers (id, first_name, last_name, email, phone, loyalty_points) VALUES
(1,  'Alice',   'Johnson',   'alice.johnson@example.com',   '555-0101', 1250),
(2,  'Bob',     'Smith',     'bob.smith@example.com',       '555-0102', 890),
(3,  'Carol',   'Williams',  'carol.williams@example.com',  '555-0103', 2100),
(4,  'David',   'Brown',     'david.brown@example.com',     '555-0104', 450),
(5,  'Emma',    'Davis',     'emma.davis@example.com',       '555-0105', 3200),
(6,  'Frank',   'Miller',    'frank.miller@example.com',    '555-0106', 670),
(7,  'Grace',   'Wilson',    'grace.wilson@example.com',    '555-0107', 1800),
(8,  'Henry',   'Moore',     'henry.moore@example.com',     '555-0108', 150),
(9,  'Ivy',     'Taylor',    'ivy.taylor@example.com',      '555-0109', 990),
(10, 'Jack',    'Anderson',  'jack.anderson@example.com',   '555-0110', 2400);

-- Addresses
INSERT INTO addresses (id, customer_id, label, line1, city, state, zip, country) VALUES
(1,  1,  'home',   '123 Oak Street',       'San Francisco', 'CA', '94102', 'US'),
(2,  1,  'work',   '456 Market Street',    'San Francisco', 'CA', '94105', 'US'),
(3,  2,  'home',   '789 Elm Avenue',       'Austin',        'TX', '73301', 'US'),
(4,  3,  'home',   '321 Pine Road',        'New York',      'NY', '10001', 'US'),
(5,  4,  'home',   '654 Maple Drive',      'Newark',        'NJ', '07101', 'US'),
(6,  5,  'home',   '987 Cedar Lane',       'Los Angeles',   'CA', '90001', 'US'),
(7,  6,  'home',   '147 Birch Court',      'Dallas',        'TX', '75201', 'US'),
(8,  7,  'home',   '258 Walnut Way',       'Brooklyn',      'NY', '11201', 'US'),
(9,  8,  'home',   '369 Spruce Blvd',      'San Jose',      'CA', '95101', 'US'),
(10, 9,  'home',   '741 Ash Place',        'Houston',       'TX', '77001', 'US'),
(11, 10, 'home',   '852 Cherry Hill',      'Amsterdam',     NULL,  '1012',  'NL');

-- Products (20 items across categories)
INSERT INTO products (id, sku, name, description, brand_id, category_id, price, cost, weight_kg) VALUES
(1,  'TN-LAP-001', 'TechNova ProBook 15',     'High-performance 15" laptop with 32GB RAM, 1TB SSD',  1, 2,  1299.99, 850.00, 2.100),
(2,  'TN-LAP-002', 'TechNova AirLight 13',    'Ultra-thin 13" laptop, 16GB RAM, 512GB SSD',          1, 2,  999.99,  620.00, 1.200),
(3,  'GW-PHN-001', 'GalaxyWear Z-Phone Pro',  'Flagship smartphone 6.7" AMOLED, 256GB',              2, 3,  899.99,  520.00, 0.195),
(4,  'GW-PHN-002', 'GalaxyWear Lite Phone',   'Budget-friendly 6.1" smartphone, 128GB',              2, 3,  349.99,  180.00, 0.175),
(5,  'PE-ACC-001', 'PowerEdge USB-C Hub 7in1', '7-port USB-C hub with HDMI, SD card reader',          7, 4,  49.99,   18.00,  0.120),
(6,  'PE-ACC-002', 'PowerEdge Wireless Mouse', 'Ergonomic wireless mouse, 2.4GHz + Bluetooth',        7, 4,  29.99,   10.00,  0.085),
(7,  'US-MEN-001', 'UrbanStyle Slim Chinos',   'Men''s slim-fit chinos, stretch cotton blend',        5, 6,  69.99,   25.00,  0.450),
(8,  'US-MEN-002', 'UrbanStyle Linen Shirt',  'Men''s casual linen shirt, breathable fabric',         5, 6,  59.99,   20.00,  0.300),
(9,  'US-WMN-001', 'UrbanStyle Wrap Dress',   'Women''s wrap dress, floral print',                    5, 7,  89.99,   30.00,  0.350),
(10, 'US-WMN-002', 'UrbanStyle Denim Jacket', 'Women''s oversized denim jacket',                      5, 7,  99.99,   38.00,  0.800),
(11, 'HC-FUR-001', 'HomeComfort Ergo Chair',   'Ergonomic office chair, adjustable lumbar support',   3, 9,  449.99,  200.00, 15.500),
(12, 'HC-FUR-002', 'HomeComfort Standing Desk','Electric sit-stand desk, 60" wide',                   3, 9,  599.99,  280.00, 35.000),
(13, 'HC-APP-001', 'HomeComfort Air Purifier', 'HEPA air purifier, covers 500 sq ft',                 3, 10, 199.99,  85.00,  4.200),
(14, 'HC-APP-002', 'HomeComfort Espresso Pro', 'Automatic espresso machine with milk frother',         3, 10, 349.99,  160.00, 6.800),
(15, 'SM-OUT-001', 'SportMax Trail Runner',    'Men''s trail running shoes, waterproof',              4, 11, 129.99,  48.00,  0.650),
(16, 'SM-OUT-002', 'SportMax Hiking Pack 40L', '40-liter hiking backpack, rain cover included',       4, 11, 89.99,   32.00,  1.100),
(17, 'NG-OUT-001', 'NatureGear Camping Tent',  '3-person tent, lightweight, 4-season',                8, 11, 249.99,  110.00, 2.800),
(18, 'NG-OUT-002', 'NatureGear Sleeping Bag',  'Down sleeping bag, rated to -10°C',                    8, 11, 149.99,  65.00,  1.400),
(19, 'BW-BK-001',  'Data Science Handbook',    'Comprehensive guide to data science and ML',           6, 12, 49.99,   12.00,  0.900),
(20, 'BW-BK-002',  'Clean Code Principles',   'Software engineering best practices',                  6, 12, 39.99,   10.00,  0.750);

-- Product images
INSERT INTO product_images (product_id, url, alt_text, sort_order) VALUES
(1,  '/images/probook15-front.jpg',    'ProBook 15 front view',     0),
(1,  '/images/probook15-side.jpg',     'ProBook 15 side view',      1),
(3,  '/images/zphone-pro-front.jpg',   'Z-Phone Pro front',         0),
(11, '/images/ergo-chair-angle.jpg',   'Ergo Chair angle view',     0),
(14, '/images/espresso-pro.jpg',       'Espresso Pro machine',      0),
(17, '/images/camping-tent.jpg',       'Camping Tent pitched',      0),
(19, '/images/ds-handbook-cover.jpg',  'Data Science Handbook cover',0);

-- Inventory
INSERT INTO inventory (product_id, warehouse_id, quantity, reorder_level, last_restocked) VALUES
(1,  1, 120,  20, '2026-03-15 10:00:00'),
(1,  2, 85,   20, '2026-03-18 09:00:00'),
(2,  1, 200,  30, '2026-03-20 11:00:00'),
(2,  2, 150,  30, '2026-03-20 11:00:00'),
(3,  1, 300,  50, '2026-04-01 08:00:00'),
(3,  2, 250,  50, '2026-04-01 08:00:00'),
(4,  1, 500,  100,'2026-03-25 14:00:00'),
(5,  1, 800,  100,'2026-03-10 07:00:00'),
(5,  3, 600,  100,'2026-03-12 07:00:00'),
(6,  1, 450,  80, '2026-03-28 10:00:00'),
(7,  2, 180,  30, '2026-04-02 09:00:00'),
(8,  2, 200,  30, '2026-04-02 09:00:00'),
(9,  2, 160,  25, '2026-03-30 12:00:00'),
(10, 2, 140,  25, '2026-03-30 12:00:00'),
(11, 1, 60,   10, '2026-03-22 15:00:00'),
(11, 3, 40,   10, '2026-03-22 15:00:00'),
(12, 3, 35,   8,  '2026-03-28 11:00:00'),
(13, 1, 220,  40, '2026-04-05 10:00:00'),
(14, 1, 90,   15, '2026-04-05 10:00:00'),
(15, 2, 300,  50, '2026-04-03 08:00:00'),
(16, 2, 180,  30, '2026-04-03 08:00:00'),
(17, 3, 75,   15, '2026-03-15 16:00:00'),
(18, 3, 120,  20, '2026-03-15 16:00:00'),
(19, 4, 500,  80, '2026-04-01 12:00:00'),
(20, 4, 400,  60, '2026-04-01 12:00:00');

-- Coupons
INSERT INTO coupons (id, code, discount_pct, discount_amt, min_order, max_uses, valid_from, valid_to) VALUES
(1, 'WELCOME10',   10.00,  NULL,   0.00,    NULL, '2026-01-01', '2026-12-31'),
(2, 'SAVE20',      20.00,  NULL,   100.00,  500,  '2026-04-01', '2026-06-30'),
(3, 'FLAT15OFF',   NULL,   15.00,  50.00,   200,  '2026-04-01', '2026-04-30'),
(4, 'SUMMER25',    25.00,  NULL,   150.00,  300,  '2026-06-01', '2026-08-31'),
(5, 'VIP50',       NULL,   50.00,  200.00,  50,   '2026-01-01', '2026-12-31');

-- Orders
INSERT INTO orders (id, customer_id, shipping_address_id, shipping_method_id, payment_method_id, status, subtotal, tax_amount, shipping_cost, total, ordered_at, shipped_at, delivered_at) VALUES
(1,  1,  1,  2, 1, 'delivered',  1349.98, 97.87, 12.99, 1460.84, '2026-03-01 14:30:00', '2026-03-02 09:00:00', '2026-03-05 16:00:00'),
(2,  2,  3,  1, 2, 'delivered',  419.98,  26.25, 5.99,  452.22,  '2026-03-05 10:15:00', '2026-03-06 08:00:00', '2026-03-12 11:00:00'),
(3,  3,  4,  3, 1, 'shipped',    949.98,  76.00, 24.99, 1050.97, '2026-04-08 09:45:00', '2026-04-09 07:30:00', NULL),
(4,  5,  6,  2, 3, 'processing', 599.99,  43.50, 12.99, 656.48,  '2026-04-09 18:20:00', NULL, NULL),
(5,  1,  2,  1, 1, 'delivered',  129.98,  9.42,  5.99,  145.39,  '2026-02-14 11:00:00', '2026-02-15 08:00:00', '2026-02-21 14:00:00'),
(6,  7,  8,  2, 2, 'delivered',  349.99,  28.00, 12.99, 390.98,  '2026-03-10 16:30:00', '2026-03-11 09:00:00', '2026-03-14 10:00:00'),
(7,  4,  5,  1, 4, 'delivered',  89.98,   5.97,  5.99,  101.94,  '2026-03-18 08:45:00', '2026-03-19 07:00:00', '2026-03-25 17:00:00'),
(8,  10, 11, 4, 1, 'shipped',    249.99,  50.00, 18.50, 318.49,  '2026-04-07 12:00:00', '2026-04-08 10:00:00', NULL),
(9,  9,  10, 1, 2, 'pending',    199.98,  12.50, 5.99,  218.47,  '2026-04-10 07:30:00', NULL, NULL),
(10, 6,  7,  2, 1, 'cancelled',  449.99,  28.12, 12.99, 491.10,  '2026-03-22 20:00:00', NULL, NULL),
(11, 3,  4,  1, 3, 'delivered',  79.98,   6.40,  5.99,  92.37,   '2026-01-20 13:00:00', '2026-01-21 08:00:00', '2026-01-28 12:00:00'),
(12, 5,  6,  3, 1, 'delivered',  1299.99, 94.25, 24.99, 1419.23, '2026-02-28 10:00:00', '2026-03-01 07:00:00', '2026-03-02 15:00:00');

-- Order items
INSERT INTO order_items (order_id, product_id, quantity, unit_price, discount) VALUES
(1,  1,  1, 1299.99, 0.00),
(1,  5,  1, 49.99,   0.00),
(2,  7,  2, 69.99,   0.00),
(2,  8,  1, 59.99,   0.00),
(2,  19, 1, 49.99,   0.00),
(3,  3,  1, 899.99,  0.00),
(3,  6,  1, 29.99,   0.00),
(3,  20, 1, 39.99,   19.99),
(4,  12, 1, 599.99,  0.00),
(5,  7,  1, 69.99,   0.00),
(5,  8,  1, 59.99,   0.00),
(6,  14, 1, 349.99,  0.00),
(7,  19, 1, 49.99,   0.00),
(7,  20, 1, 39.99,   0.00),
(8,  17, 1, 249.99,  0.00),
(9,  13, 1, 199.99,  0.00),
(10, 11, 1, 449.99,  0.00),
(11, 20, 2, 39.99,   0.00),
(12, 1,  1, 1299.99, 0.00);

-- Reviews
INSERT INTO reviews (product_id, customer_id, rating, title, body) VALUES
(1,  1,  5, 'Amazing laptop!',          'Blazing fast, great screen. Worth every penny.'),
(1,  5,  4, 'Solid performance',        'Great for development work. Battery could be better.'),
(3,  3,  5, 'Best phone I''ve owned',   'Camera is incredible, display is gorgeous.'),
(3,  2,  4, 'Great but pricey',         'Excellent phone. Wish it was a bit cheaper.'),
(7,  1,  5, 'Perfect fit',              'Comfortable and stylish. Ordered two more pairs.'),
(11, 6,  3, 'Good but assembly is hard', 'Chair is comfy once assembled. Instructions could be clearer.'),
(14, 7,  5, 'Café-quality espresso',    'Makes perfect espresso every morning. Love it!'),
(17, 10, 4, 'Solid tent',               'Held up well in rain. A bit heavy for backpacking.'),
(19, 3,  5, 'Essential reference',      'Best data science book I''ve read. Very practical.'),
(19, 9,  4, 'Good overview',            'Covers a lot of ground. Some chapters could go deeper.'),
(12, 5,  5, 'Life changing desk',       'Standing while working has been great for my back.'),
(15, 4,  4, 'Trail tested',             'Great grip and waterproofing. Ran 200 miles so far.');

-- Wishlists
INSERT INTO wishlists (customer_id, product_id) VALUES
(1, 12), (1, 14), (2, 1), (2, 17), (3, 11),
(4, 3),  (5, 9),  (6, 15),(7, 2),  (8, 18),
(9, 14), (10, 1);

-- Audit log (sample entries)
INSERT INTO audit_log (table_name, record_id, action, new_values, performed_by) VALUES
('orders',  10, 'UPDATE', '{"status":"cancelled"}',               'system'),
('inventory', 1, 'UPDATE', '{"quantity":120}',                     'warehouse_mgr'),
('customers', 5, 'UPDATE', '{"loyalty_points":3200}',             'loyalty_system'),
('products',  4, 'UPDATE', '{"price":349.99,"is_active":1}',      'product_admin'),
('coupons',   2, 'UPDATE', '{"times_used":42}',                   'checkout_system');
