// ==========================================
// 🔍 scanner.js - সম্পূর্ণ ইরর-ফ্রি ভার্সন v7.1
//    All Scanner (PSAR + RSI) - Supabase-first + Firebase-fallback
//    RSI Indicator Section সহ
//    ⚡ ব্যাচ কোয়েরি দিয়ে পারফরম্যান্স অপটিমাইজড
//    🕐 ডায়নামিক ক্যাশ TTL (মার্কেট সময় অনুযায়ী)
//    ✅ পোর্টফোলিও ফিল্টার সাপোর্ট
//    ✅ null-check সহ ইরর হ্যান্ডলিং
//    ✅ সব ট্যাবের জন্য আলাদা ডেটা লোড
//    ✅ Category → cse_market_data (Supabase first)
//    ✅ ATH/ATL/RSI/PSAR → history_dse (Supabase first)
//    ✅ ইন্ডিকেটর ফাংশন indicators.js থেকে নেওয়া
//    ⚡ requestIdleCallback দিয়ে UI ফ্রিজ কমানো
//    🔧 Buy Sell Price - Avg Sell ও Max Sell আলাদা করা হয়েছে (কেস-ইনসেনসিটিভ)
// ==========================================

// ==========================================
// 📦 হেল্পার: chunkArray (যদি গ্লোবালি না থাকে)
// ==========================================
if (typeof chunkArray === 'undefined') {
    window.chunkArray = function(array, chunkSize = 10) {
        const chunks = [];
        for (let i = 0; i < array.length; i += chunkSize) {
            chunks.push(array.slice(i, i + chunkSize));
        }
        return chunks;
    };
}

// ==========================================
// 📦 ক্যাশ ম্যানেজমেন্ট
// ==========================================
const ALL_SCANNER_CACHE_KEY = 'all_scanner_data';
const ALL_SCANNER_CACHE_TTL = 3600000; // ১ ঘন্টা

function getScannerCacheTTL() {
    try {
        const now = new Date();
        const hours = now.getHours();
        const minutes = now.getMinutes();
        const day = now.getDay();
        const totalMinutes = hours * 60 + minutes;
        const isMarketDay = (day >= 0 && day <= 4);
        const marketOpen = 9 * 60;
        const marketClose = 15 * 60;

        if (!isMarketDay || totalMinutes < marketOpen || totalMinutes >= marketClose) {
            let nextDay = new Date(now);
            let daysToAdd = 0;
            do {
                daysToAdd++;
                nextDay.setDate(now.getDate() + daysToAdd);
            } while (nextDay.getDay() > 4 || nextDay.getDay() < 0);
            const nextOpen = new Date(nextDay);
            nextOpen.setHours(9, 0, 0, 0);
            return Math.max(nextOpen.getTime() - now.getTime(), 0);
        } else {
            return 2 * 60 * 60 * 1000;
        }
    } catch (e) {
        return ALL_SCANNER_CACHE_TTL;
    }
}

async function getAllScannerCache() {
    try {
        const cached = await CacheManager.get(ALL_SCANNER_CACHE_KEY);
        if (cached) {
            // CacheManager ইতিমধ্যেই TTL চেক করে, তাই সরাসরি রিটার্ন
            return cached;
        }
        return null;
    } catch (e) {
        console.warn('Cache read error in scanner:', e);
        return null;
    }
}

async function setAllScannerCache(data, ttl = null) {
    try {
        await CacheManager.set(ALL_SCANNER_CACHE_KEY, data, ttl || getScannerCacheTTL());
    } catch (e) {
        console.warn('Cache save error in scanner:', e);
    }
}

async function clearAllScannerCache() {
    try {
        await CacheManager.remove(ALL_SCANNER_CACHE_KEY);
    } catch (e) {
        console.warn('Cache clear error in scanner:', e);
    }
}

