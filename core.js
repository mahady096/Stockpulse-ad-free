// ==========================================
// 🔥 CORE.JS – সম্পূর্ণ ইরর-ফ্রি ভার্সন
//    (সব ফাংশন ডিফাইন করা, কনফিগ-সাপোর্ট, গ্লোবাল এক্সপোজ)
//    ✅ ডুপ্লিকেট ইন্ডিকেটর ফাংশন সরানো (indicators.js থেকে নেওয়া)
// ==========================================

// ==========================================
// 📦 কনফিগ লোড (ফ্যালব্যাক সহ)
// ==========================================
const CONFIG = (typeof APP_CONFIG !== 'undefined' && APP_CONFIG) ? APP_CONFIG : {
    API: {
        SCRAPER_BASE_URL: 'https://dse-scraper.vercel.app/api'
    },
    CACHE: {
        TTL: {
            ANALYSIS: 600000,
            PRICE: 300000,
            SCANNER: 3600000,
            UNIFIED_PRICE: 300000
        }
    },
    STORAGE_KEYS: {
        THEME: 'theme',
        WATCHLIST: 'market_watch_list',
        COMMISSION: 'commissionPercent',
        DATA_MODE: 'dataMode'
    },
    DEFAULTS: {
        COMMISSION_PERCENT: 0,
        DATA_MODE: 'database'
    },
    CALC: {
        PARABOLIC_SAR_STEP: 0.02,
        PARABOLIC_SAR_MAX_STEP: 0.20,
        RSI_PERIOD: 14
    }
};

// ==========================================
// 🔥 গ্লোবাল ভেরিয়েবল ডিক্লেয়ারেশন
// ==========================================
let portfolioAnalysisInterval = null;
let isAnalysisLoading = false;
let cachedAnalysisData = null;
let lastAnalysisTime = 0;
let stockTableRefreshInterval = null;
let autoRefreshInterval = null;
let autoRefreshEnabled = true;
let isManualReloading = false;
let currentDataMode = localStorage.getItem(CONFIG.STORAGE_KEYS.DATA_MODE) || CONFIG.DEFAULTS.DATA_MODE;
let currentPriceData = new Map();
let lastDataLoadTime = null;
let currentPortfolioTotalValue = 0;
let dashboardChartInstance = null;
let modalChartInstance = null;
let advChartInstance = null;
let historyChartInstance = null;

const ANALYSIS_CACHE_TTL = CONFIG.CACHE.TTL.ANALYSIS || 600000;
const SCRAPER_BASE_URL = CONFIG.API.SCRAPER_BASE_URL || 'https://dse-scraper.vercel.app/api';

// ==========================================
// 🕐 TIMEZONE UTILITY FUNCTIONS
// ==========================================
function toBangladeshTime(date) {
    if (!date) return null;
    let jsDate;
    if (typeof date.toDate === 'function') jsDate = date.toDate();
    else if (date instanceof Date) jsDate = date;
    else if (typeof date === 'string') jsDate = new Date(date);
    else if (date.seconds) jsDate = new Date(date.seconds * 1000);
    else jsDate = new Date(date);
    const bangladeshOffset = 6 * 60 * 60 * 1000;
    return new Date(jsDate.getTime() + bangladeshOffset);
}

function formatBangladeshTime(date, showTime = true) {
    const bdDate = toBangladeshTime(date);
    if (!bdDate) return 'N/A';
    const year = bdDate.getUTCFullYear();
    const month = String(bdDate.getUTCMonth() + 1).padStart(2, '0');
    const day = String(bdDate.getUTCDate()).padStart(2, '0');
    const hours = String(bdDate.getUTCHours()).padStart(2, '0');
    const minutes = String(bdDate.getUTCMinutes()).padStart(2, '0');
    if (showTime) return `${year}-${month}-${day} ${hours}:${minutes}`;
    return `${year}-${month}-${day}`;
}

