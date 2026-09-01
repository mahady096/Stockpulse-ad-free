// ==========================================
// 📊 dash-utils.js - ইউটিলিটি ফাংশন
//    dashboard.js থেকে ভাগ করা (ফাইল ৫)
//    টাইমলাইন, ডিপোজিট, অটো-রিফ্রেশ, টাইমস্ট্যাম্প
// ==========================================

// ==========================================
// ১. পোর্টফোলিও টাইমলাইন ডেটা ফেচ
// ==========================================

async function fetchPortfolioTimelineData(startDate = null, endDate = null, portfolioId = null) {
    console.log('📥 fetchPortfolioTimelineData called', { portfolioId });
    const user = auth && auth.currentUser ? auth.currentUser : null;
    if (!user) return [];

    const today = new Date();
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(today.getDate() - 30);
    const defaultStart = thirtyDaysAgo.toISOString().split('T')[0];
    const defaultEnd = today.toISOString().split('T')[0];
    const start = startDate || defaultStart;
    const end = endDate || defaultEnd;

    const cacheKey = `timeline_${user.uid}_${start}_${end}_${portfolioId || 'all'}`;
    try {
        const cached = await CacheManager.get(cacheKey, 1800000);
        if (cached) {
            const parsed = JSON.parse(cached);
            if (Date.now() - parsed.timestamp < 1800000) {
                console.log('✅ Returning cached timeline data:', parsed.data.length);
                return parsed.data;
            }
        }
    } catch (e) {}

    if (typeof db === 'undefined') return [];

    try {
        let portfolioQuery = db.collection('portfolios').where('userId', '==', user.uid);
        if (portfolioId && portfolioId !== 'grand' && portfolioId !== 'all') {
            portfolioQuery = portfolioQuery.where('portfolioId', '==', portfolioId);
        }
        const portfolioSnap = await portfolioQuery.get();

        if (portfolioSnap.empty) return [];

        const buyLots = [];
        portfolioSnap.forEach(doc => {
            const data = doc.data();
            const perUnitCost = (data.quantity * data.buyPrice + (data.commission || 0)) / data.quantity;
            let buyDate = data.date?.toDate?.() || data.date || new Date();
            buyLots.push({
                ticker: data.shareName,
                qty: data.quantity,
                buyPrice: data.buyPrice,
                perUnitCost: perUnitCost,
                date: buyDate,
                buyDateStr: buyDate.toISOString().split('T')[0]
            });
        });

        let salesQuery = db.collection('sales_history').where('userId', '==', user.uid);
        if (portfolioId && portfolioId !== 'grand' && portfolioId !== 'all') {
            salesQuery = salesQuery.where('portfolioId', '==', portfolioId);
        }
        const salesSnap = await salesQuery.get();

        const totalSoldMap = new Map();
        salesSnap.forEach(doc => {
            const data = doc.data();
            totalSoldMap.set(data.shareName, (totalSoldMap.get(data.shareName) || 0) + data.quantitySold);
        });

        buyLots.sort((a, b) => a.date - b.date);
        const firstBuyDate = buyLots[0].date;
        const currentDate = new Date();
        currentDate.setHours(0, 0, 0, 0);
        let daysDiff = Math.ceil((currentDate - firstBuyDate) / (1000 * 60 * 60 * 24));
        if (daysDiff < 1) daysDiff = 1;
        const finalDays = Math.min(daysDiff, 365);

        const allDates = [];
        for (let i = 0; i <= finalDays; i++) {
            const d = new Date(firstBuyDate);
            d.setDate(firstBuyDate.getDate() + i);
            allDates.push(d);
        }

        const startObj = new Date(start);
        const endObj = new Date(end);
        startObj.setHours(0, 0, 0, 0);
        endObj.setHours(23, 59, 59, 999);

        // 🔥 Supabase-first: সমস্ত প্রাইস ডেটা ফেচ
        const uniqueTickers = [...new Set(buyLots.map(l => l.ticker))];
        const startDateStr = allDates[0].toISOString().split('T')[0];
        const endDateStr = allDates[allDates.length-1].toISOString().split('T')[0];
        console.log(`📊 Fetching prices for ${uniqueTickers.length} tickers from ${startDateStr} to ${endDateStr}...`);

        const priceMap = new Map();

        // ১. Supabase history_dse থেকে ফেচ (প্রথম অগ্রাধিকার)
        if (typeof supabase !== 'undefined' && supabase) {
            const chunkSize = 10;
            for (let i = 0; i < uniqueTickers.length; i += chunkSize) {
                const chunk = uniqueTickers.slice(i, i + chunkSize);
                try {
                    const { data, error } = await supabase
                        .from('history_dse')
                        .select('code, date, ltp')
                        .in('ticker', chunk)
                        .gte('date', startDateStr)
                        .lte('date', endDateStr)
                        .order('date', { ascending: true });
                    if (!error && data && data.length > 0) {
                        data.forEach(item => {
                            const price = parseFloat(item.ltp);
                            const dateStr = item.date;
                            if (price > 0) {
                                if (!priceMap.has(dateStr)) priceMap.set(dateStr, new Map());
                                priceMap.get(dateStr).set(item.code, price);
                            }
                        });
                    }
                } catch (e) {
                    console.warn('Supabase history_dse batch error:', e);
                }
            }
        }

        // ২. যদি Supabase-এ না থাকে, Firebase daily_prices ফ্যালব্যাক
        if (priceMap.size === 0 && typeof db !== 'undefined') {
            const chunkSize = 10;
            for (let i = 0; i < uniqueTickers.length; i += chunkSize) {
                const chunk = uniqueTickers.slice(i, i + chunkSize);
                try {
                    const snap = await db.collection('daily_prices')
                        .where('ticker', 'in', chunk)
                        .where('date', '>=', startDateStr)
                        .where('date', '<=', endDateStr)
                        .get();
                    snap.forEach(doc => {
                        const data = doc.data();
                        const price = parseFloat(data.price) || parseFloat(data.close) || 0;
                        const dateStr = data.date;
                        if (price > 0) {
                            if (!priceMap.has(dateStr)) priceMap.set(dateStr, new Map());
                            priceMap.get(dateStr).set(data.ticker, price);
                        }
                    });
                } catch (e) {
                    for (const ticker of chunk) {
                        try {
                            const snap2 = await db.collection('daily_prices')
                                .where('ticker', '==', ticker)
                                .where('date', '>=', startDateStr)
                                .where('date', '<=', endDateStr)
                                .get();
                            snap2.forEach(doc => {
                                const data = doc.data();
                                const price = parseFloat(data.price) || parseFloat(data.close) || 0;
                                const dateStr = data.date;
                                if (price > 0) {
                                    if (!priceMap.has(dateStr)) priceMap.set(dateStr, new Map());
                                    priceMap.get(dateStr).set(data.ticker, price);
                                }
                            });
                        } catch (e2) {}
                    }
                }
            }
        }

        console.log(`✅ Prices fetched, ${priceMap.size} dates with data.`);

        // সর্বশেষ দিনের জন্য ড্যাশবোর্ডের প্রাইস ব্যবহার করুন
        const todayStr = today.toISOString().split('T')[0];
        const latestPrices = await getLatestAndPreviousPrices(uniqueTickers);
        const latestPriceMap = new Map();
        for (const [ticker, data] of latestPrices) {
            if (data.currentPrice > 0) {
                latestPriceMap.set(ticker, data.currentPrice);
            }
        }
        if (latestPriceMap.size > 0) {
            const todayMap = priceMap.get(todayStr) || new Map();
            for (const [ticker, price] of latestPriceMap) {
                todayMap.set(ticker, price);
            }
            priceMap.set(todayStr, todayMap);
        }

        console.log('⏳ Building timeline...');
        const dailyPortfolio = [];
        let cumulativeLots = [];

        for (let idx = 0; idx < allDates.length; idx++) {
            const currentDateObj = allDates[idx];
            const dateStr = currentDateObj.toISOString().split('T')[0];

            for (const lot of buyLots) {
                const lotDate = new Date(lot.date);
                lotDate.setHours(0, 0, 0, 0);
                if (lotDate <= currentDateObj && !lot.added) {
                    cumulativeLots.push({ ...lot, remainingQty: lot.qty, added: true });
                    lot.added = true;
                }
            }

            const tempSoldMap = new Map(totalSoldMap);
            let tempLots = cumulativeLots.map(lot => ({ ...lot, remainingQty: lot.remainingQty }));
            for (const lot of tempLots) {
                let toSell = tempSoldMap.get(lot.ticker) || 0;
                if (toSell > 0 && lot.remainingQty > 0) {
                    const taken = Math.min(lot.remainingQty, toSell);
                    lot.remainingQty -= taken;
                    toSell -= taken;
                    tempSoldMap.set(lot.ticker, toSell);
                }
            }

            let totalInvestment = 0;
            const remainingStocks = [];
            for (const lot of tempLots) {
                if (lot.remainingQty > 0 && lot.perUnitCost > 0 && isFinite(lot.perUnitCost)) {
                    totalInvestment += lot.remainingQty * lot.perUnitCost;
                    remainingStocks.push({
                        ticker: lot.ticker,
                        qty: lot.remainingQty,
                        avgCost: lot.perUnitCost
                    });
                }
            }

            let totalCurrentValue = 0;
            const dayPriceMap = priceMap.get(dateStr) || new Map();
            for (const stock of remainingStocks) {
                const price = dayPriceMap.get(stock.ticker) || 0;
                totalCurrentValue += stock.qty * price;
            }

            if (totalInvestment > 0 && isFinite(totalInvestment)) {
                dailyPortfolio.push({
                    date: dateStr,
                    totalInvestment,
                    totalCurrentValue,
                    dailyPL: totalCurrentValue - totalInvestment,
                    dailyPLPercent: ((totalCurrentValue - totalInvestment) / totalInvestment) * 100
                });
            }
        }

        console.log(`✅ Timeline complete: ${dailyPortfolio.length} entries`);

        const filteredResult = dailyPortfolio.filter(item => {
            const itemDate = new Date(item.date);
            return itemDate >= startObj && itemDate <= endObj;
        });

        try {
            await CacheManager.set(cacheKey, filteredResult, 1800000);
        } catch (e) {}

        console.log(`✅ Returning ${filteredResult.length} entries`);
        return filteredResult;

    } catch (error) {
        console.error('❌ Error in fetchPortfolioTimelineData:', error);
        return [];
    }
}

