const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'database.db');
const db = new Database(dbPath);

console.log('📁 Database path:', dbPath);

function generateProductId() {
    return 'PROD-' + Math.floor(1000 + Math.random() * 9000);
}

function generateOrderId() {
    return 'ORD-' + Math.floor(1000 + Math.random() * 9000);
}

function generateKeyId() {
    return 'KEY-' + Math.floor(1000 + Math.random() * 9000);
}

function generateTicketId() {
    return 'TKT-' + Math.floor(1000 + Math.random() * 9000);
}

db.exec(`
    CREATE TABLE IF NOT EXISTS server_configs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        guild_id TEXT UNIQUE NOT NULL,
        ltc_address TEXT,
        ltc_qr_url TEXT,
        vouch_channel_id TEXT,
        log_channel_id TEXT,
        ticket_category_id TEXT,
        ticket_message_channel_id TEXT,
        support_category_id TEXT,
        transcript_channel_id TEXT,
        client_role_id TEXT,
        seller_role_id TEXT,
        created_at INTEGER DEFAULT (strftime('%s', 'now')),
        updated_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS server_admins (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        guild_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        added_by TEXT NOT NULL,
        ltc_address TEXT,
        ltc_qr_url TEXT,
        is_seller INTEGER DEFAULT 1,
        created_at INTEGER DEFAULT (strftime('%s', 'now')),
        UNIQUE(guild_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        product_id TEXT UNIQUE NOT NULL,
        guild_id TEXT NOT NULL,
        seller_id TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        ltc_price REAL NOT NULL,
        usd_price REAL,
        stock INTEGER DEFAULT 0,
        image_url TEXT,
        created_at INTEGER DEFAULT (strftime('%s', 'now'))
    );

    CREATE TABLE IF NOT EXISTS orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id TEXT UNIQUE NOT NULL,
        guild_id TEXT,
        user_id TEXT NOT NULL,
        seller_id TEXT,
        product_id TEXT NOT NULL,
        quantity INTEGER DEFAULT 1,
        ltc_address TEXT NOT NULL,
        amount REAL NOT NULL,
        usd_amount REAL,
        amount_received REAL DEFAULT 0,
        status TEXT DEFAULT 'pending',
        payment_method TEXT DEFAULT 'ltc',
        payment_code TEXT,
        txid TEXT,
        delivered_keys TEXT,
        delivered_at INTEGER,
        refunded_at INTEGER,
        refunded_by TEXT,
        ticket_channel_id TEXT,
        created_at INTEGER DEFAULT (strftime('%s', 'now')),
        updated_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id TEXT NOT NULL,
        txid TEXT NOT NULL,
        amount REAL NOT NULL,
        confirmations INTEGER DEFAULT 0,
        timestamp INTEGER DEFAULT (strftime('%s', 'now'))
    );

    CREATE TABLE IF NOT EXISTS product_keys (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        key_id TEXT UNIQUE NOT NULL,
        product_id TEXT NOT NULL,
        key_value TEXT NOT NULL,
        is_used INTEGER DEFAULT 0,
        used_by TEXT,
        used_at INTEGER,
        created_at INTEGER DEFAULT (strftime('%s', 'now'))
    );

    CREATE TABLE IF NOT EXISTS tickets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ticket_id TEXT UNIQUE NOT NULL,
        guild_id TEXT NOT NULL,
        channel_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        seller_id TEXT,
        type TEXT DEFAULT 'purchase',
        product_name TEXT,
        payment_method TEXT,
        acknowledged INTEGER DEFAULT 0,
        status TEXT DEFAULT 'open',
        claimed_by TEXT,
        created_at INTEGER DEFAULT (strftime('%s', 'now')),
        closed_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS text_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        guild_id TEXT NOT NULL,
        channel_id TEXT NOT NULL,
        session_type TEXT NOT NULL,
        step TEXT DEFAULT 'start',
        data TEXT DEFAULT '{}',
        created_at INTEGER DEFAULT (strftime('%s', 'now')),
        expires_at INTEGER,
        UNIQUE(user_id, channel_id, session_type)
    );

    CREATE TABLE IF NOT EXISTS vouches (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id TEXT UNIQUE NOT NULL,
        guild_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        seller_id TEXT NOT NULL,
        product_id TEXT NOT NULL,
        rating INTEGER NOT NULL,
        message TEXT,
        created_at INTEGER DEFAULT (strftime('%s', 'now'))
    );
`);

console.log('✅ Database tables initialized');

