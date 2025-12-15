const { Client, GatewayIntentBits, Collection, REST, Routes, SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, ChannelType, PermissionFlagsBits, StringSelectMenuBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');

// ========================
// Configuration (Hardcoded)
// ========================
const CLIENT_ID = '1447366056904491079';
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const LTC_ADDRESS = 'Lendcpxh1hrmCePoKiNx8otRksC1TG8T8H';
const LTC_QR_CODE_URL = 'https://cdn.discordapp.com/attachments/1444350061298323486/1447379141795123251/Screenshot_20241207-1859392.png';
const BOT_OWNER_ID = '1425207525166551261';
const BLOCKCYPHER_API_KEY = 'bf863a82813746c2ae97fcca1ba7f4a7';
const VOUCH_CHANNEL_ID = 'YOUR_VOUCH_CHANNEL_ID';

const CONFIRMATION_THRESHOLDS = {
    small: { maxAmount: 0.1, confirmations: 1 },
    medium: { maxAmount: 1, confirmations: 3 },
    large: { maxAmount: 10, confirmations: 6 },
    xlarge: { confirmations: 10 }
};

console.log("📦 Config loaded:", { 
    CLIENT_ID: "✓ Set",
    DISCORD_TOKEN: DISCORD_TOKEN ? "✓ Set" : "✗ Missing",
    LTC_ADDRESS: "✓ Set",
    BOT_OWNER_ID: "✓ Set"
});

if (!DISCORD_TOKEN) {
    console.error("❌ DISCORD_TOKEN missing! Add it to your .env file.");
    process.exit(1);
}

// ========================
// Auto-Generate Commands Folder
// ========================
const commandsPath = path.join(__dirname, 'commands');
const servicesPath = path.join(__dirname, 'services');

function createCommandsFolder() {
    console.log('📁 Creating commands folder and files...');
    
    if (!fs.existsSync(commandsPath)) {
        fs.mkdirSync(commandsPath, { recursive: true });
    }
    if (!fs.existsSync(servicesPath)) {
        fs.mkdirSync(servicesPath, { recursive: true });
    }

    // Products command
    const productsCmd = `const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../database');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('products')
        .setDescription('View all available products'),

    async execute(interaction, client) {
        const guildId = interaction.guild?.id;
        const products = db.getProducts(guildId);
        
        if (products.length === 0) {
            return interaction.reply({ content: '📦 No products available yet.', ephemeral: true });
        }

        const embed = new EmbedBuilder()
            .setTitle('🛒 Available Products')
            .setColor(0x00AAFF)
            .setTimestamp();

        for (const product of products) {
            embed.addFields({
                name: \`\${product.product_id} - \${product.name}\`,
                value: \`💰 \${product.ltc_price} LTC (\$\${product.usd_price || 'N/A'}) | 📦 Stock: \${product.stock}\\n\${product.description || 'No description'}\`,
                inline: false
            });
        }

        await interaction.reply({ embeds: [embed] });
    }
};`;

    // Buy command (shows sellers and products)
    const buyCmd = `const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const db = require('../database');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('buy')
        .setDescription('View available sellers and products to purchase'),

    async execute(interaction, client) {
        const guildId = interaction.guild?.id;
        if (!guildId) {
            return interaction.reply({ content: '❌ This command can only be used in a server.', ephemeral: true });
        }

        const sellers = db.getSellersWithProducts(guildId);
        
        if (sellers.length === 0) {
            return interaction.reply({ content: '📦 No products available at the moment.', ephemeral: true });
        }

        // Build embed for each seller with their products
        const embeds = [];
        
        for (const seller of sellers) {
            const products = db.getProductsBySeller(guildId, seller.user_id);
            if (products.length === 0) continue;

            let sellerUser;
            try {
                sellerUser = await client.users.fetch(seller.user_id);
            } catch {
                sellerUser = { username: 'Unknown Seller', id: seller.user_id };
            }

            const embed = new EmbedBuilder()
                .setTitle(\`🛒 \${sellerUser.username}\`)
                .setColor(0x00AAFF)
                .setDescription('Products available:');

            let productList = '';
            products.forEach((product, index) => {
                if (product.stock > 0) {
                    productList += \`**\${index + 1}.** \${product.name} - \$\${product.usd_price || product.ltc_price + ' LTC'}\\n\`;
                }
            });

            if (productList) {
                embed.addFields({ name: 'Products', value: productList });
            }

            embeds.push(embed);
        }

        if (embeds.length === 0) {
            return interaction.reply({ content: '📦 No products available at the moment.', ephemeral: true });
        }

        // Add purchase button
        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(\`start_purchase_\${guildId}\`)
                    .setLabel('🛒 Purchase')
                    .setStyle(ButtonStyle.Success)
            );

        await interaction.reply({ embeds: embeds, components: [row] });
    }
};`;

    // Orders command
    const ordersCmd = `const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../database');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('orders')
        .setDescription('View your order history'),

    async execute(interaction, client) {
        const orders = db.getOrdersByUser(interaction.user.id);

        if (orders.length === 0) {
            return interaction.reply({ content: '📋 You have no orders yet.', ephemeral: true });
        }

        const embed = new EmbedBuilder()
            .setTitle('📋 Your Orders')
            .setColor(0x00AAFF)
            .setTimestamp();

        for (const order of orders.slice(0, 10)) {
            const product = db.getProductById(order.product_id);
            const statusEmoji = {
                'pending': '⏳',
                'paid': '✅',
                'delivered': '📦',
                'refunded': '💸',
                'cancelled': '❌'
            }[order.status] || '❓';
            
            embed.addFields({
                name: \`\${statusEmoji} \${order.order_id}\`,
                value: \`Product: \${product ? product.name : 'Unknown'} | \$\${order.usd_amount || order.amount + ' LTC'} | Status: \${order.status}\`,
                inline: false
            });
        }

        await interaction.reply({ embeds: [embed], ephemeral: true });
    }
};`;

    // Add Product command (admin/seller only)
    const addProductCmd = `const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../database');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('addproduct')
        .setDescription('Add a new product (Admin/Seller only)')
        .addStringOption(option => option.setName('name').setDescription('Product name').setRequired(true))
        .addNumberOption(option => option.setName('usd_price').setDescription('Price in USD').setRequired(true))
        .addNumberOption(option => option.setName('ltc_price').setDescription('Price in LTC').setRequired(true))
        .addStringOption(option => option.setName('description').setDescription('Product description').setRequired(false))
        .addIntegerOption(option => option.setName('stock').setDescription('Initial stock').setRequired(false)),

    async execute(interaction, client) {
        const guildId = interaction.guild?.id;
        const isOwner = interaction.user.id === client.config.BOT_OWNER_ID;
        const isAdmin = guildId ? db.isServerAdmin(guildId, interaction.user.id) : false;

        if (!isOwner && !isAdmin) {
            return interaction.reply({ content: '❌ Only admins/sellers can add products.', ephemeral: true });
        }

        const name = interaction.options.getString('name');
        const usdPrice = interaction.options.getNumber('usd_price');
        const ltcPrice = interaction.options.getNumber('ltc_price');
        const description = interaction.options.getString('description') || '';
        const stock = interaction.options.getInteger('stock') || 0;

        const result = db.addProduct(name, description, ltcPrice, usdPrice, stock, null, guildId, interaction.user.id);

        const embed = new EmbedBuilder()
            .setTitle('✅ Product Added')
            .setColor(0x00FF00)
            .addFields(
                { name: 'Product ID', value: result.productId, inline: true },
                { name: 'Name', value: name, inline: true },
                { name: 'USD Price', value: \`\$\${usdPrice}\`, inline: true },
                { name: 'LTC Price', value: \`\${ltcPrice} LTC\`, inline: true },
                { name: 'Stock', value: \`\${stock}\`, inline: true }
            )
            .setTimestamp();

        console.log(\`📦 Product added: \${result.productId} - \${name} by \${interaction.user.id}\`);
        await interaction.reply({ embeds: [embed], ephemeral: true });
    }
};`;

    // Seller Update command
    const sellerUpdCmd = `const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../database');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('sellerupd')
        .setDescription('Update your seller LTC address and QR code (Admin/Seller only)')
        .addStringOption(option => option.setName('ltc_address').setDescription('Your LTC wallet address').setRequired(true))
        .addStringOption(option => option.setName('qr_url').setDescription('Your QR code image URL').setRequired(true)),

    async execute(interaction, client) {
        const guildId = interaction.guild?.id;
        const isOwner = interaction.user.id === client.config.BOT_OWNER_ID;
        const isAdmin = guildId ? db.isServerAdmin(guildId, interaction.user.id) : false;

        if (!isOwner && !isAdmin) {
            return interaction.reply({ content: '❌ Only admins/sellers can use this command.', ephemeral: true });
        }

        const ltcAddress = interaction.options.getString('ltc_address');
        const qrUrl = interaction.options.getString('qr_url');

        db.updateSellerConfig(guildId, interaction.user.id, { ltc_address: ltcAddress, ltc_qr_url: qrUrl });

        const embed = new EmbedBuilder()
            .setTitle('✅ Seller Config Updated')
            .setColor(0x00FF00)
            .addFields(
                { name: 'LTC Address', value: \`\\\`\${ltcAddress}\\\`\` },
                { name: 'QR Code', value: 'Updated ✅' }
            )
            .setImage(qrUrl)
            .setTimestamp();

        await interaction.reply({ embeds: [embed], ephemeral: true });
    }
};`;

    // Set Config command (expanded)
    const setConfigCmd = `const { SlashCommandBuilder, EmbedBuilder, ChannelType } = require('discord.js');
const db = require('../database');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('setconfig')
        .setDescription('Configure server settings (Owner/Admin only)')
        .addStringOption(option =>
            option.setName('setting')
                .setDescription('What to configure')
                .setRequired(true)
                .addChoices(
                    { name: 'LTC Address (Default)', value: 'ltc_address' },
                    { name: 'LTC QR URL (Default)', value: 'ltc_qr_url' },
                    { name: 'Vouch Channel', value: 'vouch_channel_id' },
                    { name: 'Log Channel', value: 'log_channel_id' },
                    { name: 'Ticket Category', value: 'ticket_category_id' },
                    { name: 'Ticket Message Channel', value: 'ticket_message_channel_id' },
                    { name: 'Support Category', value: 'support_category_id' }
                ))
        .addStringOption(option =>
            option.setName('value')
                .setDescription('The new value (channel ID, category ID, address, or URL)')
                .setRequired(true)),

    async execute(interaction, client) {
        const isOwner = interaction.user.id === client.config.BOT_OWNER_ID;
        const isAdmin = db.isServerAdmin(interaction.guild.id, interaction.user.id);

        if (!isOwner && !isAdmin) {
            return interaction.reply({ content: '❌ Only the bot owner or server admins can use this command.', ephemeral: true });
        }

        const setting = interaction.options.getString('setting');
        const value = interaction.options.getString('value');
        const guildId = interaction.guild.id;

        const config = {};
        config[setting] = value;

        db.upsertServerConfig(guildId, config);

        const settingNames = {
            'ltc_address': 'LTC Address',
            'ltc_qr_url': 'LTC QR URL',
            'vouch_channel_id': 'Vouch Channel',
            'log_channel_id': 'Log Channel',
            'ticket_category_id': 'Ticket Category',
            'ticket_message_channel_id': 'Ticket Message Channel',
            'support_category_id': 'Support Category'
        };

        const embed = new EmbedBuilder()
            .setTitle('⚙️ Server Config Updated')
            .setColor(0x00FF00)
            .addFields(
                { name: 'Setting', value: settingNames[setting], inline: true },
                { name: 'Value', value: setting.includes('channel') || setting.includes('category') ? \`<#\${value}>\` : \`\\\`\${value}\\\`\`, inline: true }
            )
            .setTimestamp();

        console.log(\`⚙️ Config updated for \${guildId}: \${setting} = \${value}\`);
        await interaction.reply({ embeds: [embed], ephemeral: true });
    }
};`;

    // Setup Tickets command
    const setupTicketsCmd = `const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const db = require('../database');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('setuptickets')
        .setDescription('Send the ticket panel to the configured channel (Owner/Admin only)'),

    async execute(interaction, client) {
        const isOwner = interaction.user.id === client.config.BOT_OWNER_ID;
        const isAdmin = db.isServerAdmin(interaction.guild.id, interaction.user.id);

        if (!isOwner && !isAdmin) {
            return interaction.reply({ content: '❌ Only the bot owner or server admins can use this command.', ephemeral: true });
        }

        const guildId = interaction.guild.id;
        const config = db.getServerConfig(guildId);

        if (!config?.ticket_message_channel_id) {
            return interaction.reply({ content: '❌ Please set the ticket message channel first using /setconfig', ephemeral: true });
        }

        if (!config?.ticket_category_id) {
            return interaction.reply({ content: '❌ Please set the ticket category first using /setconfig', ephemeral: true });
        }

        const channel = await interaction.guild.channels.fetch(config.ticket_message_channel_id).catch(() => null);
        if (!channel) {
            return interaction.reply({ content: '❌ Could not find the ticket message channel.', ephemeral: true });
        }

        const embed = new EmbedBuilder()
            .setTitle('🎁 Welcome!')
            .setColor(0x00AAFF)
            .setDescription(\`🎁 Hello! If you would like to purchase one of our product's please open a ticket below

🏷️ Our Product's are the **CHEAPEST** on the market.

✅ Please wait patiently until a seller responds to your ticket.

🛡️ Please check our vouches before opening a ticket.

⚠️ Please follow Discord ToS and guidelines.

*(By opening you are agreeing to our terms of service)*\`);

        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('open_purchase_ticket')
                    .setLabel('🛒 Purchase')
                    .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                    .setCustomId('open_support_ticket')
                    .setLabel('🎫 Support')
                    .setStyle(ButtonStyle.Primary)
            );

        await channel.send({ embeds: [embed], components: [row] });
        await interaction.reply({ content: '✅ Ticket panel sent!', ephemeral: true });
    }
};`;

    // Stock command
    const stockCmd = `const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../database');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('stock')
        .setDescription('View product stock (Owner/Admin only)'),

    async execute(interaction, client) {
        const guildId = interaction.guild?.id;
        const isOwner = interaction.user.id === client.config.BOT_OWNER_ID;
        const isAdmin = guildId ? db.isServerAdmin(guildId, interaction.user.id) : false;

        if (!isOwner && !isAdmin) {
            return interaction.reply({ content: '❌ Only the bot owner or server admins can view stock.', ephemeral: true });
        }

        const products = db.getProductsBySeller(guildId, interaction.user.id);

        if (products.length === 0) {
            return interaction.reply({ content: '📦 You have no products yet.', ephemeral: true });
        }

        const embed = new EmbedBuilder()
            .setTitle('📊 Your Stock Overview')
            .setColor(0x00AAFF)
            .setTimestamp();

        for (const product of products) {
            const keyCount = db.getProductKeyCount(product.product_id);
            embed.addFields({
                name: \`\${product.product_id} - \${product.name}\`,
                value: \`Stock: \${product.stock} | Keys Available: \${keyCount} | Price: \$\${product.usd_price}\`,
                inline: false
            });
        }

        await interaction.reply({ embeds: [embed], ephemeral: true });
    }
};`;

    // Add Key command
    const addKeyCmd = `const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../database');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('addkey')
        .setDescription('Add product keys (Admin/Seller only)')
        .addStringOption(option => option.setName('product_id').setDescription('Product ID (e.g., PROD-1234)').setRequired(true))
        .addStringOption(option => option.setName('keys').setDescription('Keys (comma-separated for multiple)').setRequired(true)),

    async execute(interaction, client) {
        const guildId = interaction.guild?.id;
        const isOwner = interaction.user.id === client.config.BOT_OWNER_ID;
        const isAdmin = guildId ? db.isServerAdmin(guildId, interaction.user.id) : false;

        if (!isOwner && !isAdmin) {
            return interaction.reply({ content: '❌ Only admins/sellers can add keys.', ephemeral: true });
        }

        const productId = interaction.options.getString('product_id').toUpperCase();
        const keysInput = interaction.options.getString('keys');

        const product = db.getProductById(productId, guildId);
        if (!product) {
            return interaction.reply({ content: '❌ Product not found.', ephemeral: true });
        }

        // Check if user owns this product
        if (product.seller_id !== interaction.user.id && !isOwner) {
            return interaction.reply({ content: '❌ You can only add keys to your own products.', ephemeral: true });
        }

        const keys = keysInput.split(',').map(k => k.trim()).filter(k => k.length > 0);
        let added = 0;

        for (const key of keys) {
            db.addProductKey(product.product_id, key);
            added++;
        }

        const newCount = db.getProductKeyCount(product.product_id);
        db.updateProductStock(product.product_id, newCount);

        const embed = new EmbedBuilder()
            .setTitle('🔑 Keys Added')
            .setColor(0x00FF00)
            .addFields(
                { name: 'Product', value: \`\${product.name} (\${product.product_id})\`, inline: true },
                { name: 'Keys Added', value: \`\${added}\`, inline: true },
                { name: 'New Stock', value: \`\${newCount}\`, inline: true }
            )
            .setTimestamp();

        console.log(\`🔑 Added \${added} keys to \${product.product_id}\`);
        await interaction.reply({ embeds: [embed], ephemeral: true });
    }
};`;

    // Add Admin command
    const addAdminCmd = `const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../database');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('addadmin')
        .setDescription('Add a server admin/seller (Owner only)')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('User to add as admin/seller')
                .setRequired(true)),

    async execute(interaction, client) {
        if (interaction.user.id !== client.config.BOT_OWNER_ID) {
            return interaction.reply({ content: '❌ Only the bot owner can add admins.', ephemeral: true });
        }

        const user = interaction.options.getUser('user');
        const guildId = interaction.guild.id;

        const added = db.addServerAdmin(guildId, user.id, interaction.user.id);

        if (!added) {
            return interaction.reply({ content: \`❌ \${user.tag} is already an admin.\`, ephemeral: true });
        }

        const embed = new EmbedBuilder()
            .setTitle('✅ Admin/Seller Added')
            .setColor(0x00FF00)
            .addFields(
                { name: 'User', value: \`\${user.tag} (\${user.id})\`, inline: true },
                { name: 'Server', value: interaction.guild.name, inline: true }
            )
            .setFooter({ text: 'They should use /sellerupd to set their LTC address' })
            .setTimestamp();

        console.log(\`👑 Admin added: \${user.tag} for server \${guildId}\`);
        await interaction.reply({ embeds: [embed], ephemeral: true });
    }
};`;

    // Remove Admin command
    const removeAdminCmd = `const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../database');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('removeadmin')
        .setDescription('Remove a server admin/seller (Owner only)')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('User to remove as admin/seller')
                .setRequired(true)),

    async execute(interaction, client) {
        if (interaction.user.id !== client.config.BOT_OWNER_ID) {
            return interaction.reply({ content: '❌ Only the bot owner can remove admins.', ephemeral: true });
        }

        const user = interaction.options.getUser('user');
        const guildId = interaction.guild.id;

        db.removeServerAdmin(guildId, user.id);

        const embed = new EmbedBuilder()
            .setTitle('✅ Admin/Seller Removed')
            .setColor(0xFF0000)
            .addFields(
                { name: 'User', value: \`\${user.tag} (\${user.id})\`, inline: true },
                { name: 'Server', value: interaction.guild.name, inline: true }
            )
            .setTimestamp();

        console.log(\`👑 Admin removed: \${user.tag} from server \${guildId}\`);
        await interaction.reply({ embeds: [embed], ephemeral: true });
    }
};`;

    // Server Config command
    const serverConfigCmd = `const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../database');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('serverconfig')
        .setDescription('View server configuration (Owner/Admin only)'),

    async execute(interaction, client) {
        const isOwner = interaction.user.id === client.config.BOT_OWNER_ID;
        const isAdmin = db.isServerAdmin(interaction.guild.id, interaction.user.id);

        if (!isOwner && !isAdmin) {
            return interaction.reply({ content: '❌ Only the bot owner or server admins can use this command.', ephemeral: true });
        }

        const guildId = interaction.guild.id;
        const config = db.getServerConfig(guildId);
        const admins = db.getServerAdmins(guildId);
        const products = db.getProducts(guildId);

        const embed = new EmbedBuilder()
            .setTitle('⚙️ Server Configuration')
            .setColor(0x00AAFF)
            .addFields(
                { name: '🆔 Server ID', value: guildId, inline: true },
                { name: '📦 Products', value: \`\${products.length}\`, inline: true },
                { name: '👑 Admins/Sellers', value: admins.length > 0 ? admins.map(a => \`<@\${a.user_id}>\`).join(', ') : 'None', inline: false }
            )
            .setTimestamp();

        if (config) {
            embed.addFields(
                { name: '💰 Default LTC Address', value: config.ltc_address || 'Not set', inline: true },
                { name: '📷 Default QR URL', value: config.ltc_qr_url ? 'Set ✅' : 'Not set', inline: true },
                { name: '⭐ Vouch Channel', value: config.vouch_channel_id ? \`<#\${config.vouch_channel_id}>\` : 'Not set', inline: true },
                { name: '📝 Log Channel', value: config.log_channel_id ? \`<#\${config.log_channel_id}>\` : 'Not set', inline: true },
                { name: '🎫 Ticket Category', value: config.ticket_category_id ? \`<#\${config.ticket_category_id}>\` : 'Not set', inline: true },
                { name: '📨 Ticket Message Channel', value: config.ticket_message_channel_id ? \`<#\${config.ticket_message_channel_id}>\` : 'Not set', inline: true },
                { name: '🎫 Support Category', value: config.support_category_id ? \`<#\${config.support_category_id}>\` : 'Not set', inline: true }
            );
        } else {
            embed.addFields({ name: '⚠️ Status', value: 'No configuration set. Use /setconfig to configure.' });
        }

        await interaction.reply({ embeds: [embed], ephemeral: true });
    }
};`;

    // (confirmorder command removed)

    // Help command
    const helpCmd = `const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../database');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('help')
        .setDescription('Show all available commands'),

    async execute(interaction, client) {
        const isOwner = interaction.user.id === client.config.BOT_OWNER_ID;
        const isAdmin = db.isServerAdmin(interaction.guild?.id, interaction.user.id);

        const embed = new EmbedBuilder()
            .setTitle('📚 Bot Commands')
            .setColor(0x00AAFF)
            .setDescription('Here are all available commands:')
            .addFields(
                { name: '🛒 Customer Commands', value: 
                    \`**/buy** - View sellers and products, start purchase
**/products** - View all available products
**/orders** - View your order history
**/help** - Show this help message\`
                }
            )
            .setTimestamp();

        if (isOwner || isAdmin) {
            embed.addFields(
                { name: '⚙️ Admin/Seller Commands', value: 
                    \`**/addproduct** - Add a new product
**/addkey** - Add product keys
**/stock** - View your product stock
**/sellerupd** - Update your LTC address and QR
**/setconfig** - Configure server settings
**/serverconfig** - View server configuration
**/setuptickets** - Send ticket panel\`
                }
            );
        }

        if (isOwner) {
            embed.addFields(
                { name: '👑 Owner Only', value: 
                    \`**/addadmin** - Add a server admin/seller
**/removeadmin** - Remove a server admin/seller\`
                }
            );
        }

        await interaction.reply({ embeds: [embed], ephemeral: true });
    }
};`;

    // Payment Checker service
    const paymentCheckerSvc = `const axios = require('axios');
const db = require('../database');

const CHECK_INTERVAL = 25000;
const ORDER_EXPIRY_MS = 30 * 60 * 1000;

module.exports = {
    start(client) {
        console.log('🔄 Payment checker started (25s interval)');
        this.checkPayments(client);
        setInterval(() => this.checkPayments(client), CHECK_INTERVAL);
    },

    async checkPayments(client) {
        try {
            const pending = db.prepare("SELECT * FROM orders WHERE status = 'pending' AND payment_method = 'ltc'").all();
            if (pending.length === 0) return;

            console.log(\`🔍 Checking \${pending.length} pending LTC order(s)...\`);
            
            for (const order of pending) {
                const orderAge = Date.now() - (order.created_at * 1000);
                if (orderAge > ORDER_EXPIRY_MS) {
                    console.log(\`⏰ Order \${order.order_id} expired\`);
                    db.updateOrderStatus(order.order_id, 'cancelled');
                    client.pendingOrders.delete(order.order_id);
                    
                    try {
                        const user = await client.users.fetch(order.user_id);
                        await user.send({
                            embeds: [{
                                color: 0xFF0000,
                                title: '⏰ Order Expired',
                                description: \`Your order **\${order.order_id}** has expired.\`,
                                timestamp: new Date().toISOString()
                            }]
                        });
                    } catch {}
                    continue;
                }

                await this.checkOrderPayment(client, order);
            }
        } catch (error) {
            console.error('❌ Payment check error:', error.message);
        }
    },

    async checkOrderPayment(client, order) {
        try {
            const response = await axios.get(\`https://api.blockcypher.com/v1/ltc/main/addrs/\${order.ltc_address}?token=\${client.config.BLOCKCYPHER_API_KEY}\`);
            const transactions = response.data.txrefs || [];

            for (const tx of transactions) {
                if (tx.tx_input_n === -1) {
                    const ltcValue = tx.value / 100000000;
                    const txTime = new Date(tx.confirmed || tx.received).getTime();
                    const orderTime = order.created_at * 1000;

                    if (txTime >= orderTime - 60000 && Math.abs(ltcValue - order.amount) < 0.0001) {
                        const existingTx = db.getTransactionByTxid(tx.tx_hash);
                        if (existingTx) continue;

                        console.log(\`💰 Payment detected for \${order.order_id}: \${ltcValue} LTC\`);
                        await this.processPayment(client, order, tx.tx_hash, ltcValue);
                        break;
                    }
                }
            }
        } catch (error) {
            if (error.response?.status !== 429) {
                console.error(\`❌ Error checking \${order.order_id}:\`, error.message);
            }
        }
    },

    async processPayment(client, order, txid, amount) {
        db.addTransaction(order.order_id, txid, amount);
        db.markOrderPaid(order.order_id, txid);
        client.pendingOrders.delete(order.order_id);

        const product = db.getProductById(order.product_id);
        const key = db.getAvailableKey(order.product_id);

        if (key) {
            db.markKeyUsed(key.id, order.user_id);
            db.updateProductStock(order.product_id, db.getProductKeyCount(order.product_id));
            db.markOrderDelivered(order.order_id, key.key_value);
        }

        try {
            const user = await client.users.fetch(order.user_id);
            const serverConfig = order.guild_id ? db.getServerConfig(order.guild_id) : null;
            const vouchChannelId = serverConfig?.vouch_channel_id || client.config.VOUCH_CHANNEL_ID;

            await user.send({
                embeds: [{
                    color: 0x00FF00,
                    title: '✅ Payment Confirmed!',
                    description: \`Your payment for **\${product?.name || 'your order'}** was confirmed!\`,
                    fields: [
                        { name: 'Order ID', value: order.order_id, inline: true },
                        { name: 'Amount', value: \`\${amount} LTC\`, inline: true }
                    ],
                    timestamp: new Date().toISOString()
                }]
            });

            if (key) {
                await user.send({
                    embeds: [{
                        color: 0x00AAFF,
                        title: '📦 Product Delivered!',
                        fields: [{ name: '🔑 Your Key', value: \`\\\`\\\`\\\`\${key.key_value}\\\`\\\`\\\`\` }]
                    }]
                });

                let sellerUsername = 'Seller';
                try {
                    const seller = await client.users.fetch(order.seller_id);
                    sellerUsername = seller.username;
                } catch {}

                await user.send({
                    embeds: [{
                        color: 0xFFD700,
                        title: '⭐ Thank You For Your Purchase!',
                        description: \`If you're satisfied, please vouch for us in <#\${vouchChannelId}>!\`,
                        fields: [
                            { name: '📝 Copy & Paste This:', value: \`\\\`+vouch \${sellerUsername} \${product?.name || 'Product'} \$\${order.usd_amount || amount}\\\`\` }
                        ],
                        footer: { text: 'Your feedback helps us grow!' }
                    }]
                });
                
                console.log(\`📦 Key delivered for order \${order.order_id}\`);
            }
        } catch (e) {
            console.error('❌ Could not notify user:', e.message);
        }
    }
};`;

    // Write all files
    fs.writeFileSync(path.join(commandsPath, 'products.js'), productsCmd);
    fs.writeFileSync(path.join(commandsPath, 'buy.js'), buyCmd);
    fs.writeFileSync(path.join(commandsPath, 'orders.js'), ordersCmd);
    fs.writeFileSync(path.join(commandsPath, 'addproduct.js'), addProductCmd);
    fs.writeFileSync(path.join(commandsPath, 'sellerupd.js'), sellerUpdCmd);
    fs.writeFileSync(path.join(commandsPath, 'setconfig.js'), setConfigCmd);
    fs.writeFileSync(path.join(commandsPath, 'setuptickets.js'), setupTicketsCmd);
    fs.writeFileSync(path.join(commandsPath, 'stock.js'), stockCmd);
    fs.writeFileSync(path.join(commandsPath, 'addkey.js'), addKeyCmd);
    fs.writeFileSync(path.join(commandsPath, 'addadmin.js'), addAdminCmd);
    fs.writeFileSync(path.join(commandsPath, 'removeadmin.js'), removeAdminCmd);
    fs.writeFileSync(path.join(commandsPath, 'serverconfig.js'), serverConfigCmd);
    fs.writeFileSync(path.join(commandsPath, 'help.js'), helpCmd);
    fs.writeFileSync(path.join(servicesPath, 'paymentChecker.js'), paymentCheckerSvc);

    console.log('✅ Created 13 command files + payment checker');
}

// Check if commands folder exists, if not create it
const commandFiles = fs.existsSync(commandsPath) ? fs.readdirSync(commandsPath).filter(f => f.endsWith('.js')) : [];
if (commandFiles.length === 0) {
    createCommandsFolder();
}

// ========================
// Initialize Database
// ========================
const db = require('./database');

// ========================
// Discord Client Setup
// ========================
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.MessageContent
    ]
});