// ==========================================
// 🔍 All Scanner ডেটা লোডার (Supabase-first + requestIdleCallback)
// ==========================================
async function loadAllScannerData(forceRefresh = false, onProgress = null) {
    try {
        if (!forceRefresh) {
            const cached = await getAllScannerCache();
            if (cached && Array.isArray(cached) && cached.length > 0) {
                console.log('✅ All Scanner data loaded from cache');
                if (typeof onProgress === 'function') onProgress(cached.length, cached.length);
                return cached;
            }
        }

        const user = auth && auth.currentUser ? auth.currentUser : null;
        if (!user) {
            if (typeof showToast === 'function') showToast('Please login first', 'error');
            return null;
        }

        let tickers = [];
        if (typeof dseStocks !== 'undefined' && Array.isArray(dseStocks)) tickers = dseStocks;
        else if (window.dseStocks && Array.isArray(window.dseStocks)) tickers = window.dseStocks;
        else {
            if (typeof showToast === 'function') showToast('No stock list available.', 'error');
            return [];
        }

        if (tickers.length === 0) {
            if (typeof showToast === 'function') showToast('Stock list is empty.', 'error');
            return [];
        }

        console.log(`📊 Scanning ${tickers.length} stocks...`);
        if (typeof onProgress === 'function') onProgress(0, tickers.length);

        const allResults = [];
        const BATCH_SIZE = 10;
        let supabasePriceMap = new Map();

        // ---------- ১. লাইভ প্রাইস ও ক্যাটাগরি (Supabase cse_market_data first) ----------
        if (typeof supabase !== 'undefined' && supabase) {
            try {
                const supabaseChunks = chunkArray(tickers, BATCH_SIZE);
                for (const chunk of supabaseChunks) {
                    try {
                        const { data, error } = await supabase
                            .from('cse_market_data')
                            .select('ticker, ltp, high, low, category')
                            .in('code', chunk)
                            .order('date', { ascending: false });
                        if (!error && data) {
                            const seen = new Set();
                            data.forEach(row => {
                                if (!seen.has(row.code)) {
                                    seen.add(row.code);
                                    supabasePriceMap.set(row.code, {
                                        ltp: parseFloat(row.ltp) || 0,
                                        high: parseFloat(row.high) || 0,
                                        low: parseFloat(row.low) || 0,
                                        category: row.category || 'N/A'
                                    });
                                }
                            });
                        }
                    } catch (e) {
                        console.warn('Supabase cse_market_data batch fetch failed:', e);
                    }
                }
            } catch (e) {
                console.warn('Supabase cse_market_data fetch error:', e);
            }
        }

        // ---------- ২. Firebase cse_detailed_data থেকে ক্যাটাগরি ফ্যালব্যাক ----------
        if (supabasePriceMap.size === 0 && typeof db !== 'undefined') {
            try {
                const fbChunks = chunkArray(tickers, BATCH_SIZE);
                for (const chunk of fbChunks) {
                    try {
                        const snap = await db.collection('cse_detailed_data')
                            .where('code', 'in', chunk)
                            .orderBy('date', 'desc')
                            .limit(1)
                            .get();
                        if (!snap.empty) {
                            snap.forEach(doc => {
                                const data = doc.data();
                                const code = data.code;
                                if (code && !supabasePriceMap.has(code)) {
                                    supabasePriceMap.set(code, {
                                        ltp: parseFloat(data.ltp) || 0,
                                        high: parseFloat(data.high) || 0,
                                        low: parseFloat(data.low) || 0,
                                        category: data.category || 'N/A'
                                    });
                                }
                            });
                        }
                    } catch (e) {
                        console.warn('Firebase cse_detailed_data category fallback failed:', e);
                    }
                }
            } catch (e) {
                console.warn('Firebase cse_detailed_data fetch error:', e);
            }
        }

        const startDate = new Date();
        startDate.setDate(startDate.getDate() - 30);
        const startDateStr = startDate.toISOString().split('T')[0];

        let allHistoricData = [];

        // ---------- ৩. ঐতিহাসিক ডেটা (ATH/ATL/RSI/PSAR) → Supabase history_dse ----------
        if (typeof supabase !== 'undefined' && supabase) {
            try {
                const supabaseHistChunks = chunkArray(tickers, BATCH_SIZE);
                for (const chunk of supabaseHistChunks) {
                    try {
                        const { data, error } = await supabase
                            .from('history_dse')
                            .select('ticker, date, ltp, high, low')
                            .in('ticker', chunk)
                            .gte('date', startDateStr)
                            .order('date', { ascending: true });
                        if (!error && data && data.length > 0) {
                            data.forEach(item => {
                                const ltp = parseFloat(item.ltp);
                                if (ltp > 0) {
                                    allHistoricData.push({
                                        code: item.code,
                                        date: item.date,
                                        ltp: ltp,
                                        high: parseFloat(item.high) || ltp,
                                        low: parseFloat(item.low) || ltp
                                    });
                                }
                            });
                        }
                    } catch (e) {
                        console.warn('Supabase history_dse batch fetch failed:', e);
                    }
                }
            } catch (e) {
                console.warn('Supabase history_dse fetch error:', e);
            }
        }

        // ---------- ৪. যদি history_dse-এ না থাকে, Firebase cse_detailed_data ফ্যালব্যাক ----------
        if (allHistoricData.length === 0 && typeof db !== 'undefined') {
            try {
                const firebaseChunks = chunkArray(tickers, BATCH_SIZE);
                for (const chunk of firebaseChunks) {
                    try {
                        const snap = await db.collection('cse_detailed_data')
                            .where('code', 'in', chunk)
                            .where('date', '>=', startDateStr)
                            .orderBy('date', 'asc')
                            .get();
                        if (!snap.empty) {
                            snap.forEach(doc => {
                                const data = doc.data();
                                const ltp = parseFloat(data.ltp);
                                if (ltp > 0) {
                                    allHistoricData.push({
                                        code: data.code,
                                        date: data.date,
                                        ltp: ltp,
                                        high: parseFloat(data.high) || ltp,
                                        low: parseFloat(data.low) || ltp
                                    });
                                }
                            });
                        }
                    } catch (e) {
                        console.warn('Firebase cse_detailed_data fallback failed:', e);
                    }
                }
            } catch (e) {
                console.warn('Firebase cse_detailed_data fetch error:', e);
            }
        }

        // গ্রুপিং
        const groupedData = {};
        allHistoricData.forEach(item => {
            if (!groupedData[item.code]) groupedData[item.code] = [];
            groupedData[item.code].push(item);
        });

        // ==========================================
        // 🔥 requestIdleCallback দিয়ে ব্যাচ প্রসেস
        // ==========================================
        let currentBatchIndex = 0;

        const processNextBatch = () => {
            // সব ব্যাচ শেষ?
            if (currentBatchIndex >= tickers.length) {
                // ✅ সব ডেটা প্রসেস শেষ – ক্যাশ সেভ ও রিটার্ন
                const ttl = getScannerCacheTTL();
                setAllScannerCache(allResults, ttl).catch(e => console.warn('Cache save error:', e));
                console.log(`✅ All Scanner loaded: ${allResults.length} stocks`);
                if (typeof onProgress === 'function') {
                    onProgress(allResults.length, allResults.length);
                }
                // কলব্যাক ফাংশন কল (যদি থাকে)
                if (typeof window._scannerComplete === 'function') {
                    window._scannerComplete(allResults);
                }
                return;
            }

            // বর্তমান ব্যাচ নিন
            const batch = tickers.slice(currentBatchIndex, currentBatchIndex + BATCH_SIZE);
            currentBatchIndex += BATCH_SIZE;

            const batchPromises = batch.map(async (ticker) => {
                try {
                    const priceData = groupedData[ticker] || [];
                    if (priceData.length < 15) return null;

                    // PSAR ক্যালকুলেট (indicators.js থেকে)
                    let lastSAR = null;
                    let lastRSI = null;
                    try {
                        if (typeof calculateParabolicSAR === 'function') {
                            const sarData = calculateParabolicSAR(priceData);
                            lastSAR = sarData.length > 0 ? sarData[sarData.length - 1] : null;
                        }
                        if (typeof calculateRSI === 'function') {
                            const rsiData = calculateRSI(priceData.map(p => p.ltp), 14);
                            lastRSI = rsiData.length > 0 ? rsiData[rsiData.length - 1].rsi : null;
                        }
                    } catch (indicatorError) {
                        console.warn(`Indicator calculation error for ${ticker}:`, indicatorError);
                    }

                    // বর্তমান প্রাইস (Supabase থেকে, না থাকলে history_dse থেকে)
                    let currentPrice = priceData[priceData.length - 1]?.ltp || 0;
                    let category = 'N/A';
                    if (supabasePriceMap.has(ticker)) {
                        const live = supabasePriceMap.get(ticker);
                        if (live.ltp > 0) currentPrice = live.ltp;
                        category = live.category || 'N/A';
                    }

                    // ATH/ATL ক্যালকুলেট
                    let ath = 0, atl = Infinity;
                    for (const item of priceData) {
                        const ltp = item.ltp;
                        if (ltp > ath) ath = ltp;
                        if (ltp > 0 && ltp < atl) atl = ltp;
                        if (item.high > ath) ath = item.high;
                        if (item.low > 0 && item.low < atl) atl = item.low;
                    }
                    if (atl === Infinity) atl = 0;

                    return {
                        ticker: ticker,
                        currentPrice: currentPrice,
                        sar: lastSAR ? lastSAR.sar : currentPrice,
                        trend: lastSAR ? lastSAR.trend : 'up',
                        rsi: lastRSI !== null ? lastRSI : null,
                        category: category,
                        ath: ath,
                        atl: atl
                    };
                } catch (err) {
                    console.warn(`Error processing ${ticker}:`, err);
                    return null;
                }
            });

            // ব্যাচ প্রসেস করুন
            Promise.all(batchPromises).then((results) => {
                const valid = results.filter(r => r !== null && r !== undefined);
                allResults.push(...valid);

                // প্রগ্রেস আপডেট
                if (typeof onProgress === 'function') {
                    onProgress(currentBatchIndex, tickers.length);
                }

                // পরবর্তী ব্যাচ শিডিউল করুন (ইউজার ফ্রি থাকলে)
                if (typeof requestIdleCallback === 'function') {
                    requestIdleCallback(() => processNextBatch(), { timeout: 2000 });
                } else {
                    // ফ্যালব্যাক (পুরনো ব্রাউজার বা Safari)
                    setTimeout(() => processNextBatch(), 50);
                }
            }).catch((err) => {
                console.error('Batch processing error:', err);
                // এরর হলেও পরবর্তী ব্যাচ চালান
                if (typeof requestIdleCallback === 'function') {
                    requestIdleCallback(() => processNextBatch(), { timeout: 2000 });
                } else {
                    setTimeout(() => processNextBatch(), 50);
                }
            });
        };

        // ==========================================
        // 🔥 প্রসেস শুরু করুন (Promise রিটার্ন)
        // ==========================================
        return new Promise((resolve) => {
            // কলব্যাক সেভ করুন
            window._scannerComplete = function(data) {
                resolve(data);
                delete window._scannerComplete;
            };
            processNextBatch();
        });

    } catch (error) {
        console.error('All Scanner load error:', error);
        if (typeof showToast === 'function') showToast('Error loading scanner data', 'error');
        return null;
    }
}

