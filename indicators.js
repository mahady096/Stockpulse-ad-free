// ==========================================
// 📊 indicators.js - সম্পূর্ণ আপডেটেড (সব ফোরকাস্টিং ইন্ডিকেটর সহ)
//    বেস ইন্ডিকেটর + Anchored VWAP + Volume Profile + Fibonacci + Aroon + Ichimoku
//    🆕 Linear Regression + WMA + Holt-Winters + VWAP Forecast + MACD Forecast
// ==========================================

// ==========================================
// 📦 ক্যাশ ম্যানেজমেন্ট (Memoization)
// ==========================================

const indicatorCache = new Map();
const CACHE_TTL = 60000; // ৬০ সেকেন্ড

function buildCacheKey(fnName, args) {
    const parts = args.map(arg => {
        if (Array.isArray(arg)) {
            if (arg.length === 0) return 'empty_array';
            const firstTwo = arg.slice(0, 2).map(v => typeof v === 'number' ? v.toFixed(4) : String(v)).join(',');
            const lastTwo = arg.slice(-2).map(v => typeof v === 'number' ? v.toFixed(4) : String(v)).join(',');
            return `arr_${arg.length}_${firstTwo}_${lastTwo}`;
        } else if (typeof arg === 'object' && arg !== null) {
            try {
                const keys = Object.keys(arg).slice(0, 5);
                const vals = keys.map(k => {
                    const v = arg[k];
                    if (Array.isArray(v)) return `${k}:arr_${v.length}`;
                    return `${k}:${String(v).substring(0, 20)}`;
                }).join('|');
                return `obj_${keys.length}_${vals}`;
            } catch (e) {
                return 'obj_complex';
            }
        }
        return String(arg);
    }).join('_');
    return `${fnName}_${parts}`;
}

function getCachedIndicator(fnName, computeFn, ...args) {
    const cacheKey = buildCacheKey(fnName, args);
    const cached = indicatorCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
        return cached.data;
    }
    const result = computeFn(...args);
    if (result !== null && result !== undefined) {
        if (!Array.isArray(result) || result.length > 0) {
            indicatorCache.set(cacheKey, {
                data: result,
                timestamp: Date.now()
            });
        }
    }
    return result;
}

function clearIndicatorCache() {
    indicatorCache.clear();
    console.log('🗑️ Indicator cache cleared');
}

// ==========================================
// 📊 বেস ইন্ডিকেটর
// ==========================================

function calculateSMA(data, period) {
    if (data.length < period) return [];
    const result = [];
    for (let i = period - 1; i < data.length; i++) {
        let sum = 0;
        for (let j = i - period + 1; j <= i; j++) sum += data[j];
        result.push(sum / period);
    }
    return result;
}

function calculateEMA(data, period) {
    if (data.length < period) return [];
    const multiplier = 2 / (period + 1);
    const result = [];
    let sma = 0;
    for (let i = 0; i < period; i++) sma += data[i];
    sma /= period;
    result.push(sma);
    for (let i = period; i < data.length; i++) {
        const ema = (data[i] - result[result.length - 1]) * multiplier + result[result.length - 1];
        result.push(ema);
    }
    return result;
}

function calculateRSI(data, period = 14) {
    if (data.length < period + 1) return [];
    const result = [];
    let gains = 0, losses = 0;
    for (let i = 1; i <= period; i++) {
        const diff = data[i] - data[i-1];
        if (diff >= 0) gains += diff;
        else losses += Math.abs(diff);
    }
    let avgGain = gains / period;
    let avgLoss = losses / period;
    let rsi = 100 - (100 / (1 + (avgGain / (avgLoss || 1))));
    result.push({ rsi });
    for (let i = period + 1; i < data.length; i++) {
        const diff = data[i] - data[i-1];
        const gain = diff >= 0 ? diff : 0;
        const loss = diff < 0 ? Math.abs(diff) : 0;
        avgGain = ((avgGain * (period - 1)) + gain) / period;
        avgLoss = ((avgLoss * (period - 1)) + loss) / period;
        rsi = 100 - (100 / (1 + (avgGain / (avgLoss || 1))));
        result.push({ rsi });
    }
    return result;
}