client.config = {
    CLIENT_ID,
    DISCORD_TOKEN,
    LTC_ADDRESS,
    LTC_QR_CODE_URL,
    BOT_OWNER_ID,
    BLOCKCYPHER_API_KEY,
    VOUCH_CHANNEL_ID,
    CONFIRMATION_THRESHOLDS
};

client.commands = new Collection();
client.pendingProducts = new Map();
client.pendingOrders = new Map();
client.purchaseSessions = new Map();

// ========================
// Load Commands
// ========================
const loadedCommands = [];
const cmdFiles = fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'));

for (const file of cmdFiles) {
    const command = require(path.join(commandsPath, file));
    if ('data' in command && 'execute' in command) {
        client.commands.set(command.data.name, command);
        loadedCommands.push(command.data.toJSON());
        console.log(`📌 Loaded: /${command.data.name}`);
    }
}

// ========================
// Register Slash Commands
// ========================
async function registerCommands() {
    if (loadedCommands.length === 0) {
        console.log("⚠️ No commands to register.");
        return;
    }

    const rest = new REST().setToken(DISCORD_TOKEN);
    try {
        console.log('🔄 Registering slash commands...');
        await rest.put(Routes.applicationCommands(CLIENT_ID), { body: loadedCommands });
        console.log(`✅ Registered ${loadedCommands.length} slash commands!`);
    } catch (error) {
        console.error('❌ Failed to register commands:', error);
    }
}

