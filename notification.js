// ==========================================
// 🔔 notification.js - সম্পূর্ণ আপডেটেড ভার্সন
//    প্রাইস অ্যালার্ট, ডেইলি সামারি, ডেইলি ব্রিফিং (সকাল ৯টা)
//    ব্রাউজার নোটিফিকেশন, লোকাল স্টোরেজ ম্যানেজমেন্ট
// ==========================================

// ==========================================
// 📌 কনফিগ
// ==========================================
const NOTIFICATION_CONFIG = {
    STORAGE_KEY: 'price_alerts',
    DEFAULT_ICON: '/icons/icon-192x192.png',
    MAX_ALERTS: 50
};

// ==========================================
// 🔔 নোটিফিকেশন ম্যানেজার ক্লাস
// ==========================================
class NotificationManager {
    constructor() {
        this.permission = false;
        this.alerts = {};
        this.initialized = false;
        this.init();
    }

    // ==========================================
    // 🚀 ইনিশিয়ালাইজ
    // ==========================================
    async init() {
        try {
            // ব্রাউজার নোটিফিকেশন সাপোর্ট চেক
            if (!('Notification' in window)) {
                console.log('🔔 Notifications not supported in this browser');
                this.initialized = true;
                return;
            }

            // পারমিশন চেক
            if (Notification.permission === 'granted') {
                this.permission = true;
            } else if (Notification.permission === 'default') {
                // ইউজারকে জিজ্ঞেস করি (শুধু UI ইন্টারঅ্যাকশনে করাই ভালো)
                // কিন্তু এখানে আমরা শুধু চেক করছি
                const result = await Notification.requestPermission();
                this.permission = result === 'granted';
            }

            // সংরক্ষিত অ্যালার্ট লোড
            this.loadAlerts();

            console.log(`🔔 Notifications: ${this.permission ? '✅ Enabled' : '❌ Disabled'}`);
            this.initialized = true;
        } catch (error) {
            console.error('Notification init error:', error);
            this.initialized = true;
        }
    }

    // ==========================================
    // 💾 অ্যালার্ট লোড/সেভ
    // ==========================================
    loadAlerts() {
        try {
            const stored = localStorage.getItem(NOTIFICATION_CONFIG.STORAGE_KEY);
            if (stored) {
                this.alerts = JSON.parse(stored);
                // পুরনো ট্রিগার রিসেট করুন (যদি নতুন সেশন হয়)
                for (const key in this.alerts) {
                    if (this.alerts[key].triggered) {
                        // ২৪ ঘন্টা পর রিসেট
                        const triggerTime = this.alerts[key].triggeredAt || 0;
                        if (Date.now() - triggerTime > 86400000) {
                            this.alerts[key].triggered = false;
                            this.alerts[key].triggeredAt = null;
                        }
                    }
                }
                this.saveAlerts();
            }
        } catch (e) {
            console.warn('Failed to load alerts:', e);
            this.alerts = {};
        }
    }

    saveAlerts() {
        try {
            localStorage.setItem(NOTIFICATION_CONFIG.STORAGE_KEY, JSON.stringify(this.alerts));
        } catch (e) {
            console.warn('Failed to save alerts:', e);
        }
    }

    // ==========================================
    // 📊 অ্যালার্ট সেট করুন
    // ==========================================
    setAlert(ticker, targetPrice, direction = 'any', callback = null) {
        if (!ticker || !targetPrice || targetPrice <= 0) {
            console.warn('Invalid alert parameters');
            return false;
        }

        // সীমা চেক
        const keys = Object.keys(this.alerts);
        if (keys.length >= NOTIFICATION_CONFIG.MAX_ALERTS) {
            console.warn('Max alerts reached');
            return false;
        }

        this.alerts[ticker] = {
            target: targetPrice,
            direction: direction, // 'up', 'down', 'any'
            triggered: false,
            triggeredAt: null,
            createdAt: Date.now(),
            callback: callback ? callback.toString() : null
        };

        this.saveAlerts();
        this.showNotification(
            `📊 Alert set for ${ticker}`,
            `Target: ৳${targetPrice.toFixed(2)} (${direction === 'any' ? 'any' : direction === 'up' ? '↑ up' : '↓ down'})`
        );
        return true;
    }