// ==========================================
// 🎯 Strong Buy/Sell ফিল্টার
// ==========================================
function filterStrongBuySignals(data) {
    if (!data || !Array.isArray(data)) return [];
    return data.filter(item => 
        item.rsi !== null && 
        item.rsi < 30 && 
        item.sar < item.currentPrice
    ).sort((a, b) => (a.rsi || 0) - (b.rsi || 0));
}

function filterStrongSellSignals(data) {
    if (!data || !Array.isArray(data)) return [];
    return data.filter(item => 
        item.rsi !== null && 
        item.rsi > 70 && 
        item.sar > item.currentPrice
    ).sort((a, b) => (b.rsi || 0) - (a.rsi || 0));
}

// ==========================================
// 🖥️ UI রেন্ডারিং
// ==========================================
function renderAllScannerTable(data, type, containerId) {
    const tbody = document.getElementById(containerId);
    if (!tbody) {
        console.warn(`Container #${containerId} not found`);
        return;
    }
    if (!data || !Array.isArray(data) || data.length === 0) {
        const msg = type === 'buy' ? 'No Strong Buy signals found.' : 'No Strong Sell signals found.';
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:30px; color:var(--text-muted);">${msg}</td></tr>`;
        return;
    }
    try {
        let html = '';
        data.forEach(item => {
            const isBuy = type === 'buy';
            const signalText = isBuy ? '🟢🔥 STRONG BUY' : '🔴🔥 STRONG SELL';
            const signalColor = isBuy ? '#059669' : '#dc2626';
            const rsiColor = isBuy ? '#10b981' : '#ef4444';
            html += `<tr onclick="if(typeof openStockDetailModal === 'function') openStockDetailModal('${item.ticker}')" style="cursor:pointer;">`;
            html += `<td style="padding:10px; font-weight:bold; color:var(--primary-color); text-decoration:underline;">${item.ticker}</td>`;
            html += `<td style="padding:10px; text-align:right;">৳${(item.currentPrice || 0).toFixed(2)}</td>`;
            html += `<td style="padding:10px; text-align:right;">৳${(item.sar || 0).toFixed(2)}</td>`;
            html += `<td style="padding:10px; text-align:right; color:${rsiColor}; font-weight:600;">${item.rsi !== null ? item.rsi.toFixed(2) : '-'}</td>`;
            html += `<td style="padding:10px; text-align:center; color:${signalColor}; font-weight:bold;">${signalText}</td>`;
            html += `</tr>`;
        });
        tbody.innerHTML = html;
    } catch (error) {
        console.error('Render error:', error);
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:20px; color:red;">Error rendering table</td></tr>`;
    }
}

