const { Client, GatewayIntentBits, Collection, REST, Routes, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, PermissionFlagsBits, StringSelectMenuBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');

const CLIENT_ID = process.env.CLIENT_ID || 'YOUR_CLIENT_ID';
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const BOT_OWNER_ID = process.env.BOT_OWNER_ID || 'YOUR_BOT_OWNER_ID';
const BLOCKCYPHER_API_KEY = process.env.BLOCKCYPHER_API_KEY || '';

const LTC_FEE_TOLERANCE = 0.05;
const CONFIRMATION_THRESHOLDS = {
    small: { maxAmount: 0.1, confirmations: 1 },
    medium: { maxAmount: 1, confirmations: 3 },
    large: { maxAmount: 10, confirmations: 6 },
    xlarge: { confirmations: 10 }
};

const db = require('./database');

// Helper to check if user is bot owner (auto-seller)
function isBotOwner(userId) {
    return userId === BOT_OWNER_ID;
}

// Helper to check if user can use seller commands
function canUseSellercCommands(guildId, userId) {
    return isBotOwner(userId) || db.isSeller(guildId, userId);
}

// Slash commands (simplified - no parameters, bot asks in text)
const commandsData = {
    setup: {
        name: "setup",
        description: "Setup the bot for this server (bot asks questions in text)"
    },
    addproduct: {
        name: "addproduct",
        description: "Add a new product (bot asks questions in text)"
    },
    products: {
        name: "products",
        description: "View all available products"
    },
    addstock: {
        name: "addstock",
        description: "Add stock/deliverables to a product (bot asks questions in text)"
    },
    deleteproduct: {
        name: "deleteproduct",
        description: "Delete a product (bot asks for product number in text)"
    },
    editproduct: {
        name: "editproduct",
        description: "Edit a product (bot asks questions in text)"
    },
    buy: {
        name: "buy",
        description: "Start a purchase - shows all available products"
    },
    orders: {
        name: "orders",
        description: "View your orders"
    },
    addadmin: {
        name: "addadmin",
        description: "Add a seller/admin (bot asks in text)"
    },
    removeadmin: {
        name: "removeadmin",
        description: "Remove a seller/admin (bot asks in text)"
    },
    sold: {
        name: "sold",
        description: "View sold orders (bot asks for period in text)"
    },
    stats: {
        name: "stats",
        description: "View store statistics"
    },
    deliver: {
        name: "deliver",
        description: "Manually deliver an order (bot asks for order ID in text)"
    },
    refund: {
        name: "refund",
        description: "Refund an order (bot asks for order ID in text)"
    },
    ticketpanel: {
        name: "ticketpanel",
        description: "Create a ticket panel"
    },
    help: {
        name: "help",
        description: "View all available commands"
    },
    cancel: {
        name: "cancel",
        description: "Cancel current text session"
    }
};

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

client.config = {
    CLIENT_ID,
    BOT_OWNER_ID,
    BLOCKCYPHER_API_KEY,
    CONFIRMATION_THRESHOLDS,
    LTC_FEE_TOLERANCE
};

client.commands = new Collection();

// ============= COMMAND HANDLERS =============

const commandHandlers = {
    setup: async (interaction, client) => {
        if (!isBotOwner(interaction.user.id)) {
            return interaction.reply({ content: '❌ Only the bot owner can use this command.', ephemeral: true });
        }

        db.createTextSession(interaction.user.id, interaction.guild.id, interaction.channel.id, 'setup', 'ltc_address', {});
        
        await interaction.reply({
            content: '⚙️ **Server Setup**\n\nPlease enter your **Litecoin wallet address**:',
            ephemeral: false
        });
    },

    addproduct: async (interaction, client) => {
        if (!canUseSellercCommands(interaction.guild.id, interaction.user.id)) {
            return interaction.reply({ content: '❌ You are not authorized to use this command.', ephemeral: true });
        }

        db.createTextSession(interaction.user.id, interaction.guild.id, interaction.channel.id, 'addproduct', 'name', {});
        
        await interaction.reply({
            content: '📦 **Add Product**\n\nPlease enter the **product name**:',
            ephemeral: false
        });
    },

    products: async (interaction, client) => {
        await showProductsGroupedBySeller(interaction, client);
    },

    addstock: async (interaction, client) => {
        if (!canUseSellercCommands(interaction.guild.id, interaction.user.id)) {
            return interaction.reply({ content: '❌ You are not authorized to use this command.', ephemeral: true });
        }

        const products = db.getProductsBySeller(interaction.guild.id, interaction.user.id);
        if (products.length === 0) {
            return interaction.reply({ content: '❌ You have no products. Use `/addproduct` first.', ephemeral: true });
        }

        let productList = '📦 **Your Products:**\n\n';
        products.forEach((p, i) => {
            productList += `**${i + 1}.** ${p.name} - $${p.usd_price} (Stock: ${p.stock})\n`;
        });
        productList += '\n**Enter the product number to add stock to:**';

        db.createTextSession(interaction.user.id, interaction.guild.id, interaction.channel.id, 'addstock', 'select', { products: products.map(p => p.product_id) });
        
        await interaction.reply({ content: productList, ephemeral: false });
    },

    deleteproduct: async (interaction, client) => {
        if (!canUseSellercCommands(interaction.guild.id, interaction.user.id)) {
            return interaction.reply({ content: '❌ You are not authorized to use this command.', ephemeral: true });
        }

        const products = db.getProductsBySeller(interaction.guild.id, interaction.user.id);
        if (products.length === 0) {
            return interaction.reply({ content: '❌ You have no products.', ephemeral: true });
        }

        let productList = '🗑️ **Delete Product**\n\n**Your Products:**\n\n';
        products.forEach((p, i) => {
            productList += `**${i + 1}.** ${p.name} - $${p.usd_price} (Stock: ${p.stock})\n`;
        });
        productList += '\n**Enter the product number to delete:**';

        db.createTextSession(interaction.user.id, interaction.guild.id, interaction.channel.id, 'deleteproduct', 'select', { products: products.map(p => p.product_id) });
        
        await interaction.reply({ content: productList, ephemeral: false });
    },

    editproduct: async (interaction, client) => {
        if (!canUseSellercCommands(interaction.guild.id, interaction.user.id)) {
            return interaction.reply({ content: '❌ You are not authorized to use this command.', ephemeral: true });
        }

        const products = db.getProductsBySeller(interaction.guild.id, interaction.user.id);
        if (products.length === 0) {
            return interaction.reply({ content: '❌ You have no products.', ephemeral: true });
        }

        let productList = '✏️ **Edit Product**\n\n**Your Products:**\n\n';
        products.forEach((p, i) => {
            productList += `**${i + 1}.** ${p.name} - $${p.usd_price} (Stock: ${p.stock})\n`;
        });
        productList += '\n**Enter the product number to edit:**';

        db.createTextSession(interaction.user.id, interaction.guild.id, interaction.channel.id, 'editproduct', 'select', { products: products.map(p => p.product_id) });
        
        await interaction.reply({ content: productList, ephemeral: false });
    },

    buy: async (interaction, client) => {
        await startPurchaseFlow(interaction, client);
    },

    orders: async (interaction, client) => {
        const orders = db.getOrdersByUser(interaction.user.id);

        if (orders.length === 0) {
            return interaction.reply({ content: '📦 You have no orders.', ephemeral: true });
        }

        const embed = new EmbedBuilder()
            .setTitle('📦 Your Orders')
            .setColor(0x00AAFF)
            .setTimestamp();

        const recentOrders = orders.slice(0, 10);
        for (const order of recentOrders) {
            const statusEmoji = {
                'pending': '⏳',
                'paid': '✅',
                'delivered': '📦',
                'refunded': '💸',
                'cancelled': '❌'
            }[order.status] || '❓';

            embed.addFields({
                name: `${statusEmoji} ${order.order_id}`,
                value: `**Product:** ${order.product_id}\n**Qty:** ${order.quantity || 1}\n**Amount:** ${order.amount} LTC\n**Status:** ${order.status}`,
                inline: true
            });
        }

        if (orders.length > 10) {
            embed.setFooter({ text: `Showing 10 of ${orders.length} orders` });
        }

        await interaction.reply({ embeds: [embed], ephemeral: true });
    },

    addadmin: async (interaction, client) => {
        if (!isBotOwner(interaction.user.id)) {
            return interaction.reply({ content: '❌ Only the bot owner can add admins.', ephemeral: true });
        }

        db.createTextSession(interaction.user.id, interaction.guild.id, interaction.channel.id, 'addadmin', 'user', {});
        
        await interaction.reply({
            content: '👤 **Add Admin/Seller**\n\nPlease **mention the user** (@user) you want to add as a seller:',
            ephemeral: false
        });
    },

    removeadmin: async (interaction, client) => {
        if (!isBotOwner(interaction.user.id)) {
            return interaction.reply({ content: '❌ Only the bot owner can remove admins.', ephemeral: true });
        }

        db.createTextSession(interaction.user.id, interaction.guild.id, interaction.channel.id, 'removeadmin', 'user', {});
        
        await interaction.reply({
            content: '👤 **Remove Admin/Seller**\n\nPlease **mention the user** (@user) you want to remove:',
            ephemeral: false
        });
    },

    sold: async (interaction, client) => {
        if (!canUseSellercCommands(interaction.guild.id, interaction.user.id)) {
            return interaction.reply({ content: '❌ You are not authorized to use this command.', ephemeral: true });
        }

        db.createTextSession(interaction.user.id, interaction.guild.id, interaction.channel.id, 'sold', 'period', {});
        
        await interaction.reply({
            content: '📊 **Sold Orders**\n\nEnter time period:\n• `today`\n• `week`\n• `month`\n• `all`',
            ephemeral: false
        });
    },

    stats: async (interaction, client) => {
        if (!canUseSellercCommands(interaction.guild.id, interaction.user.id)) {
            return interaction.reply({ content: '❌ You are not authorized to use this command.', ephemeral: true });
        }

        const stats = db.getStats(interaction.guild.id, interaction.user.id);
        const products = db.getProductsBySeller(interaction.guild.id, interaction.user.id);
        const totalStock = products.reduce((sum, p) => sum + p.stock, 0);

        const embed = new EmbedBuilder()
            .setTitle('📊 Store Statistics')
            .setColor(0x00AAFF)
            .addFields(
                { name: '📦 Total Orders', value: stats.totalOrders.toString(), inline: true },
                { name: '✅ Delivered', value: stats.deliveredOrders.toString(), inline: true },
                { name: '⏳ Pending', value: stats.pendingOrders.toString(), inline: true },
                { name: '💰 Revenue (LTC)', value: stats.totalRevenue.toFixed(8), inline: true },
                { name: '💵 Revenue (USD)', value: `$${stats.totalRevenueUsd.toFixed(2)}`, inline: true },
                { name: '🛒 Products', value: products.length.toString(), inline: true },
                { name: '📦 Total Stock', value: totalStock.toString(), inline: true }
            )
            .setTimestamp();

        await interaction.reply({ embeds: [embed], ephemeral: true });
    },

    deliver: async (interaction, client) => {
        if (!canUseSellercCommands(interaction.guild.id, interaction.user.id)) {
            return interaction.reply({ content: '❌ You are not authorized to use this command.', ephemeral: true });
        }

        db.createTextSession(interaction.user.id, interaction.guild.id, interaction.channel.id, 'deliver', 'order_id', {});
        
        await interaction.reply({
            content: '📦 **Deliver Order**\n\nPlease enter the **Order ID** (e.g., ORD-1234):',
            ephemeral: false
        });
    },

    refund: async (interaction, client) => {
        if (!canUseSellercCommands(interaction.guild.id, interaction.user.id)) {
            return interaction.reply({ content: '❌ You are not authorized to use this command.', ephemeral: true });
        }

        db.createTextSession(interaction.user.id, interaction.guild.id, interaction.channel.id, 'refund', 'order_id', {});
        
        await interaction.reply({
            content: '💸 **Refund Order**\n\nPlease enter the **Order ID** (e.g., ORD-1234):',
            ephemeral: false
        });
    },

    ticketpanel: async (interaction, client) => {
        if (!canUseSellercCommands(interaction.guild.id, interaction.user.id)) {
            return interaction.reply({ content: '❌ You are not authorized to use this command.', ephemeral: true });
        }

        const embed = new EmbedBuilder()
            .setTitle('🎫 Support & Purchase Tickets')
            .setDescription('Click a button below to open a ticket!')
            .setColor(0x00AAFF)
            .addFields(
                { name: '🛒 Purchase', value: 'Open a purchase ticket', inline: true },
                { name: '❓ Support', value: 'Open a support ticket', inline: true }
            );

        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('open_purchase_ticket')
                    .setLabel('Purchase')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('🛒'),
                new ButtonBuilder()
                    .setCustomId('open_support_ticket')
                    .setLabel('Support')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('❓')
            );

        await interaction.channel.send({ embeds: [embed], components: [row] });
        await interaction.reply({ content: '✅ Ticket panel created!', ephemeral: true });
    },

    help: async (interaction, client) => {
        const embed = new EmbedBuilder()
            .setTitle('📚 Bot Commands')
            .setColor(0x00AAFF)
            .setDescription('All commands use text-based Q&A - the bot will ask you questions after you use a command!')
            .addFields(
                { name: '🛒 Customer Commands', value: '`/buy` - Start a purchase (shows all products)\n`/products` - View products\n`/orders` - View your orders' },
                { name: '⚙️ Setup Commands', value: '`/setup` - Setup the bot\n`/addadmin` - Add a seller\n`/removeadmin` - Remove a seller' },
                { name: '📦 Product Commands', value: '`/addproduct` - Add a product\n`/editproduct` - Edit a product (by number)\n`/deleteproduct` - Delete a product (by number)\n`/addstock` - Add deliverables (by number)' },
                { name: '💰 Order Commands', value: '`/deliver` - Deliver an order\n`/refund` - Refund an order\n`/sold` - View sold orders' },
                { name: '📊 Stats & Tickets', value: '`/stats` - View statistics\n`/ticketpanel` - Create ticket panel\n`/cancel` - Cancel current session' }
            )
            .setTimestamp();

        await interaction.reply({ embeds: [embed], ephemeral: true });
    },

    cancel: async (interaction, client) => {
        db.deleteAllTextSessions(interaction.user.id, interaction.channel.id);
        await interaction.reply({ content: '✅ Session cancelled.', ephemeral: true });
    }
};