    // ==========================================
    // ❌ অ্যালার্ট রিমুভ
    // ==========================================
    removeAlert(ticker) {
        if (this.alerts[ticker]) {
            delete this.alerts[ticker];
            this.saveAlerts();
            this.showNotification(`🗑️ Alert removed for ${ticker}`, '');
            return true;
        }
        return false;
    }

    // ==========================================
    // 📋 সব অ্যালার্ট দেখান
    // ==========================================
    getAlerts() {
        return { ...this.alerts };
    }

    // ==========================================
    // 🔍 প্রাইস চেক করুন (ড্যাশবোর্ড রিফ্রেশে কল করুন)
    // ==========================================
    checkPriceAlerts(ticker, currentPrice) {
        if (!this.initialized || !this.permission) return;
        if (!ticker || currentPrice <= 0) return;

        const alert = this.alerts[ticker];
        if (!alert || alert.triggered) return;

        let shouldTrigger = false;
        let triggerMessage = '';

        if (alert.direction === 'up' && currentPrice >= alert.target) {
            shouldTrigger = true;
            triggerMessage = `📈 ${ticker} reached ৳${currentPrice.toFixed(2)} (Target: ৳${alert.target.toFixed(2)})`;
        } else if (alert.direction === 'down' && currentPrice <= alert.target) {
            shouldTrigger = true;
            triggerMessage = `📉 ${ticker} dropped to ৳${currentPrice.toFixed(2)} (Target: ৳${alert.target.toFixed(2)})`;
        } else if (alert.direction === 'any') {
            // ১% এর বেশি পরিবর্তন হলে ট্রিগার
            const changePercent = Math.abs((currentPrice - alert.target) / alert.target) * 100;
            if (changePercent >= 1) {
                shouldTrigger = true;
                const direction = currentPrice > alert.target ? '↑ up' : '↓ down';
                triggerMessage = `${ticker} moved ${direction} to ৳${currentPrice.toFixed(2)} (Target: ৳${alert.target.toFixed(2)})`;
            }
        }

        if (shouldTrigger) {
            alert.triggered = true;
            alert.triggeredAt = Date.now();
            this.saveAlerts();

            // কাস্টম কলব্যাক
            if (alert.callback) {
                try {
                    const fn = new Function('return ' + alert.callback)();
                    if (typeof fn === 'function') fn(ticker, currentPrice, alert.target);
                } catch (e) {
                    console.warn('Callback error:', e);
                }
            }

            this.showNotification('🔔 Price Alert!', triggerMessage);
        }
    }

    // ==========================================
    // 📈 ডেইলি সামারি নোটিফিকেশন
    // ==========================================
    showDailySummary(pl, percentage, totalValue) {
        if (!this.initialized || !this.permission) return;
        const emoji = pl >= 0 ? '📈' : '📉';
        const body = `P&L: ${pl >= 0 ? '+' : ''}৳${pl.toFixed(2)} (${percentage >= 0 ? '+' : ''}${percentage.toFixed(2)}%) | Total: ৳${totalValue.toFixed(2)}`;
        this.showNotification(`${emoji} Daily Portfolio Update`, body);
    }

