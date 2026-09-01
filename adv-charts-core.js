// ==========================================
// 📈 adv-charts-core.js - অ্যাডভান্সড চার্ট কোর ফাংশন
//    ডেটা লোড, ইন্ডিকেটর ক্যালকুলেশন, চার্ট রেন্ডারিং (মেইন + RSI + Stochastic)
//    ✅ সব ইন্ডিকেটর ফাংশন indicators.js থেকে নেওয়া (ডুপ্লিকেট সরানো)
//    ✅ ক্যাশিং ইন্ডিকেটর ফাংশন ব্যবহার করা হয়েছে (cachedRSI, cachedSMA ইত্যাদি)
//    ✅ ইরর হ্যান্ডলিং যোগ করা হয়েছে (showToast)
// ==========================================

// গ্লোবাল ভেরিয়েবল
let advMainChart = null;
let advRSIChart = null;
let advStochChart = null;
let advChartData = null;
let advActiveIndicators = {
    sma5: false,
    sma10:false,
    sma20:false,
    sma50: false,
    ema5: false,
    ema10: true,
    ema20: true,
    ema50: false,
    rsi: true,
    bollinger: true,
    stochastic: true,
    atr: false,
    forecast: false,
    psar: false,
    vwap: false,
    volprofile: false,
    fibonacci: false,
    aroon: false,
    ichimoku: false,
    linreg: false,
    wma: false,
    holtWinters: false,
    vwapForecast: false,
    macdForecast: false
};
let advCurrentTicker = 'GP';
let advCurrentPeriod = 30;
let advDataSource = 'database';
let advStockList = (typeof dseStocks !== 'undefined') ? dseStocks : (window.dseStocks || []);
let currentChartType = 'line';
let volumeData = [];

// Zoom প্লাগইন রেজিস্টার
if (typeof Chart !== 'undefined' && typeof ChartZoom !== 'undefined') {
    Chart.register(ChartZoom);
} else if (typeof window.ChartZoom !== 'undefined') {
    Chart.register(window.ChartZoom);
} else {
    console.warn('Chart.js Zoom plugin not found. Zoom feature disabled.');
}

// ==========================================
// 🔙 গো ব্যাক ফাংশন
// ==========================================
window.goBackToStockModal = function() {
    // Always return directly to the dashboard. Returning to the stock-detail
    // modal can re-trigger the Pro gate and create a back-navigation loop.
    window.location.replace('./');
};

// ==========================================
// 🚀 ইনিশিয়ালাইজেশন
// ==========================================
document.addEventListener('DOMContentLoaded', async function() {
    // 🔒 Direct URL access must also respect the Pro gate.
    if (window.StockPulsePlan) {
        await window.StockPulsePlan.load(false);
        if (!window.StockPulsePlan.isPro()) {
            window.location.replace('./pro.html');
            return;
        }
    }

    if (typeof dseStocks !== 'undefined') advStockList = dseStocks;
    else if (window.dseStocks) advStockList = window.dseStocks;

    const loadBtn = document.getElementById('adv-chart-load');
    if (loadBtn) loadBtn.addEventListener('click', loadAdvancedChart);

    const searchInput = document.getElementById('adv-chart-search');
    if (searchInput) {
        searchInput.addEventListener('input', handleSearchInput);
        searchInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                const ticker = this.value.trim().toUpperCase();
                if (ticker && advStockList.includes(ticker)) {
                    advCurrentTicker = ticker;
                    const suggestions = document.getElementById('adv-chart-suggestions');
                    if (suggestions) suggestions.style.display = 'none';
                    loadAdvancedChart();
                }
            }
        });
    }

    const dataSource = document.getElementById('adv-data-source');
    if (dataSource) {
        dataSource.addEventListener('change', function() {
            advDataSource = this.value;
            if (advChartData) loadAdvancedChart();
        });
    }

    const periodSelect = document.getElementById('adv-chart-period');
    if (periodSelect) {
        periodSelect.addEventListener('change', function() {
            advCurrentPeriod = this.value === 'all' ? 'all' : parseInt(this.value);
            if (advChartData) loadAdvancedChart();
        });
    }

    document.querySelectorAll('.indicator-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const indicator = this.dataset.indicator;
            const isActive = this.classList.contains('active');
            if (isActive) {
                this.classList.remove('active');
                advActiveIndicators[indicator] = false;
            } else {
                this.classList.add('active');
                advActiveIndicators[indicator] = true;
            }
            if (advChartData) {
                if (currentChartType === 'line') {
                    renderAdvancedChart(advChartData);
                } else {
                    renderCandlestickChart(advChartData);
                }
                generateSuggestion(advChartData);
                setTimeout(runDeepAnalysis, 300);
            }
        });
    });

    const lineBtn = document.getElementById('toggle-chart-type');
    const candleBtn = document.getElementById('toggle-chart-type-candle');
    if (lineBtn && candleBtn) {
        lineBtn.addEventListener('click', function() {
            currentChartType = 'line';
            this.classList.add('active');
            candleBtn.classList.remove('active');
            const lineContainer = document.getElementById('line-chart-wrapper');
            const candleContainer = document.getElementById('candlestick-wrapper');
            if (lineContainer) lineContainer.style.display = 'block';
            if (candleContainer) candleContainer.style.display = 'none';
            if (advChartData) {
                renderAdvancedChart(advChartData);
                setTimeout(runDeepAnalysis, 300);
            }
        });
        candleBtn.addEventListener('click', function() {
            currentChartType = 'candle';
            this.classList.add('active');
            lineBtn.classList.remove('active');
            const lineContainer = document.getElementById('line-chart-wrapper');
            const candleContainer = document.getElementById('candlestick-wrapper');
            if (lineContainer) lineContainer.style.display = 'none';
            if (candleContainer) candleContainer.style.display = 'block';
            if (advChartData) {
                renderCandlestickChart(advChartData);
                setTimeout(runDeepAnalysis, 300);
            }
        });
        const lineContainer = document.getElementById('line-chart-wrapper');
        const candleContainer = document.getElementById('candlestick-wrapper');
        if (lineContainer) lineContainer.style.display = 'block';
        if (candleContainer) candleContainer.style.display = 'none';
        lineBtn.classList.add('active');
        candleBtn.classList.remove('active');
    }

    updatePresetSelect();

    const params = new URLSearchParams(window.location.search);
    const tickerFromURL = params.get('ticker');
    if (tickerFromURL) {
        const searchInput = document.getElementById('adv-chart-search');
        if (searchInput) searchInput.value = tickerFromURL;
        advCurrentTicker = tickerFromURL;
        loadAdvancedChart(tickerFromURL);
    } else {
        loadAdvancedChart();
    }

    if (typeof loadSavedTheme === 'function') loadSavedTheme();
});