for (const [name, handler] of Object.entries(commandHandlers)) {
    client.commands.set(name, { execute: handler });
}

// ============= HELPER FUNCTIONS =============

async function showProductsGroupedBySeller(interaction, client) {
    const sellers = db.getAllSellersWithProducts(interaction.guild.id);
    
    if (sellers.length === 0) {
        return interaction.reply({ content: '❌ No products available.', ephemeral: true });
    }

    const embed = new EmbedBuilder()
        .setTitle('🛒 Available Products')
        .setColor(0x00AAFF)
        .setTimestamp();

    let productNumber = 1;

    for (const seller of sellers) {
        let sellerUser;
        try {
            sellerUser = await client.users.fetch(seller.user_id);
        } catch {
            sellerUser = { username: 'Unknown Seller', id: seller.user_id };
        }

        const products = db.getProductsBySeller(interaction.guild.id, seller.user_id);
        
        let productList = '';
        for (const product of products) {
            const price = product.usd_price ? `$${product.usd_price}` : `${product.ltc_price} LTC`;
            productList += `**${productNumber}.** ${product.name} - ${price} (Stock: ${product.stock})\n`;
            productNumber++;
        }

        if (productList) {
            embed.addFields({
                name: `👤 ${sellerUser.username}`,
                value: productList,
                inline: false
            });
        }
    }

    await interaction.reply({ embeds: [embed], ephemeral: true });
}

