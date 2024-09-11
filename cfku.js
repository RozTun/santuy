const { Telegraf, Markup } = require('telegraf');
const axios = require('axios');

// Konfigurasi bot Telegram
const token = "7207051413:AAEXYMsygWdkSKrVh2TBX24fFk24-oD3Yzg"; // Ganti dengan token bot Telegram Anda
const bot = new Telegraf(token);

// Konfigurasi Cloudflare
const apiKey = "95913bd422604921a1ae64c79a262cc6f402d"; // API Key Cloudflare dari https://dash.cloudflare.com/profile/api-tokens
const domaincf = "premm.my.id"; // Domain utama yang digunakan (contoh: "example.com")
const iniemail = "ajanggaul9@gmail.com"; // Email yang terdaftar di akun Cloudflare Anda

// Pengaturan kontekstual bot
const userContext = {};
const adminIds = [5881666389, 987654321]; // Ganti dengan ID Telegram admin

// Fungsi untuk memvalidasi IP
const isValidIP = (ip) => {
    const regex = /^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    return regex.test(ip);
};

// Fungsi untuk mendapatkan Zone ID dari Cloudflare
const getZoneId = async (domain) => {
    const response = await axios.get(`https://api.cloudflare.com/client/v4/zones?name=${domain}&status=active`, {
        headers: {
            'X-Auth-Email': iniemail,
            'X-Auth-Key': apiKey,
            'Content-Type': 'application/json'
        }
    });

    if (response.data.result.length === 0) {
        throw new Error('Zone ID not found for the given domain');
    }

    return response.data.result[0].id;
};

// Fungsi untuk membuat DNS record baru di Cloudflare
const createDnsRecord = async (zoneId, domain, ip, proxied) => {
    const response = await axios.post(`https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records`, {
        type: 'A',
        name: domain,
        content: ip,
        proxied: proxied
    }, {
        headers: {
            'X-Auth-Email': iniemail,
            'X-Auth-Key': apiKey,
            'Content-Type': 'application/json'
        }
    });

    return response.data.result.id;
};

// Fungsi utama bot saat start
bot.start((ctx) => {
    if (!adminIds.includes(ctx.from.id)) {
        return ctx.reply('⚠️ *You are not authorized to use this bot.*', { parse_mode: 'Markdown' });
    }
    ctx.replyWithPhoto('https://github.com/AutoFTbot/AutoFTbot/raw/main/assets/programmer.gif', {
        caption: '𝘞𝘦𝘭𝘤𝘰𝘮𝘦! 𝘜𝘴𝘦 𝘵𝘩𝘦 𝘣𝘶𝘵𝘵𝘰𝘯𝘴 𝘣𝘦𝘭𝘰𝘸 𝘵𝘰 𝘢𝘥𝘥 𝘢 𝘯𝘦𝘸 𝘐𝘗 𝘰𝘳 𝘷𝘪𝘦𝘸 𝘋𝘕𝘚 𝘳𝘦𝘤𝘰𝘳𝘥𝘴.',
        ...Markup.inlineKeyboard([
            [Markup.button.callback('𝘗𝘖𝘐𝘕𝘛𝘐𝘕𝘎 𝘋𝘕𝘚', 'add_ip')],
            [Markup.button.callback('𝘓𝘪𝘴𝘵 𝘋𝘕𝘚 𝘙𝘦𝘤𝘰𝘳𝘥𝘴/𝘥𝘦𝘭𝘦𝘵𝘦', 'list_dns_records')]
        ]).resize()
    });
});

// Fungsi saat tombol add_ip diklik
bot.action('add_ip', (ctx) => {
    if (!adminIds.includes(ctx.from.id)) {
        return ctx.reply('⚠️ *You are not authorized to use this bot.*', { parse_mode: 'Markdown' });
    }
    userContext[ctx.from.id] = 'awaiting_ip';
    ctx.reply('⚠️ *Please send the IP address you want to register.*', { parse_mode: 'Markdown' });
});

// Fungsi untuk menangani input teks dari pengguna
bot.on('text', (ctx) => {
    const userId = ctx.from.id;
    const status = userContext[userId];

    // Handle input IP
    if (status === 'awaiting_ip') {
        const ip = ctx.message.text;
        if (!isValidIP(ip)) {
            return ctx.reply('⚠️ *Invalid IP address. Please send a valid IP address.*', { parse_mode: 'Markdown' });
        }
        userContext[userId] = { status: 'awaiting_subdomain', ip: ip };
        ctx.reply('⚠️ *Please send the subdomain you want to use (e.g., subdomain.example.com).*', { parse_mode: 'Markdown' });
    }

    // Handle input subdomain
    if (status?.status === 'awaiting_subdomain') {
        const subdomain = ctx.message.text;
        const ip = status.ip;
        userContext[userId] = { status: 'awaiting_proxied', ip: ip, subdomain: subdomain };
        ctx.reply('⚠️ *Do you want to enable proxy for this DNS record?*', {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
                [Markup.button.callback('Yes', 'proxied_true')],
                [Markup.button.callback('No', 'proxied_false')]
            ]).resize()
        });
    }
});