// ==========================================
// ২. ডিপোজিট ম্যানেজমেন্ট
// ==========================================

async function getUserDeposit(userId) {
    if (!userId) return 0;
    try {
        if (typeof db === 'undefined') return 0;
        const doc = await db.collection('user_meta').doc(userId).get();
        if (doc.exists) {
            return doc.data().deposit || 0;
        }
        return 0;
    } catch (e) {
        console.warn('Error getting deposit:', e);
        return 0;
    }
}

async function updateUserDeposit(userId, amount) {
    if (!userId) return;
    try {
        if (typeof db === 'undefined') return;
        await db.collection('user_meta').doc(userId).set({
            deposit: amount,
            updatedAt: new Date()
        }, { merge: true });
    } catch (e) {
        console.error('Error updating deposit:', e);
        throw e;
    }
}

// ==========================================
// ৩. অটো-রিফ্রেশ
// ==========================================

function startAutoRefresh() {
    if (window.autoRefreshInterval) {
        clearInterval(window.autoRefreshInterval);
        window.autoRefreshInterval = null;
    }
    if (!autoRefreshEnabled) return;
    
    const REFRESH_INTERVAL = 1800000; // ৩০ মিনিট
    let timeLeft = REFRESH_INTERVAL / 1000;

    function updateTimer() {
        const timerEl = document.getElementById('next-refresh-timer');
        if (timerEl) {
            const minutes = Math.floor(timeLeft / 60);
            const seconds = Math.floor(timeLeft % 60);
            timerEl.innerText = `⏳ ${minutes}m ${seconds}s`;
            if (timeLeft <= 0) {
                timerEl.innerText = '🔄 Refreshing...';
            }
        }
    }

    const timerInterval = setInterval(() => {
        timeLeft--;
        if (timeLeft <= 0) {
            timeLeft = REFRESH_INTERVAL / 1000;
        }
        updateTimer();
    }, 1000);

    window.autoRefreshInterval = setInterval(() => {
        if (!document.hidden && currentDataMode === 'firebase' && auth && auth.currentUser) {
            console.log('🔄 Auto-refreshing dashboard...');
            loadDashboardData();
            timeLeft = REFRESH_INTERVAL / 1000;
            updateTimer();
        }
    }, REFRESH_INTERVAL);
    
    updateTimer();
}