async function startPurchaseFlow(interaction, client) {
    const sellers = db.getSellersWithProducts(interaction.guild.id);
    
    if (sellers.length === 0) {
        return interaction.reply({ content: '❌ No products available for purchase.', ephemeral: true });
    }

    // Build product list grouped by seller
    const embed = new EmbedBuilder()
        .setTitle('🛒 Available Products')
        .setDescription('Select a product to purchase by entering its number below.')
        .setColor(0x00AAFF)
        .setTimestamp();

    const allProducts = [];
    let productNumber = 1;

    for (const seller of sellers) {
        let sellerUser;
        try {
            sellerUser = await client.users.fetch(seller.user_id);
        } catch {
            sellerUser = { username: 'Unknown Seller', id: seller.user_id };
        }

        const products = db.getProductsBySeller(interaction.guild.id, seller.user_id).filter(p => p.stock > 0);
        
        let productList = '';
        for (const product of products) {
            const price = product.usd_price ? `$${product.usd_price}` : `${product.ltc_price} LTC`;
            productList += `**${productNumber}.** ${product.name} - ${price} (Stock: ${product.stock})\n`;
            allProducts.push({ ...product, sellerUsername: sellerUser.username, number: productNumber });
            productNumber++;
        }

        if (productList) {
            embed.addFields({
                name: `👤 ${sellerUser.username}`,
                value: productList,
                inline: false
            });
        }
    }

    embed.setFooter({ text: 'Enter the product number to purchase' });

    db.createTextSession(interaction.user.id, interaction.guild.id, interaction.channel.id, 'buy', 'select_product', { 
        products: allProducts.map(p => ({ product_id: p.product_id, seller_id: p.seller_id, number: p.number }))
    });

    await interaction.reply({ embeds: [embed], ephemeral: false });
}

