const { Client, GatewayIntentBits, Collection, REST, Routes, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, ChannelType, PermissionFlagsBits, StringSelectMenuBuilder } = require('discord.js');
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

const commandsData = {
    setup: {
        name: "setup",
        description: "Setup the bot for this server",
        options: [
            { name: "ltc_address", description: "Your Litecoin wallet address", type: 3, required: true },
            { name: "qr_code", description: "URL to your LTC QR code image", type: 3, required: false },
            { name: "vouch_channel", description: "Channel for vouches", type: 7, required: false },
            { name: "log_channel", description: "Channel for logs", type: 7, required: false },
            { name: "ticket_category", description: "Category for purchase tickets", type: 7, required: false },
            { name: "support_category", description: "Category for support tickets", type: 7, required: false },
            { name: "transcript_channel", description: "Channel for ticket transcripts", type: 7, required: false },
            { name: "client_role", description: "Role to give to customers after purchase", type: 8, required: false },
            { name: "seller_role", description: "Role for sellers/admins", type: 8, required: false }
        ]
    },
    addproduct: {
        name: "addproduct",
        description: "Add a new product",
        options: [
            { name: "name", description: "Product name", type: 3, required: true },
            { name: "price", description: "Price in USD", type: 10, required: true },
            { name: "description", description: "Product description", type: 3, required: false },
            { name: "image", description: "Product image URL", type: 3, required: false }
        ]
    },
    products: {
        name: "products",
        description: "View all available products",
        options: []
    },
    addstock: {
        name: "addstock",
        description: "Add stock/keys to a product",
        options: [
            { name: "product_id", description: "Product ID (e.g., PROD-1234)", type: 3, required: true },
            { name: "keys", description: "Keys/codes separated by commas", type: 3, required: true }
        ]
    },
    deleteproduct: {
        name: "deleteproduct",
        description: "Delete a product",
        options: [
            { name: "product_id", description: "Product ID to delete", type: 3, required: true }
        ]
    },
    editproduct: {
        name: "editproduct",
        description: "Edit a product",
        options: [
            { name: "product_id", description: "Product ID to edit", type: 3, required: true },
            { name: "name", description: "New product name", type: 3, required: false },
            { name: "price", description: "New price in USD", type: 10, required: false },
            { name: "description", description: "New description", type: 3, required: false },
            { name: "image", description: "New image URL", type: 3, required: false }
        ]
    },
    buy: {
        name: "buy",
        description: "Start a purchase",
        options: []
    },
    orders: {
        name: "orders",
        description: "View your orders",
        options: []
    },
    addadmin: {
        name: "addadmin",
        description: "Add a seller/admin",
        options: [
            { name: "user", description: "User to add as admin", type: 6, required: true }
        ]
    },
    removeadmin: {
        name: "removeadmin",
        description: "Remove a seller/admin",
        options: [
            { name: "user", description: "User to remove as admin", type: 6, required: true }
        ]
    },
    sold: {
        name: "sold",
        description: "View sold orders",
        options: [
            {
                name: "period",
                description: "Time period",
                type: 3,
                required: false,
                choices: [
                    { name: "Today", value: "today" },
                    { name: "This Week", value: "week" },
                    { name: "This Month", value: "month" },
                    { name: "All Time", value: "all" }
                ]
            }
        ]
    },
    stats: {
        name: "stats",
        description: "View store statistics",
        options: []
    },
    deliver: {
        name: "deliver",
        description: "Manually deliver an order",
        options: [
            { name: "order_id", description: "Order ID to deliver", type: 3, required: true }
        ]
    },
    refund: {
        name: "refund",
        description: "Refund an order",
        options: [
            { name: "order_id", description: "Order ID to refund", type: 3, required: true }
        ]
    },
    ticketpanel: {
        name: "ticketpanel",
        description: "Create a ticket panel",
        options: []
    },
    help: {
        name: "help",
        description: "View all available commands",
        options: []
    }
};