function stopAutoRefresh() {
    if (window.autoRefreshInterval) {
        clearInterval(window.autoRefreshInterval);
        window.autoRefreshInterval = null;
    }
}

// ==========================================
// ৪. ম্যানুয়াল রিলোড
// ==========================================

async function manualReloadDashboard() {
    const user = auth && auth.currentUser ? auth.currentUser : null;
    if (!user) {
        if (typeof showToast === 'function') showToast('Please login first', 'error');
        return;
    }
    if (isManualReloading) {
        if (typeof showToast === 'function') showToast('Already reloading...', 'info');
        return;
    }
    isManualReloading = true;
    const reloadBtn = document.getElementById('btn-manual-reload');
    const originalText = reloadBtn ? reloadBtn.innerHTML : '';
    try {
        if (reloadBtn) {
            reloadBtn.innerHTML = '⏳ Loading...';
            reloadBtn.disabled = true;
            reloadBtn.style.opacity = '0.7';
        }
        if (typeof showToast === 'function') showToast('🔄 Manual refresh started...', 'info');
        firebaseDataManager.clearCache();
        CacheManager.clearAll();
        try { localStorage.removeItem('cachedPrices'); } catch (e) { /* ignore */ }
        await loadDashboardData();
        if (typeof loadUnifiedStockTable === 'function') await loadUnifiedStockTable(user.uid);
        if (typeof loadPortfolioAnalysisTable === 'function') await loadPortfolioAnalysisTable(user.uid);
        await updateTimestamp();
        if (typeof showToast === 'function') showToast('✅ Dashboard refreshed successfully!', 'success');
    } catch (error) {
        console.error(error);
        if (typeof showToast === 'function') showToast('❌ Refresh failed.', 'error');
    } finally {
        if (reloadBtn) {
            reloadBtn.innerHTML = originalText;
            reloadBtn.disabled = false;
            reloadBtn.style.opacity = '1';
        }
        isManualReloading = false;
    }
}