// Fungsi untuk mengaktifkan proxy
bot.action('proxied_true', (ctx) => {
    const userId = ctx.from.id;
    const userState = userContext[userId];

    if (userState && userState.status === 'awaiting_proxied') {
        const { ip, subdomain } = userState;
        createRecord(subdomain, ip, true).then((recordId) => {
            if (recordId) {
                ctx.reply(`✅ *Registration Successful*\n*VPS IP:* \`${ip}\`\n*Domain:* \`${subdomain}\`\n*Proxied:* \`true\``, { parse_mode: 'Markdown' });
            } else {
                ctx.reply('⚠️ *Failed to create DNS record.*', { parse_mode: 'Markdown' });
            }
            delete userContext[userId];
        }).catch((error) => {
            ctx.reply('⚠️ *Error occurred while processing your request.*', { parse_mode: 'Markdown' });
            delete userContext[userId];
        });
    }
});

// Fungsi untuk menonaktifkan proxy
bot.action('proxied_false', (ctx) => {
    const userId = ctx.from.id;
    const userState = userContext[userId];

    if (userState && userState.status === 'awaiting_proxied') {
        const { ip, subdomain } = userState;
        createRecord(subdomain, ip, false).then((recordId) => {
            if (recordId) {
                ctx.reply(`✅ *Registration Successful*\n*VPS IP:* \`${ip}\`\n*Domain:* \`${subdomain}\`\n*Proxied:* \`false\``, { parse_mode: 'Markdown' });
            } else {
                ctx.reply('⚠️ *Failed to create DNS record.*', { parse_mode: 'Markdown' });
            }
            delete userContext[userId];
        }).catch((error) => {
            ctx.reply('⚠️ *Error occurred while processing your request.*', { parse_mode: 'Markdown' });
            delete userContext[userId];
        });
    }
});

// Fungsi untuk melihat dan menghapus DNS record
bot.action('list_dns_records', async (ctx) => {
    if (!adminIds.includes(ctx.from.id)) {
        return ctx.reply('⚠️ *You are not authorized to use this bot.*', { parse_mode: 'Markdown' });
    }
    try {
        const zoneId = await getZoneId(domaincf);
        const response = await axios.get(`https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records`, {
            headers: {
                'X-Auth-Email': iniemail,
                'X-Auth-Key': apiKey,
                'Content-Type': 'application/json'
            }
        });

        const records = response.data.result;
        if (records.length === 0) {
            ctx.reply('No DNS records found.');
        } else {
            let message = '📝 *DNS Records List:*\n\n';
            records.forEach((record, index) => {
                message += `${index + 1}. *Subdomain:* \`${record.name}\`\n*Type:* \`${record.type}\`\n*Content:* \`${record.content}\`\n*Proxied:* \`${record.proxied}\`\n*Record ID:* \`${record.id}\`\n\n`;
            });
            message += 'To delete a record, use the command:\n\n`/delete_record <record_id>`';
            ctx.reply(message, { parse_mode: 'Markdown' });
        }
    } catch (error) {
        ctx.reply('⚠️ *Error fetching DNS records.*', { parse_mode: 'Markdown' });
    }
});

// Fungsi untuk menghapus DNS record berdasarkan ID
bot.command('delete_record', async (ctx) => {
    if (!adminIds.includes(ctx.from.id)) {
        return ctx.reply('⚠️ *You are not authorized to use this bot.*', { parse_mode: 'Markdown' });
    }

    const args = ctx.message.text.split(' ');
    if (args.length < 2) {
        return ctx.reply('⚠️ *Please provide a valid record ID.*\nExample: `/delete_record <record_id>`', { parse_mode: 'Markdown' });
    }

    const recordId = args[1];
    try {
        const zoneId = await getZoneId(domaincf);
        await axios.delete(`https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records/${recordId}`, {
            headers: {
                'X-Auth-Email': iniemail,
                'X-Auth-Key': apiKey,
                'Content-Type': 'application/json'
            }
        });

        ctx.reply(`✅ *Record with ID \`${recordId}\` has been deleted successfully.*`, { parse_mode: 'Markdown' });
    } catch (error) {
        ctx.reply('⚠️ *Failed to delete DNS record. Please check the record ID and try again.*', { parse_mode: 'Markdown' });
    }
});

// Fungsi untuk membuat record DNS
async function createRecord(subdomain, ip, proxied) {
    try {
        const zoneId = await getZoneId(domaincf);
        const recordId = await createDnsRecord(zoneId, subdomain, ip, proxied);
        return recordId;
    } catch (error) {
        console.error('Error creating DNS record:', error.message);
        return null;
    }
}

// Menjalankan bot
bot.launch()
    .then(() => console.log('🚀 Bot is running...'))
    .catch((error) => console.error('Error launching bot:', error));