for (const [name, data] of Object.entries(commandsData)) {
    const filePath = path.join(__dirname, `${name}.json`);
    if (!fs.existsSync(filePath)) {
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
        console.log(`📁 Created: ${name}.json`);
    }
}

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
client.pendingProducts = new Map();
client.pendingOrders = new Map();
client.purchaseSessions = new Map();

const commandHandlers = {
    setup: async (interaction, client) => {
        const ltcAddress = interaction.options.getString('ltc_address');
        const qrCode = interaction.options.getString('qr_code');
        const vouchChannel = interaction.options.getChannel('vouch_channel');
        const logChannel = interaction.options.getChannel('log_channel');
        const ticketCategory = interaction.options.getChannel('ticket_category');
        const supportCategory = interaction.options.getChannel('support_category');
        const transcriptChannel = interaction.options.getChannel('transcript_channel');
        const clientRole = interaction.options.getRole('client_role');
        const sellerRole = interaction.options.getRole('seller_role');

        const config = {
            ltc_address: ltcAddress,
            ltc_qr_url: qrCode,
            vouch_channel_id: vouchChannel?.id,
            log_channel_id: logChannel?.id,
            ticket_category_id: ticketCategory?.id,
            support_category_id: supportCategory?.id,
            transcript_channel_id: transcriptChannel?.id,
            client_role_id: clientRole?.id,
            seller_role_id: sellerRole?.id
        };

        db.upsertServerConfig(interaction.guild.id, config);
        db.addServerAdmin(interaction.guild.id, interaction.user.id, interaction.user.id);

        await interaction.reply({
            content: '✅ Server setup complete! You are now registered as a seller.',
            ephemeral: true
        });
    },

    addproduct: async (interaction, client) => {
        if (!db.isServerAdmin(interaction.guild.id, interaction.user.id)) {
            return interaction.reply({ content: '❌ You are not authorized to use this command.', ephemeral: true });
        }

        const name = interaction.options.getString('name');
        const usdPrice = interaction.options.getNumber('price');
        const description = interaction.options.getString('description') || '';
        const image = interaction.options.getString('image');

        const ltcPrice = usdPrice / 100;

        const product = db.addProduct(
            name,
            description,
            ltcPrice,
            usdPrice,
            0,
            image,
            interaction.guild.id,
            interaction.user.id
        );

        await interaction.reply({
            content: `✅ Product added!\n**ID:** ${product.product_id}\n**Name:** ${name}\n**Price:** $${usdPrice}`,
            ephemeral: true
        });
    },

    products: async (interaction, client) => {
        const products = db.getProducts(interaction.guild.id);

        if (products.length === 0) {
            return interaction.reply({ content: '❌ No products available.', ephemeral: true });
        }

        const embed = new EmbedBuilder()
            .setTitle('🛒 Available Products')
            .setColor(0x00AAFF)
            .setTimestamp();

        for (const product of products) {
            const price = product.usd_price ? `$${product.usd_price}` : `${product.ltc_price} LTC`;
            embed.addFields({
                name: `${product.name} (${product.product_id})`,
                value: `💰 **Price:** ${price}\n📦 **Stock:** ${product.stock}\n${product.description || 'No description'}`,
                inline: true
            });
        }

        await interaction.reply({ embeds: [embed], ephemeral: true });
    },

    addstock: async (interaction, client) => {
        if (!db.isServerAdmin(interaction.guild.id, interaction.user.id)) {
            return interaction.reply({ content: '❌ You are not authorized to use this command.', ephemeral: true });
        }

        const productId = interaction.options.getString('product_id');
        const keysString = interaction.options.getString('keys');

        const product = db.getProductById(productId, interaction.guild.id);
        if (!product) {
            return interaction.reply({ content: '❌ Product not found.', ephemeral: true });
        }

        if (product.seller_id !== interaction.user.id) {
            return interaction.reply({ content: '❌ You can only add stock to your own products.', ephemeral: true });
        }

        const keys = keysString.split(',').map(k => k.trim()).filter(k => k.length > 0);
        let added = 0;

        for (const key of keys) {
            const result = db.addProductKey(productId, key);
            if (result) added++;
        }

        await interaction.reply({
            content: `✅ Added ${added} key(s) to **${product.name}**. New stock: ${product.stock + added}`,
            ephemeral: true
        });
    },

    deleteproduct: async (interaction, client) => {
        if (!db.isServerAdmin(interaction.guild.id, interaction.user.id)) {
            return interaction.reply({ content: '❌ You are not authorized to use this command.', ephemeral: true });
        }

        const productId = interaction.options.getString('product_id');
        const product = db.getProductById(productId, interaction.guild.id);

        if (!product) {
            return interaction.reply({ content: '❌ Product not found.', ephemeral: true });
        }

        if (product.seller_id !== interaction.user.id) {
            return interaction.reply({ content: '❌ You can only delete your own products.', ephemeral: true });
        }

        db.deleteProduct(productId);

        await interaction.reply({
            content: `✅ Product **${product.name}** (${productId}) has been deleted.`,
            ephemeral: true
        });
    },

    editproduct: async (interaction, client) => {
        if (!db.isServerAdmin(interaction.guild.id, interaction.user.id)) {
            return interaction.reply({ content: '❌ You are not authorized to use this command.', ephemeral: true });
        }

        const productId = interaction.options.getString('product_id');
        const product = db.getProductById(productId, interaction.guild.id);

        if (!product) {
            return interaction.reply({ content: '❌ Product not found.', ephemeral: true });
        }

        if (product.seller_id !== interaction.user.id) {
            return interaction.reply({ content: '❌ You can only edit your own products.', ephemeral: true });
        }

        const updates = {};
        const name = interaction.options.getString('name');
        const price = interaction.options.getNumber('price');
        const description = interaction.options.getString('description');
        const image = interaction.options.getString('image');

        if (name) updates.name = name;
        if (price) {
            updates.usd_price = price;
            updates.ltc_price = price / 100;
        }
        if (description) updates.description = description;
        if (image) updates.image_url = image;

        if (Object.keys(updates).length === 0) {
            return interaction.reply({ content: '❌ No changes specified.', ephemeral: true });
        }

        db.updateProduct(productId, updates);

        await interaction.reply({
            content: `✅ Product **${productId}** updated successfully.`,
            ephemeral: true
        });
    },

    buy: async (interaction, client) => {
        const embed = new EmbedBuilder()
            .setTitle('🛒 Start Purchase')
            .setDescription('Click the button below to start your purchase!')
            .setColor(0x00AAFF);

        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`start_purchase_${interaction.guild.id}`)
                    .setLabel('Start Purchase')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('🛒')
            );

        await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
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
                value: `**Product:** ${order.product_id}\n**Amount:** ${order.amount} LTC\n**Status:** ${order.status}`,
                inline: true
            });
        }

        if (orders.length > 10) {
            embed.setFooter({ text: `Showing 10 of ${orders.length} orders` });
        }

        await interaction.reply({ embeds: [embed], ephemeral: true });
    },

    addadmin: async (interaction, client) => {
        const user = interaction.options.getUser('user');

        if (db.isServerAdmin(interaction.guild.id, user.id)) {
            return interaction.reply({ content: '❌ This user is already an admin.', ephemeral: true });
        }

        db.addServerAdmin(interaction.guild.id, user.id, interaction.user.id);

        await interaction.reply({
            content: `✅ <@${user.id}> has been added as an admin/seller.`,
            ephemeral: true
        });
    },

    removeadmin: async (interaction, client) => {
        const user = interaction.options.getUser('user');

        if (!db.isServerAdmin(interaction.guild.id, user.id)) {
            return interaction.reply({ content: '❌ This user is not an admin.', ephemeral: true });
        }

        db.removeServerAdmin(interaction.guild.id, user.id);

        await interaction.reply({
            content: `✅ <@${user.id}> has been removed as an admin/seller.`,
            ephemeral: true
        });
    },

    sold: async (interaction, client) => {
        if (!db.isServerAdmin(interaction.guild.id, interaction.user.id)) {
            return interaction.reply({ content: '❌ You are not authorized to use this command.', ephemeral: true });
        }

        const period = interaction.options.getString('period') || 'all';
        const orders = db.getSoldOrders(interaction.guild.id, interaction.user.id, period);

        if (orders.length === 0) {
            return interaction.reply({ content: '📦 No sold orders found for this period.', ephemeral: true });
        }

        const totalLtc = orders.reduce((sum, o) => sum + o.amount, 0);
        const totalUsd = orders.reduce((sum, o) => sum + (o.usd_amount || 0), 0);

        const embed = new EmbedBuilder()
            .setTitle(`📊 Sold Orders (${period})`)
            .setColor(0x00FF00)
            .setDescription(`**Total Orders:** ${orders.length}\n**Total LTC:** ${totalLtc.toFixed(8)}\n**Total USD:** $${totalUsd.toFixed(2)}`)
            .setTimestamp();

        const recentOrders = orders.slice(0, 5);
        for (const order of recentOrders) {
            embed.addFields({
                name: order.order_id,
                value: `Product: ${order.product_id}\nAmount: ${order.amount} LTC ($${order.usd_amount || 0})`,
                inline: true
            });
        }

        await interaction.reply({ embeds: [embed], ephemeral: true });
    },

    stats: async (interaction, client) => {
        if (!db.isServerAdmin(interaction.guild.id, interaction.user.id)) {
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
        if (!db.isServerAdmin(interaction.guild.id, interaction.user.id)) {
            return interaction.reply({ content: '❌ You are not authorized to use this command.', ephemeral: true });
        }

        const orderId = interaction.options.getString('order_id');
        const order = db.getOrderById(orderId);

        if (!order) {
            return interaction.reply({ content: '❌ Order not found.', ephemeral: true });
        }

        if (order.status === 'delivered') {
            return interaction.reply({ content: '❌ Order already delivered.', ephemeral: true });
        }

        const key = db.useProductKey(order.product_id, order.user_id);

        if (!key) {
            db.updateOrderStatus(orderId, 'delivered');
            return interaction.reply({
                content: `✅ Order **${orderId}** marked as delivered (no key available).`,
                ephemeral: true
            });
        }

        db.deliverOrder(orderId, key.key_value);

        try {
            const user = await client.users.fetch(order.user_id);
            await user.send(`🎉 Your order **${orderId}** has been delivered!\n\n**Your key/code:**\n\`\`\`${key.key_value}\`\`\``);
        } catch (e) {
            console.error('Could not DM user:', e.message);
        }

        await interaction.reply({
            content: `✅ Order **${orderId}** delivered successfully!`,
            ephemeral: true
        });
    },

    refund: async (interaction, client) => {
        if (!db.isServerAdmin(interaction.guild.id, interaction.user.id)) {
            return interaction.reply({ content: '❌ You are not authorized to use this command.', ephemeral: true });
        }

        const orderId = interaction.options.getString('order_id');
        const order = db.getOrderById(orderId);

        if (!order) {
            return interaction.reply({ content: '❌ Order not found.', ephemeral: true });
        }

        if (order.status === 'refunded') {
            return interaction.reply({ content: '❌ Order already refunded.', ephemeral: true });
        }

        db.refundOrder(orderId, interaction.user.id);

        try {
            const user = await client.users.fetch(order.user_id);
            await user.send(`💸 Your order **${orderId}** has been refunded. Please contact the seller for your refund.`);
        } catch (e) {
            console.error('Could not DM user:', e.message);
        }

        await interaction.reply({
            content: `✅ Order **${orderId}** has been refunded.`,
            ephemeral: true
        });
    },

    ticketpanel: async (interaction, client) => {
        if (!db.isServerAdmin(interaction.guild.id, interaction.user.id)) {
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
            .addFields(
                { name: '🛒 Customer Commands', value: '`/buy` - Start a purchase\n`/products` - View products\n`/orders` - View your orders' },
                { name: '⚙️ Setup Commands', value: '`/setup` - Setup the bot\n`/addadmin` - Add a seller\n`/removeadmin` - Remove a seller' },
                { name: '📦 Product Commands', value: '`/addproduct` - Add a product\n`/editproduct` - Edit a product\n`/deleteproduct` - Delete a product\n`/addstock` - Add stock/keys' },
                { name: '💰 Order Commands', value: '`/deliver` - Deliver an order\n`/refund` - Refund an order\n`/sold` - View sold orders' },
                { name: '📊 Stats & Tickets', value: '`/stats` - View statistics\n`/ticketpanel` - Create ticket panel' }
            )
            .setTimestamp();

        await interaction.reply({ embeds: [embed], ephemeral: true });
    }
};

for (const [name, handler] of Object.entries(commandHandlers)) {
    client.commands.set(name, { execute: handler });
}

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

async function generateTranscript(channel) {
    try {
        const messages = await channel.messages.fetch({ limit: 100 });
        const sorted = messages.sort((a, b) => a.createdTimestamp - b.createdTimestamp);

        let transcript = `📜 TICKET TRANSCRIPT\n`;
        transcript += `Channel: ${channel.name}\n`;
        transcript += `Generated: ${new Date().toISOString()}\n`;
        transcript += `${'='.repeat(50)}\n\n`;

        for (const [, msg] of sorted) {
            const timestamp = new Date(msg.createdTimestamp).toLocaleString();
            transcript += `[${timestamp}] ${msg.author.tag}:\n`;
            if (msg.content) transcript += `${msg.content}\n`;
            if (msg.embeds.length > 0) {
                msg.embeds.forEach(embed => {
                    if (embed.title) transcript += `[Embed: ${embed.title}]\n`;
                    if (embed.description) transcript += `${embed.description}\n`;
                });
            }
            transcript += '\n';
        }

        return transcript;
    } catch (e) {
        console.error('Error generating transcript:', e);
        return null;
    }
}

async function sendTranscript(client, guildId, ticketChannel, ticketInfo) {
    try {
        const config = db.getServerConfig(guildId);
        if (!config?.transcript_channel_id) return;

        const transcriptChannel = await client.channels.fetch(config.transcript_channel_id);
        if (!transcriptChannel) return;

        const transcript = await generateTranscript(ticketChannel);
        if (!transcript) return;

        const embed = new EmbedBuilder()
            .setTitle('📜 Ticket Transcript')
            .setColor(0x00AAFF)
            .addFields(
                { name: 'Ticket ID', value: ticketInfo.ticket_id, inline: true },
                { name: 'User', value: `<@${ticketInfo.user_id}>`, inline: true },
                { name: 'Type', value: ticketInfo.type, inline: true },
                { name: 'Claimed By', value: ticketInfo.claimed_by ? `<@${ticketInfo.claimed_by}>` : 'Not claimed', inline: true }
            )
            .setTimestamp();

        const buffer = Buffer.from(transcript, 'utf-8');

        await transcriptChannel.send({
            embeds: [embed],
            files: [{
                attachment: buffer,
                name: `transcript-${ticketInfo.ticket_id}.txt`
            }]
        });

        console.log(`📜 Transcript sent for ticket ${ticketInfo.ticket_id}`);
    } catch (e) {
        console.error('Error sending transcript:', e);
    }
}

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
        await handleButtonInteraction(interaction, client);
    }

    if (interaction.isModalSubmit()) {
        await handleModalSubmit(interaction, client);
    }

    if (interaction.isStringSelectMenu()) {
        await handleSelectMenu(interaction, client);
    }
});

