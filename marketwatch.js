// ==========================================
// 📊 marketwatch.js - Watch List & Full Market View
//    ✅ null-check সহ ইরর হ্যান্ডলিং
//    ✅ পোর্টফোলিও ফিল্টার সাপোর্ট
// ==========================================

// ==========================================
// 📦 ক্যাশ ও স্টোরেজ ম্যানেজমেন্ট
// ==========================================
const WATCHLIST_STORAGE_KEY = 'market_watch_list';
const MARKET_DATA_CACHE_KEY = 'market_full_view_data';
const MARKET_CACHE_TTL = 600000; // ১০ মিনিট

// ওয়াচলিস্ট লোড/সেভ
function getWatchList() {
    try {
        const data = localStorage.getItem(WATCHLIST_STORAGE_KEY);
        return data ? JSON.parse(data) : [];
    } catch { return []; }
}

function saveWatchList(list) {
    localStorage.setItem(WATCHLIST_STORAGE_KEY, JSON.stringify(list));
}

// ফুল ভিউ ডেটা ক্যাশ
function getCachedMarketData() {
    try {
        const cached = sessionStorage.getItem(MARKET_DATA_CACHE_KEY);
        if (!cached) return null;
        const parsed = JSON.parse(cached);
        if (Date.now() - parsed.timestamp < MARKET_CACHE_TTL) {
            return parsed.data;
        }
        return null;
    } catch { return null; }
}

function setCachedMarketData(data) {
    try {
        sessionStorage.setItem(MARKET_DATA_CACHE_KEY, JSON.stringify({
            timestamp: Date.now(),
            data: data
        }));
    } catch (e) { console.warn('Cache save failed:', e); }
}

// ==========================================
// 📈 প্রাইস হিস্টোরি ফেচার (১, ৩, ৭, ১৫, ৩০ দিন)
// ==========================================
async function getHistoricalPrices(ticker) {
    const periods = [1, 3, 7, 15, 30];
    const result = { currentPrice: 0, changes: {} };
    
    try {
        const latestPrice = await getUnifiedPrice(ticker);
        result.currentPrice = latestPrice || 0;
        
        for (const days of periods) {
            const date = new Date();
            date.setDate(date.getDate() - days);
            const dateStr = date.toISOString().split('T')[0];
            
            let price = await firebaseDataManager.getPriceByDate(ticker, dateStr);
            if (!price || price === 0) {
                for (let extra = 1; extra <= 3; extra++) {
                    const fallbackDate = new Date();
                    fallbackDate.setDate(fallbackDate.getDate() - days - extra);
                    const fallbackStr = fallbackDate.toISOString().split('T')[0];
                    price = await firebaseDataManager.getPriceByDate(ticker, fallbackStr);
                    if (price && price > 0) break;
                }
            }
            
            let changePct = 0;
            if (price && price > 0 && result.currentPrice > 0) {
                changePct = ((result.currentPrice - price) / price) * 100;
            }
            result.changes[`${days}d`] = {
                price: price || 0,
                changePct: changePct
            };
        }
    } catch (err) {
        console.warn(`Error fetching historical prices for ${ticker}:`, err);
    }
    
    return result;
}