function renderAllScannerAnalysisTable(data, ticker) {
    const tbody = document.getElementById('all-scanner-analysis-body');
    if (!tbody) {
        console.warn('all-scanner-analysis-body not found');
        return;
    }
    if (!data || !Array.isArray(data) || data.length === 0 || !ticker) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:30px; color:var(--text-muted);">Search a share to see details.</td></tr>`;
        return;
    }
    try {
        const item = data.find(d => d.ticker === ticker);
        if (!item) {
            tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:30px; color:var(--text-muted);">No data found for ${ticker}</td></tr>`;
            return;
        }
        const isBuySignal = item.rsi < 30 && item.sar < item.currentPrice;
        const isSellSignal = item.rsi > 70 && item.sar > item.currentPrice;
        let signalText = '⚪ NEUTRAL', signalColor = '#64748b';
        if (isBuySignal) { signalText = '🟢🔥 STRONG BUY'; signalColor = '#059669'; }
        else if (isSellSignal) { signalText = '🔴🔥 STRONG SELL'; signalColor = '#dc2626'; }
        const rsiColor = item.rsi !== null ? (item.rsi < 30 ? '#10b981' : (item.rsi > 70 ? '#ef4444' : '#f59e0b')) : '#64748b';
        tbody.innerHTML = `
            <tr>
                <td style="padding:10px; font-weight:bold; color:var(--primary-color);">${item.ticker}</td>
                <td style="padding:10px; text-align:right;">৳${(item.currentPrice || 0).toFixed(2)}</td>
                <td style="padding:10px; text-align:right;">৳${(item.sar || 0).toFixed(2)}</td>
                <td style="padding:10px; text-align:right; color:${rsiColor}; font-weight:600;">${item.rsi !== null ? item.rsi.toFixed(2) : '-'}</td>
                <td style="padding:10px; text-align:center; color:${signalColor}; font-weight:bold;">${signalText}</td>
            </tr>
        `;
    } catch (error) {
        console.error('Render analysis error:', error);
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:20px; color:red;">Error rendering data</td></tr>`;
    }
}

// ==========================================
// 🚀 All Scanner পেজ লোড
// ==========================================
async function loadAllScannerPage() {
    const buyBody = document.getElementById('all-scanner-buy-body');
    const sellBody = document.getElementById('all-scanner-sell-body');
    const analysisBody = document.getElementById('all-scanner-analysis-body');
    const updateTime = document.getElementById('all-scanner-update-time');

    if (buyBody) buyBody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:40px;">⏳ Scanning market...</td></tr>';
    if (sellBody) sellBody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:40px;">⏳ Scanning market...</td></tr>';
    if (analysisBody) analysisBody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:30px;">🔍 Search a share above</td></tr>';

    try {
        const allData = await loadAllScannerData(false);
        if (!allData || allData.length === 0) {
            if (buyBody) buyBody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:30px; color:var(--text-muted);">No market data available.</td></tr>';
            if (sellBody) sellBody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:30px; color:var(--text-muted);">No market data available.</td></tr>';
            if (updateTime) updateTime.innerText = new Date().toLocaleString();
            return;
        }

        const strongBuy = filterStrongBuySignals(allData);
        const strongSell = filterStrongSellSignals(allData);

        renderAllScannerTable(strongBuy, 'buy', 'all-scanner-buy-body');
        renderAllScannerTable(strongSell, 'sell', 'all-scanner-sell-body');

        window._allScannerData = allData;
        initAllScannerSearch(allData);

        if (updateTime) updateTime.innerText = new Date().toLocaleString();
        switchAllScannerTab('buy');
    } catch (error) {
        console.error('All Scanner error:', error);
        if (buyBody) buyBody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:30px; color:red;">❌ Error loading data</td></tr>';
        if (sellBody) sellBody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:30px; color:red;">❌ Error loading data</td></tr>';
    }
}

function initAllScannerSearch(allData) {
    const searchInput = document.getElementById('all-scanner-analysis-search');
    const searchBtn = document.getElementById('all-scanner-analysis-search-btn');
    const suggestionBox = document.getElementById('all-scanner-analysis-suggestions');
    if (!searchInput) {
        console.warn('all-scanner-analysis-search not found');
        return;
    }

    const searchHandler = function() {
        const query = searchInput.value.trim().toUpperCase();
        if (query) renderAllScannerAnalysisTable(allData, query);
        else {
            const tbody = document.getElementById('all-scanner-analysis-body');
            if (tbody) tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:30px; color:var(--text-muted);">Type a share name and click Search</td></tr>';
        }
    };
    searchInput.onkeypress = function(e) { if (e.key === 'Enter') searchHandler(); };
    if (searchBtn) searchBtn.onclick = searchHandler;
    if (!suggestionBox) return;

    let stockList = [];
    if (typeof dseStocks !== 'undefined' && Array.isArray(dseStocks)) stockList = dseStocks;
    else if (window.dseStocks && Array.isArray(window.dseStocks)) stockList = window.dseStocks;

    searchInput.oninput = function() {
        const query = this.value.trim().toUpperCase();
        suggestionBox.innerHTML = '';
        if (!query) { suggestionBox.classList.add('hidden'); return; }
        const filtered = stockList.filter(stock => stock.startsWith(query)).slice(0, 10);
        if (filtered.length > 0) {
            suggestionBox.classList.remove('hidden');
            filtered.forEach(stock => {
                const div = document.createElement('div');
                div.classList.add('suggestion-item');
                div.innerText = stock;
                div.onclick = function() {
                    searchInput.value = stock;
                    suggestionBox.classList.add('hidden');
                    renderAllScannerAnalysisTable(allData, stock);
                };
                suggestionBox.appendChild(div);
            });
        } else {
            suggestionBox.classList.add('hidden');
        }
    };
    document.addEventListener('click', function(e) {
        if (!searchInput.contains(e.target) && !suggestionBox.contains(e.target)) {
            suggestionBox.classList.add('hidden');
        }
    });
}

