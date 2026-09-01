// ==========================================
// 📦 cache-helper.js - হাইব্রিড ক্যাশ ম্যানেজার v2.0
//    ছোট ডেটা → sessionStorage, বড় ডেটা → IndexedDB (localForage)
//    🔥 অটো মাইগ্রেশন: পুরানো sessionStorage ডেটা IndexedDB-তে স্থানান্তর
// ==========================================

const CacheManager = {
    // 🔑 sessionStorage-এর প্রিফিক্স (ছোট ডেটার জন্য)
    PREFIX: 'stockpulse_',

    // 🗂️ IndexedDB-তে বড় ডেটা রাখার কী-লিস্ট (প্যাটার্ন)
    BIG_KEYS_PATTERNS: ['chart_', 'scanner_', 'timeline_', 'price_detail_', 'analysis_'],

    // ⏱️ ডিফল্ট TTL (সেকেন্ড)
    DEFAULTS: {
        PRICE: 600000,      // ১০ মিনিট
        ANALYSIS: 1200000,   // ২০ মিনিট
        CHART: 1200000,      // ২০ মিনিট
        SCANNER: 7200000,    // ২ ঘন্টা
        TIMELINE: 1800000,   // ৩০ মিনিট
    },

    // ==========================================
    // 🧠 কীটি বড় ডেটা কিনা চেক করুন
    // ==========================================
    _isBigKey(key) {
        return this.BIG_KEYS_PATTERNS.some(pattern => key.startsWith(pattern));
    },

    // ==========================================
    // 📥 ডেটা পড়া (Async)
    // ==========================================
    async get(key, ttl = null) {
        try {
            // ১. ছোট ডেটা → sessionStorage (সিঙ্ক্রোনাস)
            if (!this._isBigKey(key)) {
                return this._getFromSession(key, ttl);
            }

            // ২. বড় ডেটা → IndexedDB (অ্যাসিঙ্ক)
            return await this._getFromIndexedDB(key, ttl);
        } catch (e) {
            console.warn('Cache read error:', e);
            return null;
        }
    },

    // ==========================================
    // 📤 ডেটা সেভ করা (Async)
    // ==========================================
    async set(key, value, ttl = null) {
        try {
            if (!this._isBigKey(key)) {
                return this._setToSession(key, value, ttl);
            }
            return await this._setToIndexedDB(key, value, ttl);
        } catch (e) {
            console.warn('Cache set error:', e);
            return false;
        }
    },

    // ==========================================
    // 🗑️ নির্দিষ্ট ক্যাশ ডিলিট (Async)
    // ==========================================
    async remove(key) {
        try {
            if (!this._isBigKey(key)) {
                sessionStorage.removeItem(this.PREFIX + key);
                return true;
            }
            await localforage.removeItem(this.PREFIX + key);
            return true;
        } catch (e) {
            return false;
        }
    },

    // ==========================================
    // 🧹 পুরনো ক্যাশ ক্লিয়ার (শুধু sessionStorage)
    // ==========================================
    clearOldest() {
        try {
            const keys = [];
            for (let i = 0; i < sessionStorage.length; i++) {
                const key = sessionStorage.key(i);
                if (key.startsWith(this.PREFIX)) {
                    try {
                        const item = JSON.parse(sessionStorage.getItem(key));
                        keys.push({ key, timestamp: item.timestamp || 0 });
                    } catch (e) {}
                }
            }
            keys.sort((a, b) => a.timestamp - b.timestamp);
            const toDelete = keys.slice(0, Math.min(10, keys.length));
            toDelete.forEach(item => sessionStorage.removeItem(item.key));
            console.log(`🗑️ Cleared ${toDelete.length} old session cache entries`);
        } catch (e) { /* ignore */ }
    },

    // ==========================================
    // 🚀 সব ক্যাশ ক্লিয়ার (sessionStorage + IndexedDB)
    // ==========================================
    async clearAll() {
        try {
            // sessionStorage ক্লিয়ার
            const keysToRemove = [];
            for (let i = 0; i < sessionStorage.length; i++) {
                const key = sessionStorage.key(i);
                if (key.startsWith(this.PREFIX)) {
                    keysToRemove.push(key);
                }
            }
            keysToRemove.forEach(key => sessionStorage.removeItem(key));

            // IndexedDB ক্লিয়ার (শুধু আমাদের প্রিফিক্সের ডেটা)
            const allKeys = await localforage.keys();
            for (const key of allKeys) {
                if (key.startsWith(this.PREFIX)) {
                    await localforage.removeItem(key);
                }
            }
            console.log(`🗑️ Cleared all cache (session + IndexedDB)`);
        } catch (e) {
            console.warn('clearAll error:', e);
        }
    },

    // ==========================================
    // 🔍 কোনো নির্দিষ্ট ক্যাশ কী আছে কিনা চেক করুন (Async)
    // ==========================================
    async has(key) {
        try {
            if (!this._isBigKey(key)) {
                return sessionStorage.getItem(this.PREFIX + key) !== null;
            }
            const val = await localforage.getItem(this.PREFIX + key);
            return val !== null;
        } catch (e) {
            return false;
        }
    },

    // ==========================================
    // 🔄 নির্দিষ্ট ক্যাশ গ্রুপ রিফ্রেশ (Async)
    // ==========================================
    async clearByPattern(pattern) {
        try {
            let count = 0;
            // sessionStorage
            const keysToRemove = [];
            for (let i = 0; i < sessionStorage.length; i++) {
                const key = sessionStorage.key(i);
                if (key.startsWith(this.PREFIX + pattern)) {
                    keysToRemove.push(key);
                    count++;
                }
            }
            keysToRemove.forEach(key => sessionStorage.removeItem(key));

            // IndexedDB
            const allKeys = await localforage.keys();
            for (const key of allKeys) {
                if (key.startsWith(this.PREFIX + pattern)) {
                    await localforage.removeItem(key);
                    count++;
                }
            }
            console.log(`🗑️ Cleared ${count} cache entries with pattern "${pattern}"`);
            return count;
        } catch (e) {
            console.warn('clearByPattern error:', e);
            return 0;
        }
    },

    // ==========================================
    // 🧩 প্রাইভেট মেথড: sessionStorage
    // ==========================================
    _getFromSession(key, ttl) {
        const fullKey = this.PREFIX + key;
        const item = sessionStorage.getItem(fullKey);
        if (!item) return null;
        const data = JSON.parse(item);
        const now = Date.now();
        const effectiveTtl = ttl || data.ttl || null;
        if (effectiveTtl && (now - data.timestamp) > effectiveTtl) {
            sessionStorage.removeItem(fullKey);
            return null;
        }
        return data.value;
    },

    _setToSession(key, value, ttl) {
        const fullKey = this.PREFIX + key;
        const item = { value, timestamp: Date.now() };
        if (ttl) item.ttl = ttl;
        sessionStorage.setItem(fullKey, JSON.stringify(item));
        return true;
    },

    // ==========================================
    // 🧩 প্রাইভেট মেথড: IndexedDB (localForage)
    // ==========================================
    async _getFromIndexedDB(key, ttl) {
        const fullKey = this.PREFIX + key;
        const item = await localforage.getItem(fullKey);
        if (!item) return null;
        const now = Date.now();
        const effectiveTtl = ttl || item.ttl || null;
        if (effectiveTtl && (now - item.timestamp) > effectiveTtl) {
            await localforage.removeItem(fullKey);
            return null;
        }
        return item.value;
    },

    async _setToIndexedDB(key, value, ttl) {
        const fullKey = this.PREFIX + key;
        const item = { value, timestamp: Date.now() };
        if (ttl) item.ttl = ttl;
        await localforage.setItem(fullKey, item);
        return true;
    },

    // ==========================================
    // 📊 ক্যাশ সাইজ চেক (ডিবাগিং)
    // ==========================================
    async getSize() {
        try {
            let total = 0;
            // sessionStorage
            for (let i = 0; i < sessionStorage.length; i++) {
                const key = sessionStorage.key(i);
                if (key.startsWith(this.PREFIX)) {
                    total += sessionStorage.getItem(key).length || 0;
                }
            }
            // IndexedDB
            const allKeys = await localforage.keys();
            for (const key of allKeys) {
                if (key.startsWith(this.PREFIX)) {
                    const item = await localforage.getItem(key);
                    total += JSON.stringify(item).length || 0;
                }
            }
            return (total / 1024).toFixed(2) + ' KB';
        } catch (e) {
            return '0 KB';
        }
    },

    // ==========================================
    // 🔄 মাইগ্রেশন হেল্পার: পুরানো sessionStorage ডেটা IndexedDB-তে নেওয়া
    // ==========================================
    async migrateOldData() {
        console.log('🔄 Checking for old sessionStorage data to migrate...');
        let migrated = 0;
        const keysToMigrate = ['chart_', 'scanner_', 'timeline_', 'price_detail_'];
        
        for (let i = 0; i < sessionStorage.length; i++) {
            const key = sessionStorage.key(i);
            if (key.startsWith(this.PREFIX)) {
                const actualKey = key.replace(this.PREFIX, '');
                if (keysToMigrate.some(p => actualKey.startsWith(p))) {
                    try {
                        const item = JSON.parse(sessionStorage.getItem(key));
                        if (item && item.value) {
                            // IndexedDB-তে সেভ করুন
                            await localforage.setItem(key, item);
                            // sessionStorage থেকে ডিলিট করুন (ঐচ্ছিক)
                            // sessionStorage.removeItem(key);
                            migrated++;
                        }
                    } catch (e) { /* ignore */ }
                }
            }
        }
        console.log(`✅ Migration complete: ${migrated} items moved to IndexedDB`);
        return migrated;
    }
};

// ==========================================
// 🌐 গ্লোবালি এক্সপোজ (window)
// ==========================================
if (typeof window !== 'undefined') {
    window.CacheManager = CacheManager;
}

// ==========================================
// 📤 মডিউল এক্সপোর্ট
// ==========================================
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CacheManager;
}

console.log('✅ CacheManager v2.0 (Hybrid: sessionStorage + IndexedDB) loaded');