    // ==========================================
    // 📊 ডেইলি ব্রিফিং (সকাল ৯টা) - নতুন ফিচার
    // ==========================================
    async generateDailyBriefing(userId) {
        if (!userId) {
            console.warn('No userId provided for daily briefing');
            return;
        }

        // নোটিফিকেশন পারমিশন চেক
        if (!this.permission) {
            console.log('🔔 Notification permission not granted, skipping briefing');
            return;
        }

        try {
            console.log(`📊 Generating daily briefing for user ${userId}...`);

            // ১. সব Buy ট্রানজেকশন
            let buyData = [];
            let sellData = [];

            // Supabase
            if (typeof supabase !== 'undefined' && supabase) {
                try {
                    const { data: bData, error: bError } = await supabase
                        .from('portfolios')
                        .select('share_name, buy_price')
                        .eq('user_id', userId);
                    if (!bError && bData) buyData = bData;

                    const { data: sData, error: sError } = await supabase
                        .from('sales_history')
                        .select('share_name, sell_price')
                        .eq('user_id', userId);
                    if (!sError && sData) sellData = sData;
                } catch (e) {
                    console.warn('Supabase fetch failed for briefing:', e);
                }
            }

            // Firebase ফ্যালব্যাক
            if (buyData.length === 0 && typeof db !== 'undefined') {
                try {
                    const bSnap = await db.collection('portfolios')
                        .where('userId', '==', userId)
                        .get();
                    bSnap.forEach(doc => {
                        const d = doc.data();
                        buyData.push({ share_name: d.shareName, buy_price: d.buyPrice });
                    });
                } catch (e) {
                    console.warn('Firebase buy fetch failed:', e);
                }
            }

            if (sellData.length === 0 && typeof db !== 'undefined') {
                try {
                    const sSnap = await db.collection('sales_history')
                        .where('userId', '==', userId)
                        .get();
                    sSnap.forEach(doc => {
                        const d = doc.data();
                        sellData.push({ share_name: d.shareName, sell_price: d.sellPrice });
                    });
                } catch (e) {
                    console.warn('Firebase sell fetch failed:', e);
                }
            }

            // ২. টিকার ভিত্তিতে গ্রুপিং
            const buyMap = new Map();
            buyData.forEach(item => {
                const ticker = item.share_name;
                const price = parseFloat(item.buy_price) || 0;
                if (price > 0) {
                    if (!buyMap.has(ticker) || price < buyMap.get(ticker)) {
                        buyMap.set(ticker, price);
                    }
                }
            });

            const sellMap = new Map();
            sellData.forEach(item => {
                const ticker = item.share_name;
                const price = parseFloat(item.sell_price) || 0;
                if (price > 0) {
                    if (!sellMap.has(ticker) || price > sellMap.get(ticker)) {
                        sellMap.set(ticker, price);
                    }
                }
            });

            // ৩. ইউনিক টিকার লিস্ট
            const allTickers = new Set([...buyMap.keys(), ...sellMap.keys()]);
            if (allTickers.size === 0) {
                console.log('📭 No trade data found for briefing');
                this.showNotification(
                    '📊 Good Morning!',
                    '📭 No trade data found. Start buying shares to get signals.'
                );
                return;
            }

            // ৪. বর্তমান প্রাইস ফেচ (ক্যাশিং সহ)
            const currentPrices = {};
            const tickers = Array.from(allTickers);
            for (const ticker of tickers) {
                try {
                    const price = await getUnifiedPrice(ticker);
                    if (price > 0) currentPrices[ticker] = price;
                } catch (e) {
                    console.warn(`Failed to fetch price for ${ticker}:`, e);
                }
            }

            // ৫. সিগন্যাল জেনারেট
            const buySignals = [];
            const sellSignals = [];

            for (const ticker of tickers) {
                const currentPrice = currentPrices[ticker] || 0;
                const minBuy = buyMap.get(ticker) || 0;
                const maxSell = sellMap.get(ticker) || 0;

                // Sell Signal: currentPrice > maxSell (লাভ)
                if (currentPrice > 0 && maxSell > 0 && currentPrice > maxSell) {
                    const diff = currentPrice - maxSell;
                    const pct = (diff / maxSell) * 100;
                    sellSignals.push({
                        ticker,
                        currentPrice,
                        maxSell,
                        diff,
                        pct
                    });
                }

                // Buy Signal: currentPrice < minBuy (ডিসকাউন্ট)
                if (currentPrice > 0 && minBuy > 0 && currentPrice < minBuy) {
                    const diff = minBuy - currentPrice;
                    const pct = (diff / minBuy) * 100;
                    buySignals.push({
                        ticker,
                        currentPrice,
                        minBuy,
                        diff,
                        pct
                    });
                }
            }

            // ৬. সাজানো (সবচেয়ে ভালো সুযোগ আগে)
            buySignals.sort((a, b) => b.pct - a.pct);
            sellSignals.sort((a, b) => b.pct - a.pct);

            // ৭. নোটিফিকেশন তৈরি
            let title = `📊 Good Morning! ${buySignals.length + sellSignals.length} signals`;
            let body = '';

            if (buySignals.length > 0) {
                const topBuy = buySignals.slice(0, 3);
                body += `🟢 Buy Opportunities:\n`;
                topBuy.forEach(s => {
                    body += `  ${s.ticker}: ৳${s.currentPrice.toFixed(2)} (Min Buy: ৳${s.minBuy.toFixed(2)}, ${s.pct.toFixed(1)}% down)\n`;
                });
                if (buySignals.length > 3) {
                    body += `  ... and ${buySignals.length - 3} more\n`;
                }
            }

            if (sellSignals.length > 0) {
                if (body) body += '\n';
                const topSell = sellSignals.slice(0, 3);
                body += `🔴 Sell Opportunities:\n`;
                topSell.forEach(s => {
                    body += `  ${s.ticker}: ৳${s.currentPrice.toFixed(2)} (Max Sell: ৳${s.maxSell.toFixed(2)}, ${s.pct.toFixed(1)}% up)\n`;
                });
                if (sellSignals.length > 3) {
                    body += `  ... and ${sellSignals.length - 3} more\n`;
                }
            }

            if (!body) {
                body = '📭 No buy/sell signals today. Your portfolio is balanced.';
                title = '📊 Good Morning! Your portfolio is balanced';
            }

            // ৮. নোটিফিকেশন পাঠান
            this.showNotification(title, body);
            console.log(`📊 Daily briefing sent: ${buySignals.length} buy, ${sellSignals.length} sell signals`);

        } catch (error) {
            console.error('Daily briefing error:', error);
            this.showNotification(
                '⚠️ Daily Briefing Error',
                'Failed to generate daily briefing. Please check console.'
            );
        }
    }

