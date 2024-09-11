const { Telegraf, Markup } = require('telegraf');
const axios = require('axios');

// Token bot Telegram
const token = "7320681062:AAHRwmsQqXV5CozXtyhIFDfqQcw0EywY278"; // Ganti dengan token bot Anda
const bot = new Telegraf(token);

// API Key Cloudflare
const apiKey = "95913bd422604921a1ae64c79a262cc6f402d"; // https://dash.cloudflare.com/profile/api-tokens
const iniemail = "ajanggaul9@gmail.com"; // Email Cloudflare Anda
const domainscf = ["rozstore.my.id", "premm.my.id"]; // Daftar domain yang digunakan

// Daftar admin yang diizinkan mengakses bot
const adminIds = [5881666389, 987654321]; // Ganti dengan user_id admin yang diizinkan

const userContext = {};

// Fungsi untuk mendapatkan Zone ID dari Cloudflare berdasarkan domain
const getZoneId = async (domain) => {
    const response = await axios.get(`https://api.cloudflare.com/client/v4/zones?name=${domain}&status=active`, {
        headers: {
            'X-Auth-Email': iniemail,
            'X-Auth-Key': apiKey,
            'Content-Type': 'application/json'
        }
    });

    if (response.data.result.length === 0) {
        throw new Error(`Zone ID tidak ditemukan untuk domain ${domain}`);
    }

    return response.data.result[0].id;
};

// Fungsi untuk mendapatkan Record ID dari Cloudflare berdasarkan Zone ID dan domain
const getRecordId = async (zoneId, domain) => {
    const response = await axios.get(`https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records?name=${domain}`, {
        headers: {
            'X-Auth-Email': iniemail,
            'X-Auth-Key': apiKey,
            'Content-Type': 'application/json'
        }
    });

    return response.data.result[0]?.id;
};

// Fungsi untuk mengecek keberadaan record berdasarkan IP
const getRecordByIp = async (zoneId, ip) => {
    const response = await axios.get(`https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records?content=${ip}`, {
        headers: {
            'X-Auth-Email': iniemail,
            'X-Auth-Key': apiKey,
            'Content-Type': 'application/json'
        }
    });

    return response.data.result.length > 0;
};

// Fungsi untuk membuat DNS record baru
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