// ==========================================
// 📊 loadAdvancedChart - Database + Live API
// ==========================================
async function loadAdvancedChart(ticker, forceRefresh = false) {
    const searchInput = document.getElementById('adv-chart-search');
    const finalTicker = ticker || (searchInput ? searchInput.value.trim().toUpperCase() || advCurrentTicker : advCurrentTicker);
    
    if (!finalTicker) {
        showToast('Please enter a share name', 'warning');
        return;
    }
    if (!advStockList.includes(finalTicker)) {
        showToast('Share not found. Please select from suggestions.', 'warning');
        return;
    }

    advCurrentTicker = finalTicker;
    const titleEl = document.getElementById('adv-chart-title');
    if (titleEl) titleEl.innerText = `${finalTicker} - Price History`;

    const footerSource = document.getElementById('footer-source');
    if (footerSource) {
        const sourceSelect = document.getElementById('adv-data-source');
        footerSource.innerText = sourceSelect ? sourceSelect.selectedOptions[0].text : 'Database';
    }

    const source = document.getElementById('adv-data-source')?.value || 'database';
    const period = advCurrentPeriod === 'all' ? 'all' : advCurrentPeriod;
    const cacheKey = `chart_${finalTicker}_${source}_${period}`;
    const CACHE_TTL = source === 'live' ? 120000 : 600000;

    // ✅ forceRefresh এর ক্ষেত্রে ক্যাশ ডিলিট
    if (forceRefresh) {
        CacheManager.remove(cacheKey);
    }

    const cachedData = await CacheManager.get(cacheKey, CACHE_TTL);
    if (cachedData && cachedData.actualPrices && cachedData.actualPrices.length > 0) {
        console.log(`📊 Chart data loaded from cache for ${finalTicker} (${source})`);
        advChartData = cachedData;
        volumeData = cachedData.volumeData || [];
        updateStockInfo(advChartData);
        if (currentChartType === 'line') {
            renderAdvancedChart(advChartData);
        } else {
            renderCandlestickChart(advChartData);
        }
        generateSuggestion(advChartData);
        setTimeout(runDeepAnalysis, 300);
        showToast(`📊 Loaded ${finalTicker} from cache`, 'info');
        const updateTime = document.getElementById('adv-chart-update-time');
        if (updateTime) updateTime.innerText = new Date().toLocaleString();
        const suggestionTime = document.getElementById('suggestion-time');
        if (suggestionTime) suggestionTime.innerText = new Date().toLocaleString();
        return;
    }

    try {
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - (period === 'all' ? 365 : period));
        const startDateStr = startDate.toISOString().split('T')[0];
        const endDateStr = new Date().toISOString().split('T')[0];

        let priceData = [], labels = [], highData = [], lowData = [];
        volumeData = [];

        if (source === 'database') {
            if (typeof supabase !== 'undefined' && supabase) {
                try {
                    let query = supabase
                        .from('history_dse')
                        .select('date, ltp, high, low, volume')
                        .eq('ticker', finalTicker)
                        .gte('date', startDateStr)
                        .order('date', { ascending: true });
                    
                    const { data, error } = await query;
                    if (!error && data && data.length > 0) {
                        data.forEach(row => {
                            const price = parseFloat(row.ltp);
                            const high = parseFloat(row.high) || price;
                            const low = parseFloat(row.low) || price;
                            const volume = parseFloat(row.volume) || 0;
                            if (price > 0) {
                                labels.push(row.date);
                                priceData.push(price);
                                highData.push(high);
                                lowData.push(low);
                                volumeData.push(volume);
                            }
                        });
                    }
                } catch (e) {
                    console.warn('Supabase history_dse fetch failed:', e);
                    showToast('Error fetching data from Supabase', 'error');
                }
            }

            if (priceData.length === 0 && typeof db !== 'undefined') {
                try {
                    let query = db.collection('daily_prices')
                        .where('ticker', '==', finalTicker)
                        .where('date', '>=', startDateStr)
                        .orderBy('date', 'asc');
                    
                    const snap = await query.get();
                    if (!snap.empty) {
                        snap.forEach(doc => {
                            const data = doc.data();
                            const price = parseFloat(data.price) || parseFloat(data.close) || 0;
                            const high = parseFloat(data.high) || price;
                            const low = parseFloat(data.low) || price;
                            if (price > 0) {
                                labels.push(data.date);
                                priceData.push(price);
                                highData.push(high);
                                lowData.push(low);
                                volumeData.push(0);
                            }
                        });
                    }
                } catch (e) {
                    console.warn('Firebase daily_prices fallback failed:', e);
                    showToast('Error fetching data from Firebase', 'error');
                }
            }
        } else {
            const apiUrl = `https://bd-stock-api-an3n.vercel.app/v1/dse/historical?start=${startDateStr}&end=${endDateStr}&code=${finalTicker}`;
            
            try {
                const response = await fetch(apiUrl);
                const result = await response.json();
                
                if (result.success && result.data && result.data.length > 0) {
                    result.data.forEach(item => {
                        const price = parseFloat(item['LTP*']);
                        const high = parseFloat(item['HIGH']) || price;
                        const low = parseFloat(item['LOW']) || price;
                        const volume = parseFloat(item['VOLUME']) || 0;
                        if (price > 0) {
                            labels.push(item['DATE']);
                            priceData.push(price);
                            highData.push(high);
                            lowData.push(low);
                            volumeData.push(volume);
                        }
                    });
                    console.log(`✅ Live API loaded ${priceData.length} records for ${finalTicker}`);
                } else {
                    showToast('No live data available for this period', 'warning');
                }
            } catch (error) {
                console.error('Live API fetch error:', error);
                showToast('Failed to load live data: ' + error.message, 'error');
            }
        }

        if (priceData.length === 0) {
            showToast('No data available for this share from selected source', 'error');
            return;
        }

        let avgBuyPrice = 0;
        const user = auth?.currentUser;
        if (user) {
            try {
                const unifiedData = await unifiedEngine.calculate(user.uid, null, true);
                const stockData = unifiedData.stockDetails.find(s => s.ticker === finalTicker);
                if (stockData && stockData.totalQty > 0) {
                    avgBuyPrice = stockData.totalCost / stockData.totalQty;
                }
            } catch (e) { /* ignore */ }
        }

        const forecast = arimaForecast(priceData, 5);
        let forecastLabels = [], forecastValues = [];
        if (forecast) {
            const lastDate = new Date(labels[labels.length - 1]);
            forecast.forEach((f, idx) => {
                const d = new Date(lastDate);
                d.setDate(d.getDate() + idx + 1);
                forecastLabels.push(d.toISOString().split('T')[0]);
                forecastValues.push(f);
            });
        }

        const allLabels = [...labels, ...forecastLabels];
        const allPrices = [...priceData, ...forecastValues.map(() => null)];

        const chartData = {
            ticker: finalTicker,
            labels: allLabels,
            prices: allPrices,
            actualPrices: priceData,
            actualLabels: labels,
            forecastLabels,
            forecastValues,
            avgBuyPrice,
            high: Math.max(...priceData),
            low: Math.min(...priceData),
            currentPrice: priceData[priceData.length - 1] || 0,
            highData,
            lowData,
            volumeData: volumeData,
            dataSource: source
        };

        CacheManager.set(cacheKey, chartData, CACHE_TTL);
        console.log(`📊 Chart data cached for ${finalTicker} (${source})`);

        advChartData = chartData;
        updateStockInfo(advChartData);
        if (currentChartType === 'line') {
            renderAdvancedChart(advChartData);
        } else {
            renderCandlestickChart(advChartData);
        }
        generateSuggestion(advChartData);

        const updateTime = document.getElementById('adv-chart-update-time');
        if (updateTime) updateTime.innerText = new Date().toLocaleString();
        const suggestionTime = document.getElementById('suggestion-time');
        if (suggestionTime) suggestionTime.innerText = new Date().toLocaleString();
        
        // ডিপ অ্যানালাইসিস রান করুন
        setTimeout(runDeepAnalysis, 500);

    } catch (error) {
        console.error('Chart load error:', error);
        showToast('Error loading chart data: ' + error.message, 'error');
    }
}

// ==========================================
// 🔍 সার্চ সাজেশন
// ==========================================
function handleSearchInput() {
    const query = this.value.trim().toUpperCase();
    const suggestions = document.getElementById('adv-chart-suggestions');
    if (!suggestions) return;
    if (!query || !advStockList || advStockList.length === 0) {
        suggestions.style.display = 'none';
        return;
    }
    const filtered = advStockList.filter(s => s.startsWith(query)).slice(0, 10);
    if (filtered.length > 0) {
        suggestions.style.display = 'block';
        suggestions.innerHTML = filtered.map(s =>
            `<div class="suggestion-item" onclick="selectAdvChartStock('${s}')">${s}</div>`
        ).join('');
    } else {
        suggestions.style.display = 'none';
    }
}

function selectAdvChartStock(ticker) {
    const searchInput = document.getElementById('adv-chart-search');
    if (searchInput) searchInput.value = ticker;
    const suggestions = document.getElementById('adv-chart-suggestions');
    if (suggestions) suggestions.style.display = 'none';
    advCurrentTicker = ticker;
    loadAdvancedChart();
}