function calculateMACD(data, fast = 12, slow = 26, signal = 9) {
    if (data.length < slow + signal) return null;
    const emaFast = calculateEMA(data, fast);
    const emaSlow = calculateEMA(data, slow);
    const macdLine = [];
    const startIdx = data.length - emaSlow.length;
    for (let i = 0; i < emaSlow.length; i++) {
        macdLine.push(emaFast[i + startIdx] - emaSlow[i]);
    }
    const signalLine = calculateEMA(macdLine, signal);
    const histogram = [];
    const sigStart = macdLine.length - signalLine.length;
    for (let i = 0; i < signalLine.length; i++) {
        histogram.push(macdLine[i + sigStart] - signalLine[i]);
    }
    return {
        macd: macdLine.slice(-signalLine.length),
        signal: signalLine,
        histogram
    };
}

function calculateBollingerBands(data, period = 20, stdDev = 2) {
    if (data.length < period) return null;
    const sma = calculateSMA(data, period);
    const upper = [], lower = [], middle = [];
    for (let i = period - 1; i < data.length; i++) {
        const start = i - period + 1;
        let sum = 0;
        for (let j = start; j <= i; j++) sum += Math.pow(data[j] - sma[i - period + 1], 2);
        const std = Math.sqrt(sum / period);
        upper.push(sma[i - period + 1] + stdDev * std);
        middle.push(sma[i - period + 1]);
        lower.push(sma[i - period + 1] - stdDev * std);
    }
    return { upper, middle, lower };
}

function calculateStochastic(high, low, close, period = 14, smoothK = 3, smoothD = 3) {
    if (high.length < period || low.length < period || close.length < period) return { k: [], d: [] };
    const kValues = [];
    for (let i = period - 1; i < close.length; i++) {
        const start = i - period + 1;
        let maxHigh = -Infinity, minLow = Infinity;
        for (let j = start; j <= i; j++) {
            if (high[j] > maxHigh) maxHigh = high[j];
            if (low[j] < minLow) minLow = low[j];
        }
        const range = maxHigh - minLow;
        const k = range > 0 ? ((close[i] - minLow) / range) * 100 : 50;
        kValues.push(Math.max(0, Math.min(100, k)));
    }
    const smoothKValues = [];
    for (let i = smoothK - 1; i < kValues.length; i++) {
        let sum = 0;
        for (let j = i - smoothK + 1; j <= i; j++) sum += kValues[j];
        smoothKValues.push(sum / smoothK);
    }
    const dValues = [];
    for (let i = smoothD - 1; i < smoothKValues.length; i++) {
        let sum = 0;
        for (let j = i - smoothD + 1; j <= i; j++) sum += smoothKValues[j];
        dValues.push(sum / smoothD);
    }
    return { k: smoothKValues, d: dValues };
}

function calculateATR(high, low, close, period = 14) {
    if (high.length < period || low.length < period || close.length < period + 1) return [];
    const tr = [];
    for (let i = 1; i < close.length; i++) {
        const h = high[i] || close[i];
        const l = low[i] || close[i];
        const prevClose = close[i-1];
        const tr1 = h - l;
        const tr2 = Math.abs(h - prevClose);
        const tr3 = Math.abs(l - prevClose);
        tr.push(Math.max(tr1, tr2, tr3));
    }
    let atr = [];
    let sum = 0;
    for (let i = 0; i < period && i < tr.length; i++) sum += tr[i];
    atr.push(sum / period);
    for (let i = period; i < tr.length; i++) {
        const prevAtr = atr[atr.length - 1];
        const newAtr = (prevAtr * (period - 1) + tr[i]) / period;
        atr.push(newAtr);
    }
    return atr;
}

function calculateParabolicSAR(priceData, step = 0.02, maxStep = 0.20) {
    if (!priceData || priceData.length < 2) return [];
    let sar = [];
    let trend = 'up';
    let af = step;
    let ep = priceData[0].high || priceData[0].ltp || priceData[0].close || 0;
    let currentSAR = priceData[0].low || priceData[0].ltp || priceData[0].close || 0;
    sar.push({ date: priceData[0].date, sar: currentSAR, trend: trend, af: af, ep: ep });

    for (let i = 1; i < priceData.length; i++) {
        const current = priceData[i];
        const price = current.ltp || current.close || 0;
        const high = current.high || price;
        const low = current.low || price;

        let newSAR;
        if (trend === 'up') {
            newSAR = currentSAR + af * (ep - currentSAR);
        } else {
            newSAR = currentSAR - af * (currentSAR - ep);
        }

        if (trend === 'up' && price < newSAR) {
            trend = 'down';
            newSAR = ep;
            af = step;
            ep = low;
        } else if (trend === 'down' && price > newSAR) {
            trend = 'up';
            newSAR = ep;
            af = step;
            ep = high;
        } else {
            if (trend === 'up') {
                if (high > ep) {
                    ep = high;
                    af = Math.min(af + step, maxStep);
                }
            } else {
                if (low < ep) {
                    ep = low;
                    af = Math.min(af + step, maxStep);
                }
            }
        }

        sar.push({ date: current.date, sar: newSAR, trend: trend, af: af, ep: ep });
        currentSAR = newSAR;
    }
    return sar;
}