// ============= TEXT SESSION HANDLERS =============

async function handleTextSession(message, session) {
    const { user_id, guild_id, channel_id, session_type, step, data } = session;

    switch (session_type) {
        case 'setup':
            await handleSetupSession(message, session);
            break;
        case 'addproduct':
            await handleAddProductSession(message, session);
            break;
        case 'addstock':
            await handleAddStockSession(message, session);
            break;
        case 'deleteproduct':
            await handleDeleteProductSession(message, session);
            break;
        case 'editproduct':
            await handleEditProductSession(message, session);
            break;
        case 'buy':
            await handleBuySession(message, session);
            break;
        case 'addadmin':
            await handleAddAdminSession(message, session);
            break;
        case 'removeadmin':
            await handleRemoveAdminSession(message, session);
            break;
        case 'sold':
            await handleSoldSession(message, session);
            break;
        case 'deliver':
            await handleDeliverSession(message, session);
            break;
        case 'refund':
            await handleRefundSession(message, session);
            break;
    }
}

async function handleSetupSession(message, session) {
    const { step, data } = session;
    const content = message.content.trim();

    switch (step) {
        case 'ltc_address':
            data.ltc_address = content;
            db.updateTextSession(message.author.id, message.channel.id, 'setup', 'qr_code', data);
            await message.reply('Enter your **LTC QR code URL** (or type `skip` to skip):');
            break;

        case 'qr_code':
            data.ltc_qr_url = content.toLowerCase() === 'skip' ? null : content;
            
            // Save config
            db.upsertServerConfig(message.guild.id, data);
            db.addServerAdmin(message.guild.id, message.author.id, message.author.id, true);
            
            db.deleteTextSession(message.author.id, message.channel.id, 'setup');
            await message.reply('✅ **Setup complete!** You are now registered as a seller.\n\nUse `/ticketpanel` to create a ticket panel, and `/addproduct` to add products.');
            break;
    }
}

async function handleAddProductSession(message, session) {
    const { step, data } = session;
    const content = message.content.trim();

    switch (step) {
        case 'name':
            data.name = content;
            db.updateTextSession(message.author.id, message.channel.id, 'addproduct', 'price', data);
            await message.reply('Enter the **price in USD** (number only, e.g., `10`):');
            break;

        case 'price':
            const price = parseFloat(content);
            if (isNaN(price) || price <= 0) {
                await message.reply('❌ Invalid price. Please enter a valid number:');
                return;
            }
            data.usd_price = price;
            data.ltc_price = price / 100;
            db.updateTextSession(message.author.id, message.channel.id, 'addproduct', 'description', data);
            await message.reply('Enter a **description** (or type `skip`):');
            break;

        case 'description':
            data.description = content.toLowerCase() === 'skip' ? '' : content;
            db.updateTextSession(message.author.id, message.channel.id, 'addproduct', 'image', data);
            await message.reply('Enter an **image URL** (or type `skip`):');
            break;

        case 'image':
            data.image_url = content.toLowerCase() === 'skip' ? null : content;
            db.updateTextSession(message.author.id, message.channel.id, 'addproduct', 'deliverables', data);
            await message.reply('Enter **deliverables** separated by `, ` (comma space):\n\nExample: `key1, key2, key3`\n\nEach deliverable will be given to buyers (one per purchase). Type `skip` to add later with `/addstock`.');
            break;

        case 'deliverables':
            // Create product
            const product = db.addProduct(
                data.name,
                data.description,
                data.ltc_price,
                data.usd_price,
                0,
                data.image_url,
                message.guild.id,
                message.author.id
            );

            // Add deliverables if provided
            let addedKeys = 0;
            if (content.toLowerCase() !== 'skip') {
                const keys = content.split(', ').map(k => k.trim()).filter(k => k.length > 0);
                for (const key of keys) {
                    const result = db.addProductKey(product.product_id, key);
                    if (result) addedKeys++;
                }
            }

            db.deleteTextSession(message.author.id, message.channel.id, 'addproduct');
            
            const productNum = db.getProductNumberInList(message.guild.id, message.author.id, product.product_id);
            await message.reply(`✅ **Product Added!**\n\n**#${productNum}** ${product.name}\n**Price:** $${data.usd_price}\n**Stock:** ${addedKeys} deliverables\n**ID:** ${product.product_id}`);
            break;
    }
}

async function handleAddStockSession(message, session) {
    const { step, data } = session;
    const content = message.content.trim();

    switch (step) {
        case 'select':
            const num = parseInt(content);
            if (isNaN(num) || num < 1 || num > data.products.length) {
                await message.reply(`❌ Invalid number. Enter a number between 1 and ${data.products.length}:`);
                return;
            }
            data.selectedProduct = data.products[num - 1];
            db.updateTextSession(message.author.id, message.channel.id, 'addstock', 'keys', data);
            await message.reply('Enter **deliverables** separated by `, ` (comma space):\n\nExample: `first deliverable, second deliverable, third deliverable`\n\nEach one will be given to a buyer (one per purchase):');
            break;

        case 'keys':
            const product = db.getProductByProductId(data.selectedProduct);
            if (!product) {
                db.deleteTextSession(message.author.id, message.channel.id, 'addstock');
                await message.reply('❌ Product not found.');
                return;
            }

            const keys = content.split(', ').map(k => k.trim()).filter(k => k.length > 0);
            let added = 0;
            for (const key of keys) {
                const result = db.addProductKey(product.product_id, key);
                if (result) added++;
            }

            db.deleteTextSession(message.author.id, message.channel.id, 'addstock');
            
            const updatedProduct = db.getProductByProductId(data.selectedProduct);
            await message.reply(`✅ Added **${added}** deliverable(s) to **${product.name}**.\n\n**New Stock:** ${updatedProduct.stock}`);
            break;
    }
}