async function handleButtonInteraction(interaction, client) {
    const customId = interaction.customId;

    if (customId.startsWith('start_purchase_')) {
        const guildId = customId.replace('start_purchase_', '');
        await startDMPurchaseFlow(interaction, client, guildId);
        return;
    }

    if (customId === 'open_purchase_ticket') {
        await showPurchaseModal(interaction);
        return;
    }

    if (customId === 'open_support_ticket') {
        await showSupportModal(interaction);
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
        client.pendingOrders.delete(orderId);

        await interaction.reply({ content: `✅ Order **${orderId}** has been cancelled.`, ephemeral: true });
        return;
    }

    if (customId.startsWith('confirm_purchase_')) {
        await interaction.reply({ content: '✅ Purchase confirmed! Please complete payment.', ephemeral: true });
        return;
    }

    if (customId.startsWith('decline_purchase_')) {
        await interaction.reply({ content: '❌ Purchase cancelled.', ephemeral: true });
        return;
    }
}

async function startDMPurchaseFlow(interaction, client, guildId) {
    const sellers = db.getSellersWithProducts(guildId);

    if (sellers.length === 0) {
        return interaction.reply({ content: '❌ No sellers available.', ephemeral: true });
    }

    if (sellers.length === 1) {
        await showProductSelection(interaction, client, guildId, sellers[0].user_id);
        return;
    }

    const options = [];
    for (const seller of sellers) {
        let sellerUser;
        try {
            sellerUser = await client.users.fetch(seller.user_id);
        } catch {
            sellerUser = { username: 'Unknown', id: seller.user_id };
        }
        options.push({
            label: sellerUser.username,
            description: `${seller.product_count} products available`,
            value: seller.user_id
        });
    }

    const row = new ActionRowBuilder()
        .addComponents(
            new StringSelectMenuBuilder()
                .setCustomId(`select_seller_${guildId}`)
                .setPlaceholder('Which seller would you like to buy from?')
                .addOptions(options)
        );

    const embed = new EmbedBuilder()
        .setTitle('🛒 Select a Seller')
        .setColor(0x00AAFF)
        .setDescription('Which seller would you like to buy from?');

    await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
}