function arimaForecast(data, steps = 5) {
    if (data.length < 3) return null;
    const n = data.length;
    let sumY = 0, sumY1 = 0, sumY1Y = 0, sumY1Sq = 0;
    for (let i = 1; i < n; i++) {
        sumY += data[i];
        sumY1 += data[i-1];
        sumY1Y += data[i-1] * data[i];
        sumY1Sq += data[i-1] * data[i-1];
    }
    const phi = (sumY1Y - (sumY1 * sumY) / n) / (sumY1Sq - (sumY1 * sumY1) / n);
    const c = (sumY - phi * sumY1) / n;
    const forecast = [];
    let last = data[data.length - 1];
    for (let i = 0; i < steps; i++) {
        const next = c + phi * last;
        forecast.push(next);
        last = next;
    }
    return forecast;
}

// ==========================================
// 🚀 অ্যাডভান্সড ইন্ডিকেটর
// ==========================================

// ==========================================
// 📊 ১. Anchored VWAP
// ==========================================
function calculateAnchoredVWAP(priceData, volumeData, anchorIndex = 0) {
    if (priceData.length < 2 || volumeData.length < 2) return [];
    if (anchorIndex >= priceData.length) anchorIndex = 0;
    
    let cumVolume = 0, cumVolumePrice = 0;
    const result = [];
    const startIdx = Math.max(0, anchorIndex);
    
    for (let i = startIdx; i < priceData.length; i++) {
        const vol = volumeData[i] || 1;
        cumVolume += vol;
        cumVolumePrice += priceData[i] * vol;
        result.push(cumVolumePrice / cumVolume);
    }
    return result;
}

// ==========================================
// 📊 ২. Volume Profile (POC)
// ==========================================
function calculateVolumeProfile(priceData, volumeData, bins = 20) {
    if (priceData.length < 2) return { profile: {}, pocPrice: 0, pocVolume: 0 };
    
    const min = Math.min(...priceData);
    const max = Math.max(...priceData);
    if (min === max) return { profile: {}, pocPrice: priceData[0], pocVolume: 0 };
    
    const binSize = (max - min) / bins;
    const profile = {};
    
    for (let i = 0; i < priceData.length; i++) {
        const bin = Math.floor((priceData[i] - min) / binSize);
        const key = Math.min(bin, bins - 1);
        profile[key] = (profile[key] || 0) + (volumeData[i] || 0);
    }
    
    let maxVol = 0, pocBin = 0;
    for (const [bin, vol] of Object.entries(profile)) {
        if (vol > maxVol) { 
            maxVol = vol; 
            pocBin = parseFloat(bin); 
        }
    }
    
    const pocPrice = min + (pocBin + 0.5) * binSize;
    return { 
        profile, 
        pocPrice, 
        pocVolume: maxVol,
        binSize,
        minPrice: min,
        maxPrice: max
    };
}

// ==========================================
// 📊 ৩. Fibonacci Retracement
// ==========================================
function calculateFibonacci(high, low) {
    if (!high || !low || high <= low) return null;
    const diff = high - low;
    return {
        level0: high,
        level236: high - diff * 0.236,
        level382: high - diff * 0.382,
        level500: high - diff * 0.5,
        level618: high - diff * 0.618,
        level786: high - diff * 0.786,
        level100: low,
        high: high,
        low: low,
        diff: diff
    };
}

