// ==========================================
// 📁 ui-charts.js - UI চার্ট রেন্ডারিং ফাংশন
//    ui.js থেকে ভাগ করা (প্রাইস চার্ট, RSI চার্ট, গেইন চার্ট, পারফরম্যান্স টেবিল)
//    🔥 সব ইন্ডিকেটর ফাংশন indicators.js থেকে নেওয়া
// ==========================================

// ==========================================
// ১. প্রাইস হিস্ট্রি চার্ট (Supabase-first + Firebase-fallback)
// ==========================================

window.loadPriceHistoryChart = async function(ticker, startDate = null, endDate = null) {
    if (!ticker) return;
    const canvas = document.getElementById('adv-stock-chart');
    if (!canvas) return;
    if (window.advChartInstance) {
        window.advChartInstance.destroy();
        window.advChartInstance = null;
    }

    const user = auth && auth.currentUser ? auth.currentUser : null;
    if (!user) return;

    let start = startDate ? new Date(startDate) : new Date();
    if (!startDate) start.setDate(start.getDate() - 30);
    let end = endDate ? new Date(endDate) : new Date();
    const startDateStr = start.toISOString().split('T')[0];
    const endDateStr = end.toISOString().split('T')[0];

    const prices = [], labels = [], highData = [], lowData = [];

    // ---------- ১. Supabase history_dse থেকে ফেচ (প্রথম) ----------
    if (typeof supabase !== 'undefined' && supabase) {
        try {
            let query = supabase
                .from('history_dse')
                .select('date, ltp, high, low')
                .eq('ticker', ticker)
                .gte('date', startDateStr)
                .order('date', { ascending: true });
            if (endDateStr) {
                query = query.lte('date', endDateStr);
            }
            const { data, error } = await query;
            if (!error && data && data.length > 0) {
                data.forEach(row => {
                    const price = parseFloat(row.ltp);
                    const high = parseFloat(row.high) || price;
                    const low = parseFloat(row.low) || price;
                    if (price > 0) {
                        prices.push(price);
                        highData.push(high);
                        lowData.push(low);
                        labels.push(row.date);
                    }
                });
            }
        } catch (e) {
            console.warn('Supabase history_dse fetch failed in price chart:', e);
        }
    }

    // ---------- ২. যদি Supabase-এ না থাকে, Firebase ফ্যালব্যাক ----------
    if (prices.length === 0 && typeof db !== 'undefined') {
        try {
            // ২.ক cse_detailed_data
            let query = db.collection('cse_detailed_data')
                .where('code', '==', ticker)
                .where('date', '>=', startDateStr)
                .orderBy('date', 'asc');
            if (endDateStr) query = query.where('date', '<=', endDateStr);
            const snap = await query.get();
            if (!snap.empty) {
                snap.forEach(doc => {
                    const data = doc.data();
                    const ltp = parseFloat(data.ltp);
                    const high = parseFloat(data.high) || ltp;
                    const low = parseFloat(data.low) || ltp;
                    if (ltp > 0) {
                        prices.push(ltp);
                        highData.push(high);
                        lowData.push(low);
                        labels.push(data.date);
                    }
                });
            }

            // ২.খ daily_prices ফ্যালব্যাক (যদি cse_detailed না পাওয়া যায়)
            if (prices.length === 0) {
                let query2 = db.collection('daily_prices')
                    .where('ticker', '==', ticker)
                    .where('date', '>=', startDateStr)
                    .orderBy('date', 'asc');
                if (endDateStr) query2 = query2.where('date', '<=', endDateStr);
                const snap2 = await query2.get();
                if (!snap2.empty) {
                    snap2.forEach(doc => {
                        const data = doc.data();
                        const price = parseFloat(data.price) || parseFloat(data.close) || 0;
                        const high = parseFloat(data.high) || price;
                        const low = parseFloat(data.low) || price;
                        if (price > 0) {
                            prices.push(price);
                            highData.push(high);
                            lowData.push(low);
                            labels.push(data.date);
                        }
                    });
                }
            }
        } catch (e) {
            console.warn('Firebase fallback failed in price chart:', e);
        }
    }

    if (prices.length === 0) {
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#64748b';
        ctx.font = '14px sans-serif';
        ctx.fillText('No price data available for selected range', 10, 50);
        return;
    }

    // PSAR ক্যালকুলেট (indicators.js থেকে)
    const priceDataForSAR = labels.map((date, idx) => ({
        date: date,
        ltp: prices[idx],
        high: highData[idx] || prices[idx],
        low: lowData[idx] || prices[idx]
    }));
    const sarData = calculateParabolicSAR(priceDataForSAR);

    // অ্যাভারেজ বাই প্রাইস (গ্র্যান্ড পোর্টফোলিও থেকে)
    let avgBuyPrice = 0;
    try {
        const unifiedData = await unifiedEngine.calculate(user.uid, null, true);
        if (unifiedData && unifiedData.stockDetails) {
            const stockData = unifiedData.stockDetails.find(s => s.ticker === ticker);
            if (stockData && stockData.totalQty > 0) {
                avgBuyPrice = stockData.totalCost / stockData.totalQty;
            }
        }
    } catch (e) { /* ignore */ }
    const avgBuyLine = new Array(prices.length).fill(avgBuyPrice);

    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const textColor = isDark ? '#f1f5f9' : '#1e293b';
    const gridColor = isDark ? '#334155' : '#e2e8f0';

    const sarPoints = sarData.map((item, index) => ({
        x: labels[index],
        y: item.sar,
        trend: item.trend
    }));
    const sarColors = sarPoints.map(p => p.trend === 'up' ? '#10b981' : '#ef4444');

    const ctx = canvas.getContext('2d');
    window.advChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: `${ticker} Price`,
                    data: prices,
                    borderColor: '#3b82f6',
                    backgroundColor: 'rgba(59,130,246,0.1)',
                    borderWidth: 2.5,
                    fill: true,
                    tension: 0.3,
                    pointRadius: 3,
                    pointBackgroundColor: '#3b82f6'
                },
                {
                    label: `Your Avg Buy (${avgBuyPrice > 0 ? '৳' + avgBuyPrice.toFixed(2) : 'N/A'})`,
                    data: avgBuyLine,
                    borderColor: '#f59e0b',
                    borderWidth: 2,
                    borderDash: [8, 6],
                    fill: false,
                    pointRadius: 0
                },
                {
                    label: 'Parabolic SAR',
                    data: sarPoints.map(p => p.y),
                    type: 'scatter',
                    backgroundColor: sarColors,
                    borderColor: sarColors,
                    pointRadius: 5,
                    pointStyle: 'rectRot',
                    showInLegend: true,
                    order: 0
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'top',
                    labels: { color: textColor }
                },
                tooltip: {
                    callbacks: {
                        label: (ctx) => {
                            if (ctx.dataset.label.includes('Parabolic SAR')) {
                                return `PSAR: ৳${ctx.raw.toFixed(2)} (${ctx.raw.trend === 'up' ? '🟢 Up' : '🔴 Down'})`;
                            }
                            return ctx.dataset.label.includes('Price') ?
                                `${ctx.dataset.label}: ৳${ctx.raw.toFixed(2)}` :
                                ctx.dataset.label;
                        }
                    }
                }
            },
            scales: {
                x: {
                    ticks: { color: textColor, maxRotation: 45 },
                    grid: { color: gridColor }
                },
                y: {
                    ticks: { color: textColor, callback: (v) => '৳' + v.toFixed(0) },
                    grid: { color: gridColor }
                }
            }
        }
    });
};