    // ==========================================
    // 💬 জেনেরিক নোটিফিকেশন
    // ==========================================
    showNotification(title, body, icon = NOTIFICATION_CONFIG.DEFAULT_ICON) {
        if (!this.initialized) {
            console.log('🔔 Notification not initialized yet');
            return;
        }
        if (!this.permission) {
            console.log('🔔 Notification permission not granted');
            return;
        }

        try {
            const options = {
                body: body || '',
                icon: icon,
                badge: '/icons/icon-96x96.png',
                vibrate: [200, 100, 200],
                requireInteraction: false,
                silent: false,
                tag: Date.now().toString()
            };
            new Notification(title, options);
        } catch (error) {
            console.warn('Notification show error:', error);
        }
    }

    // ==========================================
    // 🔄 সব অ্যালার্ট রিসেট
    // ==========================================
    resetAllAlerts() {
        this.alerts = {};
        this.saveAlerts();
        this.showNotification('🔄 All alerts reset', '');
    }

    // ==========================================
    // 📊 অ্যালার্টের অবস্থা (UI-এর জন্য)
    // ==========================================
    getAlertStatus(ticker) {
        return this.alerts[ticker] || null;
    }

    getActiveAlerts() {
        const active = {};
        for (const [key, value] of Object.entries(this.alerts)) {
            if (!value.triggered) {
                active[key] = value;
            }
        }
        return active;
    }

    getTriggeredAlerts() {
        const triggered = {};
        for (const [key, value] of Object.entries(this.alerts)) {
            if (value.triggered) {
                triggered[key] = value;
            }
        }
        return triggered;
    }
}

