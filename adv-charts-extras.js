// ==========================================
// 📈 adv-charts-extras.js - অ্যাডভান্সড চার্ট এক্সট্রা ফিচার
//    ক্যান্ডেল চার্ট, ফুল-স্ক্রিন, PNG ডাউনলোড, প্রিসেট, টাইমফ্রেম
// ==========================================

// ==========================================
// 🕯️ ক্যান্ডেল চার্ট রেন্ডার (ইন্ডিকেটর + ফরকাস্ট + কমেন্ট)
// ==========================================
function prepareCandlestickData(data) {
    const prices = data.actualPrices;
    const labels = data.actualLabels;
    const highData = data.highData || [];
    const lowData = data.lowData || [];
    const result = [];
    for (let i = 0; i < prices.length; i++) {
        const close = prices[i];
        const high = highData[i] || close;
        const low = lowData[i] || close;
        const open = i > 0 ? prices[i-1] : close;
        result.push({
            time: labels[i],
            open: open,
            high: high,
            low: low,
            close: close
        });
    }
    return result;
}

function renderCandlestickChart(data) {
    const container = document.getElementById('candlestick-chart');
    if (!container) return;
    
    if (!data || !data.actualPrices || data.actualPrices.length < 2) {
        container.innerHTML = '<p style="color: var(--text-muted); padding: 20px; text-align: center;">⚠️ Insufficient data.</p>';
        return;
    }

    if (typeof LightweightCharts === 'undefined') {
        container.innerHTML = `<div style="padding:20px;text-align:center;color:var(--text-muted);">
            <p>⚠️ Library not loaded.</p>
            <button onclick="loadCandlestickLibrary()" style="padding:6px 16px; background:var(--primary-color); color:white; border:none; border-radius:4px; cursor:pointer;">🔄 Retry</button>
        </div>`;
        return;
    }

    container.innerHTML = '';
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const bgColor = isDark ? '#1e293b' : '#ffffff';
    const textColor = isDark ? '#f1f5f9' : '#333';
    const gridColor = isDark ? '#334155' : '#f0f0f0';

    const chart = LightweightCharts.createChart(container, {
        width: container.clientWidth,
        height: 400,
        layout: { backgroundColor: bgColor, textColor: textColor },
        grid: { vertLines: { color: gridColor }, horzLines: { color: gridColor } },
        crosshair: { mode: LightweightCharts.CrosshairMode.Normal },
        rightPriceScale: { borderColor: gridColor },
        timeScale: { borderColor: gridColor, timeVisible: true, tickMarkFormatter: (time) => time },
    });

    const candleSeries = chart.addCandlestickSeries({
        upColor: '#26a69a', downColor: '#ef5350', borderVisible: false,
        wickUpColor: '#26a69a', wickDownColor: '#ef5350'
    });
    const candleData = prepareCandlestickData(data);
    candleSeries.setData(candleData);

    const actualPrices = data.actualPrices;
    const actualLabels = data.actualLabels;
    const highData = data.highData || [];
    const lowData = data.lowData || [];

    // SMA
    if (advActiveIndicators.sma5 || advActiveIndicators.sma10 || advActiveIndicators.sma20 || advActiveIndicators.sma50) {
        const smaPeriods = [5, 10, 20, 50];
        const smaColors = ['#8b5cf6', '#ec4899', '#f97316', '#14b8a6'];
        smaPeriods.forEach((period, idx) => {
            const key = `sma${period}`;
            if (advActiveIndicators[key]) {
                const smaValues = calculateSMA(actualPrices, period);
                if (smaValues.length > 0) {
                    const lineData = smaValues.map((val, i) => ({
                        time: actualLabels[i + period - 1],
                        value: val
                    }));
                    chart.addLineSeries({
                        color: smaColors[idx],
                        lineWidth: 1,
                        title: `SMA ${period}`,
                        priceLineVisible: false,
                    }).setData(lineData);
                }
            }
        });
    }

    // EMA
    if (advActiveIndicators.ema5 || advActiveIndicators.ema10 || advActiveIndicators.ema20 || advActiveIndicators.ema50) {
        const emaPeriods = [5, 10, 20, 50];
        const emaColors = ['#a78bfa', '#f472b6', '#fb923c', '#2dd4bf'];
        emaPeriods.forEach((period, idx) => {
            const key = `ema${period}`;
            if (advActiveIndicators[key]) {
                const emaValues = calculateEMA(actualPrices, period);
                if (emaValues.length > 0) {
                    const lineData = emaValues.map((val, i) => ({
                        time: actualLabels[i + period - 1],
                        value: val
                    }));
                    chart.addLineSeries({
                        color: emaColors[idx],
                        lineWidth: 1,
                        title: `EMA ${period}`,
                        priceLineVisible: false,
                    }).setData(lineData);
                }
            }
        });
    }

    // Bollinger Bands
    if (advActiveIndicators.bollinger) {
        const bb = calculateBollingerBands(actualPrices, 20, 2);
        if (bb && bb.middle.length > 0) {
            const middleData = bb.middle.map((val, i) => ({ time: actualLabels[i + 19], value: val }));
            const upperData = bb.upper.map((val, i) => ({ time: actualLabels[i + 19], value: val }));
            const lowerData = bb.lower.map((val, i) => ({ time: actualLabels[i + 19], value: val }));
            chart.addLineSeries({ color: '#f59e0b', lineWidth: 1, title: 'BB Middle', priceLineVisible: false }).setData(middleData);
            chart.addLineSeries({ color: 'rgba(239,68,68,0.5)', lineWidth: 1, title: 'BB Upper', priceLineVisible: false }).setData(upperData);
            chart.addLineSeries({ color: 'rgba(239,68,68,0.5)', lineWidth: 1, title: 'BB Lower', priceLineVisible: false }).setData(lowerData);
        }
    }

    // PSAR
    if (advActiveIndicators.psar) {
        const psarData = calculateParabolicSAR(actualPrices.map((p, i) => ({
            date: actualLabels[i], ltp: p, high: highData[i] || p, low: lowData[i] || p
        })));
        if (psarData.length > 0) {
            const psarPoints = psarData.map((item, i) => ({
                time: actualLabels[i] || actualLabels[actualLabels.length - 1],
                value: item.sar,
                trend: item.trend
            }));
            const psarLine = chart.addLineSeries({
                color: '#ff6b6b',
                lineWidth: 0,
                pointMarkers: psarPoints.map(p => ({
                    time: p.time,
                    position: 'aboveBar',
                    color: p.trend === 'up' ? '#10b981' : '#ef4444',
                    shape: 'circle',
                    size: 2,
                })),
                title: 'PSAR',
                priceLineVisible: false,
            });
            const dummyData = psarPoints.map(p => ({ time: p.time, value: p.value }));
            psarLine.setData(dummyData);
        }
    }

    // ARIMA Forecast
    if (advActiveIndicators.forecast && data.forecastValues && data.forecastValues.length > 0) {
        const forecastVals = data.forecastValues;
        const lastDate = new Date(actualLabels[actualLabels.length - 1]);
        const forecastData = forecastVals.map((val, i) => {
            const d = new Date(lastDate);
            d.setDate(d.getDate() + i + 1);
            return {
                time: d.toISOString().split('T')[0],
                value: val
            };
        });
        chart.addLineSeries({
            color: '#f59e0b',
            lineWidth: 2,
            lineStyle: 2,
            title: 'ARIMA Forecast',
            priceLineVisible: false,
        }).setData(forecastData);
    }

    // Anchored VWAP (ক্যান্ডেল চার্টে)
    if (advActiveIndicators.vwap && volumeData.length > 0) {
        const vwap = calculateAnchoredVWAP(actualPrices, volumeData, 0);
        if (vwap.length > 0) {
            const vwapData = vwap.map((val, i) => ({
                time: actualLabels[i + (actualPrices.length - vwap.length)],
                value: val
            }));
            chart.addLineSeries({
                color: '#f59e0b',
                lineWidth: 2,
                lineStyle: 2,
                title: 'Anchored VWAP',
                priceLineVisible: false,
            }).setData(vwapData);
        }
    }

    // Volume Profile POC (ক্যান্ডেল চার্টে)
    if (advActiveIndicators.volprofile && volumeData.length > 0) {
        const volProfile = calculateVolumeProfile(actualPrices, volumeData, 20);
        if (volProfile && volProfile.pocPrice > 0) {
            const pocData = [{ time: actualLabels[0], value: volProfile.pocPrice }, { time: actualLabels[actualLabels.length-1], value: volProfile.pocPrice }];
            chart.addLineSeries({
                color: '#8b5cf6',
                lineWidth: 2,
                lineStyle: 1,
                title: `POC (${volProfile.pocPrice.toFixed(2)})`,
                priceLineVisible: false,
            }).setData(pocData);
        }
    }

    chart.timeScale().fitContent();

    const resize = () => chart.applyOptions({ width: container.clientWidth });
    window.addEventListener('resize', resize);
    container._chart = chart;

    updateCandlestickComment(data);
}