// ==========================================
// 📈 লাইন চার্ট রেন্ডার (কোর) – ইন্ডিকেটর ক্যাশিং সহ
// ==========================================
function renderAdvancedChart(data) {
    if (!data) return;

    const mainCanvas = document.getElementById('adv-main-chart');
    if (!mainCanvas) {
        console.error('Main chart canvas not found');
        return;
    }

    // ✅ আগের চার্ট ডেস্ট্রয়
    if (advMainChart) {
        advMainChart.destroy();
        advMainChart = null;
    }

    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const textColor = isDark ? '#f1f5f9' : '#1e293b';
    const gridColor = isDark ? '#334155' : '#e2e8f0';

    const actualPrices = data.actualPrices;
    const labels = data.labels;
    const prices = data.prices;
    const highData = data.highData || [];
    const lowData = data.lowData || [];
    const volume = data.volumeData || [];

    // ✅ ক্যাশিং ইন্ডিকেটর ফাংশন ব্যবহার
    const sma5 = advActiveIndicators.sma5 ? cachedSMA(actualPrices, 5) : [];
    const sma10 = advActiveIndicators.sma10 ? cachedSMA(actualPrices, 10) : [];
    const sma20 = advActiveIndicators.sma20 ? cachedSMA(actualPrices, 20) : [];
    const sma50 = advActiveIndicators.sma50 ? cachedSMA(actualPrices, 50) : [];
    
    const ema5 = advActiveIndicators.ema5 ? cachedEMA(actualPrices, 5) : [];
    const ema10 = advActiveIndicators.ema10 ? cachedEMA(actualPrices, 10) : [];
    const ema20 = advActiveIndicators.ema20 ? cachedEMA(actualPrices, 20) : [];
    const ema50 = advActiveIndicators.ema50 ? cachedEMA(actualPrices, 50) : [];
    
    const bollinger = advActiveIndicators.bollinger ? cachedBollingerBands(actualPrices, 20, 2) : null;
    const rsiData = advActiveIndicators.rsi ? cachedRSI(actualPrices, 14) : [];
    const stochastic = advActiveIndicators.stochastic ? cachedStochastic(highData, lowData, actualPrices, 14, 3) : { k: [], d: [] };
    const atr = advActiveIndicators.atr ? cachedATR(highData, lowData, actualPrices, 14) : [];
    const forecast = advActiveIndicators.forecast ? data.forecastValues : [];

    const vwap = advActiveIndicators.vwap && volume.length > 0 ? cachedAnchoredVWAP(actualPrices, volume, 0) : [];
    const volProfile = advActiveIndicators.volprofile && volume.length > 0 ? cachedVolumeProfile(actualPrices, volume, 20) : null;
    const fib = advActiveIndicators.fibonacci ? cachedFibonacci(Math.max(...actualPrices), Math.min(...actualPrices)) : null;
    const aroon = advActiveIndicators.aroon ? cachedAroon(actualPrices, 25) : null;
    const ichimoku = advActiveIndicators.ichimoku ? cachedIchimoku(actualPrices, highData, lowData, 9, 26, 52) : null;
    const linReg = advActiveIndicators.linreg ? cachedLinearRegression(actualPrices, 20, 10) : null;
    const wma = advActiveIndicators.wma ? cachedWMA(actualPrices, 14) : [];
    const hw = advActiveIndicators.holtWinters ? cachedHoltWinters(actualPrices, 0.3, 0.1, 0.2, 7, 10) : null;
    const vwapFcst = advActiveIndicators.vwapForecast && volume.length > 0 ? cachedForecastVWAP(actualPrices, volume, 20, 10) : null;
    const macdFcst = advActiveIndicators.macdForecast ? cachedForecastMACD(actualPrices, 12, 26, 9, 10) : null;

    let psarData = [];
    if (advActiveIndicators.psar && actualPrices.length > 0) {
        const priceDataForPSAR = data.actualLabels.map((date, i) => ({
            date: date,
            ltp: actualPrices[i],
            high: highData[i] || actualPrices[i],
            low: lowData[i] || actualPrices[i]
        }));
        const psar = cachedParabolicSAR(priceDataForPSAR);
        psarData = psar.map(p => p.sar);
        while (psarData.length < actualPrices.length) {
            psarData.unshift(null);
        }
        const forecastLen = forecast.length;
        psarData = [...psarData, ...Array(forecastLen).fill(null)];
    }

    const datasets = [];

    datasets.push({
        label: `${data.ticker} Price`,
        data: prices,
        borderColor: '#3b82f6',
        backgroundColor: 'rgba(59, 130, 246, 0.05)',
        borderWidth: 2.5,
        fill: true,
        tension: 0.2,
        pointRadius: 2,
        pointBackgroundColor: '#3b82f6',
        spanGaps: false,
        segment: {
            borderColor: (ctx) => {
                const value = ctx.p0.parsed.y;
                if (value === null) return '#3b82f6';
                return value >= (data.avgBuyPrice || 0) ? '#10b981' : '#ef4444';
            }
        }
    });

    if (data.avgBuyPrice > 0) {
        datasets.push({
            label: `Avg Buy (${data.avgBuyPrice.toFixed(2)})`,
            data: new Array(prices.length).fill(data.avgBuyPrice),
            borderColor: '#f59e0b',
            borderWidth: 2,
            borderDash: [8, 6],
            fill: false,
            pointRadius: 0
        });
    }

    const smaMap = { sma5, sma10, sma20, sma50 };
    const smaColors = { sma5: '#8b5cf6', sma10: '#ec4899', sma20: '#f97316', sma50: '#14b8a6' };
    const smaLabels = { sma5: 'SMA 5', sma10: 'SMA 10', sma20: 'SMA 20', sma50: 'SMA 50' };
    Object.keys(smaMap).forEach(key => {
        if (advActiveIndicators[key] && smaMap[key].length > 0) {
            const smaData = [...smaMap[key], ...forecast.map(() => null)];
            datasets.push({
                label: smaLabels[key],
                data: smaData,
                borderColor: smaColors[key],
                borderWidth: 1.5,
                fill: false,
                pointRadius: 0
            });
        }
    });

    const emaMap = { ema5, ema10, ema20, ema50 };
    const emaColors = { ema5: '#a78bfa', ema10: '#f472b6', ema20: '#fb923c', ema50: '#2dd4bf' };
    const emaLabels = { ema5: 'EMA 5', ema10: 'EMA 10', ema20: 'EMA 20', ema50: 'EMA 50' };
    Object.keys(emaMap).forEach(key => {
        if (advActiveIndicators[key] && emaMap[key].length > 0) {
            const emaData = [...emaMap[key], ...forecast.map(() => null)];
            datasets.push({
                label: emaLabels[key],
                data: emaData,
                borderColor: emaColors[key],
                borderWidth: 1.5,
                fill: false,
                pointRadius: 0
            });
        }
    });

    if (advActiveIndicators.bollinger && bollinger) {
        const upper = [...bollinger.upper, ...forecast.map(() => null)];
        const middle = [...bollinger.middle, ...forecast.map(() => null)];
        const lower = [...bollinger.lower, ...forecast.map(() => null)];

        datasets.push({
            label: 'BB Upper',
            data: upper,
            borderColor: 'rgba(239, 68, 68, 0.5)',
            borderWidth: 1,
            fill: false,
            pointRadius: 0,
            borderDash: [4, 4]
        });
        datasets.push({
            label: 'BB Middle',
            data: middle,
            borderColor: 'rgba(239, 68, 68, 0.3)',
            borderWidth: 1,
            fill: false,
            pointRadius: 0,
            borderDash: [4, 4]
        });
        datasets.push({
            label: 'BB Lower',
            data: lower,
            borderColor: 'rgba(239, 68, 68, 0.5)',
            borderWidth: 1,
            fill: false,
            pointRadius: 0,
            borderDash: [4, 4]
        });
        datasets.push({
            label: 'Bollinger Band',
            data: upper.map((u, i) => ({ x: i, y: u, y1: lower[i] })),
            backgroundColor: 'rgba(239, 68, 68, 0.05)',
            borderColor: 'transparent',
            fill: true,
            pointRadius: 0,
            order: 10
        });
    }

    if (advActiveIndicators.forecast && forecast.length > 0) {
        const forecastData = [...new Array(actualPrices.length).fill(null), ...forecast];
        datasets.push({
            label: 'ARIMA Forecast (5d)',
            data: forecastData,
            borderColor: '#f59e0b',
            borderDash: [6, 4],
            borderWidth: 2,
            fill: false,
            pointRadius: 4,
            pointBackgroundColor: '#f59e0b',
            pointStyle: 'rectRot'
        });
    }

    if (advActiveIndicators.psar && psarData.length > 0) {
        datasets.push({
            label: 'PSAR',
            data: psarData,
            borderColor: '#ff6b6b',
            backgroundColor: 'rgba(255,107,107,0.2)',
            borderWidth: 1.5,
            fill: false,
            pointRadius: 4,
            pointBackgroundColor: '#ff6b6b',
            pointStyle: 'rectRot',
            showLine: true,
            spanGaps: false,
            order: 2
        });
    }

    if (volume && volume.length > 0) {
        const volumeColors = volume.map((v, i) => {
            if (i > 0 && v > volume[i-1]) return 'rgba(16, 185, 129, 0.6)';
            return 'rgba(239, 68, 68, 0.6)';
        });
        datasets.push({
            label: 'Volume',
            data: volume,
            type: 'bar',
            backgroundColor: volumeColors,
            borderColor: 'transparent',
            yAxisID: 'y1',
            order: 10,
            barPercentage: 0.8,
            categoryPercentage: 0.9,
            pointRadius: 0
        });
    }

    if (advActiveIndicators.vwap && vwap.length > 0) {
        const vwapData = [...new Array(actualPrices.length - vwap.length).fill(null), ...vwap];
        datasets.push({
            label: 'Anchored VWAP',
            data: vwapData,
            borderColor: '#f59e0b',
            borderWidth: 2,
            borderDash: [4, 4],
            fill: false,
            pointRadius: 0,
            order: 5
        });
    }

    if (advActiveIndicators.volprofile && volProfile && volProfile.pocPrice > 0) {
        const pocData = new Array(prices.length).fill(volProfile.pocPrice);
        datasets.push({
            label: `POC (${volProfile.pocPrice.toFixed(2)})`,
            data: pocData,
            borderColor: '#8b5cf6',
            borderWidth: 2,
            borderDash: [8, 4],
            fill: false,
            pointRadius: 0,
            order: 5
        });
    }

    if (advActiveIndicators.fibonacci && fib) {
        const fibLevels = [
            { label: '0%', value: fib.level0, color: '#ef4444' },
            { label: '23.6%', value: fib.level236, color: '#f59e0b' },
            { label: '38.2%', value: fib.level382, color: '#f97316' },
            { label: '50%', value: fib.level500, color: '#8b5cf6' },
            { label: '61.8%', value: fib.level618, color: '#ec4899' },
            { label: '100%', value: fib.level100, color: '#10b981' }
        ];
        fibLevels.forEach(level => {
            const fibData = new Array(prices.length).fill(level.value);
            datasets.push({
                label: `Fib ${level.label}`,
                data: fibData,
                borderColor: level.color,
                borderWidth: 1,
                borderDash: [6, 4],
                fill: false,
                pointRadius: 0,
                order: 5
            });
        });
    }

    if (advActiveIndicators.aroon && aroon && aroon.crossover && aroon.crossover.length > 0) {
        const buySignals = [];
        const sellSignals = [];
        aroon.crossover.forEach(cross => {
            const idx = cross.index - (actualPrices.length - prices.length);
            if (idx >= 0 && idx < prices.length) {
                if (cross.type === 'bullish') {
                    buySignals.push({ x: labels[idx], y: prices[idx] });
                } else {
                    sellSignals.push({ x: labels[idx], y: prices[idx] });
                }
            }
        });
        if (buySignals.length > 0) {
            datasets.push({
                label: 'Aroon Buy',
                data: buySignals,
                type: 'scatter',
                backgroundColor: '#10b981',
                borderColor: '#10b981',
                pointRadius: 8,
                pointStyle: 'triangle',
                order: 1,
                showInLegend: true
            });
        }
        if (sellSignals.length > 0) {
            datasets.push({
                label: 'Aroon Sell',
                data: sellSignals,
                type: 'scatter',
                backgroundColor: '#ef4444',
                borderColor: '#ef4444',
                pointRadius: 8,
                pointStyle: 'triangle',
                rotation: 180,
                order: 1,
                showInLegend: true
            });
        }
    }

    if (advActiveIndicators.ichimoku && ichimoku) {
        const tenkanData = [...new Array(actualPrices.length - ichimoku.tenkanSen.length).fill(null), ...ichimoku.tenkanSen];
        const kijunData = [...new Array(actualPrices.length - ichimoku.kijunSen.length).fill(null), ...ichimoku.kijunSen];
        
        datasets.push({
            label: 'Tenkan-sen (9)',
            data: tenkanData,
            borderColor: '#f472b6',
            borderWidth: 1.5,
            fill: false,
            pointRadius: 0,
            order: 5
        });
        datasets.push({
            label: 'Kijun-sen (26)',
            data: kijunData,
            borderColor: '#60a5fa',
            borderWidth: 1.5,
            fill: false,
            pointRadius: 0,
            order: 5
        });
    }

    if (advActiveIndicators.linreg && linReg && linReg.forecast) {
        const forecastData = [...new Array(actualPrices.length).fill(null), ...linReg.forecast];
        datasets.push({
            label: 'LinReg Forecast',
            data: forecastData,
            borderColor: '#f472b6',
            borderDash: [6, 4],
            borderWidth: 2,
            fill: false,
            pointRadius: 4,
            pointBackgroundColor: '#f472b6',
            order: 5
        });
    }

    if (advActiveIndicators.wma && wma.length > 0) {
        const wmaData = [...new Array(actualPrices.length - wma.length).fill(null), ...wma];
        datasets.push({
            label: 'WMA (14)',
            data: wmaData,
            borderColor: '#f97316',
            borderWidth: 1.5,
            fill: false,
            pointRadius: 0,
            order: 5
        });
    }

    if (advActiveIndicators.holtWinters && hw) {
        const hwData = [...new Array(actualPrices.length).fill(null), ...hw];
        datasets.push({
            label: 'Holt-Winters Forecast',
            data: hwData,
            borderColor: '#60a5fa',
            borderDash: [6, 4],
            borderWidth: 2,
            fill: false,
            pointRadius: 4,
            pointBackgroundColor: '#60a5fa',
            order: 5
        });
    }

    if (advActiveIndicators.vwapForecast && vwapFcst) {
        const fcstData = [...new Array(actualPrices.length).fill(null), ...vwapFcst];
        datasets.push({
            label: 'VWAP Forecast',
            data: fcstData,
            borderColor: '#f59e0b',
            borderDash: [6, 4],
            borderWidth: 2,
            fill: false,
            pointRadius: 4,
            pointBackgroundColor: '#f59e0b',
            pointStyle: 'rectRot',
            order: 5
        });
    }

    if (advActiveIndicators.macdForecast && macdFcst && macdFcst.forecast) {
        const fcstData = [...new Array(actualPrices.length).fill(null), ...macdFcst.forecast];
        datasets.push({
            label: 'MACD Forecast',
            data: fcstData,
            borderColor: '#ec4899',
            borderDash: [6, 4],
            borderWidth: 2,
            fill: false,
            pointRadius: 4,
            pointBackgroundColor: '#ec4899',
            pointStyle: 'rectRot',
            order: 5
        });
    }

    const mainCtx = mainCanvas.getContext('2d');
    advMainChart = new Chart(mainCtx, {
        type: 'line',
        data: { labels, datasets },
        options: {
            animation: false,
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: {
                    position: 'top',
                    labels: { color: textColor, boxWidth: 12, font: { size: 10 } }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const val = context.raw;
                            if (val === null || val === undefined) return null;
                            if (context.dataset.label === 'Volume') {
                                return `📊 Volume: ${val.toLocaleString()}`;
                            }
                            if (context.dataset.label.includes('BB')) return null;
                            if (context.dataset.label.includes('Forecast') || context.dataset.label.includes('VWAP Forecast') || context.dataset.label.includes('MACD Forecast') || context.dataset.label.includes('Holt-Winters')) {
                                return `📈 ${context.dataset.label}: ৳${val.toFixed(2)}`;
                            }
                            if (context.dataset.label.includes('Avg Buy')) {
                                return `📊 Avg Buy: ৳${val.toFixed(2)}`;
                            }
                            if (context.dataset.label.includes('PSAR')) {
                                return `PSAR: ৳${val.toFixed(2)}`;
                            }
                            if (context.dataset.label.includes('POC')) {
                                return `📊 POC: ৳${val.toFixed(2)}`;
                            }
                            if (context.dataset.label.includes('VWAP')) {
                                return `📊 Anchored VWAP: ৳${val.toFixed(2)}`;
                            }
                            if (context.dataset.label.includes('Fib')) {
                                return `📊 ${context.dataset.label}: ৳${val.toFixed(2)}`;
                            }
                            if (context.dataset.label.includes('Aroon')) {
                                return `📊 ${context.dataset.label} Signal`;
                            }
                            if (context.dataset.label.includes('Tenkan')) {
                                return `📊 Tenkan-sen: ৳${val.toFixed(2)}`;
                            }
                            if (context.dataset.label.includes('Kijun')) {
                                return `📊 Kijun-sen: ৳${val.toFixed(2)}`;
                            }
                            if (context.dataset.label.includes('LinReg')) {
                                return `📊 Linear Regression: ৳${val.toFixed(2)}`;
                            }
                            if (context.dataset.label.includes('WMA')) {
                                return `📊 WMA: ৳${val.toFixed(2)}`;
                            }
                            return `${context.dataset.label}: ৳${val.toFixed(2)}`;
                        },
                        afterBody: function(tooltipItems) {
                            const date = tooltipItems[0]?.label || '';
                            return `📅 ${date}`;
                        },
                        footer: function(tooltipItems) {
                            const item = tooltipItems[0];
                            if (!item) return '';
                            const price = item.raw;
                            const avgBuy = advChartData?.avgBuyPrice || 0;
                            if (avgBuy > 0 && !isNaN(price) && price !== null) {
                                const diff = price - avgBuy;
                                const pct = (diff / avgBuy) * 100;
                                return `📊 vs Avg Buy: ${diff >= 0 ? '+' : ''}${diff.toFixed(2)} (${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%)`;
                            }
                            return '';
                        }
                    }
                },
                zoom: {
                    pan: { enabled: true, mode: 'x', modifierKey: 'shift' },
                    zoom: { wheel: { enabled: true, speed: 0.05 }, pinch: { enabled: true }, mode: 'x' },
                    limits: { x: { minRange: 5 } }
                }
            },
            scales: {
                x: {
                    ticks: { color: textColor, maxRotation: 45, font: { size: 10 } },
                    grid: { color: gridColor }
                },
                y: {
                    position: 'right',
                    ticks: { color: textColor, callback: (v) => '৳' + v.toFixed(0) },
                    grid: { color: gridColor }
                },
                y1: {
                    position: 'left',
                    ticks: { color: textColor, callback: (v) => v.toLocaleString() },
                    grid: { display: false },
                    min: 0
                }
            }
        }
    });

    const rsiCanvas = document.getElementById('adv-rsi-chart');
    if (rsiCanvas && advActiveIndicators.rsi) {
        renderRSIChart(rsiData, isDark, rsiCanvas);
    } else if (rsiCanvas) {
        const ctx = rsiCanvas.getContext('2d');
        ctx.clearRect(0, 0, rsiCanvas.width, rsiCanvas.height);
        ctx.fillStyle = isDark ? '#64748b' : '#94a3b8';
        ctx.font = '14px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('RSI not active', rsiCanvas.width/2, 40);
    }

    const stochCanvas = document.getElementById('adv-stochastic-chart');
    if (stochCanvas && advActiveIndicators.stochastic) {
        renderStochasticChart(stochastic, isDark, stochCanvas);
    } else if (stochCanvas) {
        const ctx = stochCanvas.getContext('2d');
        ctx.clearRect(0, 0, stochCanvas.width, stochCanvas.height);
        ctx.fillStyle = isDark ? '#64748b' : '#94a3b8';
        ctx.font = '14px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Stochastic not active', stochCanvas.width/2, 40);
    }

    updatePriceComment(data);
    if (advActiveIndicators.rsi) {
        updateRSIComment(rsiData);
    } else {
        const commentDiv = document.getElementById('adv-rsi-comment');
        if (commentDiv) commentDiv.textContent = '💡 RSI indicator is off. Click button to activate.';
    }
    if (advActiveIndicators.stochastic) {
        updateStochComment(stochastic);
    } else {
        const commentDiv = document.getElementById('adv-stoch-comment');
        if (commentDiv) commentDiv.textContent = '💡 Stochastic indicator is off. Click button to activate.';
    }

    const updateTime = document.getElementById('adv-chart-update-time');
    if (updateTime) updateTime.innerText = new Date().toLocaleString();
    const suggestionTime = document.getElementById('suggestion-time');
    if (suggestionTime) suggestionTime.innerText = new Date().toLocaleString();
}