// ==========================================
// ২. RSI চার্ট (Supabase-first + Firebase-fallback)
// ==========================================

window.loadRSIChart = async function(ticker, startDate = null, endDate = null) {
    if (!ticker) return;
    const canvas = document.getElementById('adv-rsi-chart');
    if (!canvas) return;
    if (window.rsiChartInstance) {
        window.rsiChartInstance.destroy();
        window.rsiChartInstance = null;
    }

    let start = startDate ? new Date(startDate) : new Date();
    if (!startDate) start.setDate(start.getDate() - 30);
    let end = endDate ? new Date(endDate) : new Date();
    const startDateStr = start.toISOString().split('T')[0];
    const endDateStr = end.toISOString().split('T')[0];

    let priceData = [];

    // ---------- ১. Supabase history_dse ----------
    if (typeof supabase !== 'undefined' && supabase) {
        try {
            let query = supabase
                .from('history_dse')
                .select('date, ltp')
                .eq('ticker', ticker)
                .gte('date', startDateStr)
                .order('date', { ascending: true });
            if (endDateStr) {
                query = query.lte('date', endDateStr);
            }
            const { data, error } = await query;
            if (!error && data && data.length > 0) {
                priceData = data.map(d => ({ date: d.date, ltp: parseFloat(d.ltp) }));
            }
        } catch (e) {
            console.warn('Supabase history_dse fetch failed in RSI chart:', e);
        }
    }

    // ---------- ২. Firebase ফ্যালব্যাক ----------
    if (priceData.length === 0 && typeof db !== 'undefined') {
        try {
            let query = db.collection('daily_prices')
                .where('ticker', '==', ticker)
                .where('date', '>=', startDateStr)
                .orderBy('date', 'asc');
            if (endDateStr) {
                query = query.where('date', '<=', endDateStr);
            }
            const snap = await query.get();
            if (!snap.empty) {
                snap.forEach(doc => {
                    const data = doc.data();
                    const price = parseFloat(data.price) || parseFloat(data.close) || 0;
                    if (price > 0) {
                        priceData.push({ date: data.date, ltp: price });
                    }
                });
            }
        } catch (e) {
            console.warn('Firebase fallback failed in RSI chart:', e);
        }
    }

    if (priceData.length < 15) {
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#64748b';
        ctx.font = '14px sans-serif';
        ctx.fillText('Insufficient data for RSI (need 15+ days)', 10, 50);
        return;
    }

    // 🔥 RSI ক্যালকুলেট (indicators.js থেকে calculateRSI ব্যবহার)
    const rsiData = calculateRSI(priceData.map(p => p.ltp), 14);
    const labels = rsiData.map((d, i) => priceData[i]?.date || i);
    const rsiValues = rsiData.map(d => d.rsi);

    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const textColor = isDark ? '#f1f5f9' : '#1e293b';
    const gridColor = isDark ? '#334155' : '#e2e8f0';

    const ctx = canvas.getContext('2d');
    window.rsiChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'RSI (14)',
                data: rsiValues,
                borderColor: '#8b5cf6',
                backgroundColor: 'rgba(139, 92, 246, 0.1)',
                borderWidth: 2,
                fill: true,
                tension: 0.2,
                pointRadius: 2,
                pointBackgroundColor: '#8b5cf6'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { labels: { color: textColor } },
                tooltip: {
                    callbacks: {
                        label: (ctx) => {
                            const val = ctx.raw;
                            if (val === null) return 'RSI: -';
                            return `RSI: ${val.toFixed(2)}`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    ticks: { color: textColor, maxRotation: 45 },
                    grid: { color: gridColor }
                },
                y: {
                    ticks: { color: textColor, callback: (v) => v.toFixed(0) },
                    grid: { color: gridColor },
                    min: 0,
                    max: 100
                }
            }
        }
    });
};