async function handleDeleteProductSession(message, session) {
    const { step, data } = session;
    const content = message.content.trim();

    if (step === 'select') {
        const num = parseInt(content);
        if (isNaN(num) || num < 1 || num > data.products.length) {
            await message.reply(`❌ Invalid number. Enter a number between 1 and ${data.products.length}:`);
            return;
        }

        const productId = data.products[num - 1];
        const product = db.getProductByProductId(productId);
        
        if (!product) {
            db.deleteTextSession(message.author.id, message.channel.id, 'deleteproduct');
            await message.reply('❌ Product not found.');
            return;
        }

        db.deleteProduct(productId);
        db.deleteTextSession(message.author.id, message.channel.id, 'deleteproduct');
        
        await message.reply(`✅ Product **${product.name}** has been deleted.`);
    }
}

async function handleEditProductSession(message, session) {
    const { step, data } = session;
    const content = message.content.trim();

    switch (step) {
        case 'select':
            const num = parseInt(content);
            if (isNaN(num) || num < 1 || num > data.products.length) {
                await message.reply(`❌ Invalid number. Enter a number between 1 and ${data.products.length}:`);
                return;
            }
            data.selectedProduct = data.products[num - 1];
            const product = db.getProductByProductId(data.selectedProduct);
            
            db.updateTextSession(message.author.id, message.channel.id, 'editproduct', 'field', data);
            await message.reply(`**Editing: ${product.name}**\n\nWhat do you want to edit?\n• \`name\`\n• \`price\`\n• \`description\`\n• \`image\`\n• \`done\` to finish`);
            break;

        case 'field':
            const field = content.toLowerCase();
            if (field === 'done') {
                db.deleteTextSession(message.author.id, message.channel.id, 'editproduct');
                await message.reply('✅ Editing complete.');
                return;
            }
            if (!['name', 'price', 'description', 'image'].includes(field)) {
                await message.reply('❌ Invalid option. Choose: `name`, `price`, `description`, `image`, or `done`');
                return;
            }
            data.editField = field;
            db.updateTextSession(message.author.id, message.channel.id, 'editproduct', 'value', data);
            await message.reply(`Enter the new **${field}**:`);
            break;

        case 'value':
            const updates = {};
            switch (data.editField) {
                case 'name':
                    updates.name = content;
                    break;
                case 'price':
                    const price = parseFloat(content);
                    if (isNaN(price) || price <= 0) {
                        await message.reply('❌ Invalid price. Enter a valid number:');
                        return;
                    }
                    updates.usd_price = price;
                    updates.ltc_price = price / 100;
                    break;
                case 'description':
                    updates.description = content;
                    break;
                case 'image':
                    updates.image_url = content;
                    break;
            }

            db.updateProduct(data.selectedProduct, updates);
            db.updateTextSession(message.author.id, message.channel.id, 'editproduct', 'field', data);
            await message.reply(`✅ **${data.editField}** updated!\n\nEdit another field or type \`done\` to finish:\n• \`name\`\n• \`price\`\n• \`description\`\n• \`image\`\n• \`done\``);
            break;
    }
}

async function handleBuySession(message, session) {
    const { step, data } = session;
    const content = message.content.trim();

    switch (step) {
        case 'select_product':
            const num = parseInt(content);
            const selectedProduct = data.products.find(p => p.number === num);
            
            if (!selectedProduct) {
                await message.reply(`❌ Invalid product number. Enter a number between 1 and ${data.products.length}:`);
                return;
            }

            const product = db.getProductById(selectedProduct.product_id, message.guild.id);
            if (!product || product.stock <= 0) {
                await message.reply('❌ This product is out of stock.');
                return;
            }

            data.selectedProduct = selectedProduct;
            db.updateTextSession(message.author.id, message.channel.id, 'buy', 'quantity', data);
            await message.reply(`**Selected:** ${product.name} - $${product.usd_price}\n**Stock:** ${product.stock}\n\nHow many do you want to buy? (Enter a number):`);
            break;

        case 'quantity':
            const qty = parseInt(content);
            const prod = db.getProductById(data.selectedProduct.product_id, message.guild.id);
            
            if (isNaN(qty) || qty < 1) {
                await message.reply('❌ Enter a valid quantity (minimum 1):');
                return;
            }
            
            if (qty > prod.stock) {
                await message.reply(`❌ Not enough stock. Maximum available: ${prod.stock}`);
                return;
            }

            // Create order
            const seller = db.getSeller(message.guild.id, data.selectedProduct.seller_id);
            const config = db.getServerConfig(message.guild.id);
            const ltcAddress = seller?.ltc_address || config?.ltc_address;
            const qrUrl = seller?.ltc_qr_url || config?.ltc_qr_url;

            if (!ltcAddress) {
                db.deleteTextSession(message.author.id, message.channel.id, 'buy');
                await message.reply('❌ Payment not configured for this seller.');
                return;
            }

            const totalLtc = prod.ltc_price * qty;
            const totalUsd = prod.usd_price * qty;

            const order = db.createOrder(
                message.author.id,
                prod.product_id,
                ltcAddress,
                totalLtc,
                totalUsd,
                message.guild.id,
                data.selectedProduct.seller_id,
                qty
            );

            const embed = new EmbedBuilder()
                .setTitle('💳 Payment Details')
                .setColor(0x00FF00)
                .setDescription(`**Product:** ${prod.name}\n**Quantity:** ${qty}\n**Total:** $${totalUsd} (${totalLtc.toFixed(8)} LTC)`)
                .addFields(
                    { name: '📋 Order ID', value: order.order_id, inline: true },
                    { name: '💰 Send exactly', value: `${totalLtc.toFixed(8)} LTC`, inline: true },
                    { name: '📬 LTC Address', value: `\`${ltcAddress}\`` }
                )
                .setFooter({ text: 'Payment will be detected automatically' });

            if (qrUrl) {
                embed.setThumbnail(qrUrl);
            }

            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`check_${order.order_id}`)
                        .setLabel('Check Status')
                        .setStyle(ButtonStyle.Primary),
                    new ButtonBuilder()
                        .setCustomId(`cancel_${order.order_id}`)
                        .setLabel('Cancel')
                        .setStyle(ButtonStyle.Danger)
                );

            db.deleteTextSession(message.author.id, message.channel.id, 'buy');
            await message.reply({ embeds: [embed], components: [row] });
            break;
    }
}