function getBangladeshDateString(date = new Date()) {
    const bdDate = toBangladeshTime(date);
    if (!bdDate) return new Date().toISOString().split('T')[0];
    const year = bdDate.getUTCFullYear();
    const month = String(bdDate.getUTCMonth() + 1).padStart(2, '0');
    const day = String(bdDate.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function getUTCFromLocalDate(dateString) {
    if (!dateString) return new Date();
    const [year, month, day] = dateString.split('-');
    return new Date(Date.UTC(parseInt(year), parseInt(month) - 1, parseInt(day), 0, 0, 0));
}

function formatDisplayTime(date) {
    const bdDate = toBangladeshTime(date);
    if (!bdDate) return 'N/A';
    return bdDate.toLocaleString('bn-BD', {
        timeZone: 'Asia/Dhaka',
        year: 'numeric', month: 'long', day: 'numeric',
        hour: '2-digit', minute: '2-digit', hour12: false
    });
}

function getTodayDate() {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// ==========================================
// 🛡️ নিরাপদ প্রাইস ইউটিলিটি
// ==========================================
function getSafePrice(price, fallbackPrice = 0) {
    if (price === null || price === undefined || isNaN(price) || price === 0) return fallbackPrice;
    const numPrice = Number(price);
    if (isNaN(numPrice) || numPrice <= 0) return fallbackPrice;
    return numPrice;
}

function calculatePercentage(value, base) {
    if (!base || base === 0 || isNaN(base) || isNaN(value)) return 0;
    return (value / base) * 100;
}

function safeDivision(dividend, divisor, defaultValue = 0) {
    if (!divisor || divisor === 0 || isNaN(divisor) || isNaN(dividend)) return defaultValue;
    return dividend / divisor;
}

// ==========================================
// 📦 অ্যারে ভাগ করার হেলপার (ব্যাচ কোয়েরির জন্য)
// ==========================================
function chunkArray(array, chunkSize = 10) {
    const chunks = [];
    for (let i = 0; i < array.length; i += chunkSize) {
        chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
}

// ==========================================
// 🚦 API RATE LIMITER
// ==========================================
class APIRateLimiter {
    constructor(maxRequestsPerSecond = 3) {
        this.queue = [];
        this.processing = false;
        this.minDelay = 1000 / maxRequestsPerSecond;
        this.lastCall = 0;
    }
    async request(fn) {
        return new Promise((resolve, reject) => {
            this.queue.push({ fn, resolve, reject });
            this.process();
        });
    }
    async process() {
        if (this.processing || this.queue.length === 0) return;
        this.processing = true;
        while (this.queue.length > 0) {
            const now = Date.now();
            const timeToWait = Math.max(0, this.minDelay - (now - this.lastCall));
            if (timeToWait > 0) await new Promise(r => setTimeout(r, timeToWait));
            const { fn, resolve, reject } = this.queue.shift();
            this.lastCall = Date.now();
            try { resolve(await fn()); } catch (error) { reject(error); }
        }
        this.processing = false;
    }
}
const apiLimiter = new APIRateLimiter(3);

// ==========================================
// 💰 কমিশন ম্যানেজার
// ==========================================
class CommissionManager {
    constructor() {
        this.STORAGE_KEY = CONFIG.STORAGE_KEYS.COMMISSION || 'commissionPercent';
        this.loadSettings();
    }
    loadSettings() {
        const saved = localStorage.getItem(this.STORAGE_KEY);
        this.percent = saved ? parseFloat(saved) : CONFIG.DEFAULTS.COMMISSION_PERCENT || 0;
    }
    saveSettings() {
        localStorage.setItem(this.STORAGE_KEY, String(this.percent));
    }
    calculateCommission(amount) {
        return amount * (this.percent / 100);
    }
    getBuyTotalWithCommission(amount) {
        return amount + this.calculateCommission(amount);
    }
    getSellNetWithCommission(amount) {
        return amount - this.calculateCommission(amount);
    }
    getPercent() {
        return this.percent;
    }
    updatePercent(percent) {
        this.percent = Math.max(0, parseFloat(percent) || 0);
        this.saveSettings();
        // UI আপডেটের জন্য ইভেন্ট
        if (typeof document !== 'undefined') {
            document.dispatchEvent(new CustomEvent('commissionChanged', { detail: { percent: this.percent } }));
        }
    }
    calculateFullTransaction(buyPrice, sellPrice, qty) {
        const buyAmount = buyPrice * qty;
        const sellAmount = sellPrice * qty;
        const buyCommission = this.calculateCommission(buyAmount);
        const sellCommission = this.calculateCommission(sellAmount);
        return {
            buyAmount,
            sellAmount,
            buyCommission,
            sellCommission,
            netBuy: buyAmount + buyCommission,
            netSell: sellAmount - sellCommission,
            grossProfit: sellAmount - buyAmount,
            netProfit: (sellAmount - sellCommission) - (buyAmount + buyCommission),
            commissionPercent: this.percent
        };
    }
}
const commissionManager = new CommissionManager();

// ==========================================
// 🗄️ FIREBASE DATA MANAGER
// ==========================================
class FirebaseDataManager {
    constructor() {
        this.cache = new Map();
        this.cacheTTL = 1800000;
        this.pendingRequests = new Map();
        this.dataInfo = { source: 'firebase', lastUpdate: null, recordsCount: 0 };
    }
    async getCachedOrFetch(key, fetchFn, ttl = this.cacheTTL) {
        if (this.cache.has(key)) {
            const cached = this.cache.get(key);
            if (Date.now() - cached.timestamp < ttl) return cached.data;
        }
        if (this.pendingRequests.has(key)) return this.pendingRequests.get(key);
        const promise = fetchFn().then(data => {
            this.cache.set(key, { data, timestamp: Date.now() });
            this.pendingRequests.delete(key);
            return data;
        }).catch(err => {
            this.pendingRequests.delete(key);
            throw err;
        });
        this.pendingRequests.set(key, promise);
        return promise;
    }
    async getLastUpdateTime() {
        try {
            if (typeof db === 'undefined') return null;
            const snapshot = await db.collection('cse_detailed_data')
                .orderBy('date', 'desc')
                .limit(1)
                .get();
            if (!snapshot.empty) {
                const data = snapshot.docs[0].data();
                if (data.date) {
                    const bangladeshTime = toBangladeshTime(new Date(data.date));
                    bangladeshTime.setUTCHours(5, 0, 0, 0);
                    return bangladeshTime;
                }
            }
            return null;
        } catch (error) {
            console.error('Error getting last update time:', error);
            return null;
        }
    }
    async getFormattedLastUpdate() {
        const lastUpdate = await this.getLastUpdateTime();
        return lastUpdate ? formatDisplayTime(lastUpdate) : 'Not available';
    }
    async getPriceByDate(ticker, date) {
        if (!ticker || !date) return null;
        try {
            if (typeof db === 'undefined') return null;
            const snapshot = await db.collection('daily_prices')
                .where('ticker', '==', ticker)
                .where('date', '==', date)
                .limit(1)
                .get();
            if (!snapshot.empty) {
                const data = snapshot.docs[0].data();
                return parseFloat(data.price) || parseFloat(data.close) || null;
            }
            return null;
        } catch (e) {
            console.warn(`⚠️ daily_prices query failed for ${ticker} on ${date}:`, e.message);
            try {
                const snapAll = await db.collection('daily_prices')
                    .where('ticker', '==', ticker)
                    .get();
                let found = null;
                snapAll.forEach(doc => {
                    const d = doc.data();
                    if (d.date === date) {
                        found = parseFloat(d.price) || parseFloat(d.close) || null;
                    }
                });
                return found;
            } catch (e2) {
                return null;
            }
        }
    }
    getDataStatus() { return { ...this.dataInfo }; }
    clearCache() {
        this.cache.clear();
        this.pendingRequests.clear();
        console.log('🗑️ FirebaseDataManager cache cleared');
    }
}
const firebaseDataManager = new FirebaseDataManager();

// ==========================================
// 📈 ইউনিফাইড প্রাইস ফেচার
// ==========================================
let unifiedPriceCache = new Map();
let lastUnifiedPriceUpdate = 0;
const UNIFIED_PRICE_CACHE_TTL = CONFIG.CACHE.TTL.UNIFIED_PRICE || 300000;

function getHardcodedPrice(ticker) {
    const prices = {
        "GP": 255.40,
        "ROBI": 26.10,
        "SQURPHARMA": 208.70,
        "BATBC": 518.00,
        "BEXIMCO": 115.20
    };
    return prices[ticker] || 0.0;
}

// ==========================================
// 📈 getUnifiedPrice - ক্যাশিং সহ (sessionStorage + মেমোরি)
// ==========================================

/**
 * যেকোনো টিকারের বর্তমান দাম ফেরত দেয় – ক্যাশ, Supabase, Firebase, হার্ডকোডেড
 * @param {string} ticker - শেয়ারের কোড (যেমন "GP")
 * @param {boolean} forceRefresh - true দিলে ক্যাশ উপেক্ষা করে নতুন ডেটা ফেচ করবে
 * @returns {Promise<number>} - দাম (০ হলে পাওয়া যায়নি)
 */
async function getUnifiedPrice(ticker, forceRefresh = false) {
    if (!ticker) return 0;
    const now = Date.now();
    const TTL = CONFIG?.CACHE?.TTL?.UNIFIED_PRICE || 300000; // ৫ মিনিট
    const CACHE_KEY = `price_${ticker}`;

    // -----------------------------------------------------
    // ১. sessionStorage ক্যাশ চেক (forceRefresh false হলে)
    // -----------------------------------------------------
    if (!forceRefresh) {
        const cached =await CacheManager.get(CACHE_KEY, TTL);
        if (cached !== null && typeof cached === 'object' && cached.price > 0) {
            // মেমোরি ক্যাশও আপডেট করে রাখি (যাতে বারবার sessionStorage না পড়তে হয়)
            unifiedPriceCache.set(ticker, { 
                price: cached.price, 
                timestamp: now 
            });
            return cached.price;
        }
    }

    // -----------------------------------------------------
    // ২. মেমোরি ক্যাশ চেক (দ্রুত অ্যাক্সেসের জন্য)
    // -----------------------------------------------------
    if (unifiedPriceCache.has(ticker)) {
        const memCached = unifiedPriceCache.get(ticker);
        if (now - memCached.timestamp < TTL) {
            // sessionStorage-এও সেভ করে রাখি (যাতে পেজ রিলোডে কাজ করে)
            CacheManager.set(CACHE_KEY, { price: memCached.price }, TTL);
            return memCached.price;
        } else {
            // মেয়াদ শেষ, মুছে ফেলি
            unifiedPriceCache.delete(ticker);
        }
    }

    // -----------------------------------------------------
    // ৩. ডেটাবেস থেকে ফেচ (Supabase → Firebase)
    // Production never substitutes stale demo prices for missing market data.
    // -----------------------------------------------------
    let price = 0;
    const sources = [];

    // ৩.১ Supabase cse_market_data (প্রথম)
    if (typeof supabase !== 'undefined' && supabase) {
        sources.push(
            supabase
                .from('cse_market_data')
                .select('ltp')
                .eq('code', ticker)
                .order('date', { ascending: false })
                .limit(1)
                .then(({ data, error }) => {
                    if (!error && data && data.length > 0) {
                        const val = parseFloat(data[0].ltp);
                        if (!isNaN(val) && val > 0) return val;
                    }
                    return null;
                })
                .catch(() => null)
        );
    }

    // ৩.২ Supabase dse_live_data (দ্বিতীয়)
    if (typeof supabase !== 'undefined' && supabase) {
        sources.push(
            supabase
                .from('dse_live_data')
                .select('ltp')
                .eq('ticker', ticker)
                .order('date', { ascending: false })
                .limit(1)
                .then(({ data, error }) => {
                    if (!error && data && data.length > 0) {
                        const val = parseFloat(data[0].ltp);
                        if (!isNaN(val) && val > 0) return val;
                    }
                    return null;
                })
                .catch(() => null)
        );
    }

    // ৩.৩ Firebase daily_prices (ফ্যালব্যাক)
    if (typeof db !== 'undefined' && db) {
        sources.push(
            db
                .collection('daily_prices')
                .where('ticker', '==', ticker)
                .orderBy('date', 'desc')
                .limit(1)
                .get()
                .then((snap) => {
                    if (!snap.empty) {
                        const data = snap.docs[0].data();
                        const val = parseFloat(data.price) || parseFloat(data.close) || 0;
                        if (val > 0) return val;
                    }
                    return null;
                })
                .catch(() => null)
        );
    }

    // ৩.৪ সমস্ত সোর্স থেকে রেজাল্ট সংগ্রহ
    if (sources.length > 0) {
        const results = await Promise.all(sources);
        for (const result of results) {
            if (result && result > 0) {
                price = result;
                break;
            }
        }
    }

    // ৩.৫ Optional demo fallback (OFF by default in production)
    if (price === 0 && CONFIG?.DEFAULTS?.ALLOW_DEMO_PRICE_FALLBACK === true) {
        price = getHardcodedPrice(ticker);
    }

    // -----------------------------------------------------
    // ৪. ক্যাশে সেভ করা (শুধু যদি দাম > ০ হয়)
    // -----------------------------------------------------
    if (price > 0) {
        // মেমোরি ক্যাশ
        unifiedPriceCache.set(ticker, { 
            price: price, 
            timestamp: now 
        });
        // sessionStorage ক্যাশ
        await CacheManager.set(CACHE_KEY, { price }, TTL);
    }

    return price;
}

function resetUnifiedPriceCache() {
    unifiedPriceCache.clear();
    console.log('🔄 Unified price cache reset');
}

// ==========================================
// 📦 আগের দিনের প্রাইস ফেচ
// ==========================================
async function getPreviousDayPrice(ticker) {
    if (!ticker) return 0;
    const today = new Date();
    for (let i = 1; i <= 7; i++) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const dateStr = date.toISOString().split('T')[0];

        // ১. Supabase dse_live_data
        if (typeof supabase !== 'undefined' && supabase) {
            try {
                const { data, error } = await supabase
                    .from('dse_live_data')
                    .select('ltp')
                    .eq('ticker', ticker)
                    .eq('date', dateStr)
                    .limit(1);
                if (!error && data && data.length > 0) {
                    const val = parseFloat(data[0].ltp);
                    if (val > 0) return val;
                }
            } catch (e) {}
        }

        // ২. Supabase cse_market_data
        if (typeof supabase !== 'undefined' && supabase) {
            try {
                const { data, error } = await supabase
                    .from('cse_market_data')
                    .select('ltp')
                    .eq('code', ticker)
                    .eq('date', dateStr)
                    .limit(1);
                if (!error && data && data.length > 0) {
                    const val = parseFloat(data[0].ltp);
                    if (val > 0) return val;
                }
            } catch (e) {}
        }

        // ৩. Firebase daily_prices
        if (typeof db !== 'undefined' && db) {
            try {
                const snap = await db.collection('daily_prices')
                    .where('ticker', '==', ticker)
                    .where('date', '==', dateStr)
                    .limit(1)
                    .get();
                if (!snap.empty) {
                    const data = snap.docs[0].data();
                    const val = parseFloat(data.price) || parseFloat(data.close) || 0;
                    if (val > 0) return val;
                }
            } catch (e) {}
        }
    }
    return 0;
}

// ==========================================
// 📊 getLatestAndPreviousPrices - ক্যাশিং সহ (ব্যাচ + ইনক্রিমেন্টাল)
// ==========================================

/**
 * একাধিক টিকারের বর্তমান ও আগের দিনের দাম ফেরত দেয় (ক্যাশিং সহ)
 * @param {string[]} tickers - শেয়ারের কোডের অ্যারে (যেমন ["GP", "ROBI"])
 * @param {boolean} forceRefresh - true দিলে ক্যাশ উপেক্ষা করে নতুন ডেটা ফেচ করবে
 * @returns {Promise<Map<string, {currentPrice, currentDate, previousPrice, previousDate}>>}
 */
// ==========================================
// 📊 getLatestAndPreviousPrices - ক্যাশিং সহ (ব্যাচ + ইনক্রিমেন্টাল)
//    High/Low সহ Today's Price, Previous Price, Today's High, Today's Low
// ==========================================

/**
 * একাধিক টিকারের বর্তমান ও আগের দিনের দাম ফেরত দেয় (ক্যাশিং সহ)
 * @param {string[]} tickers - শেয়ারের কোডের অ্যারে (যেমন ["GP", "ROBI"])
 * @param {boolean} forceRefresh - true দিলে ক্যাশ উপেক্ষা করে নতুন ডেটা ফেচ করবে
 * @returns {Promise<Map<string, {currentPrice, currentDate, previousPrice, previousDate, high, low}>>}
 */
async function getLatestAndPreviousPrices(tickers, forceRefresh = false) {
    if (!tickers || !tickers.length) return new Map();
    
    const TTL = CONFIG?.CACHE?.TTL?.UNIFIED_PRICE || 300000; // ৫ মিনিট
    const resultMap = new Map();
    const missingTickers = [];

    // -----------------------------------------------------
    // ১. ক্যাশ থেকে ডেটা পড়া (forceRefresh false হলে)
    // -----------------------------------------------------
    if (!forceRefresh) {
        for (const ticker of tickers) {
            const cacheKey = `price_detail_${ticker}`;
            const cached = CacheManager.get(cacheKey, TTL);
            if (cached && typeof cached === 'object' && cached.currentPrice > 0) {
                resultMap.set(ticker, {
                    currentPrice: cached.currentPrice,
                    currentDate: cached.currentDate || null,
                    previousPrice: cached.previousPrice || 0,
                    previousDate: cached.previousDate || null,
                    high: cached.high || 0,
                    low: cached.low || 0
                });
            } else {
                missingTickers.push(ticker);
            }
        }

        // যদি সব টিকার ক্যাশ থাকে, তাহলে সরাসরি রিটার্ন
        if (missingTickers.length === 0) {
            return resultMap;
        }
    } else {
        // forceRefresh = true হলে সব টিকার জন্য নতুন ফেচ করতে হবে
        missingTickers.push(...tickers);
    }

    // -----------------------------------------------------
    // ২. শুধু যাদের ক্যাশ নেই, তাদের জন্য ডেটাবেস থেকে ফেচ
    // -----------------------------------------------------
    const today = new Date();
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(today.getDate() - 7);
    const startDateStr = sevenDaysAgo.toISOString().split('T')[0];
    const todayStr = today.toISOString().split('T')[0];

    // ডেটা সংরক্ষণের জন্য অস্থায়ী ম্যাপ
    const fetchedData = new Map();

    // ---------- ২.১ Supabase থেকে ব্যাচে ডেটা ----------
    if (typeof supabase !== 'undefined' && supabase) {
        const supabaseChunks = chunkArray(missingTickers, 10);
        
        // ২.১.১ cse_market_data (CSE) - বর্তমান প্রাইস + High/Low
        for (const chunk of supabaseChunks) {
            try {
                const { data, error } = await supabase
                    .from('cse_market_data')
                    .select('code, ltp, high, low, date')
                    .in('code', chunk)
                    .order('date', { ascending: false });
                if (!error && data) {
                    const seen = new Set();
                    data.forEach(row => {
                        if (!seen.has(row.code)) {
                            seen.add(row.code);
                            const val = parseFloat(row.ltp) || 0;
                            if (val > 0) {
                                if (!fetchedData.has(row.code)) {
                                    fetchedData.set(row.code, { 
                                        currentPrice: 0, 
                                        currentDate: null,
                                        high: 0,
                                        low: 0
                                    });
                                }
                                const cur = fetchedData.get(row.code);
                                if (!cur.currentPrice || cur.currentPrice === 0) {
                                    cur.currentPrice = val;
                                    cur.currentDate = row.date;
                                    cur.high = parseFloat(row.high) || 0;
                                    cur.low = parseFloat(row.low) || 0;
                                }
                            }
                        }
                    });
                }
            } catch (e) { console.warn('Supabase cse_market batch error:', e); }
        }

        // ২.১.২ dse_live_data (DSE) – শুধু যাদের CSE প্রাইস নেই
        const stillMissing = missingTickers.filter(t => !fetchedData.has(t) || fetchedData.get(t).currentPrice === 0);
        if (stillMissing.length > 0) {
            const dseChunks = chunkArray(stillMissing, 10);
            for (const chunk of dseChunks) {
                try {
                    const { data, error } = await supabase
                        .from('dse_live_data')
                        .select('ticker, ltp, high, low, date')
                        .in('ticker', chunk)
                        .order('date', { ascending: false });
                    if (!error && data) {
                        const seen = new Set();
                        data.forEach(row => {
                            if (!seen.has(row.ticker)) {
                                seen.add(row.ticker);
                                const val = parseFloat(row.ltp) || 0;
                                if (val > 0) {
                                    if (!fetchedData.has(row.ticker)) {
                                        fetchedData.set(row.ticker, { 
                                            currentPrice: 0, 
                                            currentDate: null,
                                            high: 0,
                                            low: 0
                                        });
                                    }
                                    const cur = fetchedData.get(row.ticker);
                                    if (!cur.currentPrice || cur.currentPrice === 0) {
                                        cur.currentPrice = val;
                                        cur.currentDate = row.date;
                                        cur.high = parseFloat(row.high) || 0;
                                        cur.low = parseFloat(row.low) || 0;
                                    }
                                }
                            }
                        });
                    }
                } catch (e) { console.warn('Supabase dse_live batch error:', e); }
            }
        }
    }

    // ---------- ২.২ Firebase থেকে ব্যাচে ডেটা (Supabase না পেলে) ----------
    if (typeof db !== 'undefined' && db) {
        const stillMissingFB = missingTickers.filter(t => !fetchedData.has(t) || fetchedData.get(t).currentPrice === 0);
        if (stillMissingFB.length > 0) {
            const fbChunks = chunkArray(stillMissingFB, 10);
            for (const chunk of fbChunks) {
                try {
                    // daily_prices থেকে বর্তমান প্রাইস
                    const snap = await db.collection('daily_prices')
                        .where('ticker', 'in', chunk)
                        .orderBy('date', 'desc')
                        .get();
                    if (!snap.empty) {
                        const seen = new Set();
                        snap.forEach(doc => {
                            const data = doc.data();
                            if (!seen.has(data.ticker)) {
                                seen.add(data.ticker);
                                const val = parseFloat(data.price) || parseFloat(data.close) || 0;
                                if (val > 0) {
                                    if (!fetchedData.has(data.ticker)) {
                                        fetchedData.set(data.ticker, { 
                                            currentPrice: 0, 
                                            currentDate: null,
                                            high: 0,
                                            low: 0
                                        });
                                    }
                                    const cur = fetchedData.get(data.ticker);
                                    if (!cur.currentPrice || cur.currentPrice === 0) {
                                        cur.currentPrice = val;
                                        cur.currentDate = data.date;
                                        // Firebase daily_prices-এ high/low নেই, তাই 0
                                        cur.high = 0;
                                        cur.low = 0;
                                    }
                                }
                            }
                        });
                    }
                } catch (e) { console.warn('Firebase daily_prices batch error:', e); }
            }
        }
    }

    // ---------- ২.৩ আগের দিনের প্রাইস (Previous Price) ফেচ ----------
    // যাদের currentPrice আছে, তাদের জন্য previousPrice বের করি
    const tickersWithCurrent = [];
    for (const [ticker, data] of fetchedData) {
        if (data.currentPrice > 0 && data.currentDate) {
            tickersWithCurrent.push(ticker);
        }
    }

    if (tickersWithCurrent.length > 0) {
        // Supabase cse_market_data থেকে আগের দিনের ডেটা
        if (typeof supabase !== 'undefined' && supabase) {
            const prevChunks = chunkArray(tickersWithCurrent, 10);
            for (const chunk of prevChunks) {
                try {
                    const { data, error } = await supabase
                        .from('cse_market_data')
                        .select('code, ltp, date')
                        .in('code', chunk)
                        .gte('date', startDateStr)
                        .order('date', { ascending: false });
                    if (!error && data) {
                        const tickerDataMap = {};
                        data.forEach(row => {
                            if (!tickerDataMap[row.code]) tickerDataMap[row.code] = [];
                            tickerDataMap[row.code].push(row);
                        });
                        for (const [ticker, rows] of Object.entries(tickerDataMap)) {
                            const currentInfo = fetchedData.get(ticker);
                            if (!currentInfo || !currentInfo.currentDate) continue;
                            const currentDateObj = new Date(currentInfo.currentDate);
                            let bestPrev = null;
                            for (const row of rows) {
                                const rowDate = new Date(row.date);
                                if (rowDate < currentDateObj) {
                                    if (!bestPrev || rowDate > new Date(bestPrev.date)) {
                                        bestPrev = row;
                                    }
                                }
                            }
                            if (bestPrev) {
                                const val = parseFloat(bestPrev.ltp);
                                if (val > 0) {
                                    currentInfo.previousPrice = val;
                                    currentInfo.previousDate = bestPrev.date;
                                }
                            }
                        }
                    }
                } catch (e) { console.warn('Supabase previous price batch error:', e); }
            }
        }

        // Firebase daily_prices থেকে (Supabase না পেলে)
        const stillMissingPrev = tickersWithCurrent.filter(t => {
            const info = fetchedData.get(t);
            return !info.previousPrice || info.previousPrice === 0;
        });
        if (stillMissingPrev.length > 0 && typeof db !== 'undefined' && db) {
            const fbChunks = chunkArray(stillMissingPrev, 10);
            for (const chunk of fbChunks) {
                try {
                    const snap = await db.collection('daily_prices')
                        .where('ticker', 'in', chunk)
                        .where('date', '>=', startDateStr)
                        .orderBy('date', 'asc')
                        .get();
                    if (!snap.empty) {
                        const tickerDataMap = {};
                        snap.forEach(doc => {
                            const data = doc.data();
                            if (!tickerDataMap[data.ticker]) tickerDataMap[data.ticker] = [];
                            tickerDataMap[data.ticker].push(data);
                        });
                        for (const [ticker, rows] of Object.entries(tickerDataMap)) {
                            const currentInfo = fetchedData.get(ticker);
                            if (!currentInfo || !currentInfo.currentDate) continue;
                            const currentDateObj = new Date(currentInfo.currentDate);
                            let bestPrev = null;
                            for (const row of rows) {
                                const rowDate = new Date(row.date);
                                if (rowDate < currentDateObj) {
                                    if (!bestPrev || rowDate > new Date(bestPrev.date)) {
                                        bestPrev = row;
                                    }
                                }
                            }
                            if (bestPrev) {
                                const val = parseFloat(bestPrev.price) || parseFloat(bestPrev.close) || 0;
                                if (val > 0) {
                                    currentInfo.previousPrice = val;
                                    currentInfo.previousDate = bestPrev.date;
                                }
                            }
                        }
                    }
                } catch (e) { console.warn('Firebase previous price batch error:', e); }
            }
        }
    }

    // ---------- ২.৪ যাদের কোনো ডেটা পাওয়া যায়নি, তাদের জন্য হার্ডকোডেড ফ্যালব্যাক ----------
    for (const ticker of missingTickers) {
        if (!fetchedData.has(ticker) || fetchedData.get(ticker).currentPrice === 0) {
            const hardcoded = getHardcodedPrice(ticker);
            if (hardcoded > 0) {
                fetchedData.set(ticker, {
                    currentPrice: hardcoded,
                    currentDate: todayStr,
                    previousPrice: 0,
                    previousDate: null,
                    high: 0,
                    low: 0
                });
            }
        }
    }

    // -----------------------------------------------------
    // ৩. resultMap তৈরি ও ক্যাশে সেভ করা
    // -----------------------------------------------------
    for (const [ticker, data] of fetchedData) {
        if (data.currentPrice > 0) {
            const finalData = {
                currentPrice: data.currentPrice,
                currentDate: data.currentDate || null,
                previousPrice: data.previousPrice || 0,
                previousDate: data.previousDate || null,
                high: data.high || 0,
                low: data.low || 0
            };
            resultMap.set(ticker, finalData);
            
            // sessionStorage ক্যাশ
            CacheManager.set(`price_detail_${ticker}`, finalData, TTL);
        }
    }

    // যাদের এখনও কোনো ডেটা নেই, তাদের ডিফল্ট ০ সেট করি
    for (const ticker of tickers) {
        if (!resultMap.has(ticker)) {
            resultMap.set(ticker, {
                currentPrice: 0,
                currentDate: null,
                previousPrice: 0,
                previousDate: null,
                high: 0,
                low: 0
            });
        }
    }

    return resultMap;
}

// ==========================================
// 📌 গ্লোবাল এক্সপোজ (ইতিমধ্যে core.js-এর শেষে আছে)
// ==========================================
window.getLatestAndPreviousPrices = getLatestAndPreviousPrices;

// ==========================================
// 📋 DSE স্টক লিস্ট
// ==========================================
const dseStocks = [
    "1JANATAMF", "1STPRIMFMF", "AAMRANET", "AAMRATECH", "ABB1STMF", "ABBANK", "ACFL", "ACI", "ACIFORMULA", "ACMELAB",
    "ACTIVEFINE", "ADNTEL", "ADVENT", "AFCAGRO", "AFTABAUTO", "AGNISYSL", "AGRANINS", "AIBL1STIMF", "AIL", "AL-HAJTEX",
    "ALARABANK", "ALIF", "ALLTEX", "AMANFEED", "AMBEEPHA", "ANLIMAYARN", "ANWARGALV", "APEXFOODS", "APEXFOOT", "APEXSPINN",
    "APOLOISPAT", "ARAMIT", "ARAMITCEM", "ARGONDENIM", "ASIAPACINS", "ATCSLGF", "ATLASBANG", "AZIZPIPES", "BANGAS", "BANKASIA",
    "BATASHOE", "BATBC", "BAYLEASING", "BBS", "BCC", "BDCOM", "BDFINANCE", "BDLAMPS", "BDTHAI", "BDTHAIFOOD",
    "BDWELDING", "BEACHHATCH", "BEACONPHAR", "BENGALWTL", "BERGERPBL", "BEXGSUKUK", "BEXIMCO", "BGIC", "BIFC", "BNICL",
    "BPML", "BPPL", "BRACBANK", "BSC", "BSCCL", "BSRMLTD", "BSRMSTEEL", "BXPHARMA", "CAPMBDBLMF", "CAPMIBBLMF", "BESTHLDNG",
    "CENTRALINS", "CENTRALPHL", "CITYBANK", "CNATEX", "CONFIDCEM", "CONTININS", "COPPERTECH", "CROWNCEMNT", "CVOPRL", "DACCADYE",
    "DAFODILCOM", "DBH", "DBH1STMF", "DELTALIFE", "DELTASPINN", "DESCO", "DESHBANDHU", "DHAKABANK", "DOMINAGE", "DOREENPWR",
    "DSSL", "Dulamiacot", "DUTCHBANGL", "EASTLAND", "EASTRNLUB", "EBL", "EBL1STMF", "EBLNRBMF", "ECABLES", "EGEN",
    "EMERALDOIL", "ENVOYTEX", "EPGL", "ESQUIRENIT", "ETL", "EXIM1STMF", "EXIMBANK", "FAMILYTEX", "FARCHEM", "FAREASTLIF", "FAREASTFIN",
    "FASFIN", "FBFIF", "FEDERALINS", "FEKDIL", "FINEFOODS", "FIRSTFIN", "FIRSTSBANK", "FORTUNE", "FUWANGCER",
    "FUWANGFOOD", "GBBPOWER", "GEMINISEA", "GENEXIL", "GENNEXT", "GHAIL", "GHCL", "GIB", "GLAXOSMITH", "GLOBALINS",
    "GOLDENSON", "GP", "GPHISPAT", "GQBALLPEN", "GSPFINANCE", "GRAMEENS2", "GREENDELT", "HAKKANIPUL", "HEIDELBCEM", "HFL", "HRTEX",
    "HWAWELLTEX", "IBNSINA", "IBP", "ICB", "ICB3RDNRB", "ICBAGRANI1", "ICBAMCL2ND", "ICBEPMF1S1", "IDLC", "IFADAUTOS", "ICICL",
    "IFIC", "IFIC1STMF", "IFILISLMF1", "ILFSL", "INDEXAGRO", "INTECH", "INTRACO", "IPDC", "ISLAMIBANK", "ISLAMICFIN", "ICBEPMF1S1",
    "ISNLTD", "ITC", "JAMUNABANK", "JAMUNAOIL", "JANATAINS", "JHRML", "JMISMDL", "JUTESPINN", "KARNAPHULI", "KAY&QUE",
    "KBPPWBIL", "KDSALTD", "KEYACOSMET", "KPCL", "KPPL", "LANKABAFIN", "LEGACYFOOT", "LHBL", "LIBRAINFU", "LINDEBD",
    "LOVELLO", "LRBDL", "MARICO", "MATINSPINN", "MBL1STMF", "MEGCONMILK", "MEGHNACEM", "MEGHNALIFE", "MEGHNAPET", "MERCANBANK",
    "MERCINS", "METROSPIN", "MHSML", "MIDASFIN", "MIRACLEIND", "MIRAKHTER", "MONNOAGML", "MONNOCERA", "MONNOFABR", "MONOSPOOL","MALEKSPIN", "MPETROLEUM", "MTB", "MIDLANDBNK", "NAHEEACP", "NATLIFEINS", "NAVANACNG", "NAVANAPHAR", "NBL", "NCCBANK", "NCCBLMF1", "NEWLINE",
    "NITOLINS", "NORTHERN", "NORTHRNINS", "NPOLYMER", "NRBBANK", "NTLTUBES", "OAL", "NHFIL", "OIMEX", "OLYMPIC", "ONEBANKPLC",
    "ORIONINFU", "ORIONPHARM", "PADMALIFE", "PADMAOIL", "PARAMOUNT", "PDL", "PENINSULA", "PEOPLESINS", "PF1STMF", "PHARMAID",
    "PHENIXINS", "PHOENIXFIN", "PIONEERINS", "PLFSL", "POPULAR1MF", "POPULARLIF", "POWERGRID", "PRAGATIINS", "PRAGATILIF", "PREMIERBAN",
    "PREMIERCEM", "PREMIERLEA", "PRIME1ICBA", "PRIMEBANK", "PRIMEFIN", "PRIMEINSUR", "PRIMELIFE", "PROGRESLIF", "PROVATIINS", "PTL",
    "PUBALIBANK", "PURABIGEN", "QUASEMIND", "QUEENSOUTH", "RAHIMAFOOD", "RAKCERAMIC", "RANFOUNDRY", "RDFOOD", "RECKITTBEN", "REGENTTEX",
    "RELIANCE1", "RENATA", "REPUBLIC", "RINGSHINE", "ROBI", "RSRMSTEEL", "RUNNERAUTO", "RUPALIBANK", "RUPALIINS", "SAFKOSPINN",
    "SAIFPOWER", "SAIHAMCOT", "SAIHAMTEX", "SALAMCRST", "SALVOCHEM", "SAMATALETH", "SAMORITA", "SANDHANINS", "SAPORTL", "SAVAREFR",
    "SEAPEARL", "SEMLFBSLGF", "SEMLIBBLSF", "SEMLLECMF", "SHAHJABANK", "SHASHADNIM", "SHEPHERD", "SHURWID", "SHYAMPSUG", "SIBL",
    "SICL", "SILCOPHL", "SILVAPHL", "SIMTEX", "SINOBANGLA", "SKICL", "SONALIANSH", "SONALILIFE", "SONALIPAPR", "SONARBAINS",
    "SOUTHEASTB", "SPCERAMICS", "SQURPHARMA", "SSSTEEL", "STANCERAM", "STANDARINS", "STANDBANKL", "STYLECRAFT", "SUMITPOWER", "SUNLIFEINS",
    "TAKAFULINS", "TALLUSPIN", "TAMIJTEX", "TECHNODRUG", "TILIL", "TITASGAS", "TOSRIFA", "TRUSTBANK", "TUNGHAI", "UCB",
    "UNILEVERCL", "UNIONBANK", "UNIONCAP", "UNIONINS", "UNIQUEHRL", "UNITEDFIN", "UNITEDINS", "UPGDCL", "USMANIAGL", "UTTARABANK",
    "UTTARAFIN", "VAMLBDMF1", "VAMLRBBF", "VFSTDL", "WALTONHIL", "WATACHEM", "WMSHIPYARD", "YPL", "ZAHEENSPIN", "ZAHINTEX"
];

// ==========================================
// 📈 Supabase history_dse থেকে ঐতিহাসিক ডেটা ফেচ (হেলপার)
// ==========================================
async function getHistoricalPricesFromSupabase(ticker, startDate, endDate = null) {
    if (!ticker || !startDate) return [];
    try {
        if (typeof supabase === 'undefined' || !supabase) return [];
        let query = supabase
            .from('history_dse')
            .select('date, ltp, high, low')
            .eq('ticker', ticker)
            .gte('date', startDate)
            .order('date', { ascending: true });
        if (endDate) {
            query = query.lte('date', endDate);
        }
        const { data, error } = await query;
        if (error) {
            console.warn(`Supabase history_dse fetch error for ${ticker}:`, error);
            return [];
        }
        return data || [];
    } catch (err) {
        console.warn(`Exception in getHistoricalPricesFromSupabase for ${ticker}:`, err);
        return [];
    }
}

// ==========================================
// 📈 Supabase dsex_index থেকে সর্বশেষ DSEX মান ও আগের দিনের মান
// ==========================================
async function getLatestDSEXFromSupabase() {
    try {
        if (typeof supabase === 'undefined' || !supabase) return null;
        
        // ১. সর্বশেষ ২টি রেকর্ড (আজ ও গতকাল) নিন
        const { data, error } = await supabase
            .from('dsex_index')
            .select('value, updated_at, date')
            .eq('index_name', 'DSEX')
            .order('updated_at', { ascending: false })
            .limit(2);
        
        if (error || !data || data.length === 0) return null;
        
        // ২. আজকের ডেটা (সর্বশেষ)
        const latest = data[0];
        const todayValue = parseFloat(latest.value) || 0;
        const todayDate = new Date(latest.updated_at);
        const todayDateStr = latest.date; // raw date
        
        // ৩. গতকালের ডেটা (যদি থাকে)
        let prevValue = null;
        let prevDate = null;
        if (data.length > 1) {
            prevValue = parseFloat(data[1].value) || 0;
            prevDate = new Date(data[1].updated_at);
        }
        
        // ৪. পরিবর্তন ক্যালকুলেট (যদি গতকালের মান থাকে)
        let change = 0;
        let changePercent = 0;
        if (prevValue !== null && prevValue > 0) {
            change = todayValue - prevValue;
            changePercent = (change / prevValue) * 100;
        }
        
        return {
            value: todayValue,
            date: todayDate,
            rawDate: todayDateStr,
            change: change,
            changePercent: changePercent,
            previousValue: prevValue,
            previousDate: prevDate
        };
    } catch (e) {
        console.warn('Error fetching DSEX from Supabase:', e);
        return null;
    }
}

// ==========================================
// 📊 ইউনিফাইড ক্যালকুলেশন ইঞ্জিন
// ==========================================
class UnifiedCalculationEngine {
    constructor() {
        this.cache = new Map();
        this.cacheTTL = 300000;
    }

    // UnifiedCalculationEngine.calculate() - user/portfolio isolated cache
async calculate(userId, portfolioId = null, forceRefresh = false) {
    if (!userId) return null;
    const now = Date.now();
    const cacheKey = `calc_${userId}_${portfolioId || 'all'}`;
    const cached = this.cache.get(cacheKey);
    if (!forceRefresh && cached && (now - cached.timestamp) < this.cacheTTL) {
        console.log('📦 Using cached unified calculation');
        return cached.data;
    }
    console.log('🔄 Calculating portfolio... (portfolioId:', portfolioId || 'all', ')');

    try {
        let portfolioData = [];
        let salesData = [];

        // Supabase
        if (typeof supabase !== 'undefined' && supabase) {
            try {
                const { data: pData, error: pError } = await supabase
                    .from('portfolios').select('*').eq('user_id', userId);
                if (!pError && pData) {
                    const wanted = String(portfolioId || '').trim().toLowerCase();
                    portfolioData = pData.filter(item => {
                        const pid = String(item.portfolio_id ?? '').trim().toLowerCase();
                        if (!wanted || wanted === 'grand') return true;
                        return wanted === 'main' ? (pid === '' || pid === 'main') : pid === wanted;
                    });
                }

                const { data: sData, error: sError } = await supabase
                    .from('sales_history').select('*').eq('user_id', userId);
                if (!sError && sData) {
                    const wanted = String(portfolioId || '').trim().toLowerCase();
                    salesData = sData.filter(item => {
                        const pid = String(item.portfolio_id ?? '').trim().toLowerCase();
                        if (!wanted || wanted === 'grand') return true;
                        return wanted === 'main' ? (pid === '' || pid === 'main') : pid === wanted;
                    });
                }
            } catch (e) { console.warn('Supabase calc fetch failed', e); }
        }

        // Firebase ফ্যালব্যাক
        if (portfolioData.length === 0 && typeof db !== 'undefined' && db) {
            try {
                let pQuery = db.collection('portfolios').where('userId', '==', userId);
                const snap = await pQuery.get();
                snap.forEach(doc => {
                    const data = doc.data();
                    const wanted = String(portfolioId || '').trim().toLowerCase();
                    const pid = String(data.portfolioId ?? '').trim().toLowerCase();
                    if (wanted && wanted !== 'grand' && !(wanted === 'main' ? (pid === '' || pid === 'main') : pid === wanted)) return;
                    portfolioData.push({
                        id: doc.id,
                        user_id: data.userId,
                        share_name: data.shareName,
                        quantity: data.quantity,
                        buy_price: data.buyPrice,
                        commission: data.commission || 0,
                        commission_percent: data.commissionPercent || 0,
                        date: data.date?.toDate?.()?.toISOString?.().split('T')[0] || new Date().toISOString().split('T')[0],
                        created_at: data.createdAt?.toDate?.()?.toISOString() || new Date().toISOString()
                    });
                });
            } catch (e) { console.warn('Firebase calc fetch failed', e); }
        }
        if (salesData.length === 0 && typeof db !== 'undefined' && db) {
            try {
                let sQuery = db.collection('sales_history').where('userId', '==', userId);
                const snap = await sQuery.get();
                snap.forEach(doc => {
                    const data = doc.data();
                    const wanted = String(portfolioId || '').trim().toLowerCase();
                    const pid = String(data.portfolioId ?? '').trim().toLowerCase();
                    if (wanted && wanted !== 'grand' && !(wanted === 'main' ? (pid === '' || pid === 'main') : pid === wanted)) return;
                    salesData.push({
                        id: doc.id,
                        user_id: data.userId,
                        share_name: String(data.shareName ?? '').trim().toUpperCase(),
                        quantity_sold: Number(data.quantitySold) || 0,
                        buy_price: data.buyPrice || 0,
                        sell_price: data.sellPrice || 0,
                        profit_or_loss: data.profitOrLoss || 0,
                        commission: data.commission || 0,
                        commission_percent: data.commissionPercent || 0,
                        net_received: data.netReceived || 0,
                        date: data.date?.toDate?.()?.toISOString?.().split('T')[0] || new Date().toISOString().split('T')[0],
                        created_at: data.createdAt?.toDate?.()?.toISOString() || new Date().toISOString()
                    });
                });
            } catch (e) { console.warn('Firebase sales calc fetch failed', e); }
        }

        // Normalize all rows before calculation. This prevents case/number formatting
        // differences between Buy and Sell records from hiding valid sales.
        portfolioData = portfolioData.map(item => ({
            ...item,
            share_name: String(item.share_name ?? '').trim().toUpperCase(),
            quantity: Number(item.quantity) || 0,
            buy_price: Number(item.buy_price) || 0,
            commission: Number(item.commission) || 0,
            commission_percent: Number(item.commission_percent) || 0,
        })).filter(item => item.share_name && item.quantity > 0);

        salesData = salesData.map(item => ({
            ...item,
            share_name: String(item.share_name ?? '').trim().toUpperCase(),
            quantity_sold: Number(item.quantity_sold) || 0,
        })).filter(item => item.share_name && item.quantity_sold > 0);

        if (portfolioData.length === 0) {
            console.log('No portfolio found for user');
            return null;
        }

        // মোট বিক্রি হিসাব
        const totalSoldMap = new Map();
        salesData.forEach(item => {
            const ticker = String(item.share_name ?? '').trim().toUpperCase();
            const qty = Number(item.quantity_sold) || 0;
            if (!ticker || qty <= 0) return;
            totalSoldMap.set(ticker, (totalSoldMap.get(ticker) || 0) + qty);
        });

        // Buy লট তৈরি
        const allBuyLots = [];
        const buyLots = [];
        portfolioData.forEach(item => {
            const ticker = String(item.share_name ?? '').trim().toUpperCase();
            const qty = Number(item.quantity) || 0;
            const buyPrice = Number(item.buy_price) || 0;
            const commission = Number(item.commission) || 0;
            const commissionPercent = Number(item.commission_percent) || 0;
            const totalCostWithCommission = (qty * buyPrice) + commission;
            const perUnitCostWithCommission = qty > 0 ? totalCostWithCommission / qty : 0;
            const date = item.date ? new Date(item.date) : new Date();
            allBuyLots.push({
                ticker: ticker,
                qty: qty,
                buyPrice: buyPrice,
                totalCostWithCommission: totalCostWithCommission,
                perUnitCostWithCommission: perUnitCostWithCommission,
                date: date,
                commission: commission,
                commissionPercent: commissionPercent
            });
            buyLots.push({ ...allBuyLots[allBuyLots.length - 1] });
        });

        buyLots.sort((a, b) => a.date - b.date);
        allBuyLots.sort((a, b) => a.date - b.date);

        const totalBuyMap = new Map();
        allBuyLots.forEach(lot => {
            if (!totalBuyMap.has(lot.ticker)) {
                totalBuyMap.set(lot.ticker, { totalBuyQty: 0, totalBuyCost: 0 });
            }
            const cur = totalBuyMap.get(lot.ticker);
            cur.totalBuyQty += lot.qty;
            cur.totalBuyCost += lot.qty * lot.buyPrice;
            totalBuyMap.set(lot.ticker, cur);
        });

        // FIFO রিমেইনিং ট্র্যাক
        const remainingTracker = new Map();
        const sellRemaining = new Map(totalSoldMap);
        for (const lot of buyLots) {
            let remainingQty = lot.qty;
            let toSell = sellRemaining.get(lot.ticker) || 0;
            if (toSell > 0 && remainingQty > 0) {
                const sellFromThisLot = Math.min(remainingQty, toSell);
                remainingQty -= sellFromThisLot;
                toSell -= sellFromThisLot;
                sellRemaining.set(lot.ticker, toSell);
            }
            if (remainingQty > 0) {
                if (!remainingTracker.has(lot.ticker)) {
                    remainingTracker.set(lot.ticker, { totalQty: 0, totalCost: 0, totalBuyValue: 0, lots: [] });
                }
                const current = remainingTracker.get(lot.ticker);
                const lotCost = remainingQty * lot.perUnitCostWithCommission;
                const lotBuyValue = remainingQty * lot.buyPrice;
                current.totalQty += remainingQty;
                current.totalCost += lotCost;
                current.totalBuyValue += lotBuyValue;
                current.lots.push({
                    qty: remainingQty,
                    buyPrice: lot.buyPrice,
                    perUnitCostWithCommission: lot.perUnitCostWithCommission,
                    totalCost: lotCost,
                    date: lot.date,
                    commission: lot.commission,
                    commissionPercent: lot.commissionPercent
                });
                remainingTracker.set(lot.ticker, current);
            }
        }

        const stockDetails = [];
        let grandTotalCost = 0, grandTotalBuyValue = 0, grandTotalQty = 0;
        for (const [ticker, data] of remainingTracker) {
            grandTotalCost += data.totalCost;
            grandTotalBuyValue += data.totalBuyValue;
            grandTotalQty += data.totalQty;
            const totalBuyInfo = totalBuyMap.get(ticker) || { totalBuyQty: 0, totalBuyCost: 0 };
            stockDetails.push({
                ticker: ticker,
                totalBuyQty: totalBuyInfo.totalBuyQty,
                totalBuyCost: totalBuyInfo.totalBuyCost,
                totalQty: data.totalQty,
                totalCost: data.totalCost,
                totalBuyValue: data.totalBuyValue,
                avgBuyPriceWithCommission: data.totalCost / data.totalQty,
                avgBuyPrice: data.totalBuyValue / data.totalQty,
                lots: data.lots
            });
        }

        const result = {
            _portfolioId: portfolioId || 'all',
            totalInvestment: grandTotalCost,
            totalBuyValue: grandTotalBuyValue,
            totalRemainingQty: grandTotalQty,
            stockDetails: stockDetails,
            calculatedAt: now,
            method: 'FIFO with Commission'
        };
        this.cache.set(cacheKey, { data: result, timestamp: now });
        return result;

    } catch (error) {
        console.error('Calculation error:', error);
        return null;
    }
}

    resetCache() {
        this.cache.clear();
        console.log('🔄 Unified calculation cache reset');
    }
}

// ==========================================
// 🗄️ ডুয়াল ডেটাবেস রাইট হেলপার
// ==========================================
async function savePortfolioToBoth(userId, data) {
    let supabaseSuccess = false;
    let firebaseSuccess = false;
    let supabaseError = null;

    const payload = {
        user_id: userId,
        share_name: String(data.shareName || '').trim().toUpperCase(),
        quantity: Number(data.quantity) || 0,
        buy_price: Number(data.buyPrice) || 0,
        commission: Number(data.commission) || 0,
        commission_percent: Number(data.commissionPercent) || 0,
        portfolio_id: data.portfolioId || 'main',
        date: data.date || new Date().toISOString().split('T')[0],
        created_at: new Date().toISOString()
    };

    // Use the same Firebase->Supabase custom JWT bridge as the rest of the app.
    if (typeof supabaseFetch === 'function') {
        try {
            await supabaseFetch('/portfolios', {
                method: 'POST',
                headers: { 'Prefer': 'return=minimal' },
                body: JSON.stringify(payload)
            });
            supabaseSuccess = true;
        } catch (e) {
            supabaseError = e instanceof Error ? e.message : String(e);
            console.error('Supabase portfolio insert failed:', supabaseError);
        }
    } else if (typeof supabase !== 'undefined' && supabase) {
        try {
            const { error } = await supabase.from('portfolios').insert(payload);
            if (error) throw error;
            supabaseSuccess = true;
        } catch (e) {
            supabaseError = e instanceof Error ? e.message : String(e);
            console.error('Supabase portfolio insert failed:', supabaseError);
        }
    }

    if (typeof db !== 'undefined' && db) {
        try {
            await db.collection('portfolios').add({
                userId: userId,
                shareName: payload.share_name,
                quantity: payload.quantity,
                buyPrice: payload.buy_price,
                commission: payload.commission,
                commissionPercent: payload.commission_percent,
                portfolioId: payload.portfolio_id,
                date: data.date ? new Date(data.date) : new Date(),
                createdAt: new Date()
            });
            firebaseSuccess = true;
        } catch (e) { console.warn('Firebase insert failed:', e); }
    }

    return { supabaseSuccess, firebaseSuccess, supabaseError };
}

async function saveSalesToBoth(userId, data) {
    let supabaseSuccess = false;
    let firebaseSuccess = false;
    let supabaseError = null;

    const payload = {
        user_id: userId,
        share_name: String(data.shareName || '').trim().toUpperCase(),
        quantity_sold: Number(data.quantitySold) || 0,
        buy_price: Number(data.buyPrice) || 0,
        sell_price: Number(data.sellPrice) || 0,
        profit_or_loss: Number(data.profitOrLoss) || 0,
        commission: Number(data.commission) || 0,
        commission_percent: Number(data.commissionPercent) || 0,
        net_received: Number(data.netReceived) || 0,
        portfolio_id: data.portfolioId || 'main',
        date: data.date || new Date().toISOString().split('T')[0],
        created_at: new Date().toISOString()
    };

    // IMPORTANT: use the app's custom Firebase->Supabase JWT bridge.
    // This avoids relying on a stale/incorrect supabase-js session.
    if (typeof supabaseFetch === 'function') {
        try {
            await supabaseFetch('/sales_history', {
                method: 'POST',
                headers: { 'Prefer': 'return=minimal' },
                body: JSON.stringify(payload)
            });
            supabaseSuccess = true;
        } catch (e) {
            supabaseError = e instanceof Error ? e.message : String(e);
            console.error('Supabase sales insert failed:', supabaseError);
        }
    } else if (typeof supabase !== 'undefined' && supabase) {
        try {
            const { error } = await supabase.from('sales_history').insert(payload);
            if (error) throw error;
            supabaseSuccess = true;
        } catch (e) {
            supabaseError = e instanceof Error ? e.message : String(e);
            console.error('Supabase sales insert failed:', supabaseError);
        }
    }

    if (typeof db !== 'undefined' && db) {
        try {
            await db.collection('sales_history').add({
                userId: userId,
                shareName: payload.share_name,
                quantitySold: payload.quantity_sold,
                buyPrice: payload.buy_price,
                sellPrice: payload.sell_price,
                profitOrLoss: payload.profit_or_loss,
                commission: payload.commission,
                commissionPercent: payload.commission_percent,
                netReceived: payload.net_received,
                portfolioId: payload.portfolio_id,
                date: data.date ? new Date(data.date) : new Date(),
                createdAt: new Date()
            });
            firebaseSuccess = true;
        } catch (e) { console.warn('Firebase sales insert failed:', e); }
    }

    return { supabaseSuccess, firebaseSuccess, supabaseError };
}


async function saveDividendToBoth(userId, data) {
    let supabaseSuccess = false;
    let firebaseSuccess = false;

    if (typeof supabase !== 'undefined' && supabase) {
        try {
            const { error } = await supabase.from('dividend_records').insert({
                user_id: userId,
                share_name: data.shareName,
                stock_percent: data.stockPercent || 0,
                cash_amount: data.cashAmount || 0,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            });
            if (!error) supabaseSuccess = true;
        } catch (e) { console.warn('Supabase dividend insert failed:', e); }
    }

    if (typeof db !== 'undefined' && db) {
        try {
            await db.collection('dividend_records').add({
                userId: userId,
                shareName: data.shareName,
                stockPercent: data.stockPercent || 0,
                cashAmount: data.cashAmount || 0,
                portfolioId: data.portfolioId || 'main',
                createdAt: new Date(),
                updatedAt: new Date()
            });
            firebaseSuccess = true;
        } catch (e) { console.warn('Firebase dividend insert failed:', e); }
    }

    return { supabaseSuccess, firebaseSuccess };
}

// ==========================================
// 🛡️ নিরাপদ ডেট পার্সিং
// ==========================================
function safeParseDate(value) {
    if (!value) return null;
    if (value instanceof Date && !isNaN(value)) return value;
    if (typeof value === 'string' || typeof value === 'number') {
        const d = new Date(value);
        if (!isNaN(d)) return d;
    }
    if (typeof value === 'object' && value.toDate && typeof value.toDate === 'function') {
        try {
            const d = value.toDate();
            if (d instanceof Date && !isNaN(d)) return d;
        } catch (e) {}
    }
    if (value.seconds !== undefined) {
        const d = new Date(value.seconds * 1000);
        if (!isNaN(d)) return d;
    }
    return null;
}

// DSE প্রাইস ফেচ (Supabase dse_live_data → Firebase daily_prices)
async function getDSEPrice(ticker) {
    if (!ticker) return 0;
    // ১. Supabase dse_live_data
    if (typeof supabase !== 'undefined' && supabase) {
        try {
            const { data, error } = await supabase
                .from('dse_live_data')
                .select('ltp')
                .eq('ticker', ticker)
                .order('date', { ascending: false })
                .limit(1);
            if (!error && data && data.length > 0) {
                const val = parseFloat(data[0].ltp);
                if (!isNaN(val) && val > 0) return val;
            }
        } catch (e) {}
    }
    // ২. Firebase daily_prices (ফলব্যাক)
    if (typeof db !== 'undefined' && db) {
        try {
            const snap = await db.collection('daily_prices')
                .where('ticker', '==', ticker)
                .orderBy('date', 'desc')
                .limit(1)
                .get();
            if (!snap.empty) {
                const data = snap.docs[0].data();
                const val = parseFloat(data.price) || parseFloat(data.close) || 0;
                if (val > 0) return val;
            }
        } catch (e) {}
    }
    return 0;
}

// CSE প্রাইস ফেচ (Supabase cse_market_data → Firebase cse_detailed_data)
async function getCSEPrice(ticker) {
    if (!ticker) return 0;
    // ১. Supabase cse_market_data
    if (typeof supabase !== 'undefined' && supabase) {
        try {
            const { data, error } = await supabase
                .from('cse_market_data')
                .select('ltp')
                .eq('code', ticker)
                .order('date', { ascending: false })
                .limit(1);
            if (!error && data && data.length > 0) {
                const val = parseFloat(data[0].ltp);
                if (!isNaN(val) && val > 0) return val;
            }
        } catch (e) {}
    }
    // ২. Firebase cse_detailed_data (ফলব্যাক)
    if (typeof db !== 'undefined' && db) {
        try {
            const snap = await db.collection('cse_detailed_data')
                .where('code', '==', ticker)
                .orderBy('date', 'desc')
                .limit(1)
                .get();
            if (!snap.empty) {
                const data = snap.docs[0].data();
                const val = parseFloat(data.ltp) || 0;
                if (val > 0) return val;
            }
        } catch (e) {}
    }
    return 0;
}

// P/E Ratio ফেচ (stock_metadata → cse_detailed_data)
async function getPERatio(ticker) {
    if (!ticker) return null;
    
    // ১. stock_metadata থেকে আনার চেষ্টা
    try {
        if (typeof db !== 'undefined') {
            const doc = await db.collection('stock_metadata').doc(ticker).get();
            if (doc.exists && doc.data().pe) {
                const val = parseFloat(doc.data().pe);
                if (!isNaN(val) && val > 0) return val;
            }
        }
    } catch (e) { /* ignore */ }

    // ২. Supabase cse_market_data
    if (typeof supabase !== 'undefined' && supabase) {
        try {
            const { data, error } = await supabase
                .from('cse_market_data')
                .select('pe')
                .eq('code', ticker)
                .order('date', { ascending: false })
                .limit(1);
            if (!error && data && data.length > 0) {
                const val = parseFloat(data[0].pe);
                if (!isNaN(val) && val > 0) return val;
            }
        } catch (e) { /* ignore */ }
    }

    // ৩. Firebase cse_detailed_data (ফলব্যাক)
    if (typeof db !== 'undefined') {
        try {
            const snap = await db.collection('cse_detailed_data')
                .where('code', '==', ticker)
                .orderBy('date', 'desc')
                .limit(1)
                .get();
            if (!snap.empty) {
                const data = snap.docs[0].data();
                const val = parseFloat(data.pe) || 0;
                if (val > 0) return val;
            }
        } catch (e) { /* ignore */ }
    }
    return null;
}

// ==========================================
// 🧹 গ্লোবাল ক্যাশ ক্লিনার
// ==========================================
function resetUnifiedCache() {
    // Clear the unified calculation result.
    try {
        if (typeof unifiedEngine !== 'undefined' && unifiedEngine && unifiedEngine.cache) {
            unifiedEngine.cache.clear();
        }
    } catch (e) {
        console.warn('Unified cache reset failed:', e);
    }

    // Also clear the DataService cache when available so reads after
    // a successful write never return stale portfolio data.
    try {
        if (typeof window.clearDataServiceCache === 'function') {
            window.clearDataServiceCache();
        }
    } catch (e) {
        console.warn('DataService cache clear failed:', e);
    }

    try {
        window.dispatchEvent(new CustomEvent('stockpulse:data-changed', {
            detail: { reason: 'unified cache reset', timestamp: Date.now() }
        }));
    } catch (e) {}
}

function debounce(func, wait = 300) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

function clearAllScannerCache() {
    if (typeof sessionStorage !== 'undefined') {
        sessionStorage.removeItem('all_scanner_data');
    }
    console.log('🔄 All scanner cache cleared');
}

// ==========================================
// 📂 পোর্টফোলিও মেটাডেটা ম্যানেজমেন্ট
// ==========================================

/**
 * ইউজারের সব পোর্টফোলিওর তালিকা পাওয়া
 */
async function getPortfolioMeta(userId) {
    if (!userId) return { portfolios: [] };
    try {
        if (typeof db !== 'undefined') {
            const doc = await db.collection('portfolios_meta').doc(userId).get();
            if (doc.exists) {
                return doc.data();
            }
        }
        // ডিফল্ট: একটি মেইন পোর্টফোলিও তৈরি
        const defaultMeta = {
            portfolios: [
                { id: 'main', name: '📊 Main Portfolio', type: 'main', isDefault: true, createdAt: new Date().toISOString() }
            ]
        };
        if (typeof db !== 'undefined') {
            await db.collection('portfolios_meta').doc(userId).set(defaultMeta);
        }
        return defaultMeta;
    } catch (e) {
        console.error('Error getting portfolio meta:', e);
        return { portfolios: [{ id: 'main', name: '📊 Main Portfolio', type: 'main', isDefault: true }] };
    }
}

/**
 * পোর্টফোলিও মেটাডেটা আপডেট করা
 */
async function updatePortfolioMeta(userId, meta) {
    if (!userId || !meta) return false;
    try {
        if (typeof db !== 'undefined') {
            await db.collection('portfolios_meta').doc(userId).set(meta, { merge: true });
            return true;
        }
        return false;
    } catch (e) {
        console.error('Error updating portfolio meta:', e);
        return false;
    }
}

/**
 * নতুন পোর্টফোলিও তৈরি করা
 */
async function createPortfolio(userId, name) {
    if (!userId || !name || !name.trim()) return null;
    const meta = await getPortfolioMeta(userId);

    // 🆓 Free plan: Main + one custom portfolio. Pro is unlimited.
    try {
        const pro = !!(window.StockPulsePlan && typeof window.StockPulsePlan.isPro === 'function' && window.StockPulsePlan.isPro());
        if (!pro && Array.isArray(meta?.portfolios) && meta.portfolios.length >= 2) {
            if (typeof showToast === 'function') showToast('Free plan allows up to 2 portfolios (including Main). Upgrade to Pro for unlimited portfolios.', 'warning');
            return null;
        }
    } catch (_) {
        // Fail closed for the limit check if subscription state is unavailable.
        if (Array.isArray(meta?.portfolios) && meta.portfolios.length >= 2) return null;
    }

    const id = 'sub_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
    meta.portfolios.push({
        id,
        name: name.trim(),
        type: 'sub',
        isDefault: false,
        createdAt: new Date().toISOString()
    });
    const success = await updatePortfolioMeta(userId, meta);
    return success ? id : null;
}

/**
 * পোর্টফোলিও ডিলিট করা (শুধু যদি শেয়ার সংখ্যা ০ হয়)
 */
async function deletePortfolio(userId, portfolioId) {
    if (!userId || !portfolioId || portfolioId === 'main') return false;
    // চেক করুন এই পোর্টফোলিওতে কোনো শেয়ার আছে কিনা
    if (typeof db !== 'undefined') {
        const snap = await db.collection('portfolios')
            .where('userId', '==', userId)
            .where('portfolioId', '==', portfolioId)
            .get();
        if (!snap.empty) {
            let totalQty = 0;
            snap.forEach(doc => totalQty += doc.data().quantity || 0);
            if (totalQty > 0) {
                console.warn('Portfolio has shares, cannot delete');
                return false;
            }
        }
        // সেলস হিস্ট্রি চেক (ঐচ্ছিক)
        const sellSnap = await db.collection('sales_history')
            .where('userId', '==', userId)
            .where('portfolioId', '==', portfolioId)
            .get();
        if (!sellSnap.empty) {
            // আপনি চাইলে সেল হিস্ট্রিও ডিলিট করতে পারেন, অথবা শুধু পোর্টফোলিও মেটা থেকে রিমুভ করুন
            // এখানে আমরা শুধু মেটা থেকে রিমুভ করছি
        }
    }
    const meta = await getPortfolioMeta(userId);
    meta.portfolios = meta.portfolios.filter(p => p.id !== portfolioId);
    return await updatePortfolioMeta(userId, meta);
}

/**
 * পোর্টফোলিওর নাম পরিবর্তন
 */
async function renamePortfolio(userId, portfolioId, newName) {
    if (!userId || !portfolioId || !newName || !newName.trim()) return false;
    if (portfolioId === 'main') return false;
    const meta = await getPortfolioMeta(userId);
    const portfolio = meta.portfolios.find(p => p.id === portfolioId);
    if (!portfolio) return false;
    portfolio.name = newName.trim();
    return await updatePortfolioMeta(userId, meta);
}

/**
 * পোর্টফোলিও আইডি থেকে নাম পাওয়া
 */
function getPortfolioName(portfolioId, meta) {
    if (!meta || !meta.portfolios) return portfolioId === 'main' ? '📊 Grand Portfolio' : portfolioId;
    const found = meta.portfolios.find(p => p.id === portfolioId);
    return found ? found.name : (portfolioId === 'main' ? '📊 Grand Portfolio' : portfolioId);
}
// ==========================================
// 📡 NEW API SERVICE (bd-stock-api)
// ==========================================

const STOCK_API_BASE = 'https://bd-stock-api-an3n.vercel.app/v1/dse';

/**
 * সব কোম্পানির লেটেস্ট ডেটা ফেচ করুন
 */
async function fetchAllLatestStocks() {
    try {
        const response = await fetch(`${STOCK_API_BASE}/latest`);
        const data = await response.json();
        if (data.success) return data.data;
        return [];
    } catch (error) {
        console.error('Error fetching latest stocks:', error);
        return [];
    }
}

/**
 * টিকার নাম দিয়ে ডেটা ফেচ করুন (dsexdata)
 */
async function fetchStockByTicker(ticker) {
    try {
        const response = await fetch(`${STOCK_API_BASE}/dsexdata`);
        const data = await response.json();
        if (data.success) {
            return data.data.filter(item => item['TRADING CODE'] === ticker);
        }
        return [];
    } catch (error) {
        console.error(`Error fetching stock ${ticker}:`, error);
        return [];
    }
}
// ==========================================
// 🔐 Firebase → Supabase JWT authentication bridge
// ==========================================
let cachedSupabaseToken = null;
let supabaseTokenExpiresAt = 0;
let supabaseAuthSyncPromise = null;

function decodeJwtPayload(token) {
    try {
        const part = token.split('.')[1];
        if (!part) return null;
        const normalized = part.replace(/-/g, '+').replace(/_/g, '/');
        const padded = normalized + '='.repeat((4 - normalized.length % 4) % 4);
        return JSON.parse(atob(padded));
    } catch (_) {
        return null;
    }
}

async function syncSupabaseAuth(force = false) {
    if (supabaseAuthSyncPromise && !force) return supabaseAuthSyncPromise;

    supabaseAuthSyncPromise = (async () => {
        const user = auth && auth.currentUser;
        if (!user) {
            cachedSupabaseToken = null;
            supabaseTokenExpiresAt = 0;
            if (typeof window.clearSupabaseAuth === 'function') window.clearSupabaseAuth();
            return null;
        }

        const now = Math.floor(Date.now() / 1000);
        if (!force && cachedSupabaseToken && supabaseTokenExpiresAt > now + 60) {
            return cachedSupabaseToken;
        }

        const idToken = await user.getIdToken(force);
        const hookUrl = window.APP_CONFIG?.API?.SUPABASE_AUTH_HOOK_URL;
        if (!hookUrl) throw new Error('Supabase auth-hook URL is not configured');

        const res = await fetch(hookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ firebase_token: idToken })
        });

        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.token) {
            throw new Error(data.error || 'Supabase token exchange failed');
        }

        cachedSupabaseToken = data.token;
        const payload = decodeJwtPayload(data.token);
        supabaseTokenExpiresAt = Number(payload?.exp || 0);

        if (typeof window.setSupabaseAuthToken === 'function') {
            window.setSupabaseAuthToken(data.token);
        } else {
            throw new Error('Supabase auth client bridge is not initialized');
        }

        // Notify subscription/admin-aware UI only after the custom Supabase JWT is ready.
        try { window.dispatchEvent(new CustomEvent('stockpulse:auth-ready')); } catch (_) {}

        console.log('✅ Supabase authorization synchronized');
        return cachedSupabaseToken;
    })();

    try {
        return await supabaseAuthSyncPromise;
    } finally {
        supabaseAuthSyncPromise = null;
    }
}