// ==========================================
// ৫. টাইমস্ট্যাম্প ও লোডিং
// ==========================================

function updateTimestamp() {
    const timestampElem = document.getElementById('update-timestamp');
    if (!timestampElem) return;

    const mode = currentDataMode === 'firebase' ? 'Firebase Cache' : 'Live API (Supabase)';

    getLatestDSEXFromSupabase()
        .then(dsexData => {
            if (dsexData && dsexData.date) {
                timestampElem.innerHTML = `🔄 Data source: ${mode} | Last scraped: ${formatDisplayTime(dsexData.date)} (BD Time)`;
            } else {
                // Supabase না পেলে Firebase ফ্যালব্যাক
                if (currentDataMode === 'firebase' || currentDataMode === 'live') {
                    firebaseDataManager.getLastUpdateTime()
                        .then(fbLastUpdate => {
                            if (fbLastUpdate && timestampElem) {
                                timestampElem.innerHTML = `🔄 Data source: ${mode} | Last scraped: ${formatDisplayTime(fbLastUpdate)} (BD Time)`;
                            } else {
                                timestampElem.innerHTML = `🔄 Last updated: ${formatDisplayTime(new Date())} (${mode})`;
                            }
                        })
                        .catch(() => {
                            timestampElem.innerHTML = `🔄 Last updated: ${formatDisplayTime(new Date())} (${mode})`;
                        });
                } else {
                    timestampElem.innerHTML = `🔄 Last updated: ${formatDisplayTime(new Date())} (${mode})`;
                }
            }
        })
        .catch(() => {
            // এরর হলে Firebase বা বর্তমান সময়
            if (currentDataMode === 'firebase' || currentDataMode === 'live') {
                firebaseDataManager.getLastUpdateTime()
                    .then(fbLastUpdate => {
                        if (fbLastUpdate && timestampElem) {
                            timestampElem.innerHTML = `🔄 Data source: ${mode} | Last scraped: ${formatDisplayTime(fbLastUpdate)} (BD Time)`;
                        } else {
                            timestampElem.innerHTML = `🔄 Last updated: ${formatDisplayTime(new Date())} (${mode})`;
                        }
                    })
                    .catch(() => {
                        timestampElem.innerHTML = `🔄 Last updated: ${formatDisplayTime(new Date())} (${mode})`;
                    });
            } else {
                timestampElem.innerHTML = `🔄 Last updated: ${formatDisplayTime(new Date())} (${mode})`;
            }
        });
}

function showDataLoading(isLoading) {
    // ============================================
    // 🔥 লোডার ও বাটন ডিসেবল সম্পূর্ণ বন্ধ
    //    শুধু মোড সুইচ করতে চান—কোনো UI ব্লক না
    // ============================================
    // কিছুই করবেন না—ফাংশনটি খালি
    return;
}

// ==========================================
// ৬. রিফ্রেশ পোর্টফোলিও অ্যানালাইসিস
// ==========================================