// ========================
// Handle Interactions
// ========================
client.on('interactionCreate', async interaction => {
    // Handle slash commands
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
    
    // Handle button interactions
    if (interaction.isButton()) {
        await handleButtonInteraction(interaction, client);
    }

    // Handle modal submissions
    if (interaction.isModalSubmit()) {
        await handleModalSubmit(interaction, client);
    }

    // Handle select menu interactions
    if (interaction.isStringSelectMenu()) {
        await handleSelectMenu(interaction, client);
    }
});

// ========================
// Button Handler
// ========================
async function handleButtonInteraction(interaction, client) {
    const customId = interaction.customId;

    // Start Purchase from /buy command (DM flow)
    if (customId.startsWith('start_purchase_')) {
        const guildId = customId.replace('start_purchase_', '');
        await startDMPurchaseFlow(interaction, client, guildId);
        return;
    }

    // Open Purchase Ticket
    if (customId === 'open_purchase_ticket') {
        await showPurchaseModal(interaction);
        return;
    }

    // Open Support Ticket
    if (customId === 'open_support_ticket') {
        await showSupportModal(interaction);
        return;
    }

    // Ticket Close
    if (customId === 'ticket_close') {
        await closeTicket(interaction, client);
        return;
    }

    // Ticket Claim
    if (customId === 'ticket_claim') {
        await claimTicket(interaction, client);
        return;
    }

    // Check order status
    if (customId.startsWith('check_')) {
        const orderId = customId.replace('check_', '');
        const order = db.getOrderById(orderId);
        if (!order) {
            const errorEmbed = new EmbedBuilder()
                .setTitle('❌ Error')
                .setColor(0xFF0000)
                .setDescription('Order not found.');
            return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
        }
        
        const statusEmoji = {
            'pending': '⏳',
            'paid': '✅',
            'delivered': '📦',
            'refunded': '💸',
            'cancelled': '❌'
        }[order.status] || '❓';
        
        const statusEmbed = new EmbedBuilder()
            .setTitle(`${statusEmoji} Order Status`)
            .setColor(order.status === 'delivered' ? 0x00FF00 : order.status === 'pending' ? 0xFFAA00 : 0xFF0000)
            .addFields(
                { name: 'Order ID', value: orderId, inline: true },
                { name: 'Status', value: order.status.toUpperCase(), inline: true }
            )
            .setTimestamp();
        
        await interaction.reply({ embeds: [statusEmbed], ephemeral: true });
        return;
    }

    // Cancel order
    if (customId.startsWith('cancel_')) {
        const orderId = customId.replace('cancel_', '');
        const order = db.getOrderById(orderId);
        if (!order) {
            const errorEmbed = new EmbedBuilder()
                .setTitle('❌ Error')
                .setColor(0xFF0000)
                .setDescription('Order not found.');
            return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
        }
        
        if (order.user_id !== interaction.user.id) {
            const errorEmbed = new EmbedBuilder()
                .setTitle('❌ Error')
                .setColor(0xFF0000)
                .setDescription('This is not your order.');
            return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
        }
        
        if (order.status !== 'pending') {
            const errorEmbed = new EmbedBuilder()
                .setTitle('❌ Error')
                .setColor(0xFF0000)
                .setDescription(`Cannot cancel order with status: ${order.status}`);
            return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
        }
        
        db.updateOrderStatus(orderId, 'cancelled');
        client.pendingOrders.delete(orderId);
        
        const cancelEmbed = new EmbedBuilder()
            .setTitle('✅ Order Cancelled')
            .setColor(0x00FF00)
            .setDescription(`Order **${orderId}** has been cancelled.`)
            .setTimestamp();
        
        await interaction.reply({ embeds: [cancelEmbed], ephemeral: true });
        return;
    }

    // Confirm purchase in DM/ticket
    if (customId.startsWith('confirm_purchase_')) {
        await confirmPurchase(interaction, client, customId);
        return;
    }

    // Decline purchase
    if (customId.startsWith('decline_purchase_')) {
        const declineEmbed = new EmbedBuilder()
            .setTitle('❌ Purchase Cancelled')
            .setColor(0xFF0000)
            .setDescription('Your purchase has been cancelled.')
            .setTimestamp();
        await interaction.reply({ embeds: [declineEmbed], ephemeral: true });
        return;
    }
}

