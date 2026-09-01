// 📁 config.js
// ==========================================
// সেন্ট্রাল কনফিগারেশন – সব জায়গায় একই ভ্যালু ব্যবহার হবে
// ==========================================

const APP_CONFIG = {
    // API এন্ডপয়েন্ট
    API: {
        SCRAPER_BASE_URL: 'https://dse-scraper.vercel.app/api',
        SUPABASE_URL: 'https://dpdicusxlrdydajkcgev.supabase.co',
        SUPABASE_ANON_KEY: 'sb_publishable_vIexTeuEoBjiFoA0F2w2Ag_3GUn_SMX',
        SUPABASE_AUTH_HOOK_URL: 'https://dpdicusxlrdydajkcgev.supabase.co/functions/v1/auth-hook'
    },

    // ক্যাশ টাইমআউট (মিলিসেকেন্ড)
    CACHE: {
        TTL: {
            ANALYSIS: 600000,      // 10 মিনিট
            PRICE: 300000,         // 5 মিনিট
            SCANNER: 3600000,      // 1 ঘন্টা
            UNIFIED_PRICE: 300000, // 5 মিনিট
            DASHBOARD: 300000      // 5 মিনিট
        }
    },

    // লোকাল স্টোরেজ কী
    STORAGE_KEYS: {
        THEME: 'theme',
        WATCHLIST: 'market_watch_list',
        COMMISSION: 'commissionPercent',
        DATA_MODE: 'dataMode'
    },

    // ডিফল্ট ভ্যালু
    DEFAULTS: {
        COMMISSION_PERCENT: 0,
        DATA_MODE: 'database',
        SIGNAL_THRESHOLD: 50,
        // Never show stale demo prices in production. Enable only for local testing.
        ALLOW_DEMO_PRICE_FALLBACK: false
    },

    // ক্যালকুলেশন কনস্ট্যান্ট
    CALC: {
        PARABOLIC_SAR_STEP: 0.02,
        PARABOLIC_SAR_MAX_STEP: 0.20,
        RSI_PERIOD: 14,
        FIFO_METHOD: 'FIFO_WITH_COMMISSION'
    }
};

// গ্লোবালি এক্সপোজ করুন (যাতে অন্যান্য ফাইল ব্যবহার করতে পারে)
if (typeof window !== 'undefined') {
    window.APP_CONFIG = APP_CONFIG;
}

// মডিউল এক্সপোর্ট (যদি Node.js এ ব্যবহার হয়)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = APP_CONFIG;
}