async function getSupabaseToken(force = false) {
    return syncSupabaseAuth(force);
}

async function supabaseFetch(path, options = {}) {
    const token = await getSupabaseToken(false);
    if (!token) throw new Error('Supabase authentication required');

    const anonKey = window.APP_CONFIG?.API?.SUPABASE_ANON_KEY;
    const baseUrl = window.APP_CONFIG?.API?.SUPABASE_URL;
    const url = `${baseUrl}/rest/v1${path}`;
    const response = await fetch(url, {
        ...options,
        headers: {
            'apikey': anonKey,
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            ...(options.headers || {})
        }
    });

    // Supabase REST INSERT/UPDATE requests may legitimately return 201/204
    // with an empty body (especially with Prefer: return=minimal). Never call
    // response.json() blindly on an empty response.
    const rawText = await response.text();

    if (!response.ok) {
        let message = `HTTP ${response.status}`;
        if (rawText) {
            try {
                const error = JSON.parse(rawText);
                message = error?.message || error?.error_description || error?.hint || message;
            } catch {
                message = rawText.slice(0, 500) || message;
            }
        }
        throw new Error(message);
    }

    if (!rawText.trim()) return null;

    try {
        return JSON.parse(rawText);
    } catch {
        // A successful non-JSON response is still a successful request.
        return rawText;
    }
}