// ========================
// DM Purchase Flow
// ========================
async function startDMPurchaseFlow(interaction, client, guildId) {
    const sellers = db.getSellersWithProducts(guildId);
    
    if (sellers.length === 0) {
        const errorEmbed = new EmbedBuilder()
            .setTitle('❌ No Sellers Available')
            .setColor(0xFF0000)
            .setDescription('There are no sellers with products available at the moment.');
        return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
    }

    // If only one seller, skip seller selection
    if (sellers.length === 1) {
        await showProductSelection(interaction, client, guildId, sellers[0].user_id);
        return;
    }

    // Show seller selection
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
        const errorEmbed = new EmbedBuilder()
            .setTitle('❌ No Products Available')
            .setColor(0xFF0000)
            .setDescription('No products available from this seller.');
        return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
    }

    let sellerUser;
    try {
        sellerUser = await client.users.fetch(sellerId);
    } catch {
        sellerUser = { username: 'Unknown Seller' };
    }

    const options = products.map((product, index) => ({
        label: `${index + 1}. ${product.name}`,
        description: `$${product.usd_price || product.ltc_price + ' LTC'}`,
        value: `${guildId}_${sellerId}_${product.product_id}`
    }));

    const row = new ActionRowBuilder()
        .addComponents(
            new StringSelectMenuBuilder()
                .setCustomId('select_product')
                .setPlaceholder('Please provide the product number')
                .addOptions(options)
        );

    const embed = new EmbedBuilder()
        .setTitle(`🛒 ${sellerUser.username}'s Products`)
        .setColor(0x00AAFF)
        .setDescription('Please provide the product number:');

    let productList = '';
    products.forEach((product, index) => {
        productList += `**${index + 1}.** ${product.name} - $${product.usd_price || product.ltc_price + ' LTC'}\n`;
    });
    embed.addFields({ name: 'Available Products', value: productList });

    if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ embeds: [embed], components: [row], ephemeral: true });
    } else {
        await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
    }
}