// ==========================================
// ⏰ ডেইলি ব্রিফিং শিডিউলার (সকাল ৯টা)
// ==========================================
function scheduleDailyBriefing() {
    const now = new Date();
    const target = new Date();
    target.setHours(9, 0, 0, 0); // সকাল ৯টা

    // যদি আজকের ৯টা পেরিয়ে যায়, তাহলে আগামীকাল
    if (now > target) {
        target.setDate(target.getDate() + 1);
    }

    const delay = target.getTime() - now.getTime();
    console.log(`⏰ Daily briefing scheduled in ${Math.round(delay / 60000)} minutes (at ${target.toLocaleString()})`);

    setTimeout(async () => {
        const user = auth?.currentUser;
        if (user && notificationManager) {
            console.log('⏰ Running daily briefing...');
            await notificationManager.generateDailyBriefing(user.uid);
        } else {
            console.warn('⚠️ No user or notificationManager for daily briefing');
        }
        // আবার শিডিউল করুন (পরের দিনের জন্য)
        scheduleDailyBriefing();
    }, delay);
}

// ==========================================
// 🧪 টেস্ট ফাংশন (ম্যানুয়ালি ট্রিগারের জন্য)
// ==========================================
window.testDailyBriefing = async function() {
    const user = auth?.currentUser;
    if (!user) {
        if (typeof showToast === 'function') {
            showToast('Please login first', 'error');
        } else {
            alert('Please login first');
        }
        return;
    }
    if (notificationManager) {
        await notificationManager.generateDailyBriefing(user.uid);
        if (typeof showToast === 'function') {
            showToast('✅ Briefing sent!', 'success');
        }
    } else {
        if (typeof showToast === 'function') {
            showToast('Notification manager not available', 'error');
        } else {
            alert('Notification manager not available');
        }
    }
};
// ==========================================
// 📡 API এন্ডপয়েন্ট – ডেইলি সাজেশন
//    (Vercel/Netlify Serverless Function-এর জন্য)
// ==========================================