// ==========================================
// 📊 ৪. Aroon Indicator
// ==========================================
function calculateAroon(priceData, period = 25) {
    if (priceData.length < period) return { aroonUp: [], aroonDown: [], crossover: [] };
    
    const aroonUp = [], aroonDown = [], crossover = [];
    
    for (let i = period; i < priceData.length; i++) {
        const slice = priceData.slice(i - period, i + 1);
        const highIdx = slice.indexOf(Math.max(...slice));
        const lowIdx = slice.indexOf(Math.min(...slice));
        const up = ((period - highIdx) / period) * 100;
        const down = ((period - lowIdx) / period) * 100;
        aroonUp.push(up);
        aroonDown.push(down);
        
        const prevUp = aroonUp.length > 1 ? aroonUp[aroonUp.length - 2] : up;
        const prevDown = aroonDown.length > 1 ? aroonDown[aroonDown.length - 2] : down;
        if ((prevUp < prevDown && up > down) || (prevUp > prevDown && up < down)) {
            crossover.push({
                index: i,
                type: up > down ? 'bullish' : 'bearish',
                aroonUp: up,
                aroonDown: down
            });
        }
    }
    
    return { aroonUp, aroonDown, crossover };
}

// ==========================================
// 📊 ৫. Ichimoku Cloud
// ==========================================
function calculateIchimoku(priceData, highData, lowData, tenkan = 9, kijun = 26, senkou = 52) {
    if (priceData.length < senkou || highData.length < senkou || lowData.length < senkou) {
        return null;
    }
    
    const result = {
        tenkanSen: [],
        kijunSen: [],
        senkouA: [],
        senkouB: [],
        chikou: []
    };
    
    // Tenkan-sen
    for (let i = tenkan - 1; i < priceData.length; i++) {
        const sliceHigh = highData.slice(i - tenkan + 1, i + 1);
        const sliceLow = lowData.slice(i - tenkan + 1, i + 1);
        const maxHigh = Math.max(...sliceHigh);
        const minLow = Math.min(...sliceLow);
        result.tenkanSen.push((maxHigh + minLow) / 2);
    }
    
    // Kijun-sen
    for (let i = kijun - 1; i < priceData.length; i++) {
        const sliceHigh = highData.slice(i - kijun + 1, i + 1);
        const sliceLow = lowData.slice(i - kijun + 1, i + 1);
        const maxHigh = Math.max(...sliceHigh);
        const minLow = Math.min(...sliceLow);
        result.kijunSen.push((maxHigh + minLow) / 2);
    }
    
    // Senkou Span A
    for (let i = 0; i < result.tenkanSen.length && i < result.kijunSen.length; i++) {
        result.senkouA.push((result.tenkanSen[i] + result.kijunSen[i]) / 2);
    }
    
    // Senkou Span B
    for (let i = senkou - 1; i < priceData.length; i++) {
        const sliceHigh = highData.slice(i - senkou + 1, i + 1);
        const sliceLow = lowData.slice(i - senkou + 1, i + 1);
        const maxHigh = Math.max(...sliceHigh);
        const minLow = Math.min(...sliceLow);
        result.senkouB.push((maxHigh + minLow) / 2);
    }
    
    // Chikou Span
    for (let i = 0; i < priceData.length; i++) {
        if (i + kijun < priceData.length) {
            result.chikou.push(priceData[i + kijun]);
        } else {
            result.chikou.push(null);
        }
    }
    
    return result;
}

// ==========================================
// 🆕 ফোরকাস্টিং ইন্ডিকেটর
// ==========================================

// ==========================================
// 📊 ৬. Linear Regression (ট্রেন্ডলাইন ফোরকাস্ট)
// ==========================================
function calculateLinearRegression(data, periods = 20, forecastSteps = 5) {
    if (data.length < periods) return null;
    const slice = data.slice(-periods);
    const n = slice.length;
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
    for (let i = 0; i < n; i++) {
        sumX += i;
        sumY += slice[i];
        sumXY += i * slice[i];
        sumX2 += i * i;
    }
    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;
    const forecast = [];
    for (let i = 0; i < forecastSteps; i++) {
        forecast.push(slope * (n + i) + intercept);
    }
    
    // R-squared গণনা
    const meanY = sumY / n;
    let ssTot = 0, ssRes = 0;
    for (let i = 0; i < n; i++) {
        ssTot += Math.pow(slice[i] - meanY, 2);
        ssRes += Math.pow(slice[i] - (slope * i + intercept), 2);
    }
    const rSquared = ssTot > 0 ? 1 - (ssRes / ssTot) : 0;
    
    return { slope, intercept, forecast, rSquared };
}