// ========================
// Select Menu Handler
// ========================
async function handleSelectMenu(interaction, client) {
    const customId = interaction.customId;

    // Seller selection
    if (customId.startsWith('select_seller_')) {
        const guildId = customId.replace('select_seller_', '');
        const sellerId = interaction.values[0];
        await showProductSelection(interaction, client, guildId, sellerId);
        return;
    }

    // Product selection
    if (customId === 'select_product') {
        const [guildId, sellerId, productId] = interaction.values[0].split('_');
        await showPurchaseConfirmation(interaction, client, guildId, sellerId, productId);
        return;
    }
}

async function showPurchaseConfirmation(interaction, client, guildId, sellerId, productId) {
    const product = db.getProductById(productId, guildId);
    if (!product || product.stock <= 0) {
        const errorEmbed = new EmbedBuilder()
            .setTitle('❌ Error')
            .setColor(0xFF0000)
            .setDescription('Product not found or out of stock.');
        return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
    }

    const embed = new EmbedBuilder()
        .setTitle('🛒 Confirm Purchase')
        .setColor(0xFFAA00)
        .setDescription(`Confirm the purchase of **${product.name}** for **$${product.usd_price || product.ltc_price + ' LTC'}**?`)
        .addFields(
            { name: 'Product', value: product.name, inline: true },
            { name: 'Price', value: `$${product.usd_price || 'N/A'}`, inline: true },
            { name: 'LTC Price', value: `${product.ltc_price} LTC`, inline: true }
        )
        .setFooter({ text: 'Click Confirm to proceed or Decline to cancel' });

    const row = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId(`confirm_purchase_${guildId}_${sellerId}_${productId}`)
                .setLabel('Confirm')
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
                .setCustomId(`decline_purchase_${guildId}_${sellerId}_${productId}`)
                .setLabel('Decline')
                .setStyle(ButtonStyle.Danger)
        );

    await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
}