async function showProductSelection(interaction, client, guildId, sellerId) {
    const products = db.getProductsBySeller(guildId, sellerId).filter(p => p.stock > 0);

    if (products.length === 0) {
        return interaction.reply({ content: '❌ No products available from this seller.', ephemeral: true });
    }

    const options = products.map((product, index) => ({
        label: `${index + 1}. ${product.name}`,
        description: `$${product.usd_price || product.ltc_price + ' LTC'} - Stock: ${product.stock}`,
        value: `${guildId}_${sellerId}_${product.product_id}`
    }));

    const row = new ActionRowBuilder()
        .addComponents(
            new StringSelectMenuBuilder()
                .setCustomId('select_product')
                .setPlaceholder('Select a product to purchase')
                .addOptions(options)
        );

    const embed = new EmbedBuilder()
        .setTitle('🛒 Select a Product')
        .setColor(0x00AAFF)
        .setDescription('Choose a product from the list below:');

    if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ embeds: [embed], components: [row], ephemeral: true });
    } else {
        await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
    }
}

async function handleSelectMenu(interaction, client) {
    const customId = interaction.customId;

    if (customId.startsWith('select_seller_')) {
        const guildId = customId.replace('select_seller_', '');
        const sellerId = interaction.values[0];
        await showProductSelection(interaction, client, guildId, sellerId);
        return;
    }

    if (customId === 'select_product') {
        const [guildId, sellerId, productId] = interaction.values[0].split('_');
        const product = db.getProductById(productId, guildId);
        const seller = db.getSeller(guildId, sellerId);
        const config = db.getServerConfig(guildId);

        if (!product) {
            return interaction.reply({ content: '❌ Product not found.', ephemeral: true });
        }

        const ltcAddress = seller?.ltc_address || config?.ltc_address;
        const qrUrl = seller?.ltc_qr_url || config?.ltc_qr_url;

        if (!ltcAddress) {
            return interaction.reply({ content: '❌ Payment not configured for this seller.', ephemeral: true });
        }

        const order = db.createOrder(
            interaction.user.id,
            product.product_id,
            ltcAddress,
            product.ltc_price,
            product.usd_price,
            guildId,
            sellerId
        );

        const embed = new EmbedBuilder()
            .setTitle('💳 Payment Details')
            .setColor(0x00FF00)
            .setDescription(`**Product:** ${product.name}\n**Price:** $${product.usd_price} (${product.ltc_price} LTC)`)
            .addFields(
                { name: '📋 Order ID', value: order.order_id, inline: true },
                { name: '💰 Send exactly', value: `${product.ltc_price} LTC`, inline: true },
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

        await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
        return;
    }
}

async function showPurchaseModal(interaction) {
    const modal = new ModalBuilder()
        .setCustomId('purchase_ticket_modal')
        .setTitle('Purchase Ticket');

    const productInput = new TextInputBuilder()
        .setCustomId('product_name')
        .setLabel('What product are you interested in?')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

    const messageInput = new TextInputBuilder()
        .setCustomId('message')
        .setLabel('Additional message (optional)')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(false);

    modal.addComponents(
        new ActionRowBuilder().addComponents(productInput),
        new ActionRowBuilder().addComponents(messageInput)
    );

    await interaction.showModal(modal);
}

async function showSupportModal(interaction) {
    const modal = new ModalBuilder()
        .setCustomId('support_ticket_modal')
        .setTitle('Support Ticket');

    const subjectInput = new TextInputBuilder()
        .setCustomId('subject')
        .setLabel('Subject')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

    const messageInput = new TextInputBuilder()
        .setCustomId('message')
        .setLabel('How can we help you?')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true);

    modal.addComponents(
        new ActionRowBuilder().addComponents(subjectInput),
        new ActionRowBuilder().addComponents(messageInput)
    );

    await interaction.showModal(modal);
}