function loadCandlestickLibrary() {
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/lightweight-charts@4.1.0/dist/lightweight-charts.standalone.production.js';
    script.onload = () => {
        if (advChartData) renderCandlestickChart(advChartData);
        showToast('✅ Candlestick library loaded!', 'success');
    };
    script.onerror = () => {
        showToast('❌ Failed to load candlestick library. Please try again later.', 'error');
    };
    document.head.appendChild(script);
}

// ==========================================
// 💬 ক্যান্ডেল কমেন্ট (UI ক্লাস সহ)
// ==========================================
function updateCandlestickComment(data) {
    const commentDiv = document.getElementById('candlestick-comment');
    if (!commentDiv) return;
    if (!data || !data.actualPrices || data.actualPrices.length < 3) {
        commentDiv.textContent = '💡 Insufficient data for analysis.';
        return;
    }

    const prices = data.actualPrices;
    const high = data.highData || [];
    const low = data.lowData || [];
    const lastIdx = prices.length - 1;
    const currentPrice = prices[lastIdx];
    const prevPrice = prices[lastIdx - 1];
    const prevPrevPrice = prices[lastIdx - 2];

    let comment = '📊 ';

    const todayOpen = lastIdx > 0 ? prices[lastIdx - 1] : currentPrice;
    const todayHigh = high[lastIdx] || currentPrice;
    const todayLow = low[lastIdx] || currentPrice;
    const bodySize = Math.abs(currentPrice - todayOpen);
    const range = todayHigh - todayLow;

    if (lastIdx > 1) {
        const prevOpen = lastIdx > 1 ? prices[lastIdx - 2] : prevPrice;
        const prevClose = prevPrice;
        if (prevClose > prevOpen && currentPrice < todayOpen && todayOpen > prevClose && currentPrice < prevOpen) {
            comment += '🔴 Bearish Engulfing (possible reversal down) ';
        } else if (prevClose < prevOpen && currentPrice > todayOpen && todayOpen < prevClose && currentPrice > prevOpen) {
            comment += '🟢 Bullish Engulfing (possible reversal up) ';
        }
    }

    if (range > 0 && bodySize / range < 0.1) {
        comment += '⚪ Doji (indecision, possible reversal) ';
    }

    if (advActiveIndicators.rsi) {
        const rsiData = calculateRSI(prices, 14);
        const lastRSI = rsiData.length ? rsiData[rsiData.length - 1].rsi : null;
        if (lastRSI !== null) {
            if (lastRSI < 30) comment += '| RSI oversold (<30) – potential bounce ';
            else if (lastRSI > 70) comment += '| RSI overbought (>70) – potential pullback ';
            else if (lastRSI < 40) comment += '| RSI weak (could go lower) ';
            else if (lastRSI > 60) comment += '| RSI strong (could go higher) ';
        }
    }

    if (advActiveIndicators.bollinger) {
        const bb = calculateBollingerBands(prices, 20, 2);
        if (bb && bb.upper.length > 0) {
            const lastUpper = bb.upper[bb.upper.length - 1];
            const lastLower = bb.lower[bb.lower.length - 1];
            if (currentPrice <= lastLower) comment += '| Price near lower BB (oversold) ';
            else if (currentPrice >= lastUpper) comment += '| Price near upper BB (overbought) ';
        }
    }

    if (advActiveIndicators.psar) {
        const psar = calculateParabolicSAR(prices.map((p, i) => ({ date: data.actualLabels[i], ltp: p, high: high[i] || p, low: low[i] || p })));
        if (psar.length > 0) {
            const lastPSAR = psar[psar.length - 1].sar;
            if (lastPSAR < currentPrice) comment += '| PSAR bullish ';
            else if (lastPSAR > currentPrice) comment += '| PSAR bearish ';
        }
    }

    if (advActiveIndicators.forecast && data.forecastValues && data.forecastValues.length > 0) {
        const avgForecast = data.forecastValues.reduce((a,b) => a+b, 0) / data.forecastValues.length;
        const change = ((avgForecast - currentPrice) / currentPrice) * 100;
        if (change > 2) comment += `| ARIMA predicts +${change.toFixed(2)}% in 5 days (bullish) `;
        else if (change < -2) comment += `| ARIMA predicts ${change.toFixed(2)}% in 5 days (bearish) `;
        else comment += '| ARIMA sees sideways movement ';
    }

    if (advActiveIndicators.vwap && volumeData.length > 0) {
        const vwap = calculateAnchoredVWAP(prices, volumeData, 0);
        if (vwap.length > 0) {
            const lastVWAP = vwap[vwap.length - 1];
            if (currentPrice > lastVWAP) comment += '| Price above VWAP (bullish) ';
            else if (currentPrice < lastVWAP) comment += '| Price below VWAP (bearish) ';
        }
    }

    if (advActiveIndicators.volprofile && volumeData.length > 0) {
        const volProfile = calculateVolumeProfile(prices, volumeData, 20);
        if (volProfile && volProfile.pocPrice > 0) {
            if (currentPrice > volProfile.pocPrice) comment += '| Price above POC (bullish) ';
            else if (currentPrice < volProfile.pocPrice) comment += '| Price below POC (bearish) ';
        }
    }

    commentDiv.textContent = comment || '💡 No strong signals.';
    commentDiv.classList.remove('bullish', 'bearish');
    if (comment.includes('bullish') || comment.includes('🟢') || comment.includes('potential bounce')) {
        commentDiv.classList.add('bullish');
    } else if (comment.includes('bearish') || comment.includes('🔴') || comment.includes('potential pullback')) {
        commentDiv.classList.add('bearish');
    }
}