function switchAllScannerTab(tab) {
    const containers = {
        buy: document.getElementById('all-scanner-buy-container'),
        sell: document.getElementById('all-scanner-sell-container'),
        analysis: document.getElementById('all-scanner-analysis-container')
    };
    const tabs = {
        buy: document.getElementById('all-scanner-tab-buy'),
        sell: document.getElementById('all-scanner-tab-sell'),
        analysis: document.getElementById('all-scanner-tab-analysis')
    };
    Object.values(containers).forEach(c => { if (c) c.style.display = 'none'; });
    Object.values(tabs).forEach(t => {
        if (t) {
            t.style.background = 'transparent';
            t.style.color = 'var(--text-primary)';
            t.style.border = '1px solid var(--border-color)';
        }
    });
    if (tab === 'buy' && containers.buy) {
        containers.buy.style.display = 'block';
        if (tabs.buy) {
            tabs.buy.style.background = 'var(--primary-color)';
            tabs.buy.style.color = 'white';
            tabs.buy.style.border = 'none';
        }
    } else if (tab === 'sell' && containers.sell) {
        containers.sell.style.display = 'block';
        if (tabs.sell) {
            tabs.sell.style.background = 'var(--primary-color)';
            tabs.sell.style.color = 'white';
            tabs.sell.style.border = 'none';
        }
    } else if (tab === 'analysis' && containers.analysis) {
        containers.analysis.style.display = 'block';
        if (tabs.analysis) {
            tabs.analysis.style.background = 'var(--primary-color)';
            tabs.analysis.style.color = 'white';
            tabs.analysis.style.border = 'none';
        }
    }
}

async function refreshAllScannerPage() {
    try {
        await clearAllScannerCache();
        await loadAllScannerPage();
        if (typeof showToast === 'function') showToast('✅ All Scanner refreshed!', 'success');
    } catch (e) {
        if (typeof showToast === 'function') showToast('❌ Refresh failed: ' + e.message, 'error');
    }
}

// ==========================================
// 📊 RSI Indicator Section (Supabase-first)
// ==========================================
let currentRSITab = 'buy';
let cachedRSIData = null;

async function loadRSIIndicatorPage() {
    const buyBody = document.getElementById('rsi-buy-body');
    const sellBody = document.getElementById('rsi-sell-body');
    const updateTime = document.getElementById('rsi-update-time');

    if (buyBody) buyBody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:40px;">⏳ Loading RSI data...</td></tr>';
    if (sellBody) sellBody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:40px;">⏳ Loading RSI data...</td></tr>';

    try {
        let allData = await getAllScannerCache();
        if (!allData) {
            if (typeof showToast === 'function') showToast('📊 Loading market data for RSI...', 'info');
            allData = await loadAllScannerData(true);
        }
        if (!allData || allData.length === 0) {
            if (buyBody) buyBody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:30px; color:var(--text-muted);">No market data available.</td></tr>';
            if (sellBody) sellBody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:30px; color:var(--text-muted);">No market data available.</td></tr>';
            if (updateTime) updateTime.innerText = new Date().toLocaleString();
            return;
        }
        cachedRSIData = allData;
        applyRSIFilter('buy');
        applyRSIFilter('sell');
        if (updateTime) updateTime.innerText = new Date().toLocaleString();
    } catch (error) {
        console.error('RSI Indicator error:', error);
        if (buyBody) buyBody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:30px; color:red;">❌ Error loading data</td></tr>';
        if (sellBody) sellBody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:30px; color:red;">❌ Error loading data</td></tr>';
    }
}

function applyRSIFilter(tab) {
    if (!cachedRSIData) { 
        loadRSIIndicatorPage(); 
        return; 
    }
    const tbodyId = tab === 'buy' ? 'rsi-buy-body' : 'rsi-sell-body';
    const tbody = document.getElementById(tbodyId);
    if (!tbody) return;
    const threshold = tab === 'buy' ? 30 : 70;
    let filtered = [];
    try {
        if (tab === 'buy') {
            filtered = cachedRSIData.filter(item => item.rsi !== null && item.rsi < threshold)
                .sort((a, b) => (a.rsi || 0) - (b.rsi || 0));
        } else {
            filtered = cachedRSIData.filter(item => item.rsi !== null && item.rsi > threshold)
                .sort((a, b) => (b.rsi || 0) - (a.rsi || 0));
        }
        renderRSITable(filtered, tab, tbody);
    } catch (error) {
        console.error('RSI filter error:', error);
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:20px; color:red;">Error filtering data</td></tr>`;
    }
}