async function handleAddAdminSession(message, session) {
    const content = message.content.trim();
    const mention = message.mentions.users.first();

    if (!mention) {
        await message.reply('❌ Please mention a user (@user):');
        return;
    }

    if (db.isServerAdmin(message.guild.id, mention.id)) {
        db.deleteTextSession(message.author.id, message.channel.id, 'addadmin');
        await message.reply('❌ This user is already an admin/seller.');
        return;
    }

    db.addServerAdmin(message.guild.id, mention.id, message.author.id, true);
    db.deleteTextSession(message.author.id, message.channel.id, 'addadmin');
    
    await message.reply(`✅ <@${mention.id}> has been added as a **seller**!\n\nThey can now use product commands: \`/addproduct\`, \`/editproduct\`, \`/deleteproduct\`, \`/addstock\`, etc.`);
}

async function handleRemoveAdminSession(message, session) {
    const mention = message.mentions.users.first();

    if (!mention) {
        await message.reply('❌ Please mention a user (@user):');
        return;
    }

    if (!db.isServerAdmin(message.guild.id, mention.id)) {
        db.deleteTextSession(message.author.id, message.channel.id, 'removeadmin');
        await message.reply('❌ This user is not an admin/seller.');
        return;
    }

    db.removeServerAdmin(message.guild.id, mention.id);
    db.deleteTextSession(message.author.id, message.channel.id, 'removeadmin');
    
    await message.reply(`✅ <@${mention.id}> has been removed as an admin/seller.`);
}

async function handleSoldSession(message, session) {
    const content = message.content.trim().toLowerCase();
    const validPeriods = ['today', 'week', 'month', 'all'];

    if (!validPeriods.includes(content)) {
        await message.reply('❌ Invalid period. Enter: `today`, `week`, `month`, or `all`');
        return;
    }

    const orders = db.getSoldOrders(message.guild.id, message.author.id, content);
    db.deleteTextSession(message.author.id, message.channel.id, 'sold');

    if (orders.length === 0) {
        await message.reply(`📦 No sold orders found for **${content}**.`);
        return;
    }

    const totalLtc = orders.reduce((sum, o) => sum + o.amount, 0);
    const totalUsd = orders.reduce((sum, o) => sum + (o.usd_amount || 0), 0);

    const embed = new EmbedBuilder()
        .setTitle(`📊 Sold Orders (${content})`)
        .setColor(0x00FF00)
        .setDescription(`**Total Orders:** ${orders.length}\n**Total LTC:** ${totalLtc.toFixed(8)}\n**Total USD:** $${totalUsd.toFixed(2)}`)
        .setTimestamp();

    const recentOrders = orders.slice(0, 5);
    for (const order of recentOrders) {
        embed.addFields({
            name: order.order_id,
            value: `Product: ${order.product_id}\nQty: ${order.quantity || 1}\nAmount: ${order.amount} LTC ($${order.usd_amount || 0})`,
            inline: true
        });
    }

    await message.reply({ embeds: [embed] });
}

async function handleDeliverSession(message, session) {
    const orderId = message.content.trim().toUpperCase();
    const order = db.getOrderById(orderId);

    if (!order) {
        await message.reply('❌ Order not found. Please enter a valid Order ID:');
        return;
    }

    if (order.status === 'delivered') {
        db.deleteTextSession(message.author.id, message.channel.id, 'deliver');
        await message.reply('❌ Order already delivered.');
        return;
    }

    const quantity = order.quantity || 1;
    const keys = db.useProductKeys(order.product_id, order.user_id, quantity);

    if (keys.length === 0) {
        db.updateOrderStatus(orderId, 'delivered');
        db.deleteTextSession(message.author.id, message.channel.id, 'deliver');
        await message.reply(`✅ Order **${orderId}** marked as delivered (no deliverables available).`);
        return;
    }

    db.deliverOrder(orderId, keys);
    db.deleteTextSession(message.author.id, message.channel.id, 'deliver');

    // Get product and seller info for vouch
    const product = db.getProductByProductId(order.product_id);
    const productName = product ? product.name : order.product_id;
    const price = product ? `$${product.usd_price}` : `${order.amount} LTC`;
    const config = db.getServerConfig(order.guild_id);
    
    let sellerUser;
    try {
        sellerUser = await client.users.fetch(order.seller_id);
    } catch {
        sellerUser = { username: 'Seller', id: order.seller_id };
    }

    const vouchMessage = `+Vouch ${sellerUser.username} ${productName} ${price}`;
    const vouchChannelMention = config?.vouch_channel_id ? `<#${config.vouch_channel_id}>` : '#vouch-channel';

    // DM user with deliverables and vouch info
    try {
        const user = await client.users.fetch(order.user_id);
        const keysFormatted = keys.map((k, i) => `${i + 1}. ${k}`).join('\n');
        
        const embed = new EmbedBuilder()
            .setTitle('🎉 Order Delivered!')
            .setColor(0x00FF00)
            .setDescription(`Your order **${orderId}** has been delivered!\n\n**Your deliverable(s):**\n\`\`\`\n${keysFormatted}\n\`\`\``)
            .addFields(
                { name: '📦 Product', value: productName, inline: true },
                { name: '🔢 Quantity', value: quantity.toString(), inline: true }
            )
            .setTimestamp();

        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`vouchmsg_${orderId}`)
                    .setLabel('Vouch Message')
                    .setStyle(ButtonStyle.Success)
                    .setEmoji('📋')
            );

        await user.send({ 
            content: `**Thanks For Purchasing With Us!**\n\nPlease Vouch us in ${vouchChannelMention}\n\`${vouchMessage}\``,
            embeds: [embed], 
            components: [row] 
        });
    } catch (e) {
        console.error('Could not DM user:', e.message);
    }

    await message.reply(`✅ Order **${orderId}** delivered! (${keys.length} deliverable(s) sent)`);
}