// ==========================================
// 📊 RSI চার্ট (অ্যানিমেশন বন্ধ) – ক্যাশিং সহ
// ==========================================
function renderRSIChart(rsiData, isDark, canvas) {
    const ctx = canvas.getContext('2d');
    if (advRSIChart) {
        advRSIChart.destroy();
        advRSIChart = null;
    }

    if (!rsiData || rsiData.length === 0) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = isDark ? '#64748b' : '#94a3b8';
        ctx.font = '14px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Insufficient data for RSI (need 15+ days)', canvas.width/2, 40);
        return;
    }

    const textColor = isDark ? '#f1f5f9' : '#1e293b';
    const gridColor = isDark ? '#334155' : '#e2e8f0';

    const validRsi = rsiData.filter(d => d.rsi !== null && d.rsi !== undefined);
    if (validRsi.length < 5) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = isDark ? '#64748b' : '#94a3b8';
        ctx.font = '14px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Not enough RSI data points', canvas.width/2, 40);
        return;
    }

    const labels = validRsi.map((_, i) => i);
    const rsiValues = validRsi.map(d => d.rsi);

    advRSIChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [
                {
                    label: 'RSI (14)',
                    data: rsiValues,
                    borderColor: '#8b5cf6',
                    backgroundColor: 'rgba(139, 92, 246, 0.1)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.2,
                    pointRadius: 2
                },
                {
                    label: 'Overbought (70)',
                    data: new Array(rsiValues.length).fill(70),
                    borderColor: 'rgba(239, 68, 68, 0.5)',
                    borderDash: [4, 4],
                    borderWidth: 1,
                    fill: false,
                    pointRadius: 0
                },
                {
                    label: 'Oversold (30)',
                    data: new Array(rsiValues.length).fill(30),
                    borderColor: 'rgba(16, 185, 129, 0.5)',
                    borderDash: [4, 4],
                    borderWidth: 1,
                    fill: false,
                    pointRadius: 0
                }
            ]
        },
        options: {
            animation: false,
            responsive: true,
            maintainAspectRatio: false,
            plugins: { 
                legend: { 
                    display: true,
                    labels: { color: textColor, boxWidth: 12, font: { size: 10 } }
                }
            },
            scales: {
                x: { 
                    display: false,
                    grid: { color: gridColor }
                },
                y: { 
                    min: 0, 
                    max: 100, 
                    ticks: { color: textColor, stepSize: 20 }, 
                    grid: { color: gridColor } 
                }
            }
        }
    });
}