async function confirmPurchase(interaction, client, customId) {
    const parts = customId.replace('confirm_purchase_', '').split('_');
    const guildId = parts[0];
    const sellerId = parts[1];
    const productId = parts.slice(2).join('_');

    const product = db.getProductById(productId, guildId);
    if (!product || product.stock <= 0) {
        const errorEmbed = new EmbedBuilder()
            .setTitle('❌ Error')
            .setColor(0xFF0000)
            .setDescription('Product not found or out of stock.');
        return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
    }

    // Get seller's LTC info
    const seller = db.getSeller(guildId, sellerId);
    const serverConfig = db.getServerConfig(guildId);
    
    const ltcAddress = seller?.ltc_address || serverConfig?.ltc_address || client.config.LTC_ADDRESS;
    const ltcQrUrl = seller?.ltc_qr_url || serverConfig?.ltc_qr_url || client.config.LTC_QR_CODE_URL;

    // Check if in ticket channel
    const ticket = db.getTicketByChannelId(interaction.channel?.id);
    const ticketChannelId = ticket ? interaction.channel.id : null;
    const isInTicket = !!ticket;

    // Create order
    const result = db.createOrder(
        interaction.user.id,
        product.product_id,
        ltcAddress,
        product.ltc_price,
        product.usd_price,
        'ltc',
        null,
        guildId,
        sellerId,
        ticketChannelId
    );

    // Add to pending orders
    client.pendingOrders.set(result.orderId, {
        orderId: result.orderId,
        userId: interaction.user.id,
        productId: product.product_id,
        ltcAddress: ltcAddress,
        amount: product.ltc_price,
        usdAmount: product.usd_price,
        sellerId: sellerId,
        guildId: guildId,
        ticketChannelId: ticketChannelId,
        createdAt: Date.now()
    });

    const paymentEmbed = new EmbedBuilder()
        .setTitle('⏳ Waiting for Transaction')
        .setColor(0xF7931A)
        .setDescription('When the payment is confirmed, the product will be delivered. Please be patient.')
        .addFields(
            { name: '📦 Order ID', value: result.orderId, inline: true },
            { name: '💰 Amount', value: `$${product.usd_price || 'N/A'} (${product.ltc_price} LTC)`, inline: true },
            { name: '📬 Send LTC to:', value: `\`${ltcAddress}\`` },
            { name: '⏱️ Expires', value: '30 minutes', inline: true }
        )
        .setImage(ltcQrUrl)
        .setFooter({ text: 'Payment will be detected automatically' })
        .setTimestamp();

    const row = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId(`check_${result.orderId}`)
                .setLabel('Check Status')
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId(`cancel_${result.orderId}`)
                .setLabel('Cancel Order')
                .setStyle(ButtonStyle.Danger)
        );

    // If in ticket channel, show payment in channel
    // If NOT in ticket channel, DM the payment info
    if (isInTicket) {
        await interaction.reply({ embeds: [paymentEmbed], components: [row] });
    } else {
        // Send acknowledgment in channel
        const ackEmbed = new EmbedBuilder()
            .setTitle('✅ Order Created')
            .setColor(0x00FF00)
            .setDescription('Check your DMs for payment instructions!')
            .addFields(
                { name: 'Order ID', value: result.orderId, inline: true },
                { name: 'Product', value: product.name, inline: true }
            )
            .setTimestamp();
        
        await interaction.reply({ embeds: [ackEmbed], ephemeral: true });

        // DM the payment info
        try {
            const user = await client.users.fetch(interaction.user.id);
            await user.send({ embeds: [paymentEmbed], components: [row] });
        } catch (e) {
            console.error('Could not DM user:', e.message);
            // Fallback: edit original reply to show payment
            const errorEmbed = new EmbedBuilder()
                .setTitle('⚠️ Could not send DM')
                .setColor(0xFFAA00)
                .setDescription('Please enable DMs from server members to receive payment instructions.');
            await interaction.followUp({ embeds: [errorEmbed, paymentEmbed], components: [row], ephemeral: true });
        }
    }
}