// Server config functions
db.getServerConfig = (guildId) => {
    return db.prepare('SELECT * FROM server_configs WHERE guild_id = ?').get(guildId);
};

db.upsertServerConfig = (guildId, config) => {
    const existing = db.getServerConfig(guildId);
    if (existing) {
        const updates = [];
        const values = [];
        if (config.ltc_address !== undefined) { updates.push('ltc_address = ?'); values.push(config.ltc_address); }
        if (config.ltc_qr_url !== undefined) { updates.push('ltc_qr_url = ?'); values.push(config.ltc_qr_url); }
        if (config.vouch_channel_id !== undefined) { updates.push('vouch_channel_id = ?'); values.push(config.vouch_channel_id); }
        if (config.log_channel_id !== undefined) { updates.push('log_channel_id = ?'); values.push(config.log_channel_id); }
        if (config.ticket_category_id !== undefined) { updates.push('ticket_category_id = ?'); values.push(config.ticket_category_id); }
        if (config.ticket_message_channel_id !== undefined) { updates.push('ticket_message_channel_id = ?'); values.push(config.ticket_message_channel_id); }
        if (config.support_category_id !== undefined) { updates.push('support_category_id = ?'); values.push(config.support_category_id); }
        if (config.transcript_channel_id !== undefined) { updates.push('transcript_channel_id = ?'); values.push(config.transcript_channel_id); }
        if (config.client_role_id !== undefined) { updates.push('client_role_id = ?'); values.push(config.client_role_id); }
        if (config.seller_role_id !== undefined) { updates.push('seller_role_id = ?'); values.push(config.seller_role_id); }
        if (updates.length > 0) {
            updates.push('updated_at = strftime(\'%s\', \'now\')');
            values.push(guildId);
            db.prepare(`UPDATE server_configs SET ${updates.join(', ')} WHERE guild_id = ?`).run(...values);
        }
    } else {
        db.prepare(`
            INSERT INTO server_configs (guild_id, ltc_address, ltc_qr_url, vouch_channel_id, log_channel_id, ticket_category_id, ticket_message_channel_id, support_category_id, transcript_channel_id, client_role_id, seller_role_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            guildId,
            config.ltc_address || null,
            config.ltc_qr_url || null,
            config.vouch_channel_id || null,
            config.log_channel_id || null,
            config.ticket_category_id || null,
            config.ticket_message_channel_id || null,
            config.support_category_id || null,
            config.transcript_channel_id || null,
            config.client_role_id || null,
            config.seller_role_id || null
        );
    }
    return db.getServerConfig(guildId);
};

// Admin/Seller functions
db.getServerAdmins = (guildId) => {
    return db.prepare('SELECT * FROM server_admins WHERE guild_id = ?').all(guildId);
};

db.getSeller = (guildId, userId) => {
    return db.prepare('SELECT * FROM server_admins WHERE guild_id = ? AND user_id = ?').get(guildId, userId);
};

db.isServerAdmin = (guildId, userId) => {
    const admin = db.prepare('SELECT * FROM server_admins WHERE guild_id = ? AND user_id = ?').get(guildId, userId);
    return !!admin;
};

db.isSeller = (guildId, userId) => {
    const admin = db.prepare('SELECT * FROM server_admins WHERE guild_id = ? AND user_id = ? AND is_seller = 1').get(guildId, userId);
    return !!admin;
};

db.addServerAdmin = (guildId, userId, addedBy, isSeller = true) => {
    try {
        db.prepare('INSERT INTO server_admins (guild_id, user_id, added_by, is_seller) VALUES (?, ?, ?, ?)').run(guildId, userId, addedBy, isSeller ? 1 : 0);
        return true;
    } catch (e) {
        return false;
    }
};

db.removeServerAdmin = (guildId, userId) => {
    return db.prepare('DELETE FROM server_admins WHERE guild_id = ? AND user_id = ?').run(guildId, userId);
};

db.updateSellerConfig = (guildId, userId, config) => {
    const updates = [];
    const values = [];
    if (config.ltc_address !== undefined) { updates.push('ltc_address = ?'); values.push(config.ltc_address); }
    if (config.ltc_qr_url !== undefined) { updates.push('ltc_qr_url = ?'); values.push(config.ltc_qr_url); }
    if (updates.length > 0) {
        values.push(guildId, userId);
        db.prepare(`UPDATE server_admins SET ${updates.join(', ')} WHERE guild_id = ? AND user_id = ?`).run(...values);
    }
    return db.getSeller(guildId, userId);
};

// Product functions
db.getProducts = (guildId = null) => {
    if (guildId) {
        return db.prepare('SELECT * FROM products WHERE guild_id = ? ORDER BY seller_id ASC, id ASC').all(guildId);
    }
    return db.prepare('SELECT * FROM products ORDER BY seller_id ASC, id ASC').all();
};

db.getProductsBySeller = (guildId, sellerId) => {
    return db.prepare('SELECT * FROM products WHERE guild_id = ? AND seller_id = ? ORDER BY id ASC').all(guildId, sellerId);
};

db.getProductByNumber = (guildId, sellerId, number) => {
    const products = db.getProductsBySeller(guildId, sellerId);
    if (number > 0 && number <= products.length) {
        return products[number - 1];
    }
    return null;
};

db.getProductNumberInList = (guildId, sellerId, productId) => {
    const products = db.getProductsBySeller(guildId, sellerId);
    for (let i = 0; i < products.length; i++) {
        if (products[i].product_id === productId) {
            return i + 1;
        }
    }
    return null;
};

db.getSellersWithProducts = (guildId) => {
    return db.prepare(`
        SELECT DISTINCT sa.*,
            (SELECT COUNT(*) FROM products p WHERE p.guild_id = sa.guild_id AND p.seller_id = sa.user_id AND p.stock > 0) as product_count
        FROM server_admins sa
        WHERE sa.guild_id = ? AND sa.is_seller = 1
        AND EXISTS (SELECT 1 FROM products p WHERE p.guild_id = sa.guild_id AND p.seller_id = sa.user_id AND p.stock > 0)
    `).all(guildId);
};

db.getAllSellersWithProducts = (guildId) => {
    return db.prepare(`
        SELECT DISTINCT sa.*,
            (SELECT COUNT(*) FROM products p WHERE p.guild_id = sa.guild_id AND p.seller_id = sa.user_id) as product_count
        FROM server_admins sa
        WHERE sa.guild_id = ? AND sa.is_seller = 1
        AND EXISTS (SELECT 1 FROM products p WHERE p.guild_id = sa.guild_id AND p.seller_id = sa.user_id)
    `).all(guildId);
};

db.getProductById = (productId, guildId = null) => {
    if (typeof productId === 'string' && productId.startsWith('PROD-')) {
        if (guildId) {
            return db.prepare('SELECT * FROM products WHERE product_id = ? AND guild_id = ?').get(productId, guildId);
        }
        return db.prepare('SELECT * FROM products WHERE product_id = ?').get(productId);
    }
    if (guildId) {
        return db.prepare('SELECT * FROM products WHERE (id = ? OR product_id = ?) AND guild_id = ?').get(productId, productId, guildId);
    }
    return db.prepare('SELECT * FROM products WHERE id = ? OR product_id = ?').get(productId, productId);
};

db.getProductByProductId = (productId) => {
    return db.prepare('SELECT * FROM products WHERE product_id = ?').get(productId);
};

db.addProduct = (name, description, ltcPrice, usdPrice, stock = 0, imageUrl = null, guildId = 'global', sellerId = null) => {
    let productId = generateProductId();
    let attempts = 0;
    while (db.getProductByProductId(productId) && attempts < 100) {
        productId = generateProductId();
        attempts++;
    }
    db.prepare(`
        INSERT INTO products (product_id, guild_id, seller_id, name, description, ltc_price, usd_price, stock, image_url)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(productId, guildId, sellerId, name, description, ltcPrice, usdPrice, stock, imageUrl);
    return db.getProductByProductId(productId);
};

db.updateProduct = (productId, updates) => {
    const fields = [];
    const values = [];
    if (updates.name !== undefined) { fields.push('name = ?'); values.push(updates.name); }
    if (updates.description !== undefined) { fields.push('description = ?'); values.push(updates.description); }
    if (updates.ltc_price !== undefined) { fields.push('ltc_price = ?'); values.push(updates.ltc_price); }
    if (updates.usd_price !== undefined) { fields.push('usd_price = ?'); values.push(updates.usd_price); }
    if (updates.stock !== undefined) { fields.push('stock = ?'); values.push(updates.stock); }
    if (updates.image_url !== undefined) { fields.push('image_url = ?'); values.push(updates.image_url); }
    if (fields.length > 0) {
        values.push(productId);
        db.prepare(`UPDATE products SET ${fields.join(', ')} WHERE product_id = ?`).run(...values);
    }
    return db.getProductByProductId(productId);
};

db.deleteProduct = (productId) => {
    db.prepare('DELETE FROM product_keys WHERE product_id = ?').run(productId);
    return db.prepare('DELETE FROM products WHERE product_id = ?').run(productId);
};

db.updateProductStock = (productId, newStock) => {
    db.prepare('UPDATE products SET stock = ? WHERE product_id = ?').run(newStock, productId);
    return db.getProductByProductId(productId);
};

// Product keys functions
db.getProductKeys = (productId) => {
    return db.prepare('SELECT * FROM product_keys WHERE product_id = ? AND is_used = 0 ORDER BY id ASC').all(productId);
};

db.addProductKey = (productId, keyValue) => {
    let keyId = generateKeyId();
    let attempts = 0;
    while (attempts < 100) {
        try {
            db.prepare('INSERT INTO product_keys (key_id, product_id, key_value) VALUES (?, ?, ?)').run(keyId, productId, keyValue);
            const product = db.getProductByProductId(productId);
            if (product) {
                db.updateProductStock(productId, product.stock + 1);
            }
            return db.prepare('SELECT * FROM product_keys WHERE key_id = ?').get(keyId);
        } catch (e) {
            keyId = generateKeyId();
            attempts++;
        }
    }
    return null;
};

db.useProductKeys = (productId, userId, quantity = 1) => {
    const keys = db.prepare('SELECT * FROM product_keys WHERE product_id = ? AND is_used = 0 ORDER BY id ASC LIMIT ?').all(productId, quantity);
    const usedKeys = [];
    
    for (const key of keys) {
        db.prepare('UPDATE product_keys SET is_used = 1, used_by = ?, used_at = strftime(\'%s\', \'now\') WHERE key_id = ?').run(userId, key.key_id);
        usedKeys.push(key.key_value);
    }
    
    const product = db.getProductByProductId(productId);
    if (product) {
        db.updateProductStock(productId, Math.max(0, product.stock - usedKeys.length));
    }
    
    return usedKeys;
};

db.useProductKey = (productId, userId) => {
    const keys = db.useProductKeys(productId, userId, 1);
    return keys.length > 0 ? { key_value: keys[0] } : null;
};

// Order functions
db.getOrderById = (orderId) => {
    return db.prepare('SELECT * FROM orders WHERE order_id = ?').get(orderId);
};

db.getOrdersByUser = (userId) => {
    return db.prepare('SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC').all(userId);
};

db.getOrdersByStatus = (status) => {
    return db.prepare('SELECT * FROM orders WHERE status = ? ORDER BY created_at DESC').all(status);
};

db.getPendingOrders = () => {
    return db.prepare('SELECT * FROM orders WHERE status = \'pending\' ORDER BY created_at ASC').all();
};

db.createOrder = (userId, productId, ltcAddress, amount, usdAmount = null, guildId = null, sellerId = null, quantity = 1) => {
    let orderId = generateOrderId();
    let attempts = 0;
    while (db.getOrderById(orderId) && attempts < 100) {
        orderId = generateOrderId();
        attempts++;
    }
    db.prepare(`
        INSERT INTO orders (order_id, guild_id, user_id, seller_id, product_id, quantity, ltc_address, amount, usd_amount)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(orderId, guildId, userId, sellerId, productId, quantity, ltcAddress, amount, usdAmount);
    return db.getOrderById(orderId);
};

db.updateOrderStatus = (orderId, status) => {
    db.prepare('UPDATE orders SET status = ?, updated_at = strftime(\'%s\', \'now\') WHERE order_id = ?').run(status, orderId);
    return db.getOrderById(orderId);
};

db.updateOrderAmount = (orderId, amountReceived) => {
    db.prepare('UPDATE orders SET amount_received = ?, updated_at = strftime(\'%s\', \'now\') WHERE order_id = ?').run(amountReceived, orderId);
    return db.getOrderById(orderId);
};

db.updateOrderTxid = (orderId, txid) => {
    db.prepare('UPDATE orders SET txid = ?, updated_at = strftime(\'%s\', \'now\') WHERE order_id = ?').run(txid, orderId);
    return db.getOrderById(orderId);
};

db.deliverOrder = (orderId, keys) => {
    const keysStr = Array.isArray(keys) ? keys.join('\n') : keys;
    db.prepare('UPDATE orders SET status = \'delivered\', delivered_keys = ?, delivered_at = strftime(\'%s\', \'now\'), updated_at = strftime(\'%s\', \'now\') WHERE order_id = ?').run(keysStr, orderId);
    return db.getOrderById(orderId);
};

db.refundOrder = (orderId, refundedBy) => {
    db.prepare('UPDATE orders SET status = \'refunded\', refunded_at = strftime(\'%s\', \'now\'), refunded_by = ?, updated_at = strftime(\'%s\', \'now\') WHERE order_id = ?').run(refundedBy, orderId);
    return db.getOrderById(orderId);
};

db.setOrderTicketChannel = (orderId, channelId) => {
    db.prepare('UPDATE orders SET ticket_channel_id = ? WHERE order_id = ?').run(channelId, orderId);
    return db.getOrderById(orderId);
};

// Transaction functions
db.addTransaction = (orderId, txid, amount, confirmations = 0) => {
    db.prepare('INSERT INTO transactions (order_id, txid, amount, confirmations) VALUES (?, ?, ?, ?)').run(orderId, txid, amount, confirmations);
};

db.getTransactionsByOrder = (orderId) => {
    return db.prepare('SELECT * FROM transactions WHERE order_id = ?').all(orderId);
};

db.updateTransactionConfirmations = (txid, confirmations) => {
    db.prepare('UPDATE transactions SET confirmations = ? WHERE txid = ?').run(confirmations, txid);
};

// Ticket functions
db.createTicket = (guildId, channelId, userId, type = 'purchase', sellerId = null, productName = null, paymentMethod = null) => {
    let ticketId = generateTicketId();
    let attempts = 0;
    while (attempts < 100) {
        try {
            db.prepare(`
                INSERT INTO tickets (ticket_id, guild_id, channel_id, user_id, seller_id, type, product_name, payment_method)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `).run(ticketId, guildId, channelId, userId, sellerId, type, productName, paymentMethod);
            return db.prepare('SELECT * FROM tickets WHERE ticket_id = ?').get(ticketId);
        } catch (e) {
            ticketId = generateTicketId();
            attempts++;
        }
    }
    return null;
};

db.getTicketByChannel = (channelId) => {
    return db.prepare('SELECT * FROM tickets WHERE channel_id = ?').get(channelId);
};

db.getTicketById = (ticketId) => {
    return db.prepare('SELECT * FROM tickets WHERE ticket_id = ?').get(ticketId);
};

db.getOpenTickets = (guildId) => {
    return db.prepare('SELECT * FROM tickets WHERE guild_id = ? AND status = \'open\'').all(guildId);
};

db.claimTicket = (ticketId, claimedBy) => {
    db.prepare('UPDATE tickets SET claimed_by = ? WHERE ticket_id = ?').run(claimedBy, ticketId);
    return db.getTicketById(ticketId);
};

db.closeTicket = (ticketId) => {
    db.prepare('UPDATE tickets SET status = \'closed\', closed_at = strftime(\'%s\', \'now\') WHERE ticket_id = ?').run(ticketId);
    return db.getTicketById(ticketId);
};

db.acknowledgeTicket = (ticketId) => {
    db.prepare('UPDATE tickets SET acknowledged = 1 WHERE ticket_id = ?').run(ticketId);
    return db.getTicketById(ticketId);
};

// Text session functions
db.createTextSession = (userId, guildId, channelId, sessionType, step = 'start', data = {}) => {
    const expiresAt = Math.floor(Date.now() / 1000) + 300; // 5 min expiry
    try {
        db.prepare('DELETE FROM text_sessions WHERE user_id = ? AND channel_id = ? AND session_type = ?').run(userId, channelId, sessionType);
        db.prepare(`
            INSERT INTO text_sessions (user_id, guild_id, channel_id, session_type, step, data, expires_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(userId, guildId, channelId, sessionType, step, JSON.stringify(data), expiresAt);
        return db.getTextSession(userId, channelId, sessionType);
    } catch (e) {
        return null;
    }
};

db.getTextSession = (userId, channelId, sessionType) => {
    const session = db.prepare('SELECT * FROM text_sessions WHERE user_id = ? AND channel_id = ? AND session_type = ?').get(userId, channelId, sessionType);
    if (session) {
        const now = Math.floor(Date.now() / 1000);
        if (session.expires_at && session.expires_at < now) {
            db.deleteTextSession(userId, channelId, sessionType);
            return null;
        }
        session.data = JSON.parse(session.data || '{}');
    }
    return session;
};

db.getAnyTextSession = (userId, channelId) => {
    const sessions = db.prepare('SELECT * FROM text_sessions WHERE user_id = ? AND channel_id = ?').all(userId, channelId);
    const now = Math.floor(Date.now() / 1000);
    for (const session of sessions) {
        if (!session.expires_at || session.expires_at >= now) {
            session.data = JSON.parse(session.data || '{}');
            return session;
        }
    }
    return null;
};

db.updateTextSession = (userId, channelId, sessionType, step, data) => {
    const expiresAt = Math.floor(Date.now() / 1000) + 300;
    db.prepare('UPDATE text_sessions SET step = ?, data = ?, expires_at = ? WHERE user_id = ? AND channel_id = ? AND session_type = ?')
        .run(step, JSON.stringify(data), expiresAt, userId, channelId, sessionType);
    return db.getTextSession(userId, channelId, sessionType);
};

db.deleteTextSession = (userId, channelId, sessionType) => {
    db.prepare('DELETE FROM text_sessions WHERE user_id = ? AND channel_id = ? AND session_type = ?').run(userId, channelId, sessionType);
};

db.deleteAllTextSessions = (userId, channelId) => {
    db.prepare('DELETE FROM text_sessions WHERE user_id = ? AND channel_id = ?').run(userId, channelId);
};

// Stats functions
db.getSoldOrders = (guildId, sellerId = null, period = null) => {
    let query = 'SELECT * FROM orders WHERE guild_id = ? AND status = \'delivered\'';
    const params = [guildId];
    
    if (sellerId) {
        query += ' AND seller_id = ?';
        params.push(sellerId);
    }
    
    if (period) {
        const now = Math.floor(Date.now() / 1000);
        let startTime;
        switch (period) {
            case 'today':
                startTime = now - 86400;
                break;
            case 'week':
                startTime = now - 604800;
                break;
            case 'month':
                startTime = now - 2592000;
                break;
            case 'all':
            default:
                startTime = 0;
        }
        query += ' AND created_at >= ?';
        params.push(startTime);
    }
    
    query += ' ORDER BY created_at DESC';
    return db.prepare(query).all(...params);
};

db.getStats = (guildId, sellerId = null) => {
    let params = [guildId];
    let sellerFilter = '';
    if (sellerId) {
        sellerFilter = ' AND seller_id = ?';
        params.push(sellerId);
    }
    
    const totalOrders = db.prepare(`SELECT COUNT(*) as count FROM orders WHERE guild_id = ?${sellerFilter}`).get(...params).count;
    const deliveredOrders = db.prepare(`SELECT COUNT(*) as count FROM orders WHERE guild_id = ? AND status = 'delivered'${sellerFilter}`).get(...params).count;
    const pendingOrders = db.prepare(`SELECT COUNT(*) as count FROM orders WHERE guild_id = ? AND status = 'pending'${sellerFilter}`).get(...params).count;
    const totalRevenue = db.prepare(`SELECT COALESCE(SUM(amount), 0) as total FROM orders WHERE guild_id = ? AND status = 'delivered'${sellerFilter}`).get(...params).total;
    const totalRevenueUsd = db.prepare(`SELECT COALESCE(SUM(usd_amount), 0) as total FROM orders WHERE guild_id = ? AND status = 'delivered'${sellerFilter}`).get(...params).total;
    
    return {
        totalOrders,
        deliveredOrders,
        pendingOrders,
        totalRevenue,
        totalRevenueUsd
    };
};

// Vouch functions
db.createVouch = (orderId, guildId, userId, sellerId, productId, rating, message = '') => {
    try {
        db.prepare(`
            INSERT INTO vouches (order_id, guild_id, user_id, seller_id, product_id, rating, message)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(orderId, guildId, userId, sellerId, productId, rating, message);
        return db.prepare('SELECT * FROM vouches WHERE order_id = ?').get(orderId);
    } catch (e) {
        return null;
    }
};

db.hasVouched = (orderId) => {
    const vouch = db.prepare('SELECT * FROM vouches WHERE order_id = ?').get(orderId);
    return !!vouch;
};

db.getVouchesBySeller = (guildId, sellerId) => {
    return db.prepare('SELECT * FROM vouches WHERE guild_id = ? AND seller_id = ? ORDER BY created_at DESC').all(guildId, sellerId);
};

db.getSellerRating = (guildId, sellerId) => {
    const result = db.prepare('SELECT AVG(rating) as avg_rating, COUNT(*) as count FROM vouches WHERE guild_id = ? AND seller_id = ?').get(guildId, sellerId);
    return {
        averageRating: result.avg_rating || 0,
        totalVouches: result.count || 0
    };
};

module.exports = db;