// ==========================================
// 🔍 মার্কেট ডেটা লোডার (সব শেয়ারের জন্য)
// ==========================================
async function loadFullMarketData(forceRefresh = false) {
    if (!forceRefresh) {
        const cached = getCachedMarketData();
        if (cached) {
            console.log('✅ Full market data loaded from cache');
            return cached;
        }
    }

    const user = auth.currentUser;
    if (!user) {
        if (typeof showToast === 'function') showToast('Please login first', 'error');
        return null;
    }

    try {
        const tickers = typeof dseStocks !== 'undefined' ? dseStocks : [];
        if (tickers.length === 0) {
            if (typeof showToast === 'function') showToast('No stock list available.', 'error');
            return [];
        }

        const allData = [];
        const batchSize = 10;
        let processed = 0;

        for (let i = 0; i < tickers.length; i += batchSize) {
            const batch = tickers.slice(i, i + batchSize);
            const promises = batch.map(async (ticker) => {
                try {
                    const priceData = await getHistoricalPrices(ticker);
                    let category = 'N/A';
                    try {
                        const snap = await db.collection('cse_detailed_data')
                            .where('code', '==', ticker)
                            .orderBy('date', 'desc')
                            .limit(1)
                            .get();
                        if (!snap.empty) {
                            category = snap.docs[0].data().category || 'N/A';
                        }
                    } catch (e) {}
                    return {
                        ticker: ticker,
                        category: category,
                        currentPrice: priceData.currentPrice,
                        changes: priceData.changes
                    };
                } catch (err) {
                    return null;
                }
            });

            const results = await Promise.all(promises);
            const valid = results.filter(r => r !== null && r.currentPrice > 0);
            allData.push(...valid);

            processed += batch.length;
        }

        setCachedMarketData(allData);
        console.log(`✅ Full market data loaded: ${allData.length} stocks`);

        return allData;

    } catch (error) {
        console.error('Market data load error:', error);
        if (typeof showToast === 'function') showToast('Error loading market data', 'error');
        return null;
    }
}