// ==========================================
// 📊 Stochastic চার্ট (অ্যানিমেশন বন্ধ) – ক্যাশিং সহ
// ==========================================
function renderStochasticChart(stochData, isDark, canvas) {
    const ctx = canvas.getContext('2d');
    if (advStochChart) {
        advStochChart.destroy();
        advStochChart = null;
    }
    
    if (!stochData || !stochData.k || stochData.k.length === 0) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = isDark ? '#64748b' : '#94a3b8';
        ctx.font = '14px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('No Stochastic data available (need High/Low data)', canvas.width/2, 40);
        return;
    }

    const validK = stochData.k.filter(v => v !== null && v !== undefined && !isNaN(v));
    if (validK.length < 1) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = isDark ? '#64748b' : '#94a3b8';
        ctx.font = '14px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Not enough Stochastic data', canvas.width/2, 40);
        return;
    }

    const textColor = isDark ? '#f1f5f9' : '#1e293b';
    const gridColor = isDark ? '#334155' : '#e2e8f0';

    let dValues = stochData.d || [];
    if (dValues.length < validK.length) {
        const lastD = dValues.length > 0 ? dValues[dValues.length - 1] : 50;
        while (dValues.length < validK.length) {
            dValues.push(lastD);
        }
    }

    const labels = validK.map((_, i) => i);
    const kValues = validK;
    const dFiltered = dValues.slice(0, validK.length);

    advStochChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [
                {
                    label: '%K (14)',
                    data: kValues,
                    borderColor: '#10b981',
                    backgroundColor: 'rgba(16, 185, 129, 0.1)',
                    borderWidth: 2.5,
                    fill: true,
                    tension: 0.2,
                    pointRadius: 2
                },
                {
                    label: '%D (3)',
                    data: dFiltered,
                    borderColor: '#f59e0b',
                    borderWidth: 2.5,
                    fill: false,
                    tension: 0.2,
                    pointRadius: 2
                },
                {
                    label: 'Overbought (80)',
                    data: new Array(kValues.length).fill(80),
                    borderColor: 'rgba(239, 68, 68, 0.5)',
                    borderDash: [4, 4],
                    borderWidth: 1,
                    fill: false,
                    pointRadius: 0
                },
                {
                    label: 'Oversold (20)',
                    data: new Array(kValues.length).fill(20),
                    borderColor: 'rgba(16, 185, 129, 0.5)',
                    borderDash: [4, 4],
                    borderWidth: 1,
                    fill: false,
                    pointRadius: 0
                }
            ]
        },
        options: {
            animation: false,
            responsive: true,
            maintainAspectRatio: false,
            plugins: { 
                legend: { 
                    display: true,
                    labels: { color: textColor, boxWidth: 12, font: { size: 10 } }
                }
            },
            scales: {
                x: { 
                    display: false,
                    grid: { color: gridColor }
                },
                y: { 
                    min: 0, 
                    max: 100, 
                    ticks: { color: textColor, stepSize: 20 }, 
                    grid: { color: gridColor } 
                }
            }
        }
    });
}

// ==========================================
// 📊 অন্যান্য ফাংশন (স্টক ইনফো, কমেন্ট, সাজেশন)
// ==========================================
function updateStockInfo(data) {
    const price = data.currentPrice || 0;
    const prevPrice = data.actualPrices[data.actualPrices.length - 2] || price;
    const change = price - prevPrice;
    const changePercent = prevPrice > 0 ? (change / prevPrice) * 100 : 0;

    const priceEl = document.getElementById('adv-info-price');
    if (priceEl) priceEl.innerText = `৳${price.toFixed(2)}`;

    const changeEl = document.getElementById('adv-info-change');
    if (changeEl) {
        changeEl.innerText = `${change >= 0 ? '+' : ''}${change.toFixed(2)} (${changePercent >= 0 ? '+' : ''}${changePercent.toFixed(2)}%)`;
        changeEl.className = `value ${change >= 0 ? 'positive' : 'negative'}`;
    }

    const highEl = document.getElementById('adv-info-high');
    if (highEl) highEl.innerText = `৳${data.high.toFixed(2)}`;
    const lowEl = document.getElementById('adv-info-low');
    if (lowEl) lowEl.innerText = `৳${data.low.toFixed(2)}`;
    const avgBuyEl = document.getElementById('adv-info-avgbuy');
    if (avgBuyEl) avgBuyEl.innerText = data.avgBuyPrice > 0 ? `৳${data.avgBuyPrice.toFixed(2)}` : '-';
}

function updatePriceComment(data) {
    const commentDiv = document.getElementById('adv-price-comment');
    if (!commentDiv) return;
    const lastPrice = data.currentPrice;
    const prevPrice = data.actualPrices[data.actualPrices.length - 2] || lastPrice;
    const change = lastPrice - prevPrice;
    const pct = prevPrice ? (change / prevPrice) * 100 : 0;
    let comment = `📊 Last: ৳${lastPrice.toFixed(2)} (${change >= 0 ? '+' : ''}${change.toFixed(2)}, ${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%)`;

    if (advActiveIndicators.rsi) {
        const rsiData = cachedRSI(data.actualPrices, 14);
        const lastRSI = rsiData.length ? rsiData[rsiData.length - 1].rsi : null;
        if (lastRSI !== null) {
            if (lastRSI < 30) comment += ' | ⚡ RSI Oversold (<30)';
            else if (lastRSI > 70) comment += ' | ⚡ RSI Overbought (>70)';
            else comment += ` | RSI ${lastRSI.toFixed(1)} (Neutral)`;
        }
    }

    if (advActiveIndicators.bollinger) {
        const bb = cachedBollingerBands(data.actualPrices, 20, 2);
        if (bb && bb.upper.length) {
            const lastUpper = bb.upper[bb.upper.length - 1];
            const lastLower = bb.lower[bb.lower.length - 1];
            if (lastPrice <= lastLower) comment += ' | 📉 Price near Lower BB (Oversold)';
            else if (lastPrice >= lastUpper) comment += ' | 📈 Price near Upper BB (Overbought)';
        }
    }

    if (advActiveIndicators.psar) {
        const priceDataForPSAR = data.actualLabels.map((date, i) => ({
            date: date,
            ltp: data.actualPrices[i],
            high: data.highData[i] || data.actualPrices[i],
            low: data.lowData[i] || data.actualPrices[i]
        }));
        const psar = cachedParabolicSAR(priceDataForPSAR);
        if (psar.length) {
            const lastPSAR = psar[psar.length - 1].sar;
            if (lastPSAR < lastPrice) comment += ' | 🟢 PSAR below price (Bullish)';
            else if (lastPSAR > lastPrice) comment += ' | 🔴 PSAR above price (Bearish)';
        }
    }

    if (advActiveIndicators.vwap && volumeData.length > 0) {
        const vwap = cachedAnchoredVWAP(data.actualPrices, volumeData, 0);
        if (vwap.length > 0) {
            const lastVWAP = vwap[vwap.length - 1];
            if (lastVWAP > 0) {
                comment += ` | VWAP: ৳${lastVWAP.toFixed(2)} (${lastPrice > lastVWAP ? '🟢 Above' : '🔴 Below'})`;
            }
        }
    }

    if (advActiveIndicators.volprofile && volumeData.length > 0) {
        const volProfile = cachedVolumeProfile(data.actualPrices, volumeData, 20);
        if (volProfile && volProfile.pocPrice > 0) {
            comment += ` | POC: ৳${volProfile.pocPrice.toFixed(2)} (${lastPrice > volProfile.pocPrice ? '🟢 Above' : '🔴 Below'})`;
        }
    }

    commentDiv.textContent = comment;
    commentDiv.classList.remove('bullish', 'bearish');
    if (comment.includes('Bullish') || comment.includes('🟢')) {
        commentDiv.classList.add('bullish');
    } else if (comment.includes('Bearish') || comment.includes('🔴')) {
        commentDiv.classList.add('bearish');
    }
}