// ==========================================
// ৩. Day-wise Gain/Loss Chart (Supabase-first + Firebase-fallback)
// ==========================================

window.loadGainAnalysisChart = async function(ticker, startDate = null, endDate = null) {
    if (!ticker) return;
    const canvas = document.getElementById('adv-gain-chart');
    if (!canvas) return;
    if (window.gainChartInstance) {
        window.gainChartInstance.destroy();
        window.gainChartInstance = null;
    }

    const user = auth && auth.currentUser ? auth.currentUser : null;
    if (!user) return;

    let start = startDate ? new Date(startDate) : new Date();
    if (!startDate) start.setDate(start.getDate() - 90);
    let end = endDate ? new Date(endDate) : new Date();
    const startDateStr = start.toISOString().split('T')[0];
    const endDateStr = end.toISOString().split('T')[0];

    try {
        if (typeof db === 'undefined') return;

        const buySnapshot = await db.collection('portfolios')
            .where('userId', '==', user.uid)
            .where('shareName', '==', ticker)
            .get();
        let allBuyLots = [];
        buySnapshot.forEach(doc => {
            const data = doc.data();
            const totalCost = (data.quantity * data.buyPrice) + (data.commission || 0);
            const perUnit = data.quantity > 0 ? totalCost / data.quantity : data.buyPrice;
            const date = data.date ? (data.date.toDate ? data.date.toDate() : new Date(data.date)) : new Date();
            allBuyLots.push({
                qty: data.quantity,
                buyPrice: data.buyPrice,
                perUnitCost: perUnit,
                date: date
            });
        });
        allBuyLots.sort((a, b) => a.date - b.date);

        const sellSnapshot = await db.collection('sales_history')
            .where('userId', '==', user.uid)
            .where('shareName', '==', ticker)
            .get();
        let sellTransactions = [];
        sellSnapshot.forEach(doc => {
            const data = doc.data();
            const date = data.date ? (data.date.toDate ? data.date.toDate() : new Date(data.date)) : new Date();
            sellTransactions.push({
                date: date,
                qty: data.quantitySold || 0
            });
        });
        sellTransactions.sort((a, b) => a.date - b.date);

        // প্রাইস ডেটা (Supabase-first)
        let priceMap = new Map();

        // ১. Supabase history_dse
        if (typeof supabase !== 'undefined' && supabase) {
            try {
                let query = supabase
                    .from('history_dse')
                    .select('date, ltp')
                    .eq('ticker', ticker)
                    .gte('date', startDateStr)
                    .order('date', { ascending: true });
                if (endDateStr) {
                    query = query.lte('date', endDateStr);
                }
                const { data, error } = await query;
                if (!error && data && data.length > 0) {
                    data.forEach(d => {
                        const price = parseFloat(d.ltp);
                        if (price > 0) priceMap.set(d.date, price);
                    });
                }
            } catch (e) {
                console.warn('Supabase history_dse fetch failed in gain chart:', e);
            }
        }

        // ২. Firebase ফ্যালব্যাক
        if (priceMap.size === 0 && typeof db !== 'undefined') {
            try {
                let query = db.collection('daily_prices')
                    .where('ticker', '==', ticker)
                    .where('date', '>=', startDateStr)
                    .orderBy('date', 'asc');
                if (endDateStr) {
                    query = query.where('date', '<=', endDateStr);
                }
                const snap = await query.get();
                if (!snap.empty) {
                    snap.forEach(doc => {
                        const data = doc.data();
                        const price = parseFloat(data.price) || parseFloat(data.close) || 0;
                        if (price > 0) priceMap.set(data.date, price);
                    });
                }
            } catch (e) {
                console.warn('Firebase fallback failed in gain chart:', e);
            }
        }

        if (priceMap.size === 0) {
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#64748b';
            ctx.font = '14px sans-serif';
            ctx.fillText('No price data for selected range', 10, 50);
            return;
        }

        const allDates = Array.from(priceMap.keys()).sort();
        let fifoLots = [];
        let sellIndex = 0;
        const chartLabels = [];
        const plData = [];
        const buyMarkers = [];
        const sellMarkers = [];

        const buyEventMap = new Map();
        const sellEventMap = new Map();

        buySnapshot.forEach(doc => {
            const data = doc.data();
            const date = data.date ? (data.date.toDate ? data.date.toDate() : new Date(data.date)) : new Date();
            const dateStr = date.toISOString().split('T')[0];
            if (!buyEventMap.has(dateStr)) buyEventMap.set(dateStr, []);
            buyEventMap.get(dateStr).push({ qty: data.quantity, price: data.buyPrice });
        });

        sellSnapshot.forEach(doc => {
            const data = doc.data();
            const date = data.date ? (data.date.toDate ? data.date.toDate() : new Date(data.date)) : new Date();
            const dateStr = date.toISOString().split('T')[0];
            if (!sellEventMap.has(dateStr)) sellEventMap.set(dateStr, []);
            sellEventMap.get(dateStr).push({ qty: data.quantitySold || 0, price: data.sellPrice || 0 });
        });

        let buyLotIndex = 0;
        let tempAllBuyLots = [...allBuyLots];

        for (const date of allDates) {
            const ltp = priceMap.get(date) || 0;
            if (ltp === 0) continue;

            while (buyLotIndex < tempAllBuyLots.length && tempAllBuyLots[buyLotIndex].date <= new Date(date)) {
                fifoLots.push({ ...tempAllBuyLots[buyLotIndex] });
                buyLotIndex++;
            }

            while (sellIndex < sellTransactions.length && sellTransactions[sellIndex].date <= new Date(date)) {
                let sellQty = sellTransactions[sellIndex].qty;
                while (sellQty > 0 && fifoLots.length > 0) {
                    const lot = fifoLots[0];
                    const taken = Math.min(lot.qty, sellQty);
                    lot.qty -= taken;
                    sellQty -= taken;
                    if (lot.qty === 0) fifoLots.shift();
                }
                sellIndex++;
            }

            let totalQty = 0, totalCost = 0;
            for (const lot of fifoLots) {
                totalQty += lot.qty;
                totalCost += lot.qty * lot.perUnitCost;
            }
            const currentValue = totalQty * ltp;
            const dailyPL = currentValue - totalCost;

            chartLabels.push(date);
            plData.push(dailyPL);

            if (buyEventMap.has(date)) {
                buyEventMap.get(date).forEach(evt => {
                    buyMarkers.push({
                        x: date,
                        y: dailyPL,
                        label: `🟢 Buy ${evt.qty} shares @ ৳${evt.price.toFixed(2)}`
                    });
                });
            }
            if (sellEventMap.has(date)) {
                sellEventMap.get(date).forEach(evt => {
                    sellMarkers.push({
                        x: date,
                        y: dailyPL,
                        label: `🔴 Sell ${evt.qty} shares @ ৳${evt.price.toFixed(2)}`
                    });
                });
            }
        }

        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        const textColor = isDark ? '#f1f5f9' : '#1e293b';
        const gridColor = isDark ? '#334155' : '#e2e8f0';

        const datasets = [];
        datasets.push({
            label: 'Unrealized P&L (৳)',
            data: plData,
            type: 'line',
            borderColor: '#3b82f6',
            backgroundColor: 'rgba(59, 130, 246, 0.05)',
            borderWidth: 3,
            tension: 0.2,
            fill: true,
            pointRadius: 2,
            pointBackgroundColor: '#3b82f6',
            order: 1,
            segment: {
                borderColor: (ctx) => {
                    const value = ctx.p0.parsed.y;
                    return value >= 0 ? '#10b981' : '#ef4444';
                }
            }
        });
        if (buyMarkers.length > 0) {
            datasets.push({
                label: '🟢 Buy',
                data: buyMarkers,
                type: 'scatter',
                pointBackgroundColor: '#10b981',
                pointBorderColor: '#10b981',
                pointRadius: 8,
                pointStyle: 'triangle',
                order: 0,
                showInLegend: true
            });
        }
        if (sellMarkers.length > 0) {
            datasets.push({
                label: '🔴 Sell',
                data: sellMarkers,
                type: 'scatter',
                pointBackgroundColor: '#ef4444',
                pointBorderColor: '#ef4444',
                pointRadius: 8,
                pointStyle: 'triangle',
                rotation: 180,
                order: 0,
                showInLegend: true
            });
        }

        const ctx = canvas.getContext('2d');
        window.gainChartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels: chartLabels,
                datasets: datasets
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { intersect: false, mode: 'index' },
                plugins: {
                    legend: {
                        display: true,
                        position: 'top',
                        labels: { color: textColor, boxWidth: 12, font: { size: 10 } }
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                const raw = context.raw;
                                if (typeof raw === 'object' && raw.label) return raw.label;
                                if (context.dataset.label === 'Unrealized P&L (৳)') {
                                    const val = context.parsed.y;
                                    return `${val >= 0 ? '+' : ''}৳${val.toFixed(2)}`;
                                }
                                return context.dataset.label + ': ' + context.parsed.y;
                            },
                            title: function(items) {
                                if (items.length > 0) return '📅 ' + items[0].label;
                                return '';
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        ticks: { color: textColor, maxRotation: 45, font: { size: 10 } },
                        grid: { color: gridColor, display: false }
                    },
                    y: {
                        ticks: { color: textColor, callback: (v) => '৳' + v.toFixed(0) },
                        grid: { color: gridColor }
                    }
                }
            }
        });
    } catch (error) {
        console.error('Gain chart error:', error);
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ef4444';
        ctx.font = '14px sans-serif';
        ctx.fillText('Error loading gain chart', 10, 50);
    }
};