// ==========================================
// 🚀 ইউজার ফিচার ফাংশনসমূহ
// ==========================================

// 📍 ফুল-স্ক্রিন ফাংশন
function toggleFullscreen() {
    const container = document.querySelector('.adv-page');
    if (!document.fullscreenElement) {
        container.requestFullscreen().catch(err => {
            showToast('Fullscreen not supported', 'warning');
        });
    } else {
        document.exitFullscreen();
    }
}

document.addEventListener('fullscreenchange', () => {
    if (advChartData) {
        setTimeout(() => {
            if (currentChartType === 'line') renderAdvancedChart(advChartData);
            else renderCandlestickChart(advChartData);
        }, 300);
    }
});

// 📍 PNG ডাউনলোড ফাংশন
function downloadChartAsPNG() {
    const canvas = document.getElementById('adv-main-chart');
    if (!canvas) {
        showToast('No chart to download', 'warning');
        return;
    }
    const link = document.createElement('a');
    link.download = `${advCurrentTicker}_chart_${new Date().toISOString().slice(0,10)}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
    showToast('📥 Chart downloaded!', 'success');
}

// 📍 ইন্ডিকেটর প্রিসেট ফাংশন
function saveIndicatorPreset() {
    const name = prompt('Enter preset name (e.g., "RSI+Bollinger+VWAP"):');
    if (!name) return;
    const preset = { ...advActiveIndicators };
    const presets = JSON.parse(localStorage.getItem('indicator_presets') || '{}');
    presets[name] = preset;
    localStorage.setItem('indicator_presets', JSON.stringify(presets));
    updatePresetSelect();
    showToast(`✅ Preset "${name}" saved!`, 'success');
}

function loadIndicatorPreset(name) {
    if (!name) return;
    const presets = JSON.parse(localStorage.getItem('indicator_presets') || '{}');
    const preset = presets[name];
    if (!preset) {
        showToast('Preset not found', 'error');
        return;
    }
    document.querySelectorAll('.indicator-btn').forEach(btn => {
        const indicator = btn.dataset.indicator;
        if (preset[indicator]) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
        advActiveIndicators[indicator] = preset[indicator] || false;
    });
    if (advChartData) {
        if (currentChartType === 'line') renderAdvancedChart(advChartData);
        else renderCandlestickChart(advChartData);
        generateSuggestion(advChartData);
    }
    showToast(`📊 Preset "${name}" loaded!`, 'success');
}

function updatePresetSelect() {
    const select = document.getElementById('preset-select');
    if (!select) return;
    const presets = JSON.parse(localStorage.getItem('indicator_presets') || '{}');
    const currentValue = select.value;
    select.innerHTML = '<option value="">Load Preset</option>';
    Object.keys(presets).forEach(name => {
        const opt = document.createElement('option');
        opt.value = name;
        opt.textContent = name;
        select.appendChild(opt);
    });
    if (currentValue && presets[currentValue]) select.value = currentValue;
}

function deleteIndicatorPreset() {
    const select = document.getElementById('preset-select');
    const name = select.value;
    if (!name) {
        showToast('Select a preset first', 'warning');
        return;
    }
    if (!confirm(`Delete "${name}" preset?`)) return;
    const presets = JSON.parse(localStorage.getItem('indicator_presets') || '{}');
    delete presets[name];
    localStorage.setItem('indicator_presets', JSON.stringify(presets));
    updatePresetSelect();
    showToast(`🗑️ Preset "${name}" deleted`, 'info');
}

// 📍 টাইমফ্রেম সুইচ ফাংশন
function switchTimeframe(tf) {
    const periodMap = { '1d': 1, '1w': 7, '1M': 30 };
    const period = periodMap[tf] || 30;
    const periodSelect = document.getElementById('adv-chart-period');
    if (periodSelect) periodSelect.value = period;
    advCurrentPeriod = period;
    
    document.querySelectorAll('.tf-btn').forEach(btn => {
        btn.style.background = 'transparent';
        btn.style.color = 'var(--text-primary)';
        btn.style.border = '1px solid var(--border-color)';
    });
    const activeBtn = document.querySelector(`.tf-btn[data-tf="${tf}"]`);
    if (activeBtn) {
        activeBtn.style.background = 'var(--primary-color)';
        activeBtn.style.color = 'white';
        activeBtn.style.border = 'none';
    }
    
    if (advChartData) loadAdvancedChart();
}

// ==========================================
// 📌 গ্লোবাল এক্সপোজ (এক্সট্রা ফাংশন)
// ==========================================
window.loadCandlestickLibrary = loadCandlestickLibrary;
window.renderCandlestickChart = renderCandlestickChart;
window.toggleFullscreen = toggleFullscreen;
window.downloadChartAsPNG = downloadChartAsPNG;
window.saveIndicatorPreset = saveIndicatorPreset;
window.loadIndicatorPreset = loadIndicatorPreset;
window.deleteIndicatorPreset = deleteIndicatorPreset;
window.updatePresetSelect = updatePresetSelect;
window.switchTimeframe = switchTimeframe;

console.log('✅ adv-charts-extras.js loaded successfully');