window.refreshPortfolioAnalysis = function() {
    const user = auth && auth.currentUser ? auth.currentUser : null;
    if (!user) {
        if (typeof showToast === 'function') showToast('Please login first', 'error');
        return;
    }
    if (isManualReloading) {
        if (typeof showToast === 'function') showToast('Already refreshing...', 'info');
        return;
    }
    const cacheKey = `analysis_${user.uid}`;
    try { sessionStorage.removeItem(cacheKey); } catch(e) {}
    if (typeof loadPortfolioAnalysisTable === 'function') {
        loadPortfolioAnalysisTable(user.uid, true);
        if (typeof showToast === 'function') showToast('🔄 Refreshing portfolio analysis...', 'info');
    }
};

// ==========================================
// ৭. ড্যাশবোর্ড উইজেট রিফ্রেশ
// ==========================================

window.refreshDashboardWidgets = async function() {
    try {
        const btn = document.querySelector('[onclick="refreshDashboardWidgets()"]');
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '⏳ ...';
            btn.style.opacity = '0.7';
        }

        if (typeof showToast === 'function') {
            showToast('🔄 Refreshing dashboard widgets...', 'info');
        }

        if (typeof updatePerformanceSummary === 'function') {
            await updatePerformanceSummary();
        }

        if (typeof renderDashboardHistoryChart === 'function') {
            await renderDashboardHistoryChart();
        }

        if (typeof renderDashboardDailyPLChart === 'function') {
            await renderDashboardDailyPLChart();
        }

        if (typeof loadSignalData === 'function') {
            await loadSignalData();
        }

        const timeElem = document.getElementById('dash-perf-update-time');
        if (timeElem) {
            timeElem.innerText = new Date().toLocaleString('bn-BD', { timeZone: 'Asia/Dhaka' });
        }

        const signalTime = document.getElementById('signal-update-time');
        if (signalTime) {
            signalTime.innerText = new Date().toLocaleString('bn-BD', { timeZone: 'Asia/Dhaka' });
        }

        if (typeof showToast === 'function') {
            showToast('✅ Dashboard widgets refreshed!', 'success');
        }

    } catch (error) {
        console.error('Widget refresh error:', error);
        if (typeof showToast === 'function') {
            showToast('❌ Refresh failed: ' + error.message, 'error');
        }
    } finally {
        const btn = document.querySelector('[onclick="refreshDashboardWidgets()"]');
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '🔄 Refresh Widgets';
            btn.style.opacity = '1';
        }
    }
};

// ==========================================
// ৮. অটো-রিফ্রেশ টগল ইনিশিয়ালাইজ
// ==========================================

function initAutoRefreshToggle() {
    const toggle = document.getElementById('autoRefreshToggle');
    if (!toggle) return;
    toggle.addEventListener('change', (e) => {
        autoRefreshEnabled = e.target.checked;
        if (autoRefreshEnabled) startAutoRefresh();
        else stopAutoRefresh();
    });
}

// ==========================================
// ৯. কীবোর্ড শর্টকাট (Ctrl+R)
// ==========================================

document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'r') {
        e.preventDefault();
        if (auth && auth.currentUser) manualReloadDashboard();
    }
});

// ==========================================
// ১০. Visibility Change (ট্যাব সুইচ)
// ==========================================

let visibilityTimeout = null;
document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        if (visibilityTimeout) clearTimeout(visibilityTimeout);
        if (window.autoRefreshInterval) {
            clearInterval(window.autoRefreshInterval);
            window.autoRefreshInterval = null;
        }
    } else {
        visibilityTimeout = setTimeout(() => {
            if (autoRefreshEnabled && currentDataMode === 'firebase') startAutoRefresh();
        }, 2000);
        updateTimestamp();
    }
});

// ==========================================
// 📌 গ্লোবাল এক্সপোজ
// ==========================================

window.fetchPortfolioTimelineData = fetchPortfolioTimelineData;
window.getUserDeposit = getUserDeposit;
window.updateUserDeposit = updateUserDeposit;
window.startAutoRefresh = startAutoRefresh;
window.stopAutoRefresh = stopAutoRefresh;
window.manualReloadDashboard = manualReloadDashboard;
window.updateTimestamp = updateTimestamp;
window.showDataLoading = showDataLoading;
window.refreshPortfolioAnalysis = window.refreshPortfolioAnalysis;
window.refreshDashboardWidgets = window.refreshDashboardWidgets;
window.initAutoRefreshToggle = initAutoRefreshToggle;
// ==========================================
// 📊 পোর্টফোলিও হিস্টোরি (Value History)
// ==========================================