function updateRSIComment(rsiData) {
    const commentDiv = document.getElementById('adv-rsi-comment');
    if (!commentDiv) return;
    if (!rsiData || rsiData.length === 0) {
        commentDiv.textContent = '💡 No RSI data available.';
        return;
    }
    const last = rsiData[rsiData.length - 1];
    if (last.rsi === null) {
        commentDiv.textContent = '💡 RSI value not available.';
        return;
    }
    const rsi = last.rsi;
    let comment = `📊 RSI: ${rsi.toFixed(2)} – `;
    if (rsi < 30) comment += 'Oversold (🟢 possible reversal up)';
    else if (rsi > 70) comment += 'Overbought (🔴 possible reversal down)';
    else if (rsi < 40) comment += 'Weak (could go lower)';
    else if (rsi > 60) comment += 'Strong (could go higher)';
    else comment += 'Neutral (no clear signal)';
    commentDiv.textContent = comment;
    commentDiv.classList.remove('bullish', 'bearish');
    if (rsi < 30) commentDiv.classList.add('bullish');
    else if (rsi > 70) commentDiv.classList.add('bearish');
}

function updateStochComment(stochData) {
    const commentDiv = document.getElementById('adv-stoch-comment');
    if (!commentDiv) return;
    if (!stochData || !stochData.k || stochData.k.length === 0) {
        commentDiv.textContent = '💡 No Stochastic data available.';
        return;
    }
    const lastK = stochData.k[stochData.k.length - 1];
    const lastD = stochData.d.length ? stochData.d[stochData.d.length - 1] : lastK;
    const comment = `📊 %K: ${lastK.toFixed(2)}, %D: ${lastD.toFixed(2)} – ` +
        (lastK < 20 ? 'Oversold (🟢)' :
         lastK > 80 ? 'Overbought (🔴)' :
         lastK < 40 ? 'Weak' :
         lastK > 60 ? 'Strong' : 'Neutral');
    commentDiv.textContent = comment;
    commentDiv.classList.remove('bullish', 'bearish');
    if (lastK < 20) commentDiv.classList.add('bullish');
    else if (lastK > 80) commentDiv.classList.add('bearish');
}

// ==========================================
// 🧠 স্মার্ট সাজেশন
// ==========================================
function generateSuggestion(data) {
    const container = document.getElementById('suggestion-content');
    if (!container) return;
    if (!data || !data.actualPrices || data.actualPrices.length < 14) {
        container.innerHTML = `<div class="smart-suggestion-empty">📊 Not enough recent price history to calculate a reliable suggestion. Try 3 Months or longer.</div>`;
        return;
    }

    const prices = data.actualPrices;
    const currentPrice = prices[prices.length - 1];
    const sma20 = cachedSMA(prices, 20);
    const sma50 = cachedSMA(prices, 50);
    const rsiData = cachedRSI(prices, 14);
    const lastRSI = rsiData.length > 0 && Number.isFinite(rsiData[rsiData.length - 1].rsi) ? rsiData[rsiData.length - 1].rsi : 50;
    const macdData = cachedMACD(prices, 12, 26, 9);
    const bollinger = cachedBollingerBands(prices, 20, 2);
    const stoch = cachedStochastic(data.highData || [], data.lowData || [], prices, 14, 3);
    const atr = cachedATR(data.highData || [], data.lowData || [], prices, 14);
    const rawAtrValue = atr.length > 0 ? atr[atr.length - 1] : null;
    const atrValue = Number.isFinite(rawAtrValue) && rawAtrValue > 0 ? rawAtrValue : (currentPrice * 0.02);
    const forecast = advActiveIndicators.forecast ? data.forecastValues : [];

    let vwapScore = 0, pocScore = 0;
    if (advActiveIndicators.vwap && volumeData.length > 0) {
        const vwap = cachedAnchoredVWAP(prices, volumeData, 0);
        if (vwap.length > 0) {
            const lastVWAP = vwap[vwap.length - 1];
            if (currentPrice > lastVWAP * 1.01) vwapScore = 1;
            else if (currentPrice < lastVWAP * 0.99) vwapScore = -1;
        }
    }
    if (advActiveIndicators.volprofile && volumeData.length > 0) {
        const volProfile = cachedVolumeProfile(prices, volumeData, 20);
        if (volProfile && volProfile.pocPrice > 0) {
            if (currentPrice > volProfile.pocPrice * 1.01) pocScore = 1;
            else if (currentPrice < volProfile.pocPrice * 0.99) pocScore = -1;
        }
    }

    let psarTrend = null;
    if (advActiveIndicators.psar) {
        const priceDataForPSAR = data.actualLabels.map((date, i) => ({
            date: date,
            ltp: prices[i],
            high: data.highData[i] || prices[i],
            low: data.lowData[i] || prices[i]
        }));
        const psar = cachedParabolicSAR(priceDataForPSAR);
        if (psar.length) {
            const lastPSAR = psar[psar.length - 1];
            psarTrend = lastPSAR.sar < currentPrice ? 'Bullish' : (lastPSAR.sar > currentPrice ? 'Bearish' : 'Neutral');
        }
    }

    let buyScore = 0, sellScore = 0;
    let signals = [];

    if (lastRSI < 30) { buyScore += 2; signals.push('RSI oversold (<30)'); }
    else if (lastRSI > 70) { sellScore += 2; signals.push('RSI overbought (>70)'); }

    if (macdData && macdData.macd.length > 0) {
        const lastMacd = macdData.macd[macdData.macd.length - 1];
        const lastSig = macdData.signal[macdData.signal.length - 1];
        const prevMacd = macdData.macd[macdData.macd.length - 2];
        const prevSig = macdData.signal[macdData.signal.length - 2];
        if (prevMacd < prevSig && lastMacd > lastSig) {
            buyScore += 2; signals.push('MACD bullish crossover');
        } else if (prevMacd > prevSig && lastMacd < lastSig) {
            sellScore += 2; signals.push('MACD bearish crossover');
        }
    }

    if (sma20.length > 0 && sma50.length > 0) {
        const lastSMA20 = sma20[sma20.length - 1];
        const lastSMA50 = sma50[sma50.length - 1];
        const prevSMA20 = sma20[sma20.length - 2];
        const prevSMA50 = sma50[sma50.length - 2];
        if (prevSMA20 < prevSMA50 && lastSMA20 > lastSMA50) {
            buyScore += 3; signals.push('Golden Cross (SMA 20 > SMA 50)');
        } else if (prevSMA20 > prevSMA50 && lastSMA20 < lastSMA50) {
            sellScore += 3; signals.push('Death Cross (SMA 20 < SMA 50)');
        }
    }

    if (bollinger && bollinger.upper.length > 0) {
        const lastUpper = bollinger.upper[bollinger.upper.length - 1];
        const lastLower = bollinger.lower[bollinger.lower.length - 1];
        if (currentPrice <= lastLower) {
            buyScore += 2; signals.push('Price near lower BB (oversold)');
        } else if (currentPrice >= lastUpper) {
            sellScore += 2; signals.push('Price near upper BB (overbought)');
        }
    }

    if (stoch && stoch.k.length > 0) {
        const lastK = stoch.k[stoch.k.length - 1];
        const lastD = stoch.d[stoch.d.length - 1];
        if (lastK < 20 && lastK > lastD) {
            buyScore += 2; signals.push('Stochastic oversold crossover');
        } else if (lastK > 80 && lastK < lastD) {
            sellScore += 2; signals.push('Stochastic overbought crossover');
        }
    }

    if (forecast && forecast.length > 0) {
        const avgForecast = forecast.reduce((a,b) => a+b, 0) / forecast.length;
        if (avgForecast > currentPrice * 1.03) {
            buyScore += 1; signals.push('ARIMA predicts upward trend');
        } else if (avgForecast < currentPrice * 0.97) {
            sellScore += 1; signals.push('ARIMA predicts downward trend');
        }
    }

    if (psarTrend === 'Bullish') {
        buyScore += 1; signals.push('PSAR bullish');
    } else if (psarTrend === 'Bearish') {
        sellScore += 1; signals.push('PSAR bearish');
    }

    if (vwapScore > 0) { buyScore += 1; signals.push('Price above VWAP'); }
    else if (vwapScore < 0) { sellScore += 1; signals.push('Price below VWAP'); }
    
    if (pocScore > 0) { buyScore += 1; signals.push('Price above POC'); }
    else if (pocScore < 0) { sellScore += 1; signals.push('Price below POC'); }

    let decision = 'NEUTRAL', decisionClass = 'signal-neutral';
    let confidence = 'Medium', details = '';

    if (buyScore >= 3 && buyScore > sellScore) {
        decision = 'BUY';
        decisionClass = 'signal-buy';
        confidence = buyScore >= 5 ? 'High' : 'Medium';
    } else if (sellScore >= 3 && sellScore > buyScore) {
        decision = 'SELL';
        decisionClass = 'signal-sell';
        confidence = sellScore >= 5 ? 'High' : 'Medium';
    }
    details = `Buy Score: ${buyScore} | Sell Score: ${sellScore}`;

    const targetPrice = currentPrice + (atrValue * 2);
    const stopLoss = currentPrice - (atrValue * 1.5);

    let html = `
        <div class="smart-suggestion-summary">
            <span class="signal-badge ${decisionClass}">${decision}</span>
            <span class="smart-suggestion-confidence">Confidence: <strong>${confidence}</strong></span>
            <span class="smart-suggestion-details">${details}</span>
        </div>
        <div class="adv-suggestion-grid">
            <div class="adv-suggestion-item">
                <div class="label">📈 Target Price</div>
                <div class="value">৳${targetPrice.toFixed(2)}</div>
                <div class="sub">+${((targetPrice/currentPrice-1)*100).toFixed(2)}% from current</div>
            </div>
            <div class="adv-suggestion-item">
                <div class="label">🛑 Stop Loss</div>
                <div class="value">৳${stopLoss.toFixed(2)}</div>
                <div class="sub">${((stopLoss/currentPrice-1)*100).toFixed(2)}% from current</div>
            </div>
            <div class="adv-suggestion-item">
                <div class="label">📊 ATR (Volatility)</div>
                <div class="value">৳${atrValue.toFixed(2)}</div>
                <div class="sub">14-day Average True Range</div>
            </div>
            <div class="adv-suggestion-item">
                <div class="label">📊 RSI</div>
                <div class="value">${lastRSI.toFixed(2)}</div>
                <div class="sub">${lastRSI < 30 ? 'Oversold' : lastRSI > 70 ? 'Overbought' : 'Neutral'}</div>
            </div>
        </div>
        <div class="smart-suggestion-signals">
            <strong>Signals:</strong> ${signals.length > 0 ? signals.join(' | ') : 'No strong signals'}
        </div>
    `;
    container.innerHTML = html;
}