async function handleRefundSession(message, session) {
    const orderId = message.content.trim().toUpperCase();
    const order = db.getOrderById(orderId);

    if (!order) {
        await message.reply('❌ Order not found. Please enter a valid Order ID:');
        return;
    }

    if (order.status === 'refunded') {
        db.deleteTextSession(message.author.id, message.channel.id, 'refund');
        await message.reply('❌ Order already refunded.');
        return;
    }

    db.refundOrder(orderId, message.author.id);
    db.deleteTextSession(message.author.id, message.channel.id, 'refund');

    try {
        const user = await client.users.fetch(order.user_id);
        await user.send(`💸 Your order **${orderId}** has been refunded. Please contact the seller for your refund.`);
    } catch (e) {
        console.error('Could not DM user:', e.message);
    }

    await message.reply(`✅ Order **${orderId}** has been refunded.`);
}

// ============= TICKET HANDLERS =============

async function createPurchaseTicket(interaction, client) {
    const config = db.getServerConfig(interaction.guild.id);

    if (!config?.ticket_category_id) {
        return interaction.reply({ content: '❌ Ticket system not configured.', ephemeral: true });
    }

    try {
        const channel = await interaction.guild.channels.create({
            name: `purchase-${interaction.user.username}`,
            type: ChannelType.GuildText,
            parent: config.ticket_category_id,
            permissionOverwrites: [
                {
                    id: interaction.guild.id,
                    deny: [PermissionFlagsBits.ViewChannel]
                },
                {
                    id: interaction.user.id,
                    allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages]
                }
            ]
        });

        const ticket = db.createTicket(
            interaction.guild.id,
            channel.id,
            interaction.user.id,
            'purchase'
        );

        // Show products immediately (no Start Purchase button)
        await showProductsInTicket(channel, interaction.user, client, interaction.guild.id);

        await interaction.reply({ content: `✅ Ticket created: <#${channel.id}>`, ephemeral: true });
    } catch (e) {
        console.error('Error creating ticket:', e);
        await interaction.reply({ content: '❌ Failed to create ticket.', ephemeral: true });
    }
}

async function showProductsInTicket(channel, user, client, guildId) {
    const sellers = db.getSellersWithProducts(guildId);
    
    if (sellers.length === 0) {
        await channel.send(`<@${user.id}>\n\n❌ No products available for purchase.`);
        return;
    }

    const embed = new EmbedBuilder()
        .setTitle('🛒 Available Products')
        .setDescription(`Welcome <@${user.id}>!\n\nEnter a product number to purchase:`)
        .setColor(0x00AAFF)
        .setTimestamp();

    const allProducts = [];
    let productNumber = 1;

    for (const seller of sellers) {
        let sellerUser;
        try {
            sellerUser = await client.users.fetch(seller.user_id);
        } catch {
            sellerUser = { username: 'Unknown Seller', id: seller.user_id };
        }

        const products = db.getProductsBySeller(guildId, seller.user_id).filter(p => p.stock > 0);
        
        let productList = '';
        for (const product of products) {
            const price = product.usd_price ? `$${product.usd_price}` : `${product.ltc_price} LTC`;
            productList += `**${productNumber}.** ${product.name} - ${price} (Stock: ${product.stock})\n`;
            allProducts.push({ ...product, sellerUsername: sellerUser.username, number: productNumber });
            productNumber++;
        }

        if (productList) {
            embed.addFields({
                name: `👤 ${sellerUser.username}`,
                value: productList,
                inline: false
            });
        }
    }

    const row = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('ticket_close')
                .setLabel('Close Ticket')
                .setStyle(ButtonStyle.Danger)
        );

    await channel.send({ content: `<@${user.id}>`, embeds: [embed], components: [row] });

    // Create buy session for this channel
    db.createTextSession(user.id, guildId, channel.id, 'buy', 'select_product', { 
        products: allProducts.map(p => ({ product_id: p.product_id, seller_id: p.seller_id, number: p.number }))
    });
}

async function createSupportTicket(interaction, client) {
    const config = db.getServerConfig(interaction.guild.id);
    const categoryId = config?.support_category_id || config?.ticket_category_id;

    if (!categoryId) {
        return interaction.reply({ content: '❌ Ticket system not configured.', ephemeral: true });
    }

    try {
        const channel = await interaction.guild.channels.create({
            name: `support-${interaction.user.username}`,
            type: ChannelType.GuildText,
            parent: categoryId,
            permissionOverwrites: [
                {
                    id: interaction.guild.id,
                    deny: [PermissionFlagsBits.ViewChannel]
                },
                {
                    id: interaction.user.id,
                    allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages]
                }
            ]
        });

        db.createTicket(
            interaction.guild.id,
            channel.id,
            interaction.user.id,
            'support'
        );

        const embed = new EmbedBuilder()
            .setTitle('❓ Support Ticket')
            .setColor(0xFFAA00)
            .setDescription(`Welcome <@${interaction.user.id}>!\n\nPlease describe your issue and a staff member will assist you.`)
            .setTimestamp();

        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('ticket_claim')
                    .setLabel('Claim')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId('ticket_close')
                    .setLabel('Close')
                    .setStyle(ButtonStyle.Danger)
            );

        await channel.send({ content: `<@${interaction.user.id}>`, embeds: [embed], components: [row] });
        await interaction.reply({ content: `✅ Ticket created: <#${channel.id}>`, ephemeral: true });
    } catch (e) {
        console.error('Error creating ticket:', e);
        await interaction.reply({ content: '❌ Failed to create ticket.', ephemeral: true });
    }
}