let currentHistoryMode = 'firebase';
let currentHistoryData = [];

async function loadPortfolioHistory() {
    const user = auth && auth.currentUser ? auth.currentUser : null;
    if (!user) { console.log('No user'); return; }
    const tableBody = document.getElementById('history-table-body');
    if (!tableBody) return;
    tableBody.innerHTML = `<tr><td colspan="6">Loading...</td></tr>`;

    try {
        console.log('📊 Loading portfolio history...');
        let portfolioSnapshot, salesSnapshot;
        if (typeof db !== 'undefined') {
            portfolioSnapshot = await db.collection('portfolios').where('userId', '==', user.uid).get();
            salesSnapshot = await db.collection('sales_history').where('userId', '==', user.uid).get();
        } else {
            tableBody.innerHTML = `<tr><td colspan="6">Firebase not available</td></tr>`;
            return;
        }

        if (portfolioSnapshot.empty) {
            tableBody.innerHTML = `<tr><td colspan="6">No transactions found. Start buying shares!</td></tr>`;
            return;
        }

        const buyLots = [];
        portfolioSnapshot.forEach(doc => {
            const data = doc.data();
            const totalCostWithCommission = (data.quantity * data.buyPrice) + (data.commission || 0);
            let perUnitCost = totalCostWithCommission / data.quantity;
            if (isNaN(perUnitCost) || !isFinite(perUnitCost)) perUnitCost = data.buyPrice;
            let buyDate = null;
            if (data.date) {
                if (typeof data.date.toDate === 'function') buyDate = data.date.toDate();
                else if (data.date instanceof Date) buyDate = data.date;
                else if (typeof data.date === 'string') buyDate = new Date(data.date);
                else if (data.date.seconds) buyDate = new Date(data.date.seconds * 1000);
            }
            if (!buyDate || isNaN(buyDate.getTime())) buyDate = new Date();
            buyLots.push({
                ticker: data.shareName,
                qty: data.quantity,
                buyPrice: data.buyPrice,
                totalCostWithCommission,
                perUnitCost,
                date: buyDate,
                buyDateStr: buyDate.toISOString().split('T')[0]
            });
        });

        let firstBuyDate = new Date(buyLots[0].date);
        for (const lot of buyLots) if (lot.date < firstBuyDate) firstBuyDate = lot.date;

        const totalSoldMap = new Map();
        salesSnapshot.forEach(doc => {
            const data = doc.data();
            totalSoldMap.set(data.shareName, (totalSoldMap.get(data.shareName) || 0) + data.quantitySold);
        });

        buyLots.sort((a, b) => a.date - b.date);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        let daysDiff = Math.ceil((today - firstBuyDate) / (1000 * 60 * 60 * 24));
        if (daysDiff < 1) daysDiff = 1;
        const maxDays = 365;
        const finalDays = Math.min(daysDiff, maxDays);

        const allDates = [];
        for (let i = 0; i <= finalDays; i++) {
            const date = new Date(firstBuyDate);
            date.setDate(firstBuyDate.getDate() + i);
            allDates.push(date);
        }

        const dailyPortfolio = [];
        let cumulativeLots = [];

        for (let idx = 0; idx < allDates.length; idx++) {
            const currentDate = allDates[idx];
            const dateStr = currentDate.toISOString().split('T')[0];

            for (const lot of buyLots) {
                const lotDate = new Date(lot.date);
                lotDate.setHours(0, 0, 0, 0);
                if (lotDate <= currentDate && !lot.added) {
                    cumulativeLots.push({ ...lot, remainingQty: lot.qty, added: true });
                    lot.added = true;
                }
            }
            const tempSoldMap = new Map(totalSoldMap);
            let tempLots = cumulativeLots.map(lot => ({ ...lot, remainingQty: lot.remainingQty }));
            for (const lot of tempLots) {
                let toSell = tempSoldMap.get(lot.ticker) || 0;
                if (toSell > 0 && lot.remainingQty > 0) {
                    const taken = Math.min(lot.remainingQty, toSell);
                    lot.remainingQty -= taken;
                    toSell -= taken;
                    tempSoldMap.set(lot.ticker, toSell);
                }
            }

            let totalInvestment = 0;
            const remainingStocks = [];
            for (const lot of tempLots) {
                if (lot.remainingQty > 0 && lot.perUnitCost > 0 && isFinite(lot.perUnitCost)) {
                    totalInvestment += lot.remainingQty * lot.perUnitCost;
                    remainingStocks.push({
                        ticker: lot.ticker,
                        qty: lot.remainingQty,
                        avgCost: lot.perUnitCost
                    });
                }
            }

            let totalCurrentValue = 0;
            const tickers = remainingStocks.map(s => s.ticker);
            for (const stock of remainingStocks) {
                let currentPrice = 0;
                if (currentHistoryMode === 'live') {
                    try {
                        const res = await fetch(`${SCRAPER_BASE_URL}?symbol=${stock.ticker}`);
                        if (res.ok) {
                            const data = await res.json();
                            if (data && data.ltp) currentPrice = data.ltp;
                        }
                    } catch (e) { /* ignore */ }
                }
                if (currentPrice === 0) {
                    // Supabase history_dse (ticker ব্যবহার)
                    if (typeof supabase !== 'undefined' && supabase) {
                        try {
                            const { data, error } = await supabase
                                .from('history_dse')
                                .select('ltp')
                                .eq('ticker', stock.ticker)
                                .eq('date', dateStr)
                                .limit(1);
                            if (!error && data && data.length > 0) {
                                const val = parseFloat(data[0].ltp);
                                if (val > 0) currentPrice = val;
                            }
                        } catch (e) { /* ignore */ }
                    }
                    if (currentPrice === 0) {
                        const historicalPrice = await firebaseDataManager.getPriceByDate(stock.ticker, dateStr);
                        currentPrice = historicalPrice || stock.avgCost;
                    }
                }
                if (isNaN(currentPrice) || !isFinite(currentPrice)) currentPrice = stock.avgCost;
                totalCurrentValue += stock.qty * currentPrice;
            }

            if (totalInvestment > 0 && isFinite(totalInvestment)) {
                dailyPortfolio.push({
                    date: dateStr,
                    totalInvestment,
                    totalCurrentValue,
                    dailyPL: totalCurrentValue - totalInvestment,
                    dailyPLPercent: ((totalCurrentValue - totalInvestment) / totalInvestment) * 100
                });
            }
        }

        const startDateInput = document.getElementById('history-start-date');
        const endDateInput = document.getElementById('history-end-date');
        let filteredData = [...dailyPortfolio];
        if (startDateInput && startDateInput.value) filteredData = filteredData.filter(item => item.date >= startDateInput.value);
        if (endDateInput && endDateInput.value) filteredData = filteredData.filter(item => item.date <= endDateInput.value);

        currentHistoryData = filteredData;
        renderHistoryTable(filteredData);
        renderHistoryChart(filteredData);

    } catch (error) {
        console.error(error);
        tableBody.innerHTML = `<tr><td colspan="6">Error loading data</td></tr>`;
    }
}