async function getDailySuggestionAPI(req, res) {
    const user = auth?.currentUser;
    if (!user) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    
    try {
        const suggestion = await generateDailyBriefingData(user.uid);
        return res.status(200).json({
            success: true,
            data: suggestion,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}

// ==========================================
// 🌐 গ্লোবালি এক্সপোজ
// ==========================================
let notificationManager = null;

try {
    notificationManager = new NotificationManager();
    if (typeof window !== 'undefined') {
        window.notificationManager = notificationManager;
        window.scheduleDailyBriefing = scheduleDailyBriefing;
        window.testDailyBriefing = window.testDailyBriefing;
    }
    console.log('✅ NotificationManager initialized');
} catch (error) {
    console.error('❌ Failed to initialize NotificationManager:', error);
    notificationManager = new Proxy({}, {
        get: () => () => console.warn('NotificationManager unavailable')
    });
}

// ==========================================
// 📤 এক্সপোর্ট (যদি module system ব্যবহার হয়)
// ==========================================
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        notificationManager,
        NotificationManager,
        scheduleDailyBriefing,
        testDailyBriefing: window.testDailyBriefing
    };
}
// ==========================================
// 📊 ডেইলি ব্রিফিং ডেটা জেনারেটর (শুধু ডেটা, নোটিফিকেশন ছাড়া)
// ==========================================

async function generateDailyBriefingData(userId) {
    if (!userId) {
        console.warn('No userId provided for daily briefing data');
        return null;
    }

    try {
        // ১. Buy ট্রানজেকশন
        let buyData = [];
        let sellData = [];

        // Supabase
        if (typeof supabase !== 'undefined' && supabase) {
            try {
                const { data: bData, error: bError } = await supabase
                    .from('portfolios')
                    .select('share_name, buy_price, quantity')
                    .eq('user_id', userId);
                if (!bError && bData) buyData = bData;

                const { data: sData, error: sError } = await supabase
                    .from('sales_history')
                    .select('share_name, sell_price, quantity_sold')
                    .eq('user_id', userId);
                if (!sError && sData) sellData = sData;
            } catch (e) {
                console.warn('Supabase fetch failed for briefing:', e);
            }
        }

        // Firebase ফ্যালব্যাক
        if (buyData.length === 0 && typeof db !== 'undefined') {
            try {
                const bSnap = await db.collection('portfolios')
                    .where('userId', '==', userId)
                    .get();
                bSnap.forEach(doc => {
                    const d = doc.data();
                    buyData.push({ share_name: d.shareName, buy_price: d.buyPrice, quantity: d.quantity });
                });
            } catch (e) {
                console.warn('Firebase buy fetch failed:', e);
            }
        }

        if (sellData.length === 0 && typeof db !== 'undefined') {
            try {
                const sSnap = await db.collection('sales_history')
                    .where('userId', '==', userId)
                    .get();
                sSnap.forEach(doc => {
                    const d = doc.data();
                    sellData.push({ share_name: d.shareName, sell_price: d.sellPrice, quantity_sold: d.quantitySold });
                });
            } catch (e) {
                console.warn('Firebase sell fetch failed:', e);
            }
        }

        // ২. টিকার ভিত্তিতে গ্রুপিং
        const buyMap = new Map();
        buyData.forEach(item => {
            const ticker = item.share_name;
            const price = parseFloat(item.buy_price) || 0;
            const qty = parseFloat(item.quantity) || 0;
            if (price > 0 && qty > 0) {
                if (!buyMap.has(ticker) || price < buyMap.get(ticker).min) {
                    buyMap.set(ticker, { min: price, totalQty: (buyMap.get(ticker)?.totalQty || 0) + qty });
                } else {
                    const cur = buyMap.get(ticker);
                    cur.totalQty = (cur.totalQty || 0) + qty;
                    buyMap.set(ticker, cur);
                }
            }
        });

        const sellMap = new Map();
        sellData.forEach(item => {
            const ticker = item.share_name;
            const price = parseFloat(item.sell_price) || 0;
            const qty = parseFloat(item.quantity_sold) || 0;
            if (price > 0 && qty > 0) {
                if (!sellMap.has(ticker) || price > sellMap.get(ticker).max) {
                    sellMap.set(ticker, { max: price, totalQty: (sellMap.get(ticker)?.totalQty || 0) + qty });
                } else {
                    const cur = sellMap.get(ticker);
                    cur.totalQty = (cur.totalQty || 0) + qty;
                    sellMap.set(ticker, cur);
                }
            }
        });

        // ৩. ইউনিক টিকার লিস্ট
        const allTickers = new Set([...buyMap.keys(), ...sellMap.keys()]);
        if (allTickers.size === 0) {
            return { message: '📭 No trade data found. Start buying shares to get signals.', buySignals: [], sellSignals: [] };
        }

        // ৪. বর্তমান প্রাইস ফেচ
        const currentPrices = {};
        const tickers = Array.from(allTickers);
        for (const ticker of tickers) {
            try {
                const price = await getUnifiedPrice(ticker);
                if (price > 0) currentPrices[ticker] = price;
            } catch (e) {
                console.warn(`Failed to fetch price for ${ticker}:`, e);
            }
        }

        // ৫. সিগন্যাল জেনারেট
        const buySignals = [];
        const sellSignals = [];

        for (const ticker of tickers) {
            const currentPrice = currentPrices[ticker] || 0;
            const buyInfo = buyMap.get(ticker);
            const sellInfo = sellMap.get(ticker);

            // Sell Signal: currentPrice > maxSell
            if (currentPrice > 0 && sellInfo && sellInfo.max > 0 && currentPrice > sellInfo.max) {
                const diff = currentPrice - sellInfo.max;
                const pct = (diff / sellInfo.max) * 100;
                sellSignals.push({
                    ticker,
                    currentPrice,
                    maxSell: sellInfo.max,
                    totalSellQty: sellInfo.totalQty || 0,
                    diff,
                    pct
                });
            }

            // Buy Signal: currentPrice < minBuy
            if (currentPrice > 0 && buyInfo && buyInfo.min > 0 && currentPrice < buyInfo.min) {
                const diff = buyInfo.min - currentPrice;
                const pct = (diff / buyInfo.min) * 100;
                buySignals.push({
                    ticker,
                    currentPrice,
                    minBuy: buyInfo.min,
                    totalBuyQty: buyInfo.totalQty || 0,
                    diff,
                    pct
                });
            }
        }

        // সাজানো
        buySignals.sort((a, b) => b.pct - a.pct);
        sellSignals.sort((a, b) => b.pct - a.pct);

        // ৬. বার্তা তৈরি
        let message = '';
        if (buySignals.length === 0 && sellSignals.length === 0) {
            message = '📊 Your portfolio is balanced. No strong buy/sell signals today.';
        } else {
            if (buySignals.length > 0) {
                const topBuy = buySignals.slice(0, 3);
                message += `📈 Buy Opportunities:\n`;
                topBuy.forEach(s => {
                    message += `  ${s.ticker}: ৳${s.currentPrice.toFixed(2)} (Min Buy: ৳${s.minBuy.toFixed(2)}, ${s.pct.toFixed(1)}% down)\n`;
                });
                if (buySignals.length > 3) {
                    message += `  ... and ${buySignals.length - 3} more\n`;
                }
            }
            if (sellSignals.length > 0) {
                if (message) message += '\n';
                const topSell = sellSignals.slice(0, 3);
                message += `📉 Sell Opportunities:\n`;
                topSell.forEach(s => {
                    message += `  ${s.ticker}: ৳${s.currentPrice.toFixed(2)} (Max Sell: ৳${s.maxSell.toFixed(2)}, ${s.pct.toFixed(1)}% up)\n`;
                });
                if (sellSignals.length > 3) {
                    message += `  ... and ${sellSignals.length - 3} more\n`;
                }
            }
        }

        return {
            message: message.trim(),
            buySignals,
            sellSignals,
            timestamp: new Date().toISOString()
        };

    } catch (error) {
        console.error('generateDailyBriefingData error:', error);
        return { message: '❌ Failed to generate daily briefing.', buySignals: [], sellSignals: [] };
    }
}

// গ্লোবালি এক্সপোজ
window.generateDailyBriefingData = generateDailyBriefingData;
console.log('✅ notification.js loaded successfully (with Daily Briefing)');

// আপনার GitHub টোকেন (এটি কখনো পাবলিক রিপোতে 
// 👇 আপনার Pipedream Webhook URL (এটি বসান)
const PIPEDREAM_URL = 'https://eotnqiqj6b1oy78.m.pipedream.net';

async function triggerScraperDirect() {
    const btn = document.getElementById('btn-trigger-scraper');
    const status = document.getElementById('scraper-status');
    
    // ইউজার লগইন চেক
    const user = auth.currentUser;
    if (!user) {
        showToast('Please login first', 'error');
        return;
    }

    btn.disabled = true;
    btn.innerText = '⏳ Running...';
    status.innerText = '⏳ Sending request...';

    try {
        // Pipedream-এ POST রিকোয়েস্ট
        const response = await fetch(PIPEDREAM_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
                // 👆 Pipedream-এ Authorization লাগে না, কারণ URL-টি পাবলিক
            }
            // body পাঠানোর দরকার নেই, কারণ Pipedream কোড GitHub API-তে নিজেই কল করে
        });

        if (response.ok) {
            status.innerText = '✅ Scraper started!';
            showToast('✅ Scraper triggered successfully!', 'success');
        } else {
            const errorText = await response.text();
            throw new Error(errorText || `HTTP ${response.status}`);
        }
    } catch (error) {
        status.innerText = '❌ Failed: ' + error.message;
        showToast('❌ Trigger failed: ' + error.message, 'error');
    } finally {
        btn.disabled = false;
        btn.innerText = '🔄 Run Scraper Now';
        setTimeout(() => { status.innerText = 'Ready'; }, 5000);
    }
}