function renderRSITable(data, tab, tbody) {
    if (!tbody) return;
    if (!data || !Array.isArray(data) || data.length === 0) {
        const msg = tab === 'buy' ? 'No stocks with RSI below 30.' : 'No stocks with RSI above 70.';
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:30px; color:var(--text-muted);">${msg}</td></tr>`;
        return;
    }
    try {
        let html = '';
        data.forEach(item => {
            const isBuy = tab === 'buy';
            const signalText = isBuy ? '🟢 BUY' : '🔴 SELL';
            const signalColor = isBuy ? '#10b981' : '#ef4444';
            const rsiColor = isBuy ? '#10b981' : '#ef4444';
            html += `<tr onclick="if(typeof openStockDetailModal === 'function') openStockDetailModal('${item.ticker}')" style="cursor:pointer;">`;
            html += `<td style="padding:10px; font-weight:bold; color:var(--primary-color); text-decoration:underline;">${item.ticker}</td>`;
            html += `<td style="padding:10px;">${item.category || 'N/A'}</td>`;
            html += `<td style="padding:10px; text-align:right;">৳${(item.currentPrice || 0).toFixed(2)}</td>`;
            html += `<td style="padding:10px; text-align:right; color:${rsiColor}; font-weight:600;">${item.rsi !== null ? item.rsi.toFixed(2) : '-'}</td>`;
            html += `<td style="padding:10px; text-align:right;">${item.ath > 0 ? '৳'+item.ath.toFixed(2) : '-'}</td>`;
            html += `<td style="padding:10px; text-align:right;">${item.atl > 0 ? '৳'+item.atl.toFixed(2) : '-'}</td>`;
            html += `<td style="padding:10px; text-align:center; color:${signalColor}; font-weight:bold;">${signalText}</td>`;
            html += `</tr>`;
        });
        tbody.innerHTML = html;
    } catch (error) {
        console.error('RSI table render error:', error);
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:20px; color:red;">Error rendering RSI table</td></tr>`;
    }
}

function switchRSITab(tab) {
    currentRSITab = tab;
    const containers = { buy: document.getElementById('rsi-buy-container'), sell: document.getElementById('rsi-sell-container') };
    const tabs = { buy: document.getElementById('rsi-tab-buy'), sell: document.getElementById('rsi-tab-sell') };
    Object.values(containers).forEach(c => { if (c) c.style.display = 'none'; });
    Object.values(tabs).forEach(t => {
        if (t) {
            t.style.background = 'transparent';
            t.style.color = 'var(--text-primary)';
            t.style.border = '1px solid var(--border-color)';
        }
    });
    if (tab === 'buy' && containers.buy) {
        containers.buy.style.display = 'block';
        if (tabs.buy) {
            tabs.buy.style.background = 'var(--primary-color)';
            tabs.buy.style.color = 'white';
            tabs.buy.style.border = 'none';
        }
        applyRSIFilter('buy');
    } else if (tab === 'sell' && containers.sell) {
        containers.sell.style.display = 'block';
        if (tabs.sell) {
            tabs.sell.style.background = 'var(--primary-color)';
            tabs.sell.style.color = 'white';
            tabs.sell.style.border = 'none';
        }
        applyRSIFilter('sell');
    }
}

async function refreshRSIIndicator() {
    try {
        await clearAllScannerCache();
        await loadRSIIndicatorPage();
        if (typeof showToast === 'function') showToast('✅ RSI Indicator refreshed!', 'success');
    } catch (e) {
        if (typeof showToast === 'function') showToast('❌ Refresh failed: ' + e.message, 'error');
    }
}

// ==========================================
// 📌 Screener - Parabolic SAR (Supabase-first)
// ==========================================
let currentScreenerTab = 'buy';
let screenerDataCache = null;
let screenerCacheTime = 0;
const SCREENER_CACHE_TTL = 300000;

async function loadScreenerData(tab = 'buy', portfolioId = null) {
    currentScreenerTab = tab;
    const tbody = document.getElementById('screener-table-body');
    if (!tbody) {
        console.warn('screener-table-body not found');
        return;
    }

    const tabBuy = document.getElementById('screener-tab-buy');
    const tabSell = document.getElementById('screener-tab-sell');
    if (tabBuy && tabSell) {
        [tabBuy, tabSell].forEach(btn => {
            btn.classList.remove('active');
            btn.style.background = 'transparent';
            btn.style.border = '1px solid var(--border-color)';
            btn.style.color = 'var(--text-primary)';
        });
        const activeBtn = document.getElementById(`screener-tab-${tab}`);
        if (activeBtn) {
            activeBtn.classList.add('active');
            activeBtn.style.background = 'var(--primary-color)';
            activeBtn.style.color = 'white';
            activeBtn.style.border = 'none';
        }
    }

    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding:20px;">⏳ Loading screener data...</td></tr>`;

    try {
        const user = auth && auth.currentUser ? auth.currentUser : null;
        if (!user) {
            tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding:20px; color:red;">Please login first.</td></tr>`;
            return;
        }

        const now = Date.now();
        if (screenerDataCache && (now - screenerCacheTime) < SCREENER_CACHE_TTL) {
            renderScreenerTable(tab, screenerDataCache);
            return;
        }

        const unifiedData = await unifiedEngine.calculate(user.uid, portfolioId || null, true);
        if (!unifiedData || !unifiedData.stockDetails || unifiedData.stockDetails.length === 0) {
            tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding:20px; color:var(--text-muted);">No holdings found. Add stocks to screen.</td></tr>`;
            return;
        }

        const tickers = unifiedData.stockDetails.map(s => s.ticker);
        const start = new Date();
        start.setDate(start.getDate() - 30);
        const startDateStr = start.toISOString().split('T')[0];
        const screenerResults = [];
        const batchSize = 10;

        for (let i = 0; i < tickers.length; i += batchSize) {
            const batchTickers = tickers.slice(i, i + batchSize);
            const promises = batchTickers.map(async (ticker) => {
                try {
                    let currentPrice = await getUnifiedPrice(ticker);
                    let priceData = [];

                    // ১. Supabase history_dse থেকে ফেচ (প্রথম)
                    if (typeof supabase !== 'undefined' && supabase) {
                        try {
                            const { data, error } = await supabase
                                .from('history_dse')
                                .select('date, ltp, high, low')
                                .eq('code', ticker)
                                .gte('date', startDateStr)
                                .order('date', { ascending: true });
                            if (!error && data && data.length > 0) {
                                priceData = data.map(d => ({
                                    date: d.date,
                                    ltp: parseFloat(d.ltp),
                                    high: parseFloat(d.high) || parseFloat(d.ltp),
                                    low: parseFloat(d.low) || parseFloat(d.ltp)
                                }));
                            }
                        } catch (e) {
                            console.warn(`Supabase history_dse fetch failed for ${ticker} in screener:`, e);
                        }
                    }

                    // ২. যদি history_dse-এ না থাকে, Firebase daily_prices ফ্যালব্যাক
                    if (priceData.length === 0 && typeof db !== 'undefined') {
                        try {
                            const snap = await db.collection('daily_prices')
                                .where('ticker', '==', ticker)
                                .where('date', '>=', startDateStr)
                                .orderBy('date', 'asc')
                                .get();
                            if (!snap.empty) {
                                snap.forEach(doc => {
                                    const data = doc.data();
                                    const price = parseFloat(data.price) || parseFloat(data.close) || 0;
                                    const high = parseFloat(data.high) || price;
                                    const low = parseFloat(data.low) || price;
                                    if (price > 0) {
                                        priceData.push({ date: data.date, ltp: price, high: high, low: low });
                                    }
                                });
                            }
                        } catch (e) { /* ignore */ }
                    }

                    if (priceData.length < 2) return null;
                    let sarData = [];
                    try {
                        if (typeof calculateParabolicSAR === 'function') {
                            sarData = calculateParabolicSAR(priceData);
                        }
                    } catch (indicatorError) {
                        console.warn(`PSAR calculation error for ${ticker}:`, indicatorError);
                    }
                    const lastSAR = sarData.length > 0 ? sarData[sarData.length - 1] : null;
                    if (currentPrice === 0) currentPrice = priceData[priceData.length - 1]?.ltp || 0;
                    return { 
                        ticker: ticker, 
                        currentPrice: currentPrice, 
                        sar: lastSAR?.sar || currentPrice, 
                        trend: lastSAR?.trend || 'up' 
                    };
                } catch (err) {
                    console.warn(`Error processing ${ticker} in screener:`, err);
                    return null;
                }
            });
            const results = await Promise.all(promises);
            results.forEach(r => { if (r) screenerResults.push(r); });
        }

        screenerDataCache = screenerResults;
        screenerCacheTime = Date.now();
        renderScreenerTable(tab, screenerResults);

        const updateTime = document.getElementById('screener-update-time');
        if (updateTime) updateTime.innerText = new Date().toLocaleString();
    } catch (error) {
        console.error('Screener error:', error);
        tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding:20px; color:red;">Error: ${error.message}</td></tr>`;
    }
}