function renderHistoryTable(data) {
    const tableBody = document.getElementById('history-table-body');
    if (!tableBody) return;
    if (data.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="6">No data for selected range.</td></tr>`;
        const footerInvest = document.getElementById('history-footer-invest');
        const footerValue = document.getElementById('history-footer-value');
        const footerPL = document.getElementById('history-footer-pl');
        const footerPLPct = document.getElementById('history-footer-plpct');
        if (footerInvest) footerInvest.innerHTML = '-';
        if (footerValue) footerValue.innerHTML = '-';
        if (footerPL) footerPL.innerHTML = '-';
        if (footerPLPct) footerPLPct.innerHTML = '-';
        return;
    }

    let html = '',
        totalInvestment = 0,
        totalCurrentValue = 0;
    for (const item of data) {
        totalInvestment += item.totalInvestment;
        totalCurrentValue += item.totalCurrentValue;
        html += `<tr>
            <td>${formatDate(item.date)}</td>
            <td style="text-align:right;">৳${item.totalInvestment.toLocaleString('bn-BD', {minimumFractionDigits:2})}</td>
            <td style="text-align:right;">৳${item.totalCurrentValue.toLocaleString('bn-BD', {minimumFractionDigits:2})}</td>
            <td style="text-align:right; ${item.dailyPL>=0?'color:#10b981':'color:#ef4444'}">${item.dailyPL>=0?'+':''}৳${item.dailyPL.toLocaleString('bn-BD', {minimumFractionDigits:2})}</td>
            <td style="text-align:right; ${item.dailyPLPercent>=0?'color:#10b981':'color:#ef4444'}">${item.dailyPLPercent>=0?'+':''}${item.dailyPLPercent.toFixed(2)}%</td>
            <td style="text-align:center;">${item.dailyPL>=0?'✅':'📉'}</td>
        </tr>`;
    }
    tableBody.innerHTML = html;

    const finalPL = totalCurrentValue - totalInvestment;
    const finalPLPct = totalInvestment > 0 ? (finalPL / totalInvestment) * 100 : 0;
    const footerInvest = document.getElementById('history-footer-invest');
    const footerValue = document.getElementById('history-footer-value');
    const footerPL = document.getElementById('history-footer-pl');
    const footerPLPct = document.getElementById('history-footer-plpct');
    if (footerInvest) footerInvest.innerHTML = `৳${totalInvestment.toLocaleString('bn-BD', {minimumFractionDigits:2})}`;
    if (footerValue) footerValue.innerHTML = `৳${totalCurrentValue.toLocaleString('bn-BD', {minimumFractionDigits:2})}`;
    if (footerPL) {
        footerPL.innerHTML = `${finalPL>=0?'+':''}৳${finalPL.toLocaleString('bn-BD', {minimumFractionDigits:2})}`;
        footerPL.style.color = finalPL >= 0 ? '#10b981' : '#ef4444';
    }
    if (footerPLPct) {
        footerPLPct.innerHTML = `${finalPLPct>=0?'+':''}${finalPLPct.toFixed(2)}%`;
        footerPLPct.style.color = finalPLPct >= 0 ? '#10b981' : '#ef4444';
    }
}

function renderHistoryChart(data) {
    const canvas = document.getElementById('historyChart');
    if (!canvas) return;
    if (window.historyChartInstance) window.historyChartInstance.destroy();
    if (data.length === 0) return;

    const labels = data.map(item => formatDateShort(item.date));
    const investData = data.map(item => item.totalInvestment);
    const valueData = data.map(item => item.totalCurrentValue);

    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const textColor = isDark ? '#f1f5f9' : '#1e293b';
    const gridColor = isDark ? '#334155' : '#e2e8f0';

    window.historyChartInstance = new Chart(canvas, {
        type: 'line',
        data: {
            labels,
            datasets: [
                { label: 'Total Investment', data: investData, borderColor: '#3b82f6', backgroundColor: 'transparent', borderWidth: 2.5, tension: 0.2, pointRadius: 3 },
                { label: 'Current Value', data: valueData, borderColor: '#10b981', backgroundColor: 'transparent', borderWidth: 2.5, tension: 0.2, pointRadius: 3 }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'top', labels: { color: textColor } },
                tooltip: {
                    callbacks: {
                        label: (ctx) => `${ctx.dataset.label}: ৳${ctx.raw.toLocaleString('bn-BD', {minimumFractionDigits:2})}`
                    }
                }
            },
            scales: {
                x: { ticks: { color: textColor, maxRotation: 45 }, grid: { color: gridColor } },
                y: { ticks: { color: textColor }, grid: { color: gridColor } }
            }
        }
    });
}

function filterHistoryByDate() { loadPortfolioHistory(); }

function resetHistoryFilter() {
    const startInput = document.getElementById('history-start-date');
    const endInput = document.getElementById('history-end-date');
    if (startInput) startInput.value = '';
    if (endInput) endInput.value = '';
    loadPortfolioHistory();
}

function setHistoryMode(mode) {
    currentHistoryMode = mode;
    const fbBtn = document.getElementById('history-firebase-mode');
    const liveBtn = document.getElementById('history-live-mode');
    if (fbBtn && liveBtn) {
        if (mode === 'firebase') {
            fbBtn.classList.add('active');
            fbBtn.style.background = '#10b981';
            liveBtn.classList.remove('active');
            liveBtn.style.background = '#64748b';
        } else {
            liveBtn.classList.add('active');
            liveBtn.style.background = '#10b981';
            fbBtn.classList.remove('active');
            fbBtn.style.background = '#64748b';
        }
    }
    loadPortfolioHistory();
}

function formatDate(dateStr) {
    const date = new Date(dateStr);
    return date.toLocaleDateString('bn-BD', { year: 'numeric', month: 'long', day: 'numeric' });
}

function formatDateShort(dateStr) {
    const date = new Date(dateStr);
    return `${date.getDate()}/${date.getMonth() + 1}`;
}

// গ্লোবাল এক্সপোজ
window.loadPortfolioHistory = loadPortfolioHistory;
window.filterHistoryByDate = filterHistoryByDate;
window.resetHistoryFilter = resetHistoryFilter;
window.setHistoryMode = setHistoryMode;

console.log('✅ dash-utils.js loaded successfully');