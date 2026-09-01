// 📁 data-service.js
// ==========================================
// ডেটা ফেচিং এর সেন্ট্রাল লেয়ার – Firebase + Supabase
//
// ✅ ফিক্স v2 (সিকিউরিটি হার্ডেনিং):
// - Supabase-first অর্ডার: সুপাবেসের ব্যক্তিগত টেবিলগুলো এখন
//   RLS দিয়ে লকড, তাই পড়ার কাজ আগে ফায়ারবেস থেকে হয় —
//   অযথা ফেইলড সুপাবেস কল আর যায় না
// - ফায়ারবেস খালি/এরর দিলে সুপাবেস ট্রাই হয় (মাইগ্রেশন কালীন
//   পুরনো ডেটার সেফটি নেট) — মাইগ্রেশন সম্পূর্ণ হলে সুপাবেস
//   ফলব্যাক ব্লকগুলো বাদ দিয়ে দিতে পারেন
// ==========================================

class DataService {
    constructor() {
        this.cache = new Map();
        this.cacheTTL = 300000; // 5 মিনিট
        this.pendingRequests = new Map();
    }

    // 🔥 পোর্টফোলিও ডেটা ফেচ (Supabase আগে, তারপর Firebase recovery fallback)
    async getPortfolio(userId) {
        if (!userId) return null;
        const cacheKey = `portfolio_${userId}`;
        const cached = this.getFromCache(cacheKey);
        if (cached) return cached;

        // যদি রিকোয়েস্ট ইতিমধ্যে চলছে, তাহলে সেটা রিটার্ন করুন
        if (this.pendingRequests.has(cacheKey)) {
            return this.pendingRequests.get(cacheKey);
        }

        const promise = this._fetchPortfolio(userId);
        this.pendingRequests.set(cacheKey, promise);

        try {
            const data = await promise;
            this.setCache(cacheKey, data);
            return data;
        } finally {
            this.pendingRequests.delete(cacheKey);
        }
    }

    async _fetchPortfolio(userId) {
        let portfolioData = [];

        // Supabase is the primary application-data store.
        if (typeof supabase !== 'undefined' && supabase) {
            try {
                const { data, error } = await supabase
                    .from('portfolios')
                    .select('*')
                    .eq('user_id', userId);
                if (!error && data) {
                    return data.map(item => ({
                        id: item.id,
                        userId: item.user_id,
                        shareName: item.share_name,
                        quantity: item.quantity,
                        buyPrice: item.buy_price,
                        commission: item.commission || 0,
                        commissionPercent: item.commission_percent || 0,
                        portfolioId: item.portfolio_id || 'main',
                        date: item.date,
                        createdAt: item.created_at
                    }));
                }
            } catch (e) {
                console.warn('Supabase portfolio fetch failed:', e);
            }
        }

        // Firebase is only a recovery/mirror fallback.
        if (typeof db !== 'undefined' && db) {
            try {
                const snap = await db.collection('portfolios')
                    .where('userId', '==', userId)
                    .get();
                snap.forEach(doc => {
                    const data = doc.data();
                    portfolioData.push({
                        id: doc.id,
                        userId: data.userId,
                        shareName: data.shareName,
                        quantity: data.quantity,
                        buyPrice: data.buyPrice,
                        commission: data.commission || 0,
                        commissionPercent: data.commissionPercent || 0,
                        portfolioId: data.portfolioId || 'main',
                        date: data.date?.toDate?.()?.toISOString?.()?.split('T')[0] || null,
                        createdAt: data.createdAt?.toDate?.()?.toISOString?.() || null
                    });
                });
            } catch (e) {
                console.warn('Firebase portfolio fallback failed:', e);
            }
        }

        return portfolioData;
    }

    // 📈 Sales History (Supabase আগে, তারপর Firebase recovery fallback)
    async getSalesHistory(userId) {
        const cacheKey = `sales_${userId}`;
        const cached = this.getFromCache(cacheKey);
        if (cached) return cached;

        if (this.pendingRequests.has(cacheKey)) {
            return this.pendingRequests.get(cacheKey);
        }

        const promise = this._fetchSalesHistory(userId);
        this.pendingRequests.set(cacheKey, promise);

        try {
            const data = await promise;
            this.setCache(cacheKey, data);
            return data;
        } finally {
            this.pendingRequests.delete(cacheKey);
        }
    }