/**
 * ঐতিহাসিক ডেটা ফেচ করুন
 */
async function fetchHistoricalData(ticker, startDate, endDate) {
    try {
        const url = `${STOCK_API_BASE}/historical?start=${startDate}&end=${endDate}&code=${ticker}`;
        const response = await fetch(url);
        const data = await response.json();
        if (data.success) return data.data;
        return [];
    } catch (error) {
        console.error(`Error fetching historical data for ${ticker}:`, error);
        return [];
    }
}

// গ্লোবালি এক্সপোজ
window.fetchAllLatestStocks = fetchAllLatestStocks;
window.fetchStockByTicker = fetchStockByTicker;
window.fetchHistoricalData = fetchHistoricalData;
// ==========================================
// 🌐 গ্লোবাল এক্সপোজ
// ==========================================
const unifiedEngine = new UnifiedCalculationEngine();

// ফাংশন ও ভেরিয়েবল এক্সপোজ
window.unifiedEngine = unifiedEngine;
window.getUnifiedPrice = getUnifiedPrice;
window.getLatestAndPreviousPrices = getLatestAndPreviousPrices;
window.getPreviousDayPrice = getPreviousDayPrice;
window.getHardcodedPrice = getHardcodedPrice;
window.resetUnifiedPriceCache = resetUnifiedPriceCache;
window.resetUnifiedCache = resetUnifiedCache;
window.clearAllScannerCache = clearAllScannerCache;
window.debounce = debounce;
window.dseStocks = dseStocks;
window.firebaseDataManager = firebaseDataManager;
window.commissionManager = commissionManager;
window.apiLimiter = apiLimiter;
window.safeParseDate = safeParseDate;
window.savePortfolioToBoth = savePortfolioToBoth;
window.saveSalesToBoth = saveSalesToBoth;
window.saveDividendToBoth = saveDividendToBoth;
window.toBangladeshTime = toBangladeshTime;
window.formatBangladeshTime = formatBangladeshTime;
window.getBangladeshDateString = getBangladeshDateString;
window.getUTCFromLocalDate = getUTCFromLocalDate;
window.formatDisplayTime = formatDisplayTime;
window.getTodayDate = getTodayDate;
window.getSafePrice = getSafePrice;
window.calculatePercentage = calculatePercentage;
window.safeDivision = safeDivision;
window.getDSEPrice = getDSEPrice;
window.getCSEPrice = getCSEPrice;
window.getPERatio = getPERatio;
window.chunkArray = chunkArray;
window.getPortfolioMeta = getPortfolioMeta;
window.updatePortfolioMeta = updatePortfolioMeta;
window.createPortfolio = createPortfolio;
window.deletePortfolio = deletePortfolio;
window.renamePortfolio = renamePortfolio;
window.getPortfolioName = getPortfolioName;
window.getHistoricalPricesFromSupabase = getHistoricalPricesFromSupabase;
window.getLatestDSEXFromSupabase = getLatestDSEXFromSupabase;
window.getSupabaseToken = getSupabaseToken;
window.syncSupabaseAuth = syncSupabaseAuth;
window.supabaseFetch = supabaseFetch;
console.log('✅ core.js loaded successfully (All functions defined and exposed globally)');