// ==========================================
// 🖥️ টেবিল রেন্ডারিং
// ==========================================
function renderMarketTable(data, containerId, isWatchList = false) {
    const tbody = document.getElementById(containerId);
    if (!tbody) return;

    if (!data || data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; padding:40px; color:var(--text-muted);">
            ${isWatchList ? 'No stocks in watchlist. Search and add above.' : 'No market data available.'}
        </td></tr>`;
        return;
    }

    let html = '';
    data.forEach(item => {
        const price = item.currentPrice || 0;
        const ch1d = item.changes?.['1d']?.changePct || 0;
        const ch3d = item.changes?.['3d']?.changePct || 0;
        const ch7d = item.changes?.['7d']?.changePct || 0;
        const ch15d = item.changes?.['15d']?.changePct || 0;
        const ch30d = item.changes?.['30d']?.changePct || 0;

        const formatPct = (val) => {
            const sign = val >= 0 ? '+' : '';
            const color = val >= 0 ? '#10b981' : '#ef4444';
            return `<span style="color:${color}; font-weight:600;">${sign}${val.toFixed(2)}%</span>`;
        };

        html += `<tr onclick="if(typeof openStockDetailModal === 'function') openStockDetailModal('${item.ticker}')" style="cursor:pointer; transition:background 0.2s;" 
                    onmouseover="this.style.background='var(--hover-bg)'" onmouseout="this.style.background='transparent'">`;
        html += `<td style="padding:10px; font-weight:bold; color:var(--primary-color); text-decoration:underline;">${item.ticker}</td>`;
        html += `<td style="padding:10px;">${item.category}</td>`;
        html += `<td style="padding:10px; text-align:right; font-weight:600;">৳${price.toFixed(2)}</td>`;
        html += `<td style="padding:10px; text-align:right;">${formatPct(ch1d)}</td>`;
        html += `<td style="padding:10px; text-align:right;">${formatPct(ch3d)}</td>`;
        html += `<td style="padding:10px; text-align:right;">${formatPct(ch7d)}</td>`;
        html += `<td style="padding:10px; text-align:right;">${formatPct(ch15d)}</td>`;
        html += `<td style="padding:10px; text-align:right;">${formatPct(ch30d)}</td>`;
        if (isWatchList) {
            html += `<td style="padding:10px; text-align:center;">
                <button onclick="event.stopPropagation(); removeFromWatchList('${item.ticker}')" 
                        style="background:#ef4444; color:white; border:none; padding:4px 10px; border-radius:4px; cursor:pointer; font-size:11px;">✖</button>
            </td>`;
        }
        html += `</tr>`;
    });
    tbody.innerHTML = html;
}

// ==========================================
// 📋 ওয়াচলিস্ট ফাংশন
// ==========================================
function addToWatchList(ticker) {
    if (!ticker) return;
    const list = getWatchList();
    if (list.includes(ticker)) {
        if (typeof showToast === 'function') showToast(`${ticker} already in watchlist`, 'warning');
        return;
    }
    list.push(ticker);
    saveWatchList(list);
    if (typeof showToast === 'function') showToast(`✅ ${ticker} added to watchlist`, 'success');
    refreshWatchList();
}

function removeFromWatchList(ticker) {
    let list = getWatchList();
    list = list.filter(t => t !== ticker);
    saveWatchList(list);
    if (typeof showToast === 'function') showToast(`🗑️ ${ticker} removed from watchlist`, 'info');
    refreshWatchList();
}

async function refreshWatchList() {
    const list = getWatchList();
    const countEl = document.getElementById('watchlist-count');
    const badgeEl = document.getElementById('watchlist-count-badge');
    if (countEl) countEl.innerText = list.length;
    if (badgeEl) badgeEl.innerText = list.length;

    if (list.length === 0) {
        renderMarketTable([], 'watchlist-table-body', true);
        return;
    }

    const allData = await loadFullMarketData(false);
    if (!allData) return;

    const filtered = allData.filter(item => list.includes(item.ticker));
    const finalData = list.map(ticker => {
        const found = filtered.find(item => item.ticker === ticker);
        if (found) return found;
        return {
            ticker: ticker,
            category: 'N/A',
            currentPrice: 0,
            changes: { '1d': { changePct: 0 }, '3d': { changePct: 0 }, '7d': { changePct: 0 }, '15d': { changePct: 0 }, '30d': { changePct: 0 } }
        };
    });

    renderMarketTable(finalData, 'watchlist-table-body', true);
}

// ==========================================
// 🎯 ফুল ভিউ (সর্টিং সহ)
// ==========================================
let fullViewData = [];
let fullViewSortColumn = null;
let fullViewSortDirection = 'asc';

function renderFullView(data) {
    fullViewData = data;
    renderMarketTable(data, 'fullview-table-body', false);
    const countEl = document.getElementById('fullview-count');
    const badgeEl = document.getElementById('fullview-count-badge');
    if (countEl) countEl.innerText = data.length;
    if (badgeEl) badgeEl.innerText = data.length;
}

function sortFullView(columnIndex) {
    if (fullViewData.length === 0) return;
    
    if (fullViewSortColumn === columnIndex) {
        fullViewSortDirection = fullViewSortDirection === 'asc' ? 'desc' : 'asc';
    } else {
        fullViewSortColumn = columnIndex;
        fullViewSortDirection = 'asc';
    }

    const sorted = [...fullViewData].sort((a, b) => {
        let aVal, bVal;
        switch(columnIndex) {
            case 0: aVal = a.ticker; bVal = b.ticker; break;
            case 1: aVal = a.category; bVal = b.category; break;
            case 2: aVal = a.currentPrice; bVal = b.currentPrice; break;
            case 3: aVal = a.changes?.['1d']?.changePct || 0; bVal = b.changes?.['1d']?.changePct || 0; break;
            case 4: aVal = a.changes?.['3d']?.changePct || 0; bVal = b.changes?.['3d']?.changePct || 0; break;
            case 5: aVal = a.changes?.['7d']?.changePct || 0; bVal = b.changes?.['7d']?.changePct || 0; break;
            case 6: aVal = a.changes?.['15d']?.changePct || 0; bVal = b.changes?.['15d']?.changePct || 0; break;
            case 7: aVal = a.changes?.['30d']?.changePct || 0; bVal = b.changes?.['30d']?.changePct || 0; break;
            default: aVal = a.ticker; bVal = b.ticker;
        }
        if (typeof aVal === 'string') {
            return fullViewSortDirection === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
        }
        return fullViewSortDirection === 'asc' ? aVal - bVal : bVal - aVal;
    });

    renderMarketTable(sorted, 'fullview-table-body', false);
    updateSortIndicators(columnIndex);
}

function updateSortIndicators(columnIndex) {
    const headers = document.querySelectorAll('#fullview-table thead th');
    headers.forEach((th, idx) => {
        const existing = th.querySelector('.sort-arrow');
        if (existing) existing.remove();
        if (idx === columnIndex) {
            const arrow = document.createElement('span');
            arrow.className = 'sort-arrow';
            arrow.style.marginLeft = '5px';
            arrow.textContent = fullViewSortDirection === 'asc' ? ' ▲' : ' ▼';
            th.appendChild(arrow);
        }
    });
}

// ==========================================
// 🚀 Market Watch পেজ লোড
// ==========================================
async function loadMarketWatchPage() {
    try {
        // সাজেশন ইভেন্ট ইনিশিয়ালাইজ
        initWatchlistSearch();

        // ট্যাব দেখান (ডিফল্ট watchlist)
        switchMarketWatchTab('watchlist');

        // ওয়াচলিস্ট রিফ্রেশ
        await refreshWatchList();

        // ফুল ভিউ ডেটা লোড (পিছনে)
        const data = await loadFullMarketData(false);
        if (data) {
            renderFullView(data);
        }
    } catch (error) {
        console.error('Market watch page error:', error);
        if (typeof showToast === 'function') showToast('Error loading market watch', 'error');
    }
}

function switchMarketWatchTab(tab) {
    const containers = {
        watchlist: document.getElementById('market-watchlist-container'),
        fullview: document.getElementById('market-fullview-container')
    };
    const tabs = {
        watchlist: document.getElementById('market-tab-watchlist'),
        fullview: document.getElementById('market-tab-fullview')
    };

    Object.values(containers).forEach(c => { if (c) c.style.display = 'none'; });
    Object.values(tabs).forEach(t => {
        if (t) {
            t.style.background = 'transparent';
            t.style.color = 'var(--text-primary)';
            t.style.border = '1px solid var(--border-color)';
        }
    });

    if (tab === 'watchlist' && containers.watchlist) {
        containers.watchlist.style.display = 'block';
        if (tabs.watchlist) {
            tabs.watchlist.style.background = 'var(--primary-color)';
            tabs.watchlist.style.color = 'white';
            tabs.watchlist.style.border = 'none';
        }
        refreshWatchList();
    } else if (tab === 'fullview' && containers.fullview) {
        containers.fullview.style.display = 'block';
        if (tabs.fullview) {
            tabs.fullview.style.background = 'var(--primary-color)';
            tabs.fullview.style.color = 'white';
            tabs.fullview.style.border = 'none';
        }
        if (fullViewData.length > 0) renderFullView(fullViewData);
        else loadFullMarketData(false).then(data => { if (data) renderFullView(data); });
    }
}

// ==========================================
// 🔍 ওয়াচলিস্ট সার্চ ইভেন্ট (হালনাগাদ)
// ==========================================
function initWatchlistSearch() {
    const searchInput = document.getElementById('watchlist-search');
    const suggestionBox = document.getElementById('watchlist-suggestions');
    const addBtn = document.getElementById('watchlist-add-btn');

    if (!searchInput) {
        console.warn('⚠️ Watchlist search input not found');
        return;
    }
    if (!suggestionBox) {
        console.warn('⚠️ Watchlist suggestion box not found');
        return;
    }

    let stockList = [];
    if (typeof dseStocks !== 'undefined' && Array.isArray(dseStocks)) {
        stockList = dseStocks;
    } else if (window.dseStocks && Array.isArray(window.dseStocks)) {
        stockList = window.dseStocks;
    } else {
        console.error('❌ dseStocks not found anywhere!');
        if (typeof showToast === 'function') showToast('Stock list not loaded. Please refresh the page.', 'error');
        return;
    }

    // সাজেশন দেখানো
    const showSuggestions = function(query) {
        suggestionBox.innerHTML = '';
        suggestionBox.classList.add('hidden');
        
        const trimmed = query.trim().toUpperCase();
        if (!trimmed || trimmed.length === 0) {
            return;
        }

        const filtered = stockList
            .filter(stock => stock.toUpperCase().startsWith(trimmed))
            .slice(0, 10);

        if (filtered.length > 0) {
            suggestionBox.classList.remove('hidden');
            filtered.forEach(stock => {
                const div = document.createElement('div');
                div.classList.add('suggestion-item');
                div.innerText = stock;
                div.style.cssText = `
                    cursor: pointer;
                    padding: 10px 16px;
                    border-bottom: 1px solid var(--border-color, #e2e8f0);
                    transition: background 0.2s;
                    font-size: 14px;
                    color: var(--text-primary, #1e293b);
                `;
                div.onmouseover = function() { 
                    this.style.background = 'var(--hover-bg, #f1f5f9)'; 
                };
                div.onmouseout = function() { 
                    this.style.background = 'transparent'; 
                };
                div.onclick = function(e) {
                    e.stopPropagation();
                    const ticker = this.innerText.trim();
                    searchInput.value = ticker;
                    suggestionBox.classList.add('hidden');
                    addToWatchList(ticker);
                    searchInput.value = '';
                };
                suggestionBox.appendChild(div);
            });
        } else {
            suggestionBox.classList.add('hidden');
        }
    };

    const debounce = (fn, delay) => {
        let timer;
        return function(...args) {
            clearTimeout(timer);
            timer = setTimeout(() => fn.apply(this, args), delay);
        };
    };
    const debouncedSearch = debounce(showSuggestions, 250);

    searchInput.addEventListener('input', function() {
        const query = this.value;
        debouncedSearch(query);
    });

    searchInput.addEventListener('focus', function() {
        const query = this.value.trim();
        if (query) debouncedSearch(query);
    });

    searchInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            const query = this.value.trim().toUpperCase();
            const firstSuggestion = suggestionBox.querySelector('.suggestion-item');
            if (firstSuggestion) {
                firstSuggestion.click();
            } else if (query) {
                if (stockList.includes(query)) {
                    addToWatchList(query);
                    this.value = '';
                    suggestionBox.classList.add('hidden');
                } else {
                    if (typeof showToast === 'function') showToast('Share not found. Please select from suggestions.', 'warning');
                }
            }
        }
    });

    if (addBtn) {
        addBtn.addEventListener('click', function() {
            const query = searchInput.value.trim().toUpperCase();
            if (!query) {
                if (typeof showToast === 'function') showToast('Please type a share name first.', 'warning');
                return;
            }
            if (stockList.includes(query)) {
                addToWatchList(query);
                searchInput.value = '';
                suggestionBox.classList.add('hidden');
            } else {
                if (typeof showToast === 'function') showToast('Share not found. Please select from suggestions.', 'warning');
            }
        });
    }

    document.addEventListener('click', function(e) {
        if (!searchInput.contains(e.target) && !suggestionBox.contains(e.target)) {
            suggestionBox.classList.add('hidden');
        }
    });

    console.log('✅ Watchlist search initialized successfully');
}

// ==========================================
// 📌 গ্লোবালি এক্সপোজ
// ==========================================
window.loadMarketWatchPage = loadMarketWatchPage;
window.switchMarketWatchTab = switchMarketWatchTab;
window.addToWatchList = addToWatchList;
window.removeFromWatchList = removeFromWatchList;
window.refreshWatchList = refreshWatchList;
window.sortFullView = sortFullView;
window.loadMarketWatchPage = loadMarketWatchPage;
window.switchMarketWatchTab = switchMarketWatchTab;
window.addToWatchList = addToWatchList;
window.removeFromWatchList = removeFromWatchList;
window.refreshWatchList = refreshWatchList;
window.sortFullView = sortFullView;

console.log('✅ marketwatch.js loaded successfully');