// ========================
// Ticket System
// ========================
async function showPurchaseModal(interaction) {
    const modal = new ModalBuilder()
        .setCustomId('purchase_ticket_modal')
        .setTitle('🛒 Purchase Ticket');

    const productInput = new TextInputBuilder()
        .setCustomId('product_name')
        .setLabel('What Product are you buying?')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

    const paymentInput = new TextInputBuilder()
        .setCustomId('payment_method')
        .setLabel('What is your payment method?')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('LTC')
        .setRequired(true);

    const acknowledgeInput = new TextInputBuilder()
        .setCustomId('acknowledge')
        .setLabel('Do you acknowledge you are going first?')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Yes/No')
        .setRequired(true);

    modal.addComponents(
        new ActionRowBuilder().addComponents(productInput),
        new ActionRowBuilder().addComponents(paymentInput),
        new ActionRowBuilder().addComponents(acknowledgeInput)
    );

    await interaction.showModal(modal);
}

async function showSupportModal(interaction) {
    const modal = new ModalBuilder()
        .setCustomId('support_ticket_modal')
        .setTitle('🎫 Support Ticket');

    const issueInput = new TextInputBuilder()
        .setCustomId('issue')
        .setLabel('What do you need support with?')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true);

    modal.addComponents(
        new ActionRowBuilder().addComponents(issueInput)
    );

    await interaction.showModal(modal);
}

async function handleModalSubmit(interaction, client) {
    const customId = interaction.customId;

    if (customId === 'purchase_ticket_modal') {
        await createPurchaseTicket(interaction, client);
        return;
    }

    if (customId === 'support_ticket_modal') {
        await createSupportTicket(interaction, client);
        return;
    }
}