// ==========================================
// 🎨 থিম টগল
// ==========================================
window.toggleDarkMode = function() {
    const html = document.documentElement;
    const currentTheme = html.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    html.setAttribute('data-theme', newTheme);
    try { localStorage.setItem('theme', newTheme); } catch(e) {}
    const icon = document.getElementById('theme-icon');
    const text = document.getElementById('theme-text');
    if (icon) icon.textContent = newTheme === 'dark' ? '☀️' : '🌙';
    if (text) text.textContent = newTheme === 'dark' ? 'Light' : 'Dark';
    if (advChartData) {
        if (currentChartType === 'line') {
            renderAdvancedChart(advChartData);
        } else {
            renderCandlestickChart(advChartData);
        }
        generateSuggestion(advChartData);
        setTimeout(runDeepAnalysis, 300);
    }
};

window.loadSavedTheme = function() {
    let theme = 'light';
    try {
        const saved = localStorage.getItem('theme');
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        theme = saved || (prefersDark ? 'dark' : 'light');
    } catch(e) {}
    document.documentElement.setAttribute('data-theme', theme);
    const icon = document.getElementById('theme-icon');
    const text = document.getElementById('theme-text');
    if (icon) icon.textContent = theme === 'dark' ? '☀️' : '🌙';
    if (text) text.textContent = theme === 'dark' ? 'Light' : 'Dark';
};

// ==========================================
// 📌 টোস্ট
// ==========================================
function showToast(msg, type) {
    if (typeof window.showToast === 'function') {
        window.showToast(msg, type);
    } else {
        const toast = document.createElement('div');
        const bgColor = type === 'error' ? '#ef4444' : type === 'warning' ? '#f59e0b' : '#10b981';
        toast.style.cssText = `
            position: fixed; top: 20px; left: 50%; transform: translateX(-50%);
            padding: 12px 24px; background: ${bgColor}; color: white;
            border-radius: 8px; z-index: 99999; font-size: 14px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.2);
            animation: fadeIn 0.3s ease;
        `;
        toast.textContent = msg;
        document.body.appendChild(toast);
        setTimeout(() => {
            if (toast.parentNode) toast.remove();
        }, 3000);
    }
}

// ==========================================
// 🆕 অ্যাডভান্সড ডিপ অ্যানালাইসিস (VWAP + Volume Profile সহ) – ক্যাশিং সহ
// ==========================================

