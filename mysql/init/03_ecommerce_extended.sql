-- ============================================================
-- SGS.ai Demo: Ecommerce Extended Tables (20 additional)
-- Adds to the existing ecommerce_demo database
-- ============================================================

USE ecom;

-- ───────────── 1. suppliers ─────────────
CREATE TABLE suppliers (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    name        VARCHAR(150) NOT NULL,
    contact     VARCHAR(120),
    email       VARCHAR(180),
    phone       VARCHAR(30),
    country     VARCHAR(60),
    lead_time_days INT DEFAULT 7,
    rating      DECIMAL(3,2),
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ───────────── 2. product_suppliers (many-to-many) ─────────────
CREATE TABLE product_suppliers (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    product_id  INT NOT NULL,
    supplier_id INT NOT NULL,
    unit_cost   DECIMAL(10,2),
    min_order_qty INT DEFAULT 1,
    UNIQUE KEY uq_ps (product_id, supplier_id),
    FOREIGN KEY (product_id)  REFERENCES products(id),
    FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
);

-- ───────────── 3. product_attributes ─────────────
CREATE TABLE product_attributes (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    product_id  INT NOT NULL,
    attr_name   VARCHAR(80) NOT NULL,
    attr_value  VARCHAR(255) NOT NULL,
    FOREIGN KEY (product_id) REFERENCES products(id)
);

-- ───────────── 4. product_variants ─────────────
CREATE TABLE product_variants (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    product_id  INT NOT NULL,
    sku_suffix  VARCHAR(20) NOT NULL,
    color       VARCHAR(40),
    size        VARCHAR(20),
    price_adj   DECIMAL(10,2) DEFAULT 0,
    stock       INT DEFAULT 0,
    FOREIGN KEY (product_id) REFERENCES products(id)
);

-- ───────────── 5. product_tags ─────────────
CREATE TABLE tags (
    id   INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(60) NOT NULL UNIQUE
);

CREATE TABLE product_tags (
    product_id INT NOT NULL,
    tag_id     INT NOT NULL,
    PRIMARY KEY (product_id, tag_id),
    FOREIGN KEY (product_id) REFERENCES products(id),
    FOREIGN KEY (tag_id)     REFERENCES tags(id)
);

-- ───────────── 6. returns ─────────────
CREATE TABLE returns (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    order_id        INT NOT NULL,
    order_item_id   INT NOT NULL,
    reason          ENUM('defective','wrong_item','not_as_described','changed_mind','other') NOT NULL,
    status          ENUM('requested','approved','received','refunded','rejected') DEFAULT 'requested',
    refund_amount   DECIMAL(10,2),
    requested_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
    resolved_at     DATETIME,
    notes           TEXT,
    FOREIGN KEY (order_id)      REFERENCES orders(id),
    FOREIGN KEY (order_item_id) REFERENCES order_items(id)
);

-- ───────────── 7. notifications ─────────────
CREATE TABLE notifications (
    id          BIGINT AUTO_INCREMENT PRIMARY KEY,
    customer_id INT NOT NULL,
    channel     ENUM('email','sms','push') DEFAULT 'email',
    subject     VARCHAR(200),
    body        TEXT,
    is_read     TINYINT(1) DEFAULT 0,
    sent_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (customer_id) REFERENCES customers(id)
);

-- ───────────── 8. loyalty_transactions ─────────────
CREATE TABLE loyalty_transactions (
    id          BIGINT AUTO_INCREMENT PRIMARY KEY,
    customer_id INT NOT NULL,
    points      INT NOT NULL,
    type        ENUM('earn','redeem','expire','adjust') NOT NULL,
    ref_order_id INT,
    description VARCHAR(200),
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (customer_id) REFERENCES customers(id),
    FOREIGN KEY (ref_order_id) REFERENCES orders(id)
);

-- ───────────── 9. shopping_carts ─────────────
CREATE TABLE shopping_carts (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    customer_id INT NOT NULL,
    status      ENUM('active','abandoned','converted') DEFAULT 'active',
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (customer_id) REFERENCES customers(id)
);

-- ───────────── 10. cart_items ─────────────
CREATE TABLE cart_items (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    cart_id     INT NOT NULL,
    product_id  INT NOT NULL,
    quantity    INT NOT NULL DEFAULT 1,
    added_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (cart_id)    REFERENCES shopping_carts(id),
    FOREIGN KEY (product_id) REFERENCES products(id)
);

-- ───────────── 11. promotions ─────────────
CREATE TABLE promotions (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    name            VARCHAR(120) NOT NULL,
    promo_type      ENUM('percentage','fixed','bogo','free_shipping') NOT NULL,
    value           DECIMAL(10,2),
    min_purchase    DECIMAL(10,2) DEFAULT 0,
    start_date      DATE NOT NULL,
    end_date        DATE NOT NULL,
    is_active       TINYINT(1) DEFAULT 1,
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ───────────── 12. promotion_products ─────────────
CREATE TABLE promotion_products (
    promotion_id INT NOT NULL,
    product_id   INT NOT NULL,
    PRIMARY KEY (promotion_id, product_id),
    FOREIGN KEY (promotion_id) REFERENCES promotions(id),
    FOREIGN KEY (product_id)   REFERENCES products(id)
);

-- ───────────── 13. gift_cards ─────────────
CREATE TABLE gift_cards (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    code            VARCHAR(40) NOT NULL UNIQUE,
    initial_balance DECIMAL(10,2) NOT NULL,
    current_balance DECIMAL(10,2) NOT NULL,
    purchased_by    INT,
    redeemed_by     INT,
    expires_at      DATE,
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (purchased_by) REFERENCES customers(id),
    FOREIGN KEY (redeemed_by)  REFERENCES customers(id)
);

-- ───────────── 14. page_views (analytics) ─────────────
CREATE TABLE page_views (
    id          BIGINT AUTO_INCREMENT PRIMARY KEY,
    customer_id INT,
    product_id  INT,
    page_url    VARCHAR(500) NOT NULL,
    referrer    VARCHAR(500),
    device_type ENUM('desktop','mobile','tablet') DEFAULT 'desktop',
    session_id  VARCHAR(64),
    viewed_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (customer_id) REFERENCES customers(id),
    FOREIGN KEY (product_id)  REFERENCES products(id)
);

-- ───────────── 15. email_campaigns ─────────────
CREATE TABLE email_campaigns (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    name            VARCHAR(150) NOT NULL,
    subject_line    VARCHAR(200) NOT NULL,
    body_html       TEXT,
    sent_count      INT DEFAULT 0,
    open_count      INT DEFAULT 0,
    click_count     INT DEFAULT 0,
    status          ENUM('draft','scheduled','sent','cancelled') DEFAULT 'draft',
    scheduled_at    DATETIME,
    sent_at         DATETIME,
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ───────────── 16. email_subscriptions ─────────────
CREATE TABLE email_subscriptions (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    customer_id INT NOT NULL,
    list_name   VARCHAR(80) NOT NULL DEFAULT 'general',
    is_subscribed TINYINT(1) DEFAULT 1,
    subscribed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    unsubscribed_at DATETIME,
    UNIQUE KEY uq_sub (customer_id, list_name),
    FOREIGN KEY (customer_id) REFERENCES customers(id)
);

-- ───────────── 17. payment_transactions ─────────────
CREATE TABLE payment_transactions (
    id                  BIGINT AUTO_INCREMENT PRIMARY KEY,
    order_id            INT NOT NULL,
    payment_method_id   INT,
    transaction_ref     VARCHAR(80) NOT NULL,
    amount              DECIMAL(10,2) NOT NULL,
    currency            VARCHAR(3) DEFAULT 'USD',
    status              ENUM('pending','authorized','captured','failed','refunded') DEFAULT 'pending',
    gateway_response    JSON,
    created_at          DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (order_id)          REFERENCES orders(id),
    FOREIGN KEY (payment_method_id) REFERENCES payment_methods(id)
);

-- ───────────── 18. shipping_tracking ─────────────
CREATE TABLE shipping_tracking (
    id                  INT AUTO_INCREMENT PRIMARY KEY,
    order_id            INT NOT NULL,
    tracking_number     VARCHAR(80),
    carrier             VARCHAR(60),
    status              ENUM('label_created','picked_up','in_transit','out_for_delivery','delivered','exception') DEFAULT 'label_created',
    estimated_delivery  DATE,
    last_location       VARCHAR(200),
    updated_at          DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (order_id) REFERENCES orders(id)
);

-- ───────────── 19. vendor_payouts ─────────────
CREATE TABLE vendor_payouts (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    supplier_id INT NOT NULL,
    amount      DECIMAL(12,2) NOT NULL,
    currency    VARCHAR(3) DEFAULT 'USD',
    period_from DATE NOT NULL,
    period_to   DATE NOT NULL,
    status      ENUM('pending','processing','paid','failed') DEFAULT 'pending',
    paid_at     DATETIME,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
);

-- ───────────── 20. faq ─────────────
CREATE TABLE faq (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    category    VARCHAR(80) NOT NULL,
    question    TEXT NOT NULL,
    answer      TEXT NOT NULL,
    sort_order  INT DEFAULT 0,
    is_published TINYINT(1) DEFAULT 1,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);


-- ============================================================
-- SEED DATA
-- ============================================================

-- Suppliers
INSERT INTO suppliers (id, name, contact, email, phone, country, lead_time_days, rating) VALUES
(1, 'Shenzhen TechParts Ltd',  'Li Wei',       'li.wei@techparts.cn',      '+86-755-1234',  'CN', 14, 4.50),
(2, 'Munich Electronics GmbH', 'Hans Braun',   'h.braun@munichel.de',      '+49-89-5678',   'DE', 10, 4.80),
(3, 'Milan Fashion Supply',    'Sofia Romano', 'sofia@milanfs.it',         '+39-02-9012',   'IT', 7,  4.20),
(4, 'Texas Furniture Co',      'Bill Parker',  'bill@txfurniture.com',     '214-555-3456',  'US', 5,  4.60),
(5, 'Vancouver Outdoor Gear',  'Sarah Chen',   'sarah@vanoutdoor.ca',      '604-555-7890',  'CA', 8,  4.70),
(6, 'London Book Distributors','James Ward',   'james@londonbooks.co.uk',  '+44-20-4567',   'UK', 12, 4.30),
(7, 'Seoul SmartDevices Inc',  'Park Ji-hoon', 'jihoon@ssd-korea.kr',      '+82-2-8901',    'KR', 11, 4.40),
(8, 'Portland Green Supply',   'Amy Fields',   'amy@portlandgreen.com',    '503-555-2345',  'US', 4,  4.90);

-- Product-Supplier links
INSERT INTO product_suppliers (product_id, supplier_id, unit_cost, min_order_qty) VALUES
(1, 1, 780.00, 10), (1, 2, 810.00, 5),
(2, 1, 580.00, 10), (3, 7, 480.00, 20),
(4, 7, 160.00, 50), (5, 1, 15.00, 100),
(7, 3, 22.00, 50),  (8, 3, 18.00, 50),
(9, 3, 28.00, 30),  (11, 4, 185.00, 5),
(12, 4, 260.00, 3), (13, 2, 78.00, 20),
(14, 2, 145.00, 10),(15, 5, 42.00, 30),
(17, 5, 100.00, 10),(19, 6, 8.00, 100),
(20, 6, 7.50, 100);

-- Product attributes
INSERT INTO product_attributes (product_id, attr_name, attr_value) VALUES
(1, 'RAM', '32GB DDR5'), (1, 'Storage', '1TB NVMe SSD'), (1, 'Display', '15.6" IPS 144Hz'), (1, 'Battery', '72Wh'),
(2, 'RAM', '16GB DDR5'), (2, 'Storage', '512GB NVMe SSD'), (2, 'Display', '13.3" OLED'), (2, 'Battery', '56Wh'),
(3, 'Storage', '256GB'), (3, 'Display', '6.7" AMOLED 120Hz'), (3, 'Camera', '108MP + 12MP + 5MP'), (3, 'Battery', '5000mAh'),
(4, 'Storage', '128GB'), (4, 'Display', '6.1" LCD'), (4, 'Camera', '48MP + 8MP'),
(11, 'Material', 'Mesh + aluminum'), (11, 'Max Weight', '150kg'), (11, 'Adjustable', 'Height, armrest, lumbar'),
(12, 'Width', '60 inches'), (12, 'Height Range', '28–48 inches'), (12, 'Motor', 'Dual motor'),
(13, 'Filter', 'True HEPA H13'), (13, 'Coverage', '500 sq ft'), (13, 'Noise', '24dB'),
(15, 'Material', 'Gore-Tex waterproof'), (15, 'Drop', '8mm'), (15, 'Weight', '325g per shoe');

-- Product variants
INSERT INTO product_variants (product_id, sku_suffix, color, size, price_adj, stock) VALUES
(3, '-BLK', 'Black',    NULL,  0,    120),
(3, '-WHT', 'White',    NULL,  0,    95),
(3, '-BLU', 'Blue',     NULL,  20.00, 60),
(4, '-BLK', 'Black',    NULL,  0,    200),
(4, '-GRN', 'Green',    NULL,  0,    150),
(7, '-S',   'Khaki',    'S',   0,    30),
(7, '-M',   'Khaki',    'M',   0,    50),
(7, '-L',   'Khaki',    'L',   0,    45),
(7, '-XL',  'Khaki',    'XL',  0,    25),
(9, '-S',   'Floral',   'S',   0,    35),
(9, '-M',   'Floral',   'M',   0,    40),
(9, '-L',   'Floral',   'L',   0,    30),
(15,'-9',   'Black',    '9',   0,    60),
(15,'-10',  'Black',    '10',  0,    80),
(15,'-11',  'Black',    '11',  0,    55),
(15,'-10B', 'Blue',     '10',  10.00, 40);

-- Tags
INSERT INTO tags (id, name) VALUES
(1,'bestseller'),(2,'new-arrival'),(3,'sale'),(4,'eco-friendly'),(5,'premium'),
(6,'limited-edition'),(7,'trending'),(8,'gift-idea'),(9,'bundle-deal'),(10,'clearance');

INSERT INTO product_tags (product_id, tag_id) VALUES
(1,5),(1,1),(2,2),(2,5),(3,1),(3,7),(4,3),(5,1),(5,9),
(7,2),(9,7),(11,5),(11,1),(12,5),(13,4),(14,8),(15,2),
(17,4),(18,4),(19,1),(19,8),(20,1);

-- Returns
INSERT INTO returns (order_id, order_item_id, reason, status, refund_amount, requested_at, resolved_at, notes) VALUES
(7,  13, 'changed_mind',    'refunded',  49.99, '2026-03-28 10:00:00', '2026-04-02 14:00:00', 'Customer preferred e-book version'),
(2,  3,  'wrong_item',      'refunded',  69.99, '2026-03-14 09:00:00', '2026-03-18 11:00:00', 'Sent wrong size; reshipped correct'),
(10, 17, 'changed_mind',    'approved',  449.99,'2026-03-24 08:00:00', NULL, 'Order was cancelled, awaiting return'),
(11, 18, 'defective',       'refunded',  39.99, '2026-02-01 16:00:00', '2026-02-08 10:00:00', 'Pages were misprinted');

-- Notifications
INSERT INTO notifications (customer_id, channel, subject, body, is_read, sent_at) VALUES
(1, 'email', 'Your order has shipped!',         'Order #1 is on its way. Track: FX123456789',        1, '2026-03-02 09:30:00'),
(1, 'email', 'Delivery confirmed',               'Order #1 was delivered on March 5.',                 1, '2026-03-05 16:30:00'),
(3, 'push',  'Flash Sale: 25% off Electronics',  'Use code SAVE20 at checkout. Ends April 30.',       0, '2026-04-08 10:00:00'),
(5, 'email', 'Your order is being prepared',      'Order #4 is being processed.',                      1, '2026-04-09 18:25:00'),
(5, 'sms',   'Order shipped',                     'Order #12 delivered!',                               1, '2026-03-02 15:05:00'),
(7, 'email', 'Review your purchase',              'How was your HomeComfort Espresso Pro?',             0, '2026-03-17 09:00:00'),
(10,'email', 'Your order has shipped!',            'Order #8 is on its way via DHL. Track: DH987654',  1, '2026-04-08 10:30:00'),
(2, 'push',  'We miss you!',                      'Come back and check our new arrivals.',             0, '2026-04-05 12:00:00'),
(9, 'email', 'Order confirmation',                 'Thank you! Order #9 received.',                    1, '2026-04-10 07:35:00'),
(4, 'email', 'Loyalty reward unlocked',            'You earned 50 points on your last order!',          1, '2026-03-26 08:00:00');

-- Loyalty transactions
INSERT INTO loyalty_transactions (customer_id, points, type, ref_order_id, description) VALUES
(1,  135, 'earn',   1,    'Order #1: 1 point per $10'),
(1,  15,  'earn',   5,    'Order #5: 1 point per $10'),
(2,  45,  'earn',   2,    'Order #2: 1 point per $10'),
(3,  105, 'earn',   3,    'Order #3: 1 point per $10'),
(3,  9,   'earn',   11,   'Order #11: 1 point per $10'),
(5,  142, 'earn',   12,   'Order #12: 1 point per $10'),
(5,  66,  'earn',   4,    'Order #4: 1 point per $10'),
(7,  39,  'earn',   6,    'Order #6: 1 point per $10'),
(4,  10,  'earn',   7,    'Order #7: 1 point per $10'),
(1,  -500,'redeem', NULL, 'Redeemed 500 points for $50 coupon'),
(3,  -200,'redeem', NULL, 'Redeemed 200 points for free shipping'),
(10, 32,  'earn',   8,    'Order #8: 1 point per $10');

-- Shopping carts
INSERT INTO shopping_carts (id, customer_id, status, created_at) VALUES
(1, 2,  'abandoned', '2026-04-05 14:00:00'),
(2, 8,  'active',    '2026-04-10 08:00:00'),
(3, 6,  'converted', '2026-03-22 19:30:00'),
(4, 9,  'converted', '2026-04-10 07:00:00'),
(5, 4,  'active',    '2026-04-10 09:15:00');

-- Cart items
INSERT INTO cart_items (cart_id, product_id, quantity) VALUES
(1, 1, 1), (1, 6, 2),
(2, 18, 1), (2, 16, 1), (2, 15, 1),
(3, 11, 1),
(4, 13, 1),
(5, 3, 1), (5, 5, 1);

-- Promotions
INSERT INTO promotions (id, name, promo_type, value, min_purchase, start_date, end_date) VALUES
(1, 'Spring Electronics Sale',  'percentage',   15.00,  200.00, '2026-04-01', '2026-04-30'),
(2, 'Free Shipping Weekend',    'free_shipping', NULL,   50.00,  '2026-04-12', '2026-04-14'),
(3, 'BOGO Accessories',         'bogo',          NULL,   0.00,   '2026-04-15', '2026-04-22'),
(4, 'Summer Clothing Clearance','percentage',    30.00,  0.00,   '2026-06-01', '2026-08-31'),
(5, '$25 Off Outdoor Gear',     'fixed',         25.00,  100.00, '2026-05-01', '2026-05-31');

INSERT INTO promotion_products (promotion_id, product_id) VALUES
(1, 1),(1, 2),(1, 3),(1, 4),(1, 5),(1, 6),
(3, 5),(3, 6),
(4, 7),(4, 8),(4, 9),(4, 10),
(5, 15),(5, 16),(5, 17),(5, 18);

-- Gift cards
INSERT INTO gift_cards (code, initial_balance, current_balance, purchased_by, redeemed_by, expires_at) VALUES
('GC-ALICE-100',  100.00, 45.00,  1,    1,    '2027-03-01'),
('GC-BOB-050',    50.00,  50.00,  2,    NULL, '2027-04-01'),
('GC-GIFT-075',   75.00,  0.00,   3,    5,    '2026-12-31'),
('GC-HOLIDAY-200',200.00, 200.00, NULL, NULL, '2026-12-25'),
('GC-PROMO-025',  25.00,  25.00,  NULL, NULL, '2026-06-30');

-- Page views (analytics)
INSERT INTO page_views (customer_id, product_id, page_url, referrer, device_type, session_id, viewed_at) VALUES
(1,  1,  '/products/tn-lap-001',   'https://google.com',    'desktop', 'sess-a1b2c3', '2026-03-01 14:00:00'),
(1,  5,  '/products/pe-acc-001',   '/products/tn-lap-001',  'desktop', 'sess-a1b2c3', '2026-03-01 14:10:00'),
(2,  7,  '/products/us-men-001',   'https://google.com',    'mobile',  'sess-d4e5f6', '2026-03-05 10:00:00'),
(2,  8,  '/products/us-men-002',   '/products/us-men-001',  'mobile',  'sess-d4e5f6', '2026-03-05 10:05:00'),
(3,  3,  '/products/gw-phn-001',   'https://instagram.com', 'mobile',  'sess-g7h8i9', '2026-04-08 09:30:00'),
(3,  6,  '/products/pe-acc-002',   '/products/gw-phn-001',  'mobile',  'sess-g7h8i9', '2026-04-08 09:40:00'),
(5,  12, '/products/hc-fur-002',   'https://google.com',    'desktop', 'sess-j0k1l2', '2026-04-09 18:00:00'),
(5,  1,  '/products/tn-lap-001',   'https://google.com',    'desktop', 'sess-m3n4o5', '2026-02-28 09:45:00'),
(7,  14, '/products/hc-app-002',   '/categories/appliances','tablet',  'sess-p6q7r8', '2026-03-10 16:00:00'),
(10, 17, '/products/ng-out-001',   'https://facebook.com',  'desktop', 'sess-s9t0u1', '2026-04-07 11:45:00'),
(NULL, 3,'/products/gw-phn-001',   'https://google.com',    'mobile',  'sess-v2w3x4', '2026-04-09 20:00:00'),
(NULL, 1,'/products/tn-lap-001',   'https://bing.com',      'desktop', 'sess-y5z6a7', '2026-04-10 06:00:00'),
(8,  18, '/products/ng-out-002',   '/categories/outdoors',  'mobile',  'sess-b8c9d0', '2026-04-10 08:15:00'),
(4,  3,  '/products/gw-phn-001',   'https://youtube.com',   'desktop', 'sess-e1f2g3', '2026-04-09 12:00:00'),
(9,  13, '/products/hc-app-001',   'https://google.com',    'mobile',  'sess-h4i5j6', '2026-04-10 07:15:00');

-- Email campaigns
INSERT INTO email_campaigns (id, name, subject_line, sent_count, open_count, click_count, status, scheduled_at, sent_at) VALUES
(1, 'Welcome Series',          'Welcome to our store!',               850,  620, 180, 'sent',      '2026-01-01 08:00:00', '2026-01-01 08:00:00'),
(2, 'Spring Sale Announcement','Spring Sale: Up to 25% off!',         1200, 480, 95,  'sent',      '2026-04-01 09:00:00', '2026-04-01 09:05:00'),
(3, 'New Arrivals April',      'Just in: Fresh arrivals for spring',  0,    0,   0,   'scheduled', '2026-04-15 10:00:00', NULL),
(4, 'Abandoned Cart Reminder', 'You left something behind...',        340,  210, 72,  'sent',      '2026-04-06 12:00:00', '2026-04-06 12:02:00'),
(5, 'Summer Preview',          'Get ready for summer deals',          0,    0,   0,   'draft',     NULL, NULL);

-- Email subscriptions
INSERT INTO email_subscriptions (customer_id, list_name, is_subscribed, subscribed_at, unsubscribed_at) VALUES
(1,  'general',     1, '2026-01-15 10:00:00', NULL),
(1,  'promotions',  1, '2026-01-15 10:00:00', NULL),
(2,  'general',     1, '2026-02-01 08:00:00', NULL),
(2,  'promotions',  0, '2026-02-01 08:00:00', '2026-03-15 14:00:00'),
(3,  'general',     1, '2026-01-20 12:00:00', NULL),
(4,  'general',     1, '2026-03-01 09:00:00', NULL),
(5,  'general',     1, '2026-02-10 11:00:00', NULL),
(5,  'promotions',  1, '2026-02-10 11:00:00', NULL),
(6,  'general',     1, '2026-03-05 15:00:00', NULL),
(7,  'general',     1, '2026-03-08 07:00:00', NULL),
(8,  'general',     0, '2026-01-10 09:00:00', '2026-02-20 10:00:00'),
(9,  'general',     1, '2026-04-01 06:00:00', NULL),
(10, 'general',     1, '2026-03-20 18:00:00', NULL),
(10, 'promotions',  1, '2026-03-20 18:00:00', NULL);

-- Payment transactions
INSERT INTO payment_transactions (order_id, payment_method_id, transaction_ref, amount, currency, status, gateway_response) VALUES
(1,  1, 'pi_3Oa1Bb2Cc3Dd4Ee',  1460.84, 'USD', 'captured',  '{"stripe_id":"ch_abc123","last4":"4242"}'),
(2,  2, 'PAY-5Ff6Gg7Hh8Ii9Jj', 452.22,  'USD', 'captured',  '{"paypal_id":"PAYID-XYZ","payer":"bob@example.com"}'),
(3,  1, 'pi_9Kk0Ll1Mm2Nn3Oo',  1050.97, 'USD', 'captured',  '{"stripe_id":"ch_def456","last4":"1234"}'),
(4,  3, 'APPLE-4Pp5Qq6Rr7Ss',  656.48,  'USD', 'authorized','{"apple_ref":"AP-789012"}'),
(5,  1, 'pi_8Tt9Uu0Vv1Ww2Xx',  145.39,  'USD', 'captured',  '{"stripe_id":"ch_ghi789","last4":"4242"}'),
(6,  2, 'PAY-3Yy4Zz5Aa6Bb7Cc', 390.98,  'USD', 'captured',  '{"paypal_id":"PAYID-QRS","payer":"grace@example.com"}'),
(7,  4, 'BANK-8Dd9Ee0Ff1Gg',   101.94,  'USD', 'captured',  '{"plaid_ref":"BT-345678"}'),
(8,  1, 'pi_2Hh3Ii4Jj5Kk6Ll',  318.49,  'USD', 'captured',  '{"stripe_id":"ch_jkl012","last4":"5678"}'),
(9,  2, 'PAY-7Mm8Nn9Oo0Pp',    218.47,  'USD', 'pending',   NULL),
(10, 1, 'pi_1Qq2Rr3Ss4Tt5Uu',  491.10,  'USD', 'refunded',  '{"stripe_id":"ch_mno345","refund":"re_xyz"}'),
(11, 3, 'APPLE-6Vv7Ww8Xx9Yy',  92.37,   'USD', 'captured',  '{"apple_ref":"AP-456789"}'),
(12, 1, 'pi_0Zz1Aa2Bb3Cc4Dd',  1419.23, 'USD', 'captured',  '{"stripe_id":"ch_pqr678","last4":"4242"}');

-- Shipping tracking
INSERT INTO shipping_tracking (order_id, tracking_number, carrier, status, estimated_delivery, last_location) VALUES
(1,  'FX123456789', 'FedEx', 'delivered',        '2026-03-05', 'San Francisco, CA'),
(2,  'US987654321', 'USPS',  'delivered',        '2026-03-12', 'Austin, TX'),
(3,  'UP246813579', 'UPS',   'in_transit',       '2026-04-11', 'Memphis, TN'),
(5,  'US111222333', 'USPS',  'delivered',        '2026-02-21', 'San Francisco, CA'),
(6,  'FX444555666', 'FedEx', 'delivered',        '2026-03-14', 'Brooklyn, NY'),
(7,  'US777888999', 'USPS',  'delivered',        '2026-03-25', 'Newark, NJ'),
(8,  'DH987654321', 'DHL',   'in_transit',       '2026-04-18', 'Leipzig, DE'),
(11, 'US333444555', 'USPS',  'delivered',        '2026-01-28', 'New York, NY'),
(12, 'UP666777888', 'UPS',   'delivered',        '2026-03-02', 'Los Angeles, CA');

-- Vendor payouts
INSERT INTO vendor_payouts (supplier_id, amount, period_from, period_to, status, paid_at) VALUES
(1, 28500.00, '2026-01-01', '2026-03-31', 'paid',       '2026-04-05 10:00:00'),
(2, 12400.00, '2026-01-01', '2026-03-31', 'paid',       '2026-04-05 10:00:00'),
(3, 8900.00,  '2026-01-01', '2026-03-31', 'paid',       '2026-04-06 09:00:00'),
(4, 6200.00,  '2026-01-01', '2026-03-31', 'paid',       '2026-04-06 09:00:00'),
(5, 4800.00,  '2026-01-01', '2026-03-31', 'processing', NULL),
(6, 3100.00,  '2026-01-01', '2026-03-31', 'processing', NULL),
(7, 15200.00, '2026-01-01', '2026-03-31', 'paid',       '2026-04-05 10:00:00'),
(8, 2200.00,  '2026-01-01', '2026-03-31', 'pending',    NULL);

-- FAQ
INSERT INTO faq (category, question, answer, sort_order) VALUES
('Shipping',  'How long does standard shipping take?',          'Standard shipping takes 5-7 business days within the US.',                     1),
('Shipping',  'Do you ship internationally?',                   'Yes, we ship to over 40 countries via DHL International Economy (10-14 days).', 2),
('Shipping',  'Can I change my shipping address after ordering?','Contact support within 1 hour of placing your order. Once shipped, we cannot change the address.', 3),
('Returns',   'What is your return policy?',                    'You can return most items within 30 days of delivery for a full refund.',       1),
('Returns',   'How do I initiate a return?',                    'Go to My Orders, select the item, and click "Request Return". You will receive a prepaid label.', 2),
('Returns',   'When will I receive my refund?',                 'Refunds are processed within 5-7 business days after we receive the returned item.', 3),
('Payment',   'What payment methods do you accept?',            'We accept Visa, Mastercard, Amex, PayPal, Apple Pay, and bank transfers.',     1),
('Payment',   'Is my payment information secure?',              'Yes, all payments are processed through PCI-DSS compliant gateways (Stripe, PayPal).', 2),
('Account',   'How do I reset my password?',                    'Click "Forgot Password" on the login page and follow the email instructions.', 1),
('Account',   'How do loyalty points work?',                    'Earn 1 point per $10 spent. Redeem 100 points for a $10 discount.',            2),
('Products',  'Are your products covered by warranty?',         'Electronics: 1-year manufacturer warranty. Furniture: 2-year warranty. Clothing: 90-day quality guarantee.', 1),
('Products',  'How do I check product availability?',           'Stock status is shown on each product page. You can also sign up for restock notifications.', 2);