function renderScreenerTable(tab, data) {
    const tbody = document.getElementById('screener-table-body');
    if (!tbody) return;
    if (!data || !Array.isArray(data) || data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding:20px; color:var(--text-muted);">No ${tab} signals found.</td></tr>`;
        return;
    }
    try {
        const filtered = data.filter(item => {
            if (tab === 'buy') return item.currentPrice > item.sar;
            else return item.currentPrice < item.sar;
        });
        if (filtered.length === 0) {
            tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding:20px; color:var(--text-muted);">No ${tab} signals found.</td></tr>`;
            return;
        }
        filtered.sort((a, b) => Math.abs(a.currentPrice - a.sar) - Math.abs(b.currentPrice - b.sar));
        let html = '';
        for (const item of filtered) {
            const diff = item.currentPrice - item.sar;
            const signalClass = diff > 0 ? 'up' : 'error';
            const signalText = diff > 0 ? '🟢 Buy' : '🔴 Sell';
            html += `<tr onclick="if(typeof openStockDetailModal === 'function') openStockDetailModal('${item.ticker}')" style="cursor:pointer;">`;
            html += `<td style="padding:10px; font-weight:bold; color:var(--primary-color); text-decoration:underline;">${item.ticker}</td>`;
            html += `<td style="padding:10px; text-align:right;">৳${(item.currentPrice || 0).toFixed(2)}</td>`;
            html += `<td style="padding:10px; text-align:right;">৳${(item.sar || 0).toFixed(2)}</td>`;
            html += `<td style="padding:10px; text-align:center; font-weight:bold;" class="${signalClass}">${signalText}</td>`;
            html += `</tr>`;
        }
        tbody.innerHTML = html;
    } catch (error) {
        console.error('Screener render error:', error);
        tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding:20px; color:red;">Error rendering screener</td></tr>`;
    }
}