async function generateDeepAnalysis(data) {
    const loader = document.getElementById('deep-analysis-loader');
    const content = document.getElementById('deep-analysis-content');
    const timeEl = document.getElementById('deep-analysis-time');
    
    if (!data || !data.actualPrices || data.actualPrices.length < 10) {
        if (loader) loader.innerHTML = '⚠️ Insufficient data for analysis.';
        return;
    }
    
    try {
        loader.style.display = 'block';
        content.style.display = 'none';
        
        const prices = data.actualPrices;
        const volumes = data.volumeData || [];
        const high = data.highData || [];
        const low = data.lowData || [];
        const currentPrice = prices[prices.length - 1];
        const n = prices.length;
        
        // ==========================================
        // ১. Anchored VWAP ক্যালকুলেশন (ক্যাশিং)
        // ==========================================
        const vwap = cachedAnchoredVWAP(prices, volumes, 0);
        const lastVWAP = vwap.length > 0 ? vwap[vwap.length - 1] : currentPrice;
        const vwapDiff = currentPrice - lastVWAP;
        const vwapPct = lastVWAP > 0 ? (vwapDiff / lastVWAP) * 100 : 0;
        
        let vwapStatus = 'Neutral', vwapColor = '#f59e0b', vwapSub = `VWAP: ৳${lastVWAP.toFixed(2)}`;
        if (currentPrice > lastVWAP * 1.01) {
            vwapStatus = '🟢 Above VWAP';
            vwapColor = '#10b981';
            vwapSub = `+${vwapPct.toFixed(2)}% above VWAP (Bullish)`;
        } else if (currentPrice < lastVWAP * 0.99) {
            vwapStatus = '🔴 Below VWAP';
            vwapColor = '#ef4444';
            vwapSub = `${vwapPct.toFixed(2)}% below VWAP (Bearish)`;
        } else {
            vwapStatus = '⚪ At VWAP';
            vwapColor = '#f59e0b';
            vwapSub = `Within 1% of VWAP (Neutral)`;
        }
        
        // ==========================================
        // ২. Volume Profile (POC) ক্যালকুলেশন (ক্যাশিং)
        // ==========================================
        const volProfile = cachedVolumeProfile(prices, volumes, 20);
        const pocPrice = volProfile?.pocPrice || currentPrice;
        const pocDiff = currentPrice - pocPrice;
        const pocPct = pocPrice > 0 ? (pocDiff / pocPrice) * 100 : 0;
        
        let pocStatus = 'Neutral', pocColor = '#8b5cf6', pocSub = `POC: ৳${pocPrice.toFixed(2)}`;
        if (currentPrice > pocPrice * 1.01) {
            pocStatus = '🟢 Above POC';
            pocColor = '#10b981';
            pocSub = `+${pocPct.toFixed(2)}% above POC (Bullish)`;
        } else if (currentPrice < pocPrice * 0.99) {
            pocStatus = '🔴 Below POC';
            pocColor = '#ef4444';
            pocSub = `${pocPct.toFixed(2)}% below POC (Bearish)`;
        } else {
            pocStatus = '⚪ At POC';
            pocColor = '#8b5cf6';
            pocSub = `Within 1% of POC (Neutral)`;
        }
        
        // ==========================================
        // ৩. ট্রেন্ড অ্যানালাইসিস (SMA) – ক্যাশিং
        // ==========================================
        const sma20 = cachedSMA(prices, 20);
        const sma50 = cachedSMA(prices, 50);
        const lastSMA20 = sma20.length > 0 ? sma20[sma20.length - 1] : currentPrice;
        const lastSMA50 = sma50.length > 0 ? sma50[sma50.length - 1] : currentPrice;
        const prevSMA20 = sma20.length > 1 ? sma20[sma20.length - 2] : lastSMA20;
        const prevSMA50 = sma50.length > 1 ? sma50[sma50.length - 2] : lastSMA50;
        
        let trend = 'Neutral', trendColor = '#f59e0b', trendSub = 'Sideways';
        if (currentPrice > lastSMA20 && lastSMA20 > lastSMA50) {
            trend = 'Bullish';
            trendColor = '#10b981';
            trendSub = 'Price above SMA20 & SMA50';
        } else if (currentPrice < lastSMA20 && lastSMA20 < lastSMA50) {
            trend = 'Bearish';
            trendColor = '#ef4444';
            trendSub = 'Price below SMA20 & SMA50';
        } else if (currentPrice > lastSMA20) {
            trend = 'Mild Bullish';
            trendColor = '#34d399';
            trendSub = 'Price above SMA20';
        } else if (currentPrice < lastSMA20) {
            trend = 'Mild Bearish';
            trendColor = '#f87171';
            trendSub = 'Price below SMA20';
        }
        if (prevSMA20 < prevSMA50 && lastSMA20 > lastSMA50) {
            trend = 'Bullish';
            trendColor = '#10b981';
            trendSub = 'Golden Cross (SMA20 above SMA50)';
        } else if (prevSMA20 > prevSMA50 && lastSMA20 < lastSMA50) {
            trend = 'Bearish';
            trendColor = '#ef4444';
            trendSub = 'Death Cross (SMA20 below SMA50)';
        }
        
        // ==========================================
        // ৪. সাপোর্ট/রেসিস্টেন্স (৩০ দিন)
        // ==========================================
        const recentHigh = Math.max(...high.slice(-30));
        const recentLow = Math.min(...low.slice(-30));
        const range = recentHigh - recentLow;
        const support = recentLow + range * 0.25;
        const resistance = recentHigh - range * 0.25;
        const pivot = (recentHigh + recentLow + currentPrice) / 3;
        
        let srStatus = `S: ${support.toFixed(2)} | R: ${resistance.toFixed(2)}`;
        let srSub = `Pivot: ${pivot.toFixed(2)}`;
        if (currentPrice >= resistance) srSub += ' 🔴 Near Resistance';
        else if (currentPrice <= support) srSub += ' 🟢 Near Support';
        
        // ==========================================
        // ৫. RSI ও MACD (ক্যাশিং)
        // ==========================================
        const rsiData = cachedRSI(prices, 14);
        const lastRSI = rsiData.length > 0 && Number.isFinite(rsiData[rsiData.length - 1].rsi) ? rsiData[rsiData.length - 1].rsi : 50;
        const macdData = cachedMACD(prices, 12, 26, 9);
        let macdSignal = 'Neutral';
        if (macdData && macdData.histogram.length > 0) {
            const lastHist = macdData.histogram[macdData.histogram.length - 1];
            const prevHist = macdData.histogram.length > 1 ? macdData.histogram[macdData.histogram.length - 2] : lastHist;
            if (lastHist > 0 && prevHist < 0) macdSignal = '🟢 Bullish Crossover';
            else if (lastHist < 0 && prevHist > 0) macdSignal = '🔴 Bearish Crossover';
            else if (lastHist > 0) macdSignal = '📈 Bullish Momentum';
            else if (lastHist < 0) macdSignal = '📉 Bearish Momentum';
        }
        
        // ==========================================
        // ৬. ভলিউম অ্যানালাইসিস
        // ==========================================
        const avgVolume = volumes.length > 0 ? volumes.reduce((a,b) => a+b, 0) / volumes.length : 0;
        const lastVolume = volumes.length > 0 ? volumes[volumes.length - 1] : 0;
        const volumeSurge = avgVolume > 0 ? (lastVolume / avgVolume) : 1;
        const volumeSignal = volumeSurge > 2 ? '🟢 High' : (volumeSurge > 1.5 ? '📈 Above Avg' : '📊 Normal');
        
        // ==========================================
        // ৭. ফাইনাল সিগন্যাল (VWAP + POC + অন্যান্য)
        // ==========================================
        let buyScore = 0, sellScore = 0;
        let reasons = [];
        
        // VWAP স্কোর
        if (currentPrice > lastVWAP * 1.01) { buyScore += 3; reasons.push('Price above VWAP'); }
        else if (currentPrice < lastVWAP * 0.99) { sellScore += 3; reasons.push('Price below VWAP'); }
        
        // POC স্কোর
        if (currentPrice > pocPrice * 1.01) { buyScore += 3; reasons.push('Price above POC'); }
        else if (currentPrice < pocPrice * 0.99) { sellScore += 3; reasons.push('Price below POC'); }
        
        // ট্রেন্ড স্কোর
        if (trend === 'Bullish') { buyScore += 2; reasons.push('Bullish trend'); }
        else if (trend === 'Bearish') { sellScore += 2; reasons.push('Bearish trend'); }
        
        // সাপোর্ট/রেসিস্টেন্স স্কোর
        if (currentPrice <= support) { buyScore += 2; reasons.push('Near support'); }
        else if (currentPrice >= resistance) { sellScore += 2; reasons.push('Near resistance'); }
        
        // RSI স্কোর
        if (lastRSI < 30) { buyScore += 2; reasons.push('RSI oversold'); }
        else if (lastRSI > 70) { sellScore += 2; reasons.push('RSI overbought'); }
        
        // MACD স্কোর
        if (macdSignal.includes('Bullish')) { buyScore += 2; reasons.push('MACD bullish'); }
        else if (macdSignal.includes('Bearish')) { sellScore += 2; reasons.push('MACD bearish'); }
        
        // ভলিউম স্কোর
        if (volumeSurge > 2 && buyScore > sellScore) { buyScore += 1; reasons.push('High volume support'); }
        else if (volumeSurge > 2 && sellScore > buyScore) { sellScore += 1; reasons.push('High volume pressure'); }
        
        // চূড়ান্ত সিগন্যাল
        let signal = 'NEUTRAL', signalColor = '#64748b', signalSub = 'No clear signal';
        if (buyScore >= 5 && buyScore > sellScore) {
            signal = 'BUY';
            signalColor = '#10b981';
            signalSub = `${buyScore} buy vs ${sellScore} sell signals`;
        } else if (sellScore >= 5 && sellScore > buyScore) {
            signal = 'SELL';
            signalColor = '#ef4444';
            signalSub = `${sellScore} sell vs ${buyScore} buy signals`;
        } else if (buyScore >= 3 && buyScore > sellScore) {
            signal = 'WEAK BUY';
            signalColor = '#34d399';
            signalSub = `${buyScore} buy vs ${sellScore} sell signals`;
        } else if (sellScore >= 3 && sellScore > buyScore) {
            signal = 'WEAK SELL';
            signalColor = '#f87171';
            signalSub = `${sellScore} sell vs ${buyScore} buy signals`;
        } else {
            signal = 'NEUTRAL';
            signalColor = '#64748b';
            signalSub = `Buy ${buyScore} | Sell ${sellScore} - No strong conviction`;
        }
        
        // ==========================================
        // ৮. UI আপডেট
        // ==========================================
        // VWAP কার্ড
        document.getElementById('da-vwap').innerHTML = `<span style="color: ${vwapColor};">${vwapStatus}</span>`;
        document.getElementById('da-vwap-sub').textContent = vwapSub;
        
        // POC কার্ড
        document.getElementById('da-poc').innerHTML = `<span style="color: ${pocColor};">${pocStatus}</span>`;
        document.getElementById('da-poc-sub').textContent = pocSub;
        
        // সিগন্যাল কার্ড
        document.getElementById('da-signal').innerHTML = `<span style="color: ${signalColor}; font-weight: 700; font-size: 20px;">${signal}</span>`;
        document.getElementById('da-signal-sub').textContent = signalSub;
        
        // টেবিল
        const tableBody = document.getElementById('da-table-body');
        const metrics = [
            { name: 'Current Price', value: `৳${currentPrice.toFixed(2)}`, signal: '-' },
            { name: 'VWAP', value: `৳${lastVWAP.toFixed(2)}`, signal: currentPrice > lastVWAP ? '🟢 Above' : (currentPrice < lastVWAP ? '🔴 Below' : '⚪ At') },
            { name: 'POC (Volume Profile)', value: `৳${pocPrice.toFixed(2)}`, signal: currentPrice > pocPrice ? '🟢 Above' : (currentPrice < pocPrice ? '🔴 Below' : '⚪ At') },
            { name: 'SMA 20', value: `৳${lastSMA20.toFixed(2)}`, signal: currentPrice > lastSMA20 ? '🟢 Above' : '🔴 Below' },
            { name: 'SMA 50', value: `৳${lastSMA50.toFixed(2)}`, signal: currentPrice > lastSMA50 ? '🟢 Above' : '🔴 Below' },
            { name: 'RSI (14)', value: lastRSI.toFixed(2), signal: lastRSI < 30 ? '🟢 Oversold' : (lastRSI > 70 ? '🔴 Overbought' : '⚪ Neutral') },
            { name: 'MACD', value: macdSignal, signal: macdSignal.includes('Bullish') ? '🟢' : (macdSignal.includes('Bearish') ? '🔴' : '⚪') },
            { name: 'Volume', value: `${volumeSurge.toFixed(1)}x avg`, signal: volumeSignal },
            { name: 'Support', value: `৳${support.toFixed(2)}`, signal: currentPrice <= support ? '🟢 Near' : '⚪ Far' },
            { name: 'Resistance', value: `৳${resistance.toFixed(2)}`, signal: currentPrice >= resistance ? '🔴 Near' : '⚪ Far' }
        ];
        
        tableBody.innerHTML = metrics.map(m => `
            <tr style="border-bottom: 1px solid rgba(255,255,255,0.04);">
                <td style="padding: 6px 8px;">${m.name}</td>
                <td style="padding: 6px 8px; text-align: right;">${m.value}</td>
                <td style="padding: 6px 8px; text-align: right;">${m.signal}</td>
            </tr>
        `).join('');
        
        // সারাংশ
        const summaryText = document.getElementById('da-summary-text');
        const summaryDiv = document.getElementById('da-summary');
        
        if (signal === 'BUY' || signal === 'WEAK BUY') {
            summaryText.innerHTML = `📈 <strong>${signal}</strong> signal detected. ${reasons.join(', ')}. VWAP & POC both support bullish view. Consider entry near support with stop loss.`;
            summaryDiv.style.borderLeftColor = '#10b981';
        } else if (signal === 'SELL' || signal === 'WEAK SELL') {
            summaryText.innerHTML = `📉 <strong>${signal}</strong> signal detected. ${reasons.join(', ')}. VWAP & POC both support bearish view. Consider exit near resistance.`;
            summaryDiv.style.borderLeftColor = '#ef4444';
        } else {
            summaryText.innerHTML = `⚪ <strong>NEUTRAL</strong>. ${reasons.join(', ') || 'No strong signals. VWAP & POC are neutral. Wait for clearer setup.'}`;
            summaryDiv.style.borderLeftColor = '#64748b';
        }
        
        // সময় আপডেট
        if (timeEl) timeEl.textContent = `Last updated: ${new Date().toLocaleString()}`;
        
        loader.style.display = 'none';
        content.style.display = 'block';
        
    } catch (error) {
        console.error('Deep analysis error:', error);
        document.getElementById('deep-analysis-loader').innerHTML = `❌ Error: ${error.message}`;
    }
}

// ==========================================
// 🔄 ডিপ অ্যানালাইসিস রানের ফাংশন
// ==========================================
function runDeepAnalysis() {
    if (advChartData) {
        generateDeepAnalysis(advChartData);
    }
}

// ==========================================
// 📌 গ্লোবাল এক্সপোজ (সব ফাংশন)
// ==========================================
window.loadAdvancedChart = loadAdvancedChart;
window.selectAdvChartStock = selectAdvChartStock;
window.toggleDarkMode = toggleDarkMode;
window.getHistoricalPricesFromSupabase = getHistoricalPricesFromSupabase;
// toggleFullscreen is exported by adv-charts-extras.js after this file loads.
window.downloadChartAsPNG = downloadChartAsPNG;
window.saveIndicatorPreset = saveIndicatorPreset;
window.loadIndicatorPreset = loadIndicatorPreset;
window.deleteIndicatorPreset = deleteIndicatorPreset;
window.updatePresetSelect = updatePresetSelect;
window.switchTimeframe = switchTimeframe;
window.generateDeepAnalysis = generateDeepAnalysis;
window.runDeepAnalysis = runDeepAnalysis;

console.log('✅ adv-charts-core.js loaded successfully (duplicate-free, error-free)');