// ==========================================
// ৪. মডাল পারফরম্যান্স টেবিল (Supabase-first)
// ==========================================

window.loadModalPerformanceTable = async function(ticker) {
    const user = auth && auth.currentUser ? auth.currentUser : null;
    if (!user) return;

    let currentPrice = await getUnifiedPrice(ticker);
    if (currentPrice === 0) {
        const priceData = await getLatestAndPreviousPrices([ticker]);
        currentPrice = priceData.get(ticker)?.currentPrice || 0;
    }

    const periods = [
        { name: 'today', days: 0, label: 'Today' },
        { name: '5d', days: 5, label: '5 Days' },
        { name: '15d', days: 15, label: '15 Days' },
        { name: '30d', days: 30, label: '30 Days' },
        { name: '3m', days: 90, label: '3 Months' },
        { name: '6m', days: 180, label: '6 Months' },
        { name: '1y', days: 365, label: '1 Year' }
    ];

    const returns = {};
    for (const period of periods) {
        if (period.days === 0) {
            const priceData = await getLatestAndPreviousPrices([ticker]);
            const prevPrice = priceData.get(ticker)?.previousPrice || 0;
            if (prevPrice > 0) {
                returns.today = ((currentPrice - prevPrice) / prevPrice) * 100;
            } else {
                returns.today = 0;
            }
            continue;
        }

        const targetDate = new Date();
        targetDate.setDate(targetDate.getDate() - period.days);
        const targetDateStr = targetDate.toISOString().split('T')[0];
        let pastPrice = 0;

        // Supabase history_dse
        if (typeof supabase !== 'undefined' && supabase) {
            try {
                const { data, error } = await supabase
                    .from('history_dse')
                    .select('ltp')
                    .eq('ticker', ticker)
                    .eq('date', targetDateStr)
                    .limit(1);
                if (!error && data && data.length > 0) {
                    pastPrice = parseFloat(data[0].ltp) || 0;
                }
            } catch (e) { /* ignore */ }
        }

        // Firebase ফ্যালব্যাক
        if (pastPrice === 0 && typeof db !== 'undefined') {
            try {
                const snap = await db.collection('daily_prices')
                    .where('ticker', '==', ticker)
                    .where('date', '==', targetDateStr)
                    .limit(1)
                    .get();
                if (!snap.empty) {
                    const data = snap.docs[0].data();
                    pastPrice = parseFloat(data.price) || parseFloat(data.close) || 0;
                }
            } catch (e) { /* ignore */ }
        }

        if (pastPrice && pastPrice > 0) {
            returns[period.name] = ((currentPrice - pastPrice) / pastPrice) * 100;
        } else {
            returns[period.name] = null;
        }
    }

    const updateCell = (id, value) => {
        const elem = document.getElementById(id);
        if (elem) {
            if (value === null || value === undefined) {
                elem.innerHTML = '-';
                elem.style.color = '#64748b';
            } else {
                elem.innerHTML = `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
                elem.style.color = value >= 0 ? '#10b981' : '#ef4444';
            }
        }
    };
    updateCell('modal-perf-today', returns.today);
    updateCell('modal-perf-5d', returns['5d']);
    updateCell('modal-perf-15d', returns['15d']);
    updateCell('modal-perf-30d', returns['30d']);
    updateCell('modal-perf-3m', returns['3m']);
    updateCell('modal-perf-6m', returns['6m']);
    updateCell('modal-perf-1y', returns['1y']);
};

// ==========================================
// 📌 গ্লোবাল এক্সপোজ (সব ফাংশন উইন্ডোতে)
// ==========================================

window.loadPriceHistoryChart = window.loadPriceHistoryChart;
window.loadRSIChart = window.loadRSIChart;
window.loadGainAnalysisChart = window.loadGainAnalysisChart;
window.loadModalPerformanceTable = window.loadModalPerformanceTable;

console.log('✅ ui-charts.js loaded successfully (indicators.js integrated)');