// ==========================================
// 📊 ৭. Weighted Moving Average (WMA)
// ==========================================
function calculateWMA(data, period = 14) {
    if (data.length < period) return [];
    const result = [];
    for (let i = period - 1; i < data.length; i++) {
        let sum = 0, weightSum = 0;
        for (let j = 0; j < period; j++) {
            const weight = j + 1;
            sum += data[i - period + 1 + j] * weight;
            weightSum += weight;
        }
        result.push(sum / weightSum);
    }
    return result;
}

function forecastWMA(data, period = 14, steps = 5) {
    const wma = calculateWMA(data, period);
    if (wma.length < 2) return null;
    const lastWMA = wma[wma.length - 1];
    const prevWMA = wma[wma.length - 2];
    const change = lastWMA - prevWMA;
    const forecast = [];
    for (let i = 1; i <= steps; i++) {
        forecast.push(lastWMA + change * i);
    }
    return forecast;
}

// ==========================================
// 📊 ৮. Holt-Winters Exponential Smoothing
// ==========================================
function calculateHoltWinters(data, alpha = 0.3, beta = 0.1, gamma = 0.2, seasonLength = 7, steps = 5) {
    if (data.length < seasonLength * 2) return null;
    const n = data.length;
    const level = new Array(n);
    const trend = new Array(n);
    const seasonal = new Array(n);
    
    // সিজনাল ইনডেক্স ইনিশিয়ালাইজ
    const seasonalIndices = new Array(seasonLength).fill(0);
    for (let i = 0; i < seasonLength; i++) {
        let sum = 0, count = 0;
        for (let j = i; j < n; j += seasonLength) {
            sum += data[j];
            count++;
        }
        seasonalIndices[i] = count > 0 ? sum / count : 0;
    }
    const avgSeasonal = seasonalIndices.reduce((a,b) => a+b, 0) / seasonLength;
    for (let i = 0; i < seasonLength; i++) {
        seasonalIndices[i] = avgSeasonal > 0 ? seasonalIndices[i] / avgSeasonal : 1;
    }
    
    // লেভেল, ট্রেন্ড, সিজনাল ইনিশিয়ালাইজ
    level[0] = data[0];
    trend[0] = data.length > seasonLength ? (data[seasonLength] - data[0]) / seasonLength : 0;
    for (let i = 0; i < Math.min(seasonLength, n); i++) {
        seasonal[i] = seasonalIndices[i % seasonLength];
    }
    
    // ফরওয়ার্ড ক্যালকুলেশন
    for (let i = 1; i < n; i++) {
        const prevLevel = level[i-1];
        const prevTrend = trend[i-1];
        const prevSeasonal = seasonal[i - seasonLength] || seasonalIndices[i % seasonLength] || 1;
        level[i] = alpha * (data[i] / prevSeasonal) + (1 - alpha) * (prevLevel + prevTrend);
        trend[i] = beta * (level[i] - prevLevel) + (1 - beta) * prevTrend;
        seasonal[i] = gamma * (data[i] / level[i]) + (1 - gamma) * prevSeasonal;
    }
    
    // ফোরকাস্ট
    const forecast = [];
    for (let i = 1; i <= steps; i++) {
        const idx = n - 1 + i;
        const seasonalIdx = idx % seasonLength;
        const s = seasonal[seasonalIdx] || seasonalIndices[seasonalIdx] || 1;
        forecast.push((level[n-1] + trend[n-1] * i) * s);
    }
    return forecast;
}

// ==========================================
// 📊 ৯. VWAP Forecast
// ==========================================
function forecastVWAP(priceData, volumeData, period = 20, steps = 5) {
    if (priceData.length < period || volumeData.length < period) return null;
    const vwap = calculateAnchoredVWAP(priceData, volumeData, priceData.length - period);
    if (vwap.length < 2) return null;
    const lastVWAP = vwap[vwap.length - 1];
    const prevVWAP = vwap[vwap.length - 2];
    const change = lastVWAP - prevVWAP;
    const forecast = [];
    for (let i = 1; i <= steps; i++) {
        forecast.push(lastVWAP + change * i);
    }
    return forecast;
}