// Fungsi untuk memperbarui DNS record yang ada
const updateDnsRecord = async (zoneId, recordId, domain, ip, proxied) => {
    const response = await axios.put(`https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records/${recordId}`, {
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

    if (response.data.success) {
        console.log(`DNS record diperbarui: ${domain} -> ${ip}`);
        return response.data.result.id;
    } else {
        console.error('Gagal memperbarui DNS record:', response.data.errors);
        return null;
    }
};

// Fungsi untuk menghapus DNS record
const deleteDnsRecord = async (zoneId, recordId) => {
    const response = await axios.delete(`https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records/${recordId}`, {
        headers: {
            'X-Auth-Email': iniemail,
            'X-Auth-Key': apiKey,
            'Content-Type': 'application/json'
        }
    });

    if (response.data.success) {
        console.log(`DNS record dihapus: ${recordId}`);
        return true;
    } else {
        console.error('Gagal menghapus DNS record:', response.data.errors);
        return false;
    }
};

// Fungsi untuk membuat atau memperbarui DNS record
const createRecord = async (domain, ip, proxied) => {
    try {
        const zoneId = await getZoneId(domain);
        const recordExists = await getRecordByIp(zoneId, ip);
        if (recordExists) {
            throw new Error('DNS record dengan IP yang sama sudah ada');
        }

        let recordId = await getRecordId(zoneId, domain);

        if (!recordId) {
            recordId = await createDnsRecord(zoneId, domain, ip, proxied);
        }

        return await updateDnsRecord(zoneId, recordId, domain, ip, proxied);
    } catch (error) {
        if (error.response) {
            console.error('Kesalahan dalam membuat/memperbarui DNS record:', error.response.data);
        } else {
            console.error('Kesalahan dalam membuat/memperbarui DNS record:', error.message);
        }
        return null;
    }
};

// Fungsi untuk memeriksa apakah pengguna adalah admin
const isAdmin = (userId) => {
    return adminIds.includes(userId);
};

// Memulai bot dan menampilkan menu utama
bot.start((ctx) => {
    if (!isAdmin(ctx.from.id)) {
        return ctx.reply('⚠️ Anda tidak memiliki izin untuk menggunakan bot ini.');
    }
    ctx.replyWithPhoto('https://github.com/AutoFTbot/AutoFTbot/raw/main/assets/programmer.gif', {
        caption: 'Selamat Datang! Gunakan tombol di bawah untuk menambah IP baru atau melihat record DNS.',
        ...Markup.inlineKeyboard([
            [Markup.button.callback('Pointing DNS', 'add_ip')],
            [Markup.button.callback('Daftar Rekor DNS/Hapus', 'list_dns_records')]
        ]).resize()
    });
});

// Memproses permintaan penambahan IP
bot.action('add_ip', (ctx) => {
    if (!isAdmin(ctx.from.id)) {
        return ctx.reply('⚠️ Anda tidak memiliki izin untuk menggunakan bot ini.');
    }
    userContext[ctx.from.id] = 'menunggu_ip';
    ctx.reply('⚠️ *Silakan kirimkan IP yang akan didaftarkan.*', { parse_mode: 'Markdown' });
});

// Handler untuk input teks dari pengguna
bot.on('text', (ctx) => {
    if (!isAdmin(ctx.from.id)) {
        return ctx.reply('⚠️ Anda tidak memiliki izin untuk menggunakan bot ini.');
    }
    const userId = ctx.from.id;
    const status = userContext[userId];

    if (status === 'menunggu_ip') {
        const ip = ctx.message.text;
        userContext[userId] = { status: 'memilih_domain', ip: ip };

        // Menampilkan pilihan domain yang ada
        const buttons = domainscf.map((domain, index) => [
            Markup.button.callback(`Domain ${index + 1}: ${domain}`, `select_domain_${index}`)
        ]);

        ctx.reply(
            '⚠️ *Pilih domain yang akan digunakan:*',
            Markup.inlineKeyboard(buttons).resize()
        );
    }
});

// Handler untuk domain yang dipilih
bot.action(/select_domain_(\d+)/, (ctx) => {
    if (!isAdmin(ctx.from.id)) {
        return ctx.reply('⚠️ Anda tidak memiliki izin untuk menggunakan bot ini.');
    }

    const userId = ctx.from.id;
    const index = parseInt(ctx.match[1], 10);
    const domain = domainscf[index];

    if (domain) {
        const userState = userContext[userId];
        userState.domain = domain; // Simpan domain yang dipilih
        userState.status = 'menunggu_proxied';
        ctx.reply(`⚠️ *Anda memilih domain: ${domain}*\nApakah ingin mengaktifkan proxy untuk DNS record ini?`, {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
                [Markup.button.callback('Ya', 'proxy_enabled')],
                [Markup.button.callback('Tidak', 'proxy_disabled')]
            ]).resize()
        });
    } else {
        ctx.reply('⚠️ Domain tidak ditemukan.');
    }
});

// Mengaktifkan proxy untuk DNS record
bot.action('proxy_enabled', (ctx) => {
    if (!isAdmin(ctx.from.id)) {
        return ctx.reply('⚠️ Anda tidak memiliki izin untuk menggunakan bot ini.');
    }
    const userId = ctx.from.id;
    const userState = userContext[userId];

    if (userState && userState.status === 'menunggu_proxied') {
        const ip = userState.ip;
        const domain = userState.domain;
        createRecord(domain, ip, true).then((recordId) => {
            if (recordId) {
                ctx.reply(`✅ *Pendaftaran Berhasil*\n*IP VPS:* \`${ip}\`\n*Domain:* \`${domain}\`\n*Proxied:* \`true\``, { parse_mode: 'Markdown' });
                } else {
                ctx.reply('❌ Gagal mendaftarkan IP.');
            }
        }).catch((error) => {
            console.error('Kesalahan saat menambahkan DNS record:', error);
            ctx.reply('❌ Terjadi kesalahan saat menambahkan DNS record.');
        });
    }
});