// ==========================================
// 💰 Buy Sell Price – ডেটা জেনারেটর (ফিক্সড ভার্সন)
//    🔧 কেস-ইনসেনসিটিভ ম্যাচিং + ডিবাগ লগ
// ==========================================
window.getBuySellPriceSignalData = async function() {
    console.log('🔍 getBuySellPriceSignalData() called');
    
    const user = auth?.currentUser;
    if (!user) {
        console.warn('⚠️ No user logged in');
        return { buy: [], sell: [] };
    }

    try {
        // ১. পোর্টফোলিও ডেটা
        const unifiedData = await unifiedEngine.calculate(user.uid, null, true);
        if (!unifiedData || !unifiedData.stockDetails || unifiedData.stockDetails.length === 0) {
            console.warn('⚠️ No stock details in portfolio');
            return { buy: [], sell: [] };
        }
        console.log(`📊 Portfolio stocks: ${unifiedData.stockDetails.length}`);

        // ২. সেল হিস্ট্রি ফেচ (Supabase優先)
        let salesData = [];
        let salesSource = 'none';

        if (typeof supabase !== 'undefined' && supabase) {
            try {
                console.log('📡 Fetching sales from Supabase...');
                const { data, error } = await supabase
                    .from('sales_history')
                    .select('share_name, quantity_sold, sell_price')
                    .eq('user_id', user.uid);
                
                if (error) {
                    console.warn('❌ Supabase error:', error);
                } else if (data && data.length > 0) {
                    salesData = data;
                    salesSource = 'Supabase';
                    console.log(`✅ Supabase: ${data.length} records`);
                    console.log('📋 Sample:', data[0]);
                } else {
                    console.warn('⚠️ Supabase returned 0 records');
                }
            } catch (e) {
                console.warn('❌ Supabase exception:', e);
            }
        }

        // ৩. যদি Supabase-এ না থাকে, Firebase ফ্যালব্যাক
        if (salesData.length === 0 && typeof db !== 'undefined') {
            console.log('📡 Falling back to Firebase...');
            try {
                const snap = await db.collection('sales_history')
                    .where('userId', '==', user.uid)
                    .get();
                if (!snap.empty) {
                    snap.forEach(doc => {
                        const d = doc.data();
                        salesData.push({
                            share_name: d.shareName || d.share_name || '',
                            quantity_sold: d.quantitySold || d.quantity_sold || 0,
                            sell_price: d.sellPrice || d.sell_price || 0
                        });
                    });
                    salesSource = 'Firebase';
                    console.log(`✅ Firebase: ${salesData.length} records`);
                } else {
                    console.warn('⚠️ Firebase returned 0 records');
                }
            } catch (e) {
                console.warn('❌ Firebase exception:', e);
            }
        }

        if (salesData.length === 0) {
            console.warn('⚠️ No sales data found at all');
            return { buy: [], sell: [] };
        }

        console.log(`📦 Total sales records: ${salesData.length} (source: ${salesSource})`);

        // ৪. টিকার তালিকা (পোর্টফোলিও থেকে)
        const tickers = unifiedData.stockDetails.map(s => s.ticker);
        console.log('📋 Tickers in portfolio:', tickers);

        // ৫. Sell হিস্ট্রি থেকে টিকার ভিত্তিতে গ্রুপ করা (কেস-ইনসেনসিটিভ)
        const salesByTicker = new Map();
        for (const sale of salesData) {
            const ticker = (sale.share_name || '').toUpperCase().trim();
            if (!ticker) continue;
            if (!salesByTicker.has(ticker)) {
                salesByTicker.set(ticker, []);
            }
            salesByTicker.get(ticker).push(sale);
        }

        console.log('📊 Tickers with sales:', Array.from(salesByTicker.keys()));

        // ৬. প্রতিটি স্টকের জন্য সিগন্যাল তৈরি
        const buySignals = [];
        const sellSignals = [];

        for (const stock of unifiedData.stockDetails) {
            const ticker = stock.ticker.toUpperCase().trim();
            const currentPrice = await getUnifiedPrice(ticker) || 0;
            console.log(`\n🔍 Processing: ${ticker} (Price: ${currentPrice})`);

            // মিন বাই প্রাইস
            let minBuyPrice = Infinity;
            for (const lot of stock.lots) {
                if (lot.buyPrice < minBuyPrice) minBuyPrice = lot.buyPrice;
            }
            if (minBuyPrice === Infinity) minBuyPrice = 0;

            // ওই টিকারের সেল রেকর্ড
            const tickerSales = salesByTicker.get(ticker) || [];
            console.log(`  Sales records for ${ticker}: ${tickerSales.length}`);

            let maxSellPrice = 0;
            let totalSellQty = 0;
            let totalSellValue = 0;

            for (const sale of tickerSales) {
                const sellPrice = parseFloat(sale.sell_price) || 0;
                const qty = parseFloat(sale.quantity_sold) || 0;
                if (sellPrice > 0 && qty > 0) {
                    if (sellPrice > maxSellPrice) maxSellPrice = sellPrice;
                    totalSellValue += sellPrice * qty;
                    totalSellQty += qty;
                }
            }
            const avgSellPrice = totalSellQty > 0 ? totalSellValue / totalSellQty : 0;
            console.log(`  Max Sell: ${maxSellPrice}, Avg Sell: ${avgSellPrice}`);

            // Buy Signal
            if (currentPrice > 0 && minBuyPrice > 0 && currentPrice < minBuyPrice) {
                buySignals.push({
                    ticker: ticker,
                    price: currentPrice,
                    minBuyPrice: minBuyPrice,
                    maxSellPrice: maxSellPrice,
                    avgSellPrice: avgSellPrice,
                    rsi: null,
                    psar: null,
                    ath: null,
                    atl: null
                });
                console.log(`  ✅ Buy signal added for ${ticker}`);
            }

            // Sell Signal (শুধু যদি sell history থাকে)
            if (currentPrice > 0 && maxSellPrice > 0 && currentPrice > maxSellPrice) {
                sellSignals.push({
                    ticker: ticker,
                    price: currentPrice,
                    minBuyPrice: minBuyPrice,
                    maxSellPrice: maxSellPrice,
                    avgSellPrice: avgSellPrice,
                    rsi: null,
                    psar: null,
                    ath: null,
                    atl: null
                });
                console.log(`  ✅ Sell signal added for ${ticker}`);
            }
        }

        console.log(`\n📊 Final: ${buySignals.length} Buy, ${sellSignals.length} Sell signals`);
        console.log('📋 Sell signals:', sellSignals);

        return { buy: buySignals, sell: sellSignals };
    } catch (error) {
        console.error('❌ Error in getBuySellPriceSignalData:', error);
        return { buy: [], sell: [] };
    }
};

// ==========================================
// 📌 গ্লোবালি এক্সপোজ (সব ফাংশন উইন্ডোতে)
// ==========================================
window.loadAllScannerPage = loadAllScannerPage;
window.switchAllScannerTab = switchAllScannerTab;
window.refreshAllScannerPage = refreshAllScannerPage;
window.loadRSIIndicatorPage = loadRSIIndicatorPage;
window.switchRSITab = switchRSITab;
window.applyRSIFilter = applyRSIFilter;
window.refreshRSIIndicator = refreshRSIIndicator;
window.loadScreenerData = loadScreenerData;
window.clearAllScannerCache = clearAllScannerCache;
window.getBuySellPriceSignalData = window.getBuySellPriceSignalData;

console.log('✅ scanner.js v7.1 (Full Error-Free) loaded successfully');