// ==========================================
// 📊 ১০. MACD Forecast
// ==========================================
function forecastMACD(data, fast = 12, slow = 26, signal = 9, steps = 5) {
    const macdData = calculateMACD(data, fast, slow, signal);
    if (!macdData || macdData.histogram.length < 2) return null;
    const histogram = macdData.histogram;
    const lastHist = histogram[histogram.length - 1];
    const prevHist = histogram[histogram.length - 2] || lastHist;
    const change = lastHist - prevHist;
    const forecast = [];
    for (let i = 1; i <= steps; i++) {
        forecast.push(lastHist + change * i);
    }
    return { histogram, forecast };
}

// ==========================================
// 📊 ১১. Volume-Weighted RSI (VWRSI)
// ==========================================
function calculateVWRSI(priceData, volumeData, period = 14) {
    if (priceData.length < period + 1 || volumeData.length < period + 1) return [];
    const result = [];
    let gains = 0, losses = 0, volGains = 0, volLosses = 0;
    for (let i = 1; i <= period; i++) {
        const diff = priceData[i] - priceData[i-1];
        const vol = volumeData[i] || 1;
        if (diff >= 0) {
            gains += diff;
            volGains += vol;
        } else {
            losses += Math.abs(diff);
            volLosses += vol;
        }
    }
    let avgGain = gains / period;
    let avgLoss = losses / period;
    let avgVolGain = volGains / period;
    let avgVolLoss = volLosses / period;
    let rsi = 100 - (100 / (1 + (avgGain / (avgLoss || 1))));
    let vwrsi = 100 - (100 / (1 + (avgVolGain / (avgVolLoss || 1))));
    result.push({ rsi, vwrsi });
    
    for (let i = period + 1; i < priceData.length; i++) {
        const diff = priceData[i] - priceData[i-1];
        const vol = volumeData[i] || 1;
        const gain = diff >= 0 ? diff : 0;
        const loss = diff < 0 ? Math.abs(diff) : 0;
        const volGain = diff >= 0 ? vol : 0;
        const volLoss = diff < 0 ? vol : 0;
        
        avgGain = ((avgGain * (period - 1)) + gain) / period;
        avgLoss = ((avgLoss * (period - 1)) + loss) / period;
        avgVolGain = ((avgVolGain * (period - 1)) + volGain) / period;
        avgVolLoss = ((avgVolLoss * (period - 1)) + volLoss) / period;
        
        rsi = 100 - (100 / (1 + (avgGain / (avgLoss || 1))));
        vwrsi = 100 - (100 / (1 + (avgVolGain / (avgVolLoss || 1))));
        result.push({ rsi, vwrsi });
    }
    return result;
}

// ==========================================
// 📊 ১২. Money Flow Index (MFI) - ভলিউম-ভিত্তিক RSI
// ==========================================
function calculateMFI(priceData, highData, lowData, volumeData, period = 14) {
    if (priceData.length < period + 1) return [];
    const typicalPrices = priceData.map((p, i) => {
        const h = highData[i] || p;
        const l = lowData[i] || p;
        return (h + l + p) / 3;
    });
    const moneyFlow = typicalPrices.map((tp, i) => tp * (volumeData[i] || 1));
    const result = [];
    let positiveFlow = 0, negativeFlow = 0;
    for (let i = 1; i <= period; i++) {
        if (typicalPrices[i] > typicalPrices[i-1]) {
            positiveFlow += moneyFlow[i];
        } else {
            negativeFlow += moneyFlow[i];
        }
    }
    let mfi = 100 - (100 / (1 + (positiveFlow / (negativeFlow || 1))));
    result.push(mfi);
    for (let i = period + 1; i < typicalPrices.length; i++) {
        const prevTP = typicalPrices[i-1];
        const currTP = typicalPrices[i];
        const currMF = moneyFlow[i];
        const prevMF = moneyFlow[i - period];
        if (prevTP < currTP) {
            positiveFlow += currMF;
        } else {
            negativeFlow += currMF;
        }
        // আগের দিনের ফ্লো বাদ দিন
        const prevMFIndex = i - period;
        const prevTPIndex = prevMFIndex;
        if (prevTPIndex > 0 && typicalPrices[prevTPIndex] > typicalPrices[prevTPIndex - 1]) {
            positiveFlow -= moneyFlow[prevMFIndex];
        } else {
            negativeFlow -= moneyFlow[prevMFIndex];
        }
        mfi = 100 - (100 / (1 + (positiveFlow / (negativeFlow || 1))));
        result.push(mfi);
    }
    return result;
}