// Menonaktifkan proxy untuk DNS record
bot.action('proxy_disabled', (ctx) => {
    if (!isAdmin(ctx.from.id)) {
        return ctx.reply('⚠️ Anda tidak memiliki izin untuk menggunakan bot ini.');
    }
    const userId = ctx.from.id;
    const userState = userContext[userId];

    if (userState && userState.status === 'menunggu_proxied') {
        const ip = userState.ip;
        const domain = userState.domain;
        createRecord(domain, ip, false).then((recordId) => {
            if (recordId) {
                ctx.reply(`✅ *Pendaftaran Berhasil*\n*IP VPS:* \`${ip}\`\n*Domain:* \`${domain}\`\n*Proxied:* \`false\``, { parse_mode: 'Markdown' });
            } else {
                ctx.reply('❌ Gagal mendaftarkan IP.');
            }
        }).catch((error) => {
            console.error('Kesalahan saat menambahkan DNS record:', error);
            ctx.reply('❌ Terjadi kesalahan saat menambahkan DNS record.');
        });
    }
});

// Menampilkan daftar DNS record dan opsi penghapusan
bot.action('list_dns_records', async (ctx) => {
    if (!isAdmin(ctx.from.id)) {
        return ctx.reply('⚠️ Anda tidak memiliki izin untuk menggunakan bot ini.');
    }
    
    try {
        const results = [];
        for (const domain of domainscf) {
            const zoneId = await getZoneId(domain);
            const response = await axios.get(`https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records`, {
                headers: {
                    'X-Auth-Email': iniemail,
                    'X-Auth-Key': apiKey,
                    'Content-Type': 'application/json'
                }
            });

            const records = response.data.result;
            if (records.length === 0) {
                results.push(`Tidak ada DNS record untuk domain ${domain}.`);
            } else {
                results.push(`DNS record untuk domain ${domain}:\n`);
                records.forEach((record) => {
                    results.push(`ID: ${record.id}\nNama: ${record.name}\nIP: ${record.content}\nProxied: ${record.proxied}\n`);
                });
            }
        }
        ctx.reply(results.join('\n'), {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
                [Markup.button.callback('Hapus Rekor DNS', 'delete_dns')]
            ]).resize()
        });
    } catch (error) {
        console.error('Kesalahan saat mengambil daftar DNS record:', error);
        ctx.reply('❌ Terjadi kesalahan saat mengambil daftar DNS record.');
    }
});

// Memproses penghapusan DNS record
bot.action('delete_dns', async (ctx) => {
    if (!isAdmin(ctx.from.id)) {
        return ctx.reply('⚠️ Anda tidak memiliki izin untuk menggunakan bot ini.');
    }
    ctx.reply('⚠️ Kirimkan ID DNS record yang akan dihapus.');

    userContext[ctx.from.id] = 'menunggu_record_id';
});

// Handler untuk penghapusan berdasarkan ID yang dikirimkan oleh pengguna
bot.on('text', async (ctx) => {
    const userId = ctx.from.id;
    const status = userContext[userId];

    if (status === 'menunggu_record_id') {
        const recordId = ctx.message.text;

        try {
            let deleted = false;
            for (const domain of domainscf) {
                const zoneId = await getZoneId(domain);
                deleted = await deleteDnsRecord(zoneId, recordId);

                if (deleted) {
                    ctx.reply(`✅ DNS record dengan ID ${recordId} berhasil dihapus dari domain ${domain}.`);
                    break;
                }
            }

            if (!deleted) {
                ctx.reply('❌ Gagal menghapus DNS record. Pastikan ID benar dan ada di salah satu domain.');
            }
        } catch (error) {
            console.error('Kesalahan saat menghapus DNS record:', error);
            ctx.reply('❌ Terjadi kesalahan saat menghapus DNS record.');
        }
    }
});

// Menjalankan bot
bot.launch().then(() => {
    console.log('Bot berjalan...');
}).catch((error) => {
    console.error('Gagal menjalankan bot:', error);
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));