    async _fetchSalesHistory(userId) {
        let salesData = [];

        // Supabase is the primary application-data store.
        if (typeof supabase !== 'undefined' && supabase) {
            try {
                const { data, error } = await supabase
                    .from('sales_history')
                    .select('*')
                    .eq('user_id', userId);
                if (!error && data) {
                    return data.map(item => ({
                        id: item.id,
                        userId: item.user_id,
                        shareName: item.share_name,
                        quantitySold: item.quantity_sold || 0,
                        buyPrice: item.buy_price || 0,
                        sellPrice: item.sell_price || 0,
                        profitOrLoss: item.profit_or_loss || 0,
                        commission: item.commission || 0,
                        commissionPercent: item.commission_percent || 0,
                        netReceived: item.net_received || 0,
                        portfolioId: item.portfolio_id || 'main',
                        date: item.date,
                        createdAt: item.created_at
                    }));
                }
            } catch (e) {
                console.warn('Supabase sales fetch failed:', e);
            }
        }

        // Firebase is only a recovery/mirror fallback.
        if (typeof db !== 'undefined' && db) {
            try {
                const snap = await db.collection('sales_history')
                    .where('userId', '==', userId)
                    .get();
                snap.forEach(doc => {
                    const data = doc.data();
                    salesData.push({
                        id: doc.id,
                        userId: data.userId,
                        shareName: data.shareName,
                        quantitySold: data.quantitySold || 0,
                        buyPrice: data.buyPrice || 0,
                        sellPrice: data.sellPrice || 0,
                        profitOrLoss: data.profitOrLoss || 0,
                        commission: data.commission || 0,
                        commissionPercent: data.commissionPercent || 0,
                        netReceived: data.netReceived || 0,
                        portfolioId: data.portfolioId || 'main',
                        date: data.date?.toDate?.()?.toISOString?.()?.split('T')[0] || null,
                        createdAt: data.createdAt?.toDate?.()?.toISOString?.() || null
                    });
                });
            } catch (e) {
                console.warn('Firebase sales fallback failed:', e);
            }
        }

        return salesData;
    }

    // 🗄️ ক্যাশ ম্যানেজমেন্ট
    getFromCache(key) {
        if (this.cache.has(key)) {
            const entry = this.cache.get(key);
            if (Date.now() - entry.timestamp < this.cacheTTL) {
                return entry.data;
            }
            this.cache.delete(key);
        }
        return null;
    }

    setCache(key, data) {
        this.cache.set(key, {
            data: data,
            timestamp: Date.now()
        });
    }

    clearCache() {
        this.cache.clear();
        this.pendingRequests.clear();
        console.log('🗑️ DataService cache cleared');
    }

    // 📅 ইউনিক টিকার লিস্ট (ডুপ্লিকেট বাদ)
    getUniqueTickers(portfolioData) {
        const tickers = new Set();
        portfolioData.forEach(item => {
            if (item.shareName) tickers.add(item.shareName);
        });
        return Array.from(tickers);
    }
}

// গ্লোবালি এক্সপোজ
if (typeof window !== 'undefined') {
    window.dataService = new DataService();
    window.clearDataServiceCache = () => window.dataService.clearCache();
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = DataService;
}


// Centralized cache invalidation hook.
// Write operations should call this after a successful database mutation.
window.invalidateAppDataCache = function(reason = 'data mutation') {
    try {
        if (typeof window.clearDataServiceCache === 'function') {
            window.clearDataServiceCache();
        }
    } catch (e) {
        console.warn('DataService cache clear failed:', e);
    }

    try {
        if (typeof window.resetUnifiedCache === 'function') {
            window.resetUnifiedCache();
        }
    } catch (e) {
        console.warn('Unified cache reset failed:', e);
    }

    try {
        window.dispatchEvent(new CustomEvent('stockpulse:data-changed', {
            detail: { reason, timestamp: Date.now() }
        }));
    } catch (e) {
        // CustomEvent may be unavailable in very old environments.
    }
};