// ==========================================
// 🔥 ক্যাশিং র‍্যাপার ফাংশন (সব ইন্ডিকেটর)
// ==========================================

// বেস ইন্ডিকেটর
function cachedSMA(data, period) {
    return getCachedIndicator('SMA', calculateSMA, data, period);
}
function cachedEMA(data, period) {
    return getCachedIndicator('EMA', calculateEMA, data, period);
}
function cachedRSI(data, period = 14) {
    return getCachedIndicator('RSI', calculateRSI, data, period);
}
function cachedMACD(data, fast = 12, slow = 26, signal = 9) {
    return getCachedIndicator('MACD', calculateMACD, data, fast, slow, signal);
}
function cachedBollingerBands(data, period = 20, stdDev = 2) {
    return getCachedIndicator('BB', calculateBollingerBands, data, period, stdDev);
}
function cachedStochastic(high, low, close, period = 14, smoothK = 3, smoothD = 3) {
    return getCachedIndicator('STOCH', calculateStochastic, high, low, close, period, smoothK, smoothD);
}
function cachedATR(high, low, close, period = 14) {
    return getCachedIndicator('ATR', calculateATR, high, low, close, period);
}
function cachedParabolicSAR(priceData, step = 0.02, maxStep = 0.20) {
    return getCachedIndicator('PSAR', calculateParabolicSAR, priceData, step, maxStep);
}
function cachedArimaForecast(data, steps = 5) {
    return getCachedIndicator('ARIMA', arimaForecast, data, steps);
}

// অ্যাডভান্সড ইন্ডিকেটর
function cachedAnchoredVWAP(priceData, volumeData, anchorIndex = 0) {
    return getCachedIndicator('AnchoredVWAP', calculateAnchoredVWAP, priceData, volumeData, anchorIndex);
}
function cachedVolumeProfile(priceData, volumeData, bins = 20) {
    return getCachedIndicator('VolumeProfile', calculateVolumeProfile, priceData, volumeData, bins);
}
function cachedFibonacci(high, low) {
    return getCachedIndicator('Fibonacci', calculateFibonacci, high, low);
}
function cachedAroon(priceData, period = 25) {
    return getCachedIndicator('Aroon', calculateAroon, priceData, period);
}
function cachedIchimoku(priceData, highData, lowData, tenkan = 9, kijun = 26, senkou = 52) {
    return getCachedIndicator('Ichimoku', calculateIchimoku, priceData, highData, lowData, tenkan, kijun, senkou);
}

// ফোরকাস্টিং ইন্ডিকেটর
function cachedLinearRegression(data, periods = 20, forecastSteps = 5) {
    return getCachedIndicator('LinReg', calculateLinearRegression, data, periods, forecastSteps);
}
function cachedWMA(data, period = 14) {
    return getCachedIndicator('WMA', calculateWMA, data, period);
}
function cachedForecastWMA(data, period = 14, steps = 5) {
    return getCachedIndicator('ForecastWMA', forecastWMA, data, period, steps);
}
function cachedHoltWinters(data, alpha = 0.3, beta = 0.1, gamma = 0.2, seasonLength = 7, steps = 5) {
    return getCachedIndicator('HoltWinters', calculateHoltWinters, data, alpha, beta, gamma, seasonLength, steps);
}
function cachedForecastVWAP(priceData, volumeData, period = 20, steps = 5) {
    return getCachedIndicator('ForecastVWAP', forecastVWAP, priceData, volumeData, period, steps);
}
function cachedForecastMACD(data, fast = 12, slow = 26, signal = 9, steps = 5) {
    return getCachedIndicator('ForecastMACD', forecastMACD, data, fast, slow, signal, steps);
}
function cachedVWRSI(priceData, volumeData, period = 14) {
    return getCachedIndicator('VWRSI', calculateVWRSI, priceData, volumeData, period);
}
function cachedMFI(priceData, highData, lowData, volumeData, period = 14) {
    return getCachedIndicator('MFI', calculateMFI, priceData, highData, lowData, volumeData, period);
}

