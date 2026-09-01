// ==========================================
// 📤 trade-sell.js - Sell ফাংশনালিটি
//    portfolio.js থেকে ভাগ করা
//    Supabase + Firebase ডুয়াল রাইট
//    ব্যাচ সেল সাপোর্ট
//
//    ✅ ফিক্স v2:
//    - Single sell: confirm() এখন DB write-এর আগে
//    - Batch sell: confirm() আগে থেকেই ঠিক ছিল, user_id চেক যোগ
//    - CacheManager.remove wildcard → clearByPattern
// ==========================================

(function() {
    // DOM এলিমেন্ট
    const sellTickerInput = document.getElementById('sell-ticker');
    const sellSuggestionBox = document.getElementById('sell-suggestion-box');
    const sellHoldingsContainer = document.getElementById('sell-holdings-container');
    const selectedSellTickerText = document.getElementById('selected-sell-ticker');
    const sellPortfolioTableBody = document.getElementById('sell-portfolio-table-body');
    const btnExecuteSell = document.getElementById('btn-execute-sell');
    const sellDateInput = document.getElementById('sell-trade-date');
    const sellPortfolioSelect = document.getElementById('sell-portfolio-select');

    // স্টেট
    let currentActiveLots = [];
    let currentSellPortfolioId = 'main';
    let sellBatch = [];

    if (sellDateInput) sellDateInput.value = getBangladeshDateString();

    // ==========================================
    // ১. Sell সাজেশন
    // ==========================================
    if (sellTickerInput && sellSuggestionBox) {
        const debouncedSellSearch = debounce(function(query) {
            sellSuggestionBox.innerHTML = "";
            if (!query) { sellSuggestionBox.classList.add('hidden'); return; }
            const filtered = dseStocks.filter(stock => stock.startsWith(query));
            if (filtered.length > 0) {
                sellSuggestionBox.classList.remove('hidden');
                filtered.forEach(stock => {
                    const div = document.createElement('div');
                    div.classList.add('suggestion-item');
                    div.innerText = stock;
                    div.addEventListener('click', () => {
                        sellTickerInput.value = stock;
                        sellSuggestionBox.classList.add('hidden');
                        currentSellPortfolioId = sellPortfolioSelect ? sellPortfolioSelect.value : 'main';
                        fetchHoldingsForSell(stock, currentSellPortfolioId);
                    });
                    sellSuggestionBox.appendChild(div);
                });
            } else {
                sellSuggestionBox.classList.add('hidden');
            }
        }, 250);

        sellTickerInput.addEventListener('input', function() {
            const query = this.value.trim().toUpperCase();
            debouncedSellSearch(query);
        });

        document.addEventListener('click', function(e) {
            if (!sellTickerInput.contains(e.target) && !sellSuggestionBox.contains(e.target)) {
                sellSuggestionBox.classList.add('hidden');
            }
        });
    }

    // ==========================================
    // ২. Sell পোর্টফোলিও সিলেক্টর
    // ==========================================
    if (sellPortfolioSelect) {
        sellPortfolioSelect.addEventListener('change', function() {
            currentSellPortfolioId = this.value;
            const ticker = sellTickerInput ? sellTickerInput.value.trim().toUpperCase() : '';
            if (ticker) {
                fetchHoldingsForSell(ticker, currentSellPortfolioId);
            }
        });
    }

    // ==========================================
    // ৩. হোল্ডিংস ফেচ (Supabase + Firebase)
    // ==========================================
    async function fetchHoldingsForSell(ticker, portfolioId = null) {
        const user = auth && auth.currentUser ? auth.currentUser : null;
        if (!user) return;
        if (selectedSellTickerText) selectedSellTickerText.innerText = ticker;
        if (sellPortfolioTableBody) sellPortfolioTableBody.innerHTML = `<tr><td colspan='4'>Loading lots...</td></tr>`;
        if (sellHoldingsContainer) sellHoldingsContainer.classList.remove('hidden');

        try {
            let buyLots = [];
            let totalSoldBefore = 0;

            // ---------- Supabase ----------
            if (typeof supabase !== 'undefined' && supabase) {
                try {
                    // Fetch all lots for this user/ticker, then normalize the
                    // legacy NULL portfolio_id rows in JavaScript. Older
                    // records used NULL for the Main portfolio.
                    const { data: pData, error: pError } = await supabase
                        .from('portfolios')
                        .select('*')
                        .eq('user_id', user.uid)
                        .eq('share_name', ticker);
                    if (pError) throw pError;

                    const normalizedPortfolioId = portfolioId || 'main';
                    const filteredPData = (pData || []).filter(doc => {
                        const pid = String(doc.portfolio_id ?? '').trim().toLowerCase();
                        if (normalizedPortfolioId === 'grand') return true;
                        if (normalizedPortfolioId === 'main') return pid === '' || pid === 'main';
                        return pid === String(normalizedPortfolioId).trim().toLowerCase();
                    });

                    buyLots = filteredPData.map(doc => ({
                        docId: doc.id,
                        ...doc,
                        portfolio_id: doc.portfolio_id || 'main',
                        quantity: Number(doc.quantity) || 0,
                        buy_price: Number(doc.buy_price) || 0,
                        share_name: String(doc.share_name || '').trim().toUpperCase()
                    }));

                    const { data: sData, error: sError } = await supabase
                        .from('sales_history')
                        .select('*')
                        .eq('user_id', user.uid)
                        .eq('share_name', ticker);
                    if (sError) throw sError;

                    const filteredSData = (sData || []).filter(item => {
                        const pid = String(item.portfolio_id ?? '').trim().toLowerCase();
                        if (normalizedPortfolioId === 'grand') return true;
                        if (normalizedPortfolioId === 'main') return pid === '' || pid === 'main';
                        return pid === String(normalizedPortfolioId).trim().toLowerCase();
                    });

                    totalSoldBefore = filteredSData.reduce(
                        (sum, item) => sum + (Number(item.quantity_sold) || 0), 0
                    );
                } catch (e) {
                    console.warn('Supabase fetch failed, trying Firebase...', e);
                }
            }

            // ---------- Firebase ফ্যালব্যাক ----------
            if (buyLots.length === 0 && typeof db !== 'undefined') {
                try {
                    let pQuery = db.collection('portfolios')
                        .where('userId', '==', user.uid)
                        .where('shareName', '==', ticker);
                    const buySnapshot = await pQuery.get();
                    buySnapshot.forEach(doc => {
                        const data = doc.data();
                        const pid = String(data.portfolioId ?? '').trim().toLowerCase();
                        const wanted = String(portfolioId || 'main').trim().toLowerCase();
                        if (wanted !== 'grand' && !(wanted === 'main' ? (pid === '' || pid === 'main') : pid === wanted)) return;
                        buyLots.push({
                            docId: doc.id,
                            id: doc.id,
                            quantity: data.quantity,
                            buyPrice: data.buyPrice,
                            buy_price: data.buyPrice,
                            date: data.date,
                            commission: data.commission || 0,
                            commission_percent: data.commissionPercent || 0
                        });
                    });

                    let sQuery = db.collection('sales_history')
                        .where('userId', '==', user.uid)
                        .where('shareName', '==', ticker);
                    const sellSnapshot = await sQuery.get();
                    sellSnapshot.forEach(doc => {
                        const data = doc.data();
                        const pid = String(data.portfolioId ?? '').trim().toLowerCase();
                        const wanted = String(portfolioId || 'main').trim().toLowerCase();
                        if (wanted === 'grand' || (wanted === 'main' ? (pid === '' || pid === 'main') : pid === wanted)) {
                            totalSoldBefore += (Number(data.quantitySold) || 0);
                        }
                    });
                } catch (e) {
                    console.warn('Firebase fetch failed', e);
                }
            }

            // সাজানো (FIFO — পুরনো লট আগে)
            buyLots.sort((a, b) => {
                const timeA = a.date ? safeParseDate(a.date) : 0;
                const timeB = b.date ? safeParseDate(b.date) : 0;
                return (timeA ? timeA.getTime() : 0) - (timeB ? timeB.getTime() : 0);
            });

            currentActiveLots = [];
            if (sellPortfolioTableBody) sellPortfolioTableBody.innerHTML = "";

            buyLots.forEach(lot => {
                let availableQty = Number(lot.quantity) || 0;
                if (totalSoldBefore > 0) {
                    if (totalSoldBefore >= availableQty) {
                        totalSoldBefore -= availableQty;
                        availableQty = 0;
                    } else {
                        availableQty -= totalSoldBefore;
                        totalSoldBefore = 0;
                    }
                }
                if (availableQty > 0) {
                    const buyPrice = lot.buyPrice || lot.buy_price || 0;
                    const docId = lot.docId || lot.id;
                    currentActiveLots.push({ docId: docId, buyPrice: buyPrice, availableQty: availableQty, portfolioId: lot.portfolio_id || 'main', shareName: ticker });
                    if (sellPortfolioTableBody) {
                        const tr = document.createElement('tr');
                        tr.innerHTML = `
                            <td>৳${buyPrice.toFixed(2)}</td>
                            <td style="color:#10b981; font-weight:bold;">${availableQty}</td>
                            <td>${lot.date ? safeParseDate(lot.date)?.toLocaleDateString() || 'N/A' : 'N/A'}</td>
                            <td>
                                <div class="sell-input-group">
                                    <input type="number" id="input-sell-qty-${docId}" placeholder="Qty" min="1" max="${availableQty}">
                                    <input type="number" id="input-sell-price-${docId}" placeholder="Price">
                                </div>
                                <button onclick="addToSellBatch('${docId}', '${ticker}', ${buyPrice}, ${availableQty})"
                                        style="margin-top: 5px; background: #6366f1; color: white; border: none; padding: 4px 12px; border-radius: 4px; cursor: pointer; font-size: 11px; width: 100%;">
                                    ➕ Add to Batch
                                </button>
                            </td>
                        `;
                        sellPortfolioTableBody.appendChild(tr);
                    }
                }
            });

            if (currentActiveLots.length === 0 && sellPortfolioTableBody) {
                sellPortfolioTableBody.innerHTML = `<tr><td colspan='4'>No sellable shares available.</td></tr>`;
            }
        } catch (error) {
            console.error(error);
            if (sellPortfolioTableBody) sellPortfolioTableBody.innerHTML = `<tr><td colspan='4'>Error loading data!</td></tr>`;
        }
    }

    // ==========================================
    // ৪. Sell Execute - ডুয়াল রাইট
    //    ✅ ফিক্স: confirm() এখন saveSalesToBoth()-এর আগে
    // ==========================================
    if (btnExecuteSell) {
        const newSellBtn = btnExecuteSell.cloneNode(true);
        btnExecuteSell.parentNode.replaceChild(newSellBtn, btnExecuteSell);
        newSellBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            if (newSellBtn.hasAttribute('data-processing')) {
                if (typeof showToast === 'function') showToast('Previous transaction still processing...', 'warning');
                return;
            }
            const user = auth && auth.currentUser ? auth.currentUser : null;
            const ticker = sellTickerInput ? sellTickerInput.value.trim().toUpperCase() : '';
            const portfolioId = sellPortfolioSelect ? sellPortfolioSelect.value : 'main';

            if (!user) {
                if (typeof showToast === 'function') showToast("Please login first", "error");
                return;
            }
            if (!ticker) {
                if (typeof showToast === 'function') showToast("Please select a share", "warning");
                return;
            }
            if (currentActiveLots.length === 0) {
                if (typeof showToast === 'function') showToast("No sellable lots available!", "warning");
                return;
            }

            let selectedDate = sellDateInput ? sellDateInput.value : getBangladeshDateString();
            if (!selectedDate) selectedDate = getBangladeshDateString();
            const transactionDate = getUTCFromLocalDate(selectedDate);
            if (isNaN(transactionDate.getTime())) {
                if (typeof showToast === 'function') showToast("Invalid date!", "error");
                return;
            }

            // ==========================================
            // ✅ ধাপ ১: আগে সব ইনপুট ভ্যালিডেট ও সামারি বানান
            //    DB-তে কিছু লেখার আগেই confirm() দেখান
            // ==========================================
            let pendingSales = [];
            let totalSoldQty = 0;
            let totalSellValue = 0;
            let totalCommissionAmount = 0;
            const commissionPercent = commissionManager.getPercent();

            for (let lot of currentActiveLots) {
                const qtyField = document.getElementById(`input-sell-qty-${lot.docId}`);
                const priceField = document.getElementById(`input-sell-price-${lot.docId}`);
                if (!qtyField || !priceField) continue;

                const sellQty = Number(qtyField.value) || 0;
                const sellPrice = Number(priceField.value) || 0;

                if (sellQty <= 0) continue; // এই লট skip

                if (sellQty > lot.availableQty) {
                    if (typeof showToast === 'function') showToast(`Maximum ${lot.availableQty} shares available for this lot.`, "warning");
                    return;
                }
                if (sellPrice <= 0) {
                    if (typeof showToast === 'function') showToast("Please enter a valid sell price.", "warning");
                    return;
                }

                const saleValue = sellQty * sellPrice;
                const commission = commissionManager.calculateCommission(saleValue);
                totalSellValue += saleValue;
                totalCommissionAmount += commission;
                totalSoldQty += sellQty;

                pendingSales.push({
                    shareName: ticker,
                    quantitySold: sellQty,
                    buyPrice: lot.buyPrice,
                    sellPrice: sellPrice,
                    profitOrLoss: (sellPrice - lot.buyPrice) * sellQty,
                    commission: commission,
                    commissionPercent: commissionPercent,
                    netReceived: saleValue - commission,
                    date: transactionDate.toISOString().split('T')[0],
                    portfolioId: lot.portfolioId || portfolioId || 'main'
                });
            }

            if (pendingSales.length === 0 || totalSoldQty === 0) {
                if (typeof showToast === 'function') showToast("Please enter quantity to sell.", "warning");
                return;
            }

            // ==========================================
            // ✅ ধাপ ২: এখন confirm() দেখান — DB write-এর আগে
            // ==========================================
            const netReceivable = totalSellValue - totalCommissionAmount;
            const confirmBody = `
                <div class="confirm-summary-grid">
                    <span>Stock</span><strong>${ticker}</strong>
                    <span>Quantity</span><strong>${totalSoldQty}</strong>
                    <span>Gross value</span><strong>৳${totalSellValue.toFixed(2)}</strong>
                    <span>Commission</span><strong>৳${totalCommissionAmount.toFixed(2)} (${commissionPercent}%)</strong>
                    <span class="total-label">Net receivable</span><strong class="total-value">৳${netReceivable.toFixed(2)}</strong>
                </div>`;
            if (typeof window.showConfirmModal === 'function') {
                const confirmed = await window.showConfirmModal({
                    title: 'Confirm Sell',
                    icon: '💸',
                    body: confirmBody,
                    confirmText: 'Confirm Sell'
                });
                if (!confirmed) return;
            } else if (!window.confirm(`Sell ${totalSoldQty} ${ticker}?`)) {
                return;
            } // Cancel করলে কিছুই DB-তে যায় না

            // ==========================================
            // ✅ ধাপ ৩: ইউজার confirm করেছে, এখন DB-তে লেখো
            // ==========================================
            newSellBtn.setAttribute('data-processing', 'true');
            newSellBtn.disabled = true;
            newSellBtn.style.opacity = '0.6';

            try {
                for (const saleData of pendingSales) {
                    const result = await saveSalesToBoth(user.uid, saleData);
                    if (!result.supabaseSuccess) {
                        throw new Error(`Supabase sale save failed for ${saleData.shareName}: ${result.supabaseError || 'Unknown Supabase error'}`);
                    }
                    if (!result.firebaseSuccess && typeof showToast === 'function') {
                        showToast('⚠️ Sale saved to Supabase, but Firebase mirror failed.', 'warning');
                    }
                }

                // Force a fresh calculation from the database after the write.
                // The Portfolio table must show Bought - Sold = Remaining.
                resetUnifiedCache();
                const verified = typeof unifiedEngine !== 'undefined'
                    ? await unifiedEngine.calculate(user.uid, portfolioId === 'grand' ? null : portfolioId, true)
                    : null;
                const verifiedStock = verified?.stockDetails?.find(s => String(s.ticker).trim().toUpperCase() === ticker);
                console.log(`✅ Sell verified: ${ticker} sold ${totalSoldQty}; remaining=${verifiedStock?.totalQty ?? 0}`);

                if (typeof window.invalidateAppDataCache === 'function') {
                    window.invalidateAppDataCache('sale saved');
                }

                // ✅ ফিক্স: wildcard → clearByPattern
                resetUnifiedCache();
                resetUnifiedPriceCache();
                CacheManager.remove(`price_${ticker}`);
                CacheManager.remove(`price_detail_${ticker}`);
                CacheManager.clearByPattern(`chart_${ticker}`);

                if (typeof showToast === 'function') showToast(`✅ ${totalSoldQty} shares of ${ticker} sold successfully!`, "success");

                // UI রিসেট
                if (sellTickerInput) sellTickerInput.value = "";
                if (sellHoldingsContainer) sellHoldingsContainer.classList.add('hidden');
                if (sellDateInput) sellDateInput.value = getTodayDate();
                currentActiveLots = [];
                if (sellSuggestionBox) sellSuggestionBox.classList.add('hidden');

                if (auth && auth.currentUser) {
                    if (typeof loadDashboardData === 'function') loadDashboardData(portfolioId, true);
                    if (typeof loadPortfolioAnalysisTable === 'function') loadPortfolioAnalysisTable(user.uid, portfolioId, true);
                    if (typeof loadUnifiedStockTable === 'function') loadUnifiedStockTable(user.uid);
                }
            } catch (error) {
                console.error('Sell execute error:', error);
                if (typeof showToast === 'function') showToast("Sell failed! Please try again.", "error");
            } finally {
                newSellBtn.removeAttribute('data-processing');
                newSellBtn.disabled = false;
                newSellBtn.style.opacity = '1';
            }
        });
    }

    // ==========================================
    // ৫. ব্যাচ সেল ফাংশন
    // ==========================================

    // ব্যাচে যোগ
    window.addToSellBatch = function(lotId, ticker, buyPrice, availableQty) {
        const qtyInput = document.getElementById(`input-sell-qty-${lotId}`);
        const priceInput = document.getElementById(`input-sell-price-${lotId}`);
        if (!qtyInput || !priceInput) return;

        const sellQty = Number(qtyInput.value) || 0;
        const sellPrice = Number(priceInput.value) || 0;

        if (sellQty <= 0 || sellPrice <= 0) {
            if (typeof showToast === 'function') showToast('Please enter valid quantity and price.', 'warning');
            return;
        }
        if (sellQty > availableQty) {
            if (typeof showToast === 'function') showToast(`Maximum ${availableQty} shares available.`, 'warning');
            return;
        }

        const entry = {
            lotId: lotId,
            ticker: ticker,
            buyPrice: buyPrice,
            sellQty: sellQty,
            sellPrice: sellPrice,
            totalValue: sellQty * sellPrice,
            portfolioId: (currentActiveLots.find(l => String(l.docId) === String(lotId))?.portfolioId) || portfolioId || 'main'
        };
        sellBatch.push(entry);
        renderBatchTable();

        qtyInput.value = '';
        priceInput.value = '';
        if (typeof showToast === 'function') showToast(`✅ ${ticker} added to batch (${sellQty} shares)`, 'success');
    };

    // ব্যাচ থেকে রিমুভ
    window.removeFromBatch = function(index) {
        sellBatch.splice(index, 1);
        renderBatchTable();
        if (typeof showToast === 'function') showToast('🗑️ Removed from batch', 'info');
    };

    // ব্যাচ টেবিল রেন্ডার
    function renderBatchTable() {
        const tbody = document.getElementById('batch-sell-body');
        if (!tbody) return;

        if (sellBatch.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 20px; color: var(--text-muted);">No items added yet. Add from holdings below.</td></tr>`;
            return;
        }

        let html = '';
        let grandTotal = 0;
        sellBatch.forEach((item, index) => {
            grandTotal += item.totalValue;
            html += `<tr>
                <td style="padding: 8px; font-weight: bold;">${item.ticker}</td>
                <td style="padding: 8px;">৳${item.buyPrice.toFixed(2)}</td>
                <td style="padding: 8px;">${item.sellQty}</td>
                <td style="padding: 8px;">৳${item.sellPrice.toFixed(2)}</td>
                <td style="padding: 8px;">৳${item.totalValue.toFixed(2)}</td>
                <td style="padding: 8px;">
                    <button onclick="removeFromBatch(${index})" style="background: #ef4444; color: white; border: none; padding: 4px 10px; border-radius: 4px; cursor: pointer;">✖</button>
                </td>
            </tr>`;
        });

        html += `<tr style="font-weight: bold; background: var(--bg-tertiary);">
            <td colspan="4" style="padding: 8px; text-align: right;">Total Sell Value</td>
            <td style="padding: 8px;">৳${grandTotal.toFixed(2)}</td>
            <td style="padding: 8px;"></td>
        </tr>`;
        tbody.innerHTML = html;
    }

    // ব্যাচ সেল এক্সিকিউট
    // ✅ batch sell-এ confirm() আগে থেকেই ঠিক ছিল
    window.executeBatchSell = async function() {
        if (sellBatch.length === 0) {
            if (typeof showToast === 'function') showToast('No items in batch. Add some first.', 'warning');
            return;
        }

        const user = auth && auth.currentUser ? auth.currentUser : null;
        if (!user) {
            if (typeof showToast === 'function') showToast('Please login first.', 'error');
            return;
        }

        const portfolioId = sellPortfolioSelect ? sellPortfolioSelect.value : 'main';

        const totalQty = sellBatch.reduce((sum, item) => sum + item.sellQty, 0);
        const totalValue = sellBatch.reduce((sum, item) => sum + item.totalValue, 0);
        const commissionPercent = commissionManager.getPercent();
        const commissionAmount = commissionManager.calculateCommission(totalValue);
        const netReceivable = totalValue - commissionAmount;

        // ✅ confirm() আগেই আছে এখানে — DB write-এর আগে
        let confirmMsg = `📊 Batch Sell Summary:\n━━━━━━━━━━━━━━━━━━━━\n📦 Total Shares: ${totalQty}\n💰 Total Sell Value: ৳${totalValue.toFixed(2)}`;
        if (commissionPercent > 0) {
            confirmMsg += `\n💸 Commission (${commissionPercent}%): ৳${commissionAmount.toFixed(2)}`;
            confirmMsg += `\n💵 Net Receivable: ৳${netReceivable.toFixed(2)}`;
        }
        confirmMsg += `\n━━━━━━━━━━━━━━━━━━━━\n🔄 ${sellBatch.length} entry(s) will be processed.`;
        if (!confirm(confirmMsg)) return;

        const btn = document.getElementById('btn-execute-batch-sell');
        if (btn) {
            btn.disabled = true;
            btn.innerText = '⏳ Processing...';
            btn.style.opacity = '0.7';
        }

        try {
            let selectedDate = document.getElementById('sell-trade-date')?.value || getBangladeshDateString();
            if (!selectedDate) selectedDate = getBangladeshDateString();
            const transactionDate = getUTCFromLocalDate(selectedDate);
            if (isNaN(transactionDate.getTime())) {
                if (typeof showToast === 'function') showToast('Invalid date!', 'error');
                return;
            }

            let processedCount = 0;
            for (const item of sellBatch) {
                const saleValue = item.sellQty * item.sellPrice;
                const commission = commissionManager.calculateCommission(saleValue);

                const result = await saveSalesToBoth(user.uid, {
                    shareName: String(item.ticker || '').trim().toUpperCase(),
                    quantitySold: Number(item.sellQty) || 0,
                    buyPrice: Number(item.buyPrice) || 0,
                    sellPrice: Number(item.sellPrice) || 0,
                    profitOrLoss: (Number(item.sellPrice) - Number(item.buyPrice)) * (Number(item.sellQty) || 0),
                    commission: commission,
                    commissionPercent: commissionManager.getPercent(),
                    netReceived: saleValue - commission,
                    date: transactionDate.toISOString().split('T')[0],
                    portfolioId: item.portfolioId || portfolioId || 'main'
                });
                if (!result.supabaseSuccess) throw new Error(`Supabase batch sale save failed for ${item.ticker}: ${result.supabaseError || 'Unknown Supabase error'}`);
                processedCount++;
            }

            if (typeof showToast === 'function') showToast(`✅ ${processedCount} sale(s) processed successfully!`, 'success');

            sellBatch = [];
            renderBatchTable();

            // ✅ ফিক্স: wildcard → clearByPattern
            resetUnifiedCache();
            resetUnifiedPriceCache();

            if (typeof loadDashboardData === 'function') loadDashboardData(portfolioId, true);
            if (typeof loadPortfolioAnalysisTable === 'function') loadPortfolioAnalysisTable(user.uid, portfolioId, true);
            if (typeof loadUnifiedStockTable === 'function') loadUnifiedStockTable(user.uid);

            // UI রিসেট
            const sellTicker = document.getElementById('sell-ticker');
            if (sellTicker) sellTicker.value = '';
            const sellContainer = document.getElementById('sell-holdings-container');
            if (sellContainer) sellContainer.classList.add('hidden');
            const sellDateEl = document.getElementById('sell-trade-date');
            if (sellDateEl) sellDateEl.value = getTodayDate();

        } catch (error) {
            console.error('Batch sell error:', error);
            if (typeof showToast === 'function') showToast('❌ Failed to execute batch sales.', 'error');
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerText = '✅ Execute All Sales';
                btn.style.opacity = '1';
            }
        }
    };

    // ব্যাচ ক্লিয়ার
    window.clearBatch = function() {
        if (sellBatch.length === 0) return;
        if (!confirm('Clear all items from batch?')) return;
        sellBatch = [];
        renderBatchTable();
        if (typeof showToast === 'function') showToast('Batch cleared', 'info');
    };

    // ==========================================
    // ৬. Sell ট্যাব ইভেন্ট
    // ==========================================
    function initSellTabs() {
        const tabs = document.querySelectorAll('.sell-tab-btn');
        const panels = {
            sell: document.getElementById('sell-tab-content'),
            history: document.getElementById('sell-history-tab-content')
        };
        if (!tabs.length || !panels.sell || !panels.history) return;

        tabs.forEach(tab => {
            tab.addEventListener('click', function() {
                const target = this.getAttribute('data-tab');
                tabs.forEach(t => {
                    t.classList.remove('active');
                    t.style.background = 'transparent';
                    t.style.color = 'var(--text-primary)';
                    t.style.border = '1px solid var(--border-color)';
                    t.style.borderBottom = 'none';
                });
                this.classList.add('active');
                this.style.background = 'var(--primary-color)';
                this.style.color = 'white';
                this.style.border = 'none';

                Object.values(panels).forEach(p => {
                    if (p) p.style.display = 'none';
                });

                if (target === 'sell') {
                    if (panels.sell) panels.sell.style.display = 'block';
                } else if (target === 'history') {
                    if (panels.history) {
                        panels.history.style.display = 'block';
                        const searchInput = document.getElementById('sell-history-search');
                        if (searchInput) {
                            searchInput.value = '';
                            loadSellHistory('');
                        }
                    }
                }
            });
        });
    }

    // ==========================================
    // ৭. Sell History
    // ==========================================
    async function loadSellHistory(ticker, portfolioId = null) {
        const user = auth && auth.currentUser ? auth.currentUser : null;
        if (!user) {
            if (typeof showToast === 'function') showToast('Please login first', 'error');
            return;
        }

        const tbody = document.getElementById('sell-history-body');
        const footer = document.getElementById('sell-history-footer');
        if (!tbody) return;

        const avgEl = document.getElementById('sell-history-avg-price');
        const highEl = document.getElementById('sell-history-high-price');
        const lowEl = document.getElementById('sell-history-low-price');

        if (!ticker || ticker.trim() === '') {
            tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 30px; color: var(--text-muted);">Search a share to see sell history.</td></tr>`;
            if (footer) footer.style.display = 'none';
            if (avgEl) avgEl.innerHTML = '📊 Avg: -';
            if (highEl) highEl.innerHTML = '📈 High: -';
            if (lowEl) lowEl.innerHTML = '📉 Low: -';
            return;
        }

        ticker = ticker.trim().toUpperCase();
        tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 20px;">Loading...</td></tr>`;
        if (footer) footer.style.display = 'table-footer-group';

        try {
            let sellData = [];

            // Supabase
            if (typeof supabase !== 'undefined' && supabase) {
                try {
                    const { data, error } = await supabase.from('sales_history')
                        .select('*')
                        .eq('user_id', user.uid)
                        .eq('share_name', ticker)
                        .order('date', { ascending: false });
                    if (error) throw error;
                    const wanted = String(portfolioId || 'main').trim().toLowerCase();
                    sellData = (data || []).filter(item => {
                        const pid = String(item.portfolio_id ?? '').trim().toLowerCase();
                        return wanted === 'grand'
                            || (wanted === 'main' ? (pid === '' || pid === 'main') : pid === wanted);
                    });
                } catch (e) {
                    console.warn('Supabase sell history fetch failed, trying Firebase...', e);
                }
            }

            // Firebase ফ্যালব্যাক
            if (sellData.length === 0 && typeof db !== 'undefined') {
                try {
                    let sQuery = db.collection('sales_history')
                        .where('userId', '==', user.uid)
                        .where('shareName', '==', ticker)
                        .orderBy('date', 'desc');
                    if (portfolioId) sQuery = sQuery.where('portfolioId', '==', portfolioId);
                    const sellSnapshot = await sQuery.get();
                    sellSnapshot.forEach(doc => {
                        const data = doc.data();
                        const parsedDate = safeParseDate(data.date);
                        const parsedCreatedAt = safeParseDate(data.createdAt);
                        sellData.push({
                            id: doc.id,
                            share_name: data.shareName,
                            quantity_sold: data.quantitySold || 0,
                            sell_price: data.sellPrice || 0,
                            buy_price: data.buyPrice || 0,
                            profit_or_loss: data.profitOrLoss || 0,
                            date: parsedDate ? parsedDate.toISOString() : null,
                            created_at: parsedCreatedAt ? parsedCreatedAt.toISOString() : null
                        });
                    });
                } catch (e) {
                    console.warn('Firebase sell history fetch failed', e);
                }
            }

            if (sellData.length === 0) {
                tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 30px; color: var(--text-muted);">No sell history found for ${ticker}.</td></tr>`;
                if (footer) footer.style.display = 'none';
                if (avgEl) avgEl.innerHTML = '📊 Avg: -';
                if (highEl) highEl.innerHTML = '📈 High: -';
                if (lowEl) lowEl.innerHTML = '📉 Low: -';
                return;
            }

            let html = '';
            let totalSellValue = 0;
            let totalSellQty = 0;
            let maxPrice = 0;
            let minPrice = Infinity;

            sellData.forEach(item => {
                const date = safeParseDate(item.date) || new Date();
                const dateStr = date.toLocaleDateString('bn-BD');
                const sellQty = item.quantity_sold || 0;
                const sellPrice = item.sell_price || 0;
                const buyPrice = item.buy_price || 0;
                const totalValue = sellQty * sellPrice;
                const profit = item.profit_or_loss || (sellPrice - buyPrice) * sellQty;
                const profitClass = profit >= 0 ? 'up' : 'error';

                if (sellPrice > 0) {
                    if (sellPrice > maxPrice) maxPrice = sellPrice;
                    if (sellPrice < minPrice) minPrice = sellPrice;
                }

                totalSellValue += totalValue;
                totalSellQty += sellQty;

                html += `<tr>
                    <td style="padding: 8px;">${dateStr}</td>
                    <td style="padding: 8px; font-weight: bold;">${item.share_name}</td>
                    <td style="padding: 8px;">${sellQty}</td>
                    <td style="padding: 8px;">৳${sellPrice.toFixed(2)}</td>
                    <td style="padding: 8px;">৳${buyPrice.toFixed(2)}</td>
                    <td style="padding: 8px;">৳${totalValue.toFixed(2)}</td>
                    <td style="padding: 8px;" class="${profitClass}">${profit >= 0 ? '+' : ''}৳${profit.toFixed(2)}</td>
                </tr>`;
            });

            tbody.innerHTML = html;

            const avgPrice = totalSellQty > 0 ? totalSellValue / totalSellQty : 0;
            if (avgEl) avgEl.innerHTML = `📊 Avg: ৳${avgPrice.toFixed(2)} (Qty: ${totalSellQty})`;
            if (highEl) highEl.innerHTML = `📈 High: ৳${maxPrice > 0 ? maxPrice.toFixed(2) : '-'}`;
            if (lowEl) lowEl.innerHTML = `📉 Low: ৳${minPrice !== Infinity ? minPrice.toFixed(2) : '-'}`;

            if (footer) footer.style.display = 'table-footer-group';
        } catch (error) {
            console.error('Sell history error:', error);
            tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 20px; color: red;">Error loading data. ${error.message}</td></tr>`;
            if (footer) footer.style.display = 'none';
        }
    }

    // ==========================================
    // ৮. Sell History সার্চ
    // ==========================================
    function initSellHistorySearch() {
        const searchInput = document.getElementById('sell-history-search');
        const suggestionBox = document.getElementById('sell-history-suggestion-box');
        if (!searchInput || !suggestionBox) return;

        const debouncedSellHist = debounce(function(query) {
            suggestionBox.innerHTML = '';
            suggestionBox.classList.add('hidden');
            if (!query) {
                loadSellHistory('');
                return;
            }
            const filtered = dseStocks.filter(stock => stock.startsWith(query));
            if (filtered.length > 0) {
                suggestionBox.classList.remove('hidden');
                const limited = filtered.slice(0, 15);
                limited.forEach(stock => {
                    const div = document.createElement('div');
                    div.classList.add('suggestion-item');
                    div.innerText = stock;
                    div.addEventListener('click', function() {
                        searchInput.value = stock;
                        suggestionBox.classList.add('hidden');
                        const portfolioId = document.getElementById('sell-portfolio-select')?.value || 'main';
                        loadSellHistory(stock, portfolioId);
                    });
                    suggestionBox.appendChild(div);
                });
            } else {
                suggestionBox.classList.add('hidden');
                loadSellHistory('');
            }
        }, 300);

        searchInput.addEventListener('input', function() {
            const query = this.value.trim().toUpperCase();
            debouncedSellHist(query);
        });

        searchInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                const ticker = this.value.trim().toUpperCase();
                suggestionBox.classList.add('hidden');
                if (ticker && dseStocks.includes(ticker)) {
                    const portfolioId = document.getElementById('sell-portfolio-select')?.value || 'main';
                    loadSellHistory(ticker, portfolioId);
                } else {
                    loadSellHistory('');
                }
            }
        });
    }

    // ==========================================
    // ৯. গ্লোবালি এক্সপোজ
    // ==========================================
    window.loadSellHistory = loadSellHistory;
    window.initSellHistorySearch = initSellHistorySearch;
    window.initSellTabs = initSellTabs;
    window.fetchHoldingsForSell = fetchHoldingsForSell;
    window.sellBatch = sellBatch;
    window.renderBatchTable = renderBatchTable;

    // DOMContentLoaded
    document.addEventListener('DOMContentLoaded', function() {
        if (typeof initSellTabs === 'function') initSellTabs();
        if (typeof initSellHistorySearch === 'function') initSellHistorySearch();

        const executeBtn = document.getElementById('btn-execute-batch-sell');
        if (executeBtn) {
            executeBtn.addEventListener('click', window.executeBatchSell);
        }
        const clearBtn = document.getElementById('btn-clear-batch');
        if (clearBtn) {
            clearBtn.addEventListener('click', window.clearBatch);
        }
    });

    console.log('✅ trade-sell.js v2 loaded (confirm-before-save, cache fix)');
})();