async function claimTicket(interaction, client) {
    const ticket = db.getTicketByChannel(interaction.channel.id);
    if (!ticket) {
        return interaction.reply({ content: '❌ This is not a ticket channel.', ephemeral: true });
    }

    if (!canUseSellercCommands(interaction.guild.id, interaction.user.id)) {
        return interaction.reply({ content: '❌ Only sellers can claim tickets.', ephemeral: true });
    }

    db.claimTicket(ticket.ticket_id, interaction.user.id);
    await interaction.reply({ content: `✅ Ticket claimed by <@${interaction.user.id}>` });
}

async function closeTicket(interaction, client) {
    const ticket = db.getTicketByChannel(interaction.channel.id);
    if (!ticket) {
        return interaction.reply({ content: '❌ This is not a ticket channel.', ephemeral: true });
    }

    db.closeTicket(ticket.ticket_id);
    await interaction.reply({ content: '✅ Ticket will be deleted in 5 seconds...' });

    setTimeout(async () => {
        try {
            await interaction.channel.delete();
        } catch (e) {
            console.error('Error deleting channel:', e);
        }
    }, 5000);
}

// ============= EVENT HANDLERS =============

client.on('interactionCreate', async interaction => {
    if (interaction.isChatInputCommand()) {
        const command = client.commands.get(interaction.commandName);
        if (!command) return;

        try {
            await command.execute(interaction, client);
        } catch (error) {
            console.error(`❌ Error in /${interaction.commandName}:`, error);
            const reply = { content: '❌ Command error!', ephemeral: true };
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp(reply);
            } else {
                await interaction.reply(reply);
            }
        }
    }

    if (interaction.isButton()) {
        const customId = interaction.customId;

        if (customId === 'open_purchase_ticket') {
            await createPurchaseTicket(interaction, client);
            return;
        }

        if (customId === 'open_support_ticket') {
            await createSupportTicket(interaction, client);
            return;
        }

        if (customId === 'ticket_close') {
            await closeTicket(interaction, client);
            return;
        }

        if (customId === 'ticket_claim') {
            await claimTicket(interaction, client);
            return;
        }

        if (customId.startsWith('check_')) {
            const orderId = customId.replace('check_', '');
            const order = db.getOrderById(orderId);
            if (!order) {
                return interaction.reply({ content: '❌ Order not found.', ephemeral: true });
            }

            const statusEmoji = {
                'pending': '⏳',
                'paid': '✅',
                'delivered': '📦',
                'refunded': '💸',
                'cancelled': '❌'
            }[order.status] || '❓';

            let statusMsg = `${statusEmoji} Order **${orderId}** status: **${order.status.toUpperCase()}**`;
            if (order.status === 'pending' && order.amount_received > 0) {
                const remaining = order.amount - order.amount_received;
                statusMsg += `\n💰 Received: ${order.amount_received} LTC | Remaining: ${remaining.toFixed(8)} LTC`;
            }

            await interaction.reply({ content: statusMsg, ephemeral: true });
            return;
        }

        if (customId.startsWith('cancel_')) {
            const orderId = customId.replace('cancel_', '');
            const order = db.getOrderById(orderId);
            if (!order) {
                return interaction.reply({ content: '❌ Order not found.', ephemeral: true });
            }

            if (order.user_id !== interaction.user.id) {
                return interaction.reply({ content: '❌ This is not your order.', ephemeral: true });
            }

            if (order.status !== 'pending') {
                return interaction.reply({ content: `❌ Cannot cancel order with status: ${order.status}`, ephemeral: true });
            }

            db.updateOrderStatus(orderId, 'cancelled');
            await interaction.reply({ content: `✅ Order **${orderId}** has been cancelled.`, ephemeral: true });
            return;
        }

        // Handle vouch message button
        if (customId.startsWith('vouchmsg_')) {
            const orderId = customId.replace('vouchmsg_', '');
            const order = db.getOrderById(orderId);
            
            if (!order) {
                return interaction.reply({ content: '❌ Order not found.', ephemeral: true });
            }

            // Get product and seller info
            const product = db.getProductByProductId(order.product_id);
            const productName = product ? product.name : order.product_id;
            const price = product ? `$${product.usd_price}` : `${order.amount} LTC`;
            
            let sellerUser;
            try {
                sellerUser = await client.users.fetch(order.seller_id);
            } catch {
                sellerUser = { username: 'Seller', id: order.seller_id };
            }

            const vouchMessage = `+Vouch ${sellerUser.username} ${productName} ${price}`;

            await interaction.reply({ 
                content: `📋 **Copy this message and post it in the vouch channel:**\n\n\`\`\`\n${vouchMessage}\n\`\`\``,
                ephemeral: true 
            });
            return;
        }
    }
});

// Handle text messages for sessions
client.on('messageCreate', async message => {
    if (message.author.bot) return;
    if (!message.guild) return;

    // Check for active text session
    const session = db.getAnyTextSession(message.author.id, message.channel.id);
    if (session) {
        await handleTextSession(message, session);
    }
});

async function registerCommands() {
    const commands = Object.values(commandsData);
    const rest = new REST().setToken(DISCORD_TOKEN);
    try {
        console.log('🔄 Registering slash commands...');
        await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
        console.log(`✅ Registered ${commands.length} slash commands!`);
    } catch (error) {
        console.error('❌ Failed to register commands:', error);
    }
}

client.once('ready', async () => {
    console.log(`✅ Logged in as ${client.user.tag}`);
    console.log(`👤 Bot Owner ID: ${BOT_OWNER_ID}`);
    await registerCommands();
});

client.login(DISCORD_TOKEN);