// ==========================================
// 🌐 গ্লোবালি এক্সপোজ
// ==========================================
if (typeof window !== 'undefined') {
    // বেস ইন্ডিকেটর
    window.calculateSMA = calculateSMA;
    window.calculateEMA = calculateEMA;
    window.calculateRSI = calculateRSI;
    window.calculateMACD = calculateMACD;
    window.calculateBollingerBands = calculateBollingerBands;
    window.calculateStochastic = calculateStochastic;
    window.calculateATR = calculateATR;
    window.calculateParabolicSAR = calculateParabolicSAR;
    window.arimaForecast = arimaForecast;
    
    // অ্যাডভান্সড ইন্ডিকেটর
    window.calculateAnchoredVWAP = calculateAnchoredVWAP;
    window.calculateVolumeProfile = calculateVolumeProfile;
    window.calculateFibonacci = calculateFibonacci;
    window.calculateAroon = calculateAroon;
    window.calculateIchimoku = calculateIchimoku;
    
    // ফোরকাস্টিং ইন্ডিকেটর
    window.calculateLinearRegression = calculateLinearRegression;
    window.calculateWMA = calculateWMA;
    window.forecastWMA = forecastWMA;
    window.calculateHoltWinters = calculateHoltWinters;
    window.forecastVWAP = forecastVWAP;
    window.forecastMACD = forecastMACD;
    window.calculateVWRSI = calculateVWRSI;
    window.calculateMFI = calculateMFI;
    
    // ক্যাশিং ফাংশন
    window.cachedSMA = cachedSMA;
    window.cachedEMA = cachedEMA;
    window.cachedRSI = cachedRSI;
    window.cachedMACD = cachedMACD;
    window.cachedBollingerBands = cachedBollingerBands;
    window.cachedStochastic = cachedStochastic;
    window.cachedATR = cachedATR;
    window.cachedParabolicSAR = cachedParabolicSAR;
    window.cachedArimaForecast = cachedArimaForecast;
    window.cachedAnchoredVWAP = cachedAnchoredVWAP;
    window.cachedVolumeProfile = cachedVolumeProfile;
    window.cachedFibonacci = cachedFibonacci;
    window.cachedAroon = cachedAroon;
    window.cachedIchimoku = cachedIchimoku;
    window.cachedLinearRegression = cachedLinearRegression;
    window.cachedWMA = cachedWMA;
    window.cachedForecastWMA = cachedForecastWMA;
    window.cachedHoltWinters = cachedHoltWinters;
    window.cachedForecastVWAP = cachedForecastVWAP;
    window.cachedForecastMACD = cachedForecastMACD;
    window.cachedVWRSI = cachedVWRSI;
    window.cachedMFI = cachedMFI;
    
    window.clearIndicatorCache = clearIndicatorCache;
}

// ==========================================
// 📤 এক্সপোর্ট (যদি ES Modules ব্যবহার করা হয়)
// ==========================================
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        calculateSMA,
        calculateEMA,
        calculateRSI,
        calculateMACD,
        calculateBollingerBands,
        calculateStochastic,
        calculateATR,
        calculateParabolicSAR,
        arimaForecast,
        calculateAnchoredVWAP,
        calculateVolumeProfile,
        calculateFibonacci,
        calculateAroon,
        calculateIchimoku,
        calculateLinearRegression,
        calculateWMA,
        forecastWMA,
        calculateHoltWinters,
        forecastVWAP,
        forecastMACD,
        calculateVWRSI,
        calculateMFI,
        cachedSMA,
        cachedEMA,
        cachedRSI,
        cachedMACD,
        cachedBollingerBands,
        cachedStochastic,
        cachedATR,
        cachedParabolicSAR,
        cachedArimaForecast,
        cachedAnchoredVWAP,
        cachedVolumeProfile,
        cachedFibonacci,
        cachedAroon,
        cachedIchimoku,
        cachedLinearRegression,
        cachedWMA,
        cachedForecastWMA,
        cachedHoltWinters,
        cachedForecastVWAP,
        cachedForecastMACD,
        cachedVWRSI,
        cachedMFI,
        clearIndicatorCache
    };
}
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

// ডেইলি ব্রিফিং ডেটা জেনারেট (শুধু ডেটা, নোটিফিকেশন ছাড়া)
async function generateDailyBriefingData(userId) {
    // আগের generateDailyBriefing()-এর লজিক ব্যবহার করুন
    // কিন্তু নোটিফিকেশন পাঠাবেন না, শুধু ডেটা রিটার্ন করবেন
}
console.log('✅ indicators.js loaded successfully (All indicators + Forecasting + Volume-based)');