async function createPurchaseTicket(interaction, client) {
    const productName = interaction.fields.getTextInputValue('product_name');
    const paymentMethod = interaction.fields.getTextInputValue('payment_method');
    const acknowledge = interaction.fields.getTextInputValue('acknowledge');

    const guildId = interaction.guild.id;
    const config = db.getServerConfig(guildId);

    if (!config?.ticket_category_id) {
        const errorEmbed = new EmbedBuilder()
            .setTitle('❌ Error')
            .setColor(0xFF0000)
            .setDescription('Ticket system not configured. Please ask an admin to set it up.');
        return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
    }

    // Create ticket channel
    const ticketChannel = await interaction.guild.channels.create({
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

    // Save ticket to DB
    const ticketResult = db.createTicket(guildId, ticketChannel.id, interaction.user.id, 'purchase', null, productName, paymentMethod, acknowledge.toLowerCase() === 'yes' ? 1 : 0);

    // Send welcome message
    const embed = new EmbedBuilder()
        .setTitle('🛒 Purchase Ticket')
        .setColor(0x00AAFF)
        .setDescription(`Hello <@${interaction.user.id}>! Please wait for the owner to respond to your ticket. Thanks, after the deal is finished don't forget to vouch!!`)
        .addFields(
            { name: 'What are you trying to buy?', value: productName },
            { name: 'Do you have any form of crypto?', value: paymentMethod },
            { name: 'Do you acknowledge that you are going first?', value: acknowledge }
        )
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

    await ticketChannel.send({ content: `<@${interaction.user.id}>`, embeds: [embed], components: [row] });

    // Now show sellers and products in the ticket
    const sellers = db.getSellersWithProducts(guildId);
    if (sellers.length > 0) {
        const productEmbeds = [];
        
        for (const seller of sellers) {
            const products = db.getProductsBySeller(guildId, seller.user_id);
            if (products.length === 0) continue;

            let sellerUser;
            try {
                sellerUser = await client.users.fetch(seller.user_id);
            } catch {
                sellerUser = { username: 'Unknown Seller' };
            }

            const sellerEmbed = new EmbedBuilder()
                .setTitle(`🛒 ${sellerUser.username}`)
                .setColor(0x00AAFF);

            let productList = '';
            products.forEach((product, index) => {
                if (product.stock > 0) {
                    productList += `**${index + 1}.** ${product.name} - $${product.usd_price || product.ltc_price + ' LTC'}\n`;
                }
            });

            if (productList) {
                sellerEmbed.addFields({ name: 'Products', value: productList });
                productEmbeds.push(sellerEmbed);
            }
        }

        if (productEmbeds.length > 0) {
            const buyRow = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`start_purchase_${guildId}`)
                        .setLabel('🛒 Purchase')
                        .setStyle(ButtonStyle.Success)
                );

            await ticketChannel.send({ embeds: productEmbeds, components: [buyRow] });
        }
    }

    const successEmbed = new EmbedBuilder()
        .setTitle('✅ Ticket Created')
        .setColor(0x00FF00)
        .setDescription(`Your ticket has been created! <#${ticketChannel.id}>`)
        .setTimestamp();
    await interaction.reply({ embeds: [successEmbed], ephemeral: true });
}

async function createSupportTicket(interaction, client) {
    const issue = interaction.fields.getTextInputValue('issue');

    const guildId = interaction.guild.id;
    const config = db.getServerConfig(guildId);

    const categoryId = config?.support_category_id || config?.ticket_category_id;
    if (!categoryId) {
        const errorEmbed = new EmbedBuilder()
            .setTitle('❌ Error')
            .setColor(0xFF0000)
            .setDescription('Ticket system not configured. Please ask an admin to set it up.');
        return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
    }

    // Create ticket channel
    const ticketChannel = await interaction.guild.channels.create({
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

    // Save ticket to DB
    db.createTicket(guildId, ticketChannel.id, interaction.user.id, 'support');

    // Send welcome message
    const embed = new EmbedBuilder()
        .setTitle('🎫 Support Ticket')
        .setColor(0x00AAFF)
        .setDescription(`Welcome <@${interaction.user.id}>! Please wait for a staff member to get to your ticket.`)
        .addFields(
            { name: 'What do you need support with?', value: issue }
        )
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

    await ticketChannel.send({ content: `<@${interaction.user.id}>`, embeds: [embed], components: [row] });

    const successEmbed = new EmbedBuilder()
        .setTitle('✅ Ticket Created')
        .setColor(0x00FF00)
        .setDescription(`Your support ticket has been created! <#${ticketChannel.id}>`)
        .setTimestamp();
    await interaction.reply({ embeds: [successEmbed], ephemeral: true });
}

async function closeTicket(interaction, client) {
    const ticket = db.getTicketByChannelId(interaction.channel.id);
    if (!ticket) {
        const errorEmbed = new EmbedBuilder()
            .setTitle('❌ Error')
            .setColor(0xFF0000)
            .setDescription('This is not a ticket channel.');
        return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
    }

    db.updateTicketStatus(ticket.ticket_id, 'closed');

    const closeEmbed = new EmbedBuilder()
        .setTitle('🔒 Ticket Closing')
        .setColor(0xFF0000)
        .setDescription('This ticket will be closed in 5 seconds...')
        .setTimestamp();
    
    await interaction.reply({ embeds: [closeEmbed] });
    
    setTimeout(async () => {
        try {
            await interaction.channel.delete();
        } catch (e) {
            console.error('Could not delete ticket channel:', e.message);
        }
    }, 5000);
}

async function claimTicket(interaction, client) {
    const guildId = interaction.guild.id;
    const isOwner = interaction.user.id === client.config.BOT_OWNER_ID;
    const isAdmin = db.isServerAdmin(guildId, interaction.user.id);

    if (!isOwner && !isAdmin) {
        const errorEmbed = new EmbedBuilder()
            .setTitle('❌ Permission Denied')
            .setColor(0xFF0000)
            .setDescription('Only admins can claim tickets.');
        return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
    }

    const ticket = db.getTicketByChannelId(interaction.channel.id);
    if (!ticket) {
        const errorEmbed = new EmbedBuilder()
            .setTitle('❌ Error')
            .setColor(0xFF0000)
            .setDescription('This is not a ticket channel.');
        return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
    }

    if (ticket.claimed_by) {
        const errorEmbed = new EmbedBuilder()
            .setTitle('❌ Already Claimed')
            .setColor(0xFF0000)
            .setDescription(`This ticket has already been claimed by <@${ticket.claimed_by}>`);
        return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
    }

    db.claimTicket(ticket.ticket_id, interaction.user.id);

    const embed = new EmbedBuilder()
        .setTitle('✅ Ticket Claimed')
        .setColor(0x00FF00)
        .setDescription(`This ticket has been claimed by <@${interaction.user.id}>`)
        .setTimestamp();

    await interaction.reply({ embeds: [embed] });
}

// ========================
// DM Message Handler (for purchase flow in DMs)
// ========================
client.on('messageCreate', async message => {
    if (message.author.bot) return;
    if (!message.channel.isDMBased()) return;

    const session = db.getPurchaseSession(message.author.id, message.channel.id);
    // DM purchase flow handled via buttons, no text-based flow needed
});

// ========================
// Bot Ready
// ========================
client.once('ready', async () => {
    console.log(`\n========================================`);
    console.log(`✅ Logged in as ${client.user.tag}`);
    console.log(`📊 Serving ${client.guilds.cache.size} server(s)`);
    console.log(`========================================\n`);

    await registerCommands();

    // Start payment checker
    const paymentChecker = require('./services/paymentChecker');
    paymentChecker.start(client);

    // Load pending orders
    const pending = db.prepare("SELECT * FROM orders WHERE status = 'pending'").all();
    for (const order of pending) {
        client.pendingOrders.set(order.order_id, order);
    }
    console.log(`📋 Loaded ${pending.length} pending orders`);
});

// ========================
// Error Handling
// ========================
client.on('error', e => console.error('❌ Client error:', e));
process.on('unhandledRejection', e => console.error('❌ Unhandled rejection:', e));

// ========================
// Start Bot
// ========================
client.login(DISCORD_TOKEN);