async function handleModalSubmit(interaction, client) {
    if (interaction.customId === 'purchase_ticket_modal') {
        await createPurchaseTicket(interaction, client);
        return;
    }

    if (interaction.customId === 'support_ticket_modal') {
        await createSupportTicket(interaction, client);
        return;
    }
}

async function createPurchaseTicket(interaction, client) {
    const productName = interaction.fields.getTextInputValue('product_name');
    const message = interaction.fields.getTextInputValue('message') || '';
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
            'purchase',
            null,
            productName
        );

        const embed = new EmbedBuilder()
            .setTitle('🛒 Purchase Ticket')
            .setColor(0x00AAFF)
            .setDescription(`**User:** <@${interaction.user.id}>\n**Product:** ${productName}\n**Message:** ${message || 'None'}`)
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

async function createSupportTicket(interaction, client) {
    const subject = interaction.fields.getTextInputValue('subject');
    const message = interaction.fields.getTextInputValue('message');
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

        const ticket = db.createTicket(
            interaction.guild.id,
            channel.id,
            interaction.user.id,
            'support'
        );

        const embed = new EmbedBuilder()
            .setTitle('❓ Support Ticket')
            .setColor(0xFFAA00)
            .setDescription(`**User:** <@${interaction.user.id}>\n**Subject:** ${subject}\n**Message:** ${message}`)
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

    if (!db.isServerAdmin(interaction.guild.id, interaction.user.id)) {
        return interaction.reply({ content: '❌ Only admins can claim tickets.', ephemeral: true });
    }

    db.claimTicket(ticket.ticket_id, interaction.user.id);

    await interaction.reply({ content: `✅ Ticket claimed by <@${interaction.user.id}>` });
}

async function closeTicket(interaction, client) {
    const ticket = db.getTicketByChannel(interaction.channel.id);
    if (!ticket) {
        return interaction.reply({ content: '❌ This is not a ticket channel.', ephemeral: true });
    }

    await sendTranscript(client, interaction.guild.id, interaction.channel, ticket);
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

client.once('ready', async () => {
    console.log(`✅ Logged in as ${client.user.tag}`);
    await registerCommands();
});

client.login(DISCORD_TOKEN);
