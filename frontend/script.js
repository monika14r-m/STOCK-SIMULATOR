// ----- Config -----
let INITIAL_CASH = 100000;
const COMMISSION_PER_TRADE = 10;
const SLIPPAGE_PCT = 0.001;

const MARKET_OPEN_HOUR = 9;
const MARKET_OPEN_MINUTE = 30;
const MARKET_CLOSE_HOUR = 16;
const MARKET_CLOSE_MINUTE = 0;

// ----- Data -----
const stocks = [
    { symbol: "AAPL", name: "Apple Inc.", price: 180, prevPrice: 180 },
    { symbol: "GOOG", name: "Alphabet Inc.", price: 135, prevPrice: 135 },
    { symbol: "TSLA", name: "Tesla Inc.", price: 220, prevPrice: 220 },
    { symbol: "AMZN", name: "Amazon.com Inc.", price: 150, prevPrice: 150 },
    { symbol: "MSFT", name: "Microsoft Corp.", price: 310, prevPrice: 310 }
];

let cash = INITIAL_CASH;
let portfolio = {};   // {symbol: {qty, avgPrice}}
let history = [];      // trade records
let selectedSymbol = null;

let mode = "balanced"; // conservative | balanced | aggressive
let plView = "amount"; // amount | percent
let tradesTodayCount = 0;
let winsCount = 0;

// ----- Helpers -----
function formatMoney(v) {
    return "₹" + v.toFixed(2);
}

function formatPercent(v) {
    return v.toFixed(2) + "%";
}

function isMarketOpen() {
    const now = new Date();
    const h = now.getHours();
    const m = now.getMinutes();
    const afterOpen =
        h > MARKET_OPEN_HOUR ||
        (h === MARKET_OPEN_HOUR && m >= MARKET_OPEN_MINUTE);
    const beforeClose =
        h < MARKET_CLOSE_HOUR ||
        (h === MARKET_CLOSE_HOUR && m < MARKET_CLOSE_MINUTE);
    return afterOpen && beforeClose;
}

function updateMarketStatus() {
    const chip = document.getElementById("marketStatusChip");
    if (!chip) return;
    const open = isMarketOpen();
    chip.textContent = open ? "OPEN" : "CLOSED";
    chip.style.background = open
        ? "rgba(34, 197, 94, 0.18)"
        : "rgba(248, 113, 113, 0.2)";
    chip.style.color = open ? "#22c55e" : "#fb7185";
}

function updateStockPrices() {
    stocks.forEach(stock => {
        stock.prevPrice = stock.price;
        const changePct = (Math.random() * 2 - 1) * 0.02; // -2% to +2%
        const newPrice = stock.price * (1 + changePct);
        stock.price = Math.max(1, newPrice);
    });
}

// ----- UI: watchlist -----
function renderStocksTable(filter = "") {
    const tbody = document.getElementById("stocksBody");
    tbody.innerHTML = "";

    const lowerFilter = filter.trim().toLowerCase();

    stocks
        .filter(s => {
            if (!lowerFilter) return true;
            return (
                s.symbol.toLowerCase().includes(lowerFilter) ||
                s.name.toLowerCase().includes(lowerFilter)
            );
        })
        .forEach(stock => {
            const tr = document.createElement("tr");
            const change = stock.price - stock.prevPrice;
            const changePct = stock.prevPrice ? (change / stock.prevPrice) * 100 : 0;
            const up = change >= 0;
            const sign = up ? "+" : "";

            tr.innerHTML = `
                <td>${stock.symbol}</td>
                <td>${stock.name}</td>
                <td class="price">${formatMoney(stock.price)}</td>
                <td>
                    <span class="badge-change ${up ? "up" : "down"}">
                        ${sign}${change.toFixed(2)} (${sign}${changePct.toFixed(2)}%)
                    </span>
                </td>
                <td>
                    <button class="watch-btn" data-symbol="${stock.symbol}">
                        Trade
                    </button>
                </td>
            `;

            tbody.appendChild(tr);
        });

    tbody.querySelectorAll(".watch-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            const symbol = btn.getAttribute("data-symbol");
            selectSymbol(symbol);
        });
    });
}

// ----- UI: portfolio & summary -----
function renderPortfolio() {
    const tbody = document.getElementById("portfolioBody");
    tbody.innerHTML = "";

    let portfolioValue = 0;

    Object.keys(portfolio).forEach(symbol => {
        const pos = portfolio[symbol];
        if (pos.qty <= 0) return;

        const stock = stocks.find(s => s.symbol === symbol);
        const lastPrice = stock ? stock.price : pos.avgPrice;
        const positionValue = lastPrice * pos.qty;
        const cost = pos.avgPrice * pos.qty;
        const pl = positionValue - cost;
        const plPct = cost > 0 ? (pl / cost) * 100 : 0;

        portfolioValue += positionValue;

        const tr = document.createElement("tr");

        let plDisplay = plView === "amount"
            ? formatMoney(pl)
            : formatPercent(plPct);
        const plColor = pl >= 0 ? "#22c55e" : "#fb7185";

        tr.innerHTML = `
            <td>${symbol}</td>
            <td>${pos.qty}</td>
            <td class="price">${formatMoney(pos.avgPrice)}</td>
            <td class="price">${formatMoney(lastPrice)}</td>
            <td class="price">${formatMoney(positionValue)}</td>
            <td class="price" style="color:${plColor}">
                ${plDisplay}
            </td>
        `;
        tbody.appendChild(tr);
    });

    const cashDisplay = document.getElementById("cashDisplay");
    const portfolioValueDisplay = document.getElementById("portfolioValueDisplay");
    const totalValueDisplay = document.getElementById("totalValueDisplay");

    cashDisplay.textContent = formatMoney(cash);
    portfolioValueDisplay.textContent = formatMoney(portfolioValue);
    totalValueDisplay.textContent = formatMoney(portfolioValue + cash);

    renderEducationTip(portfolioValue);
    renderCurrentPositionBox();
}

// ----- UI: history & stats -----
function renderHistory() {
    const tbody = document.getElementById("historyBody");
    tbody.innerHTML = "";

    history
        .slice()
        .reverse()
        .forEach(trade => {
            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td>${trade.time}</td>
                <td>${trade.symbol}</td>
                <td>${trade.side.toUpperCase()}</td>
                <td>${trade.kind}</td>
                <td>${trade.qty}</td>
                <td class="price">${formatMoney(trade.price)}</td>
                <td class="price">${formatMoney(trade.fees)}</td>
            `;
            tbody.appendChild(tr);
        });
}

function renderSessionStats() {
    document.getElementById("tradesToday").textContent = tradesTodayCount.toString();
    const winRateEl = document.getElementById("winRate");
    if (tradesTodayCount === 0) {
        winRateEl.textContent = "–";
    } else {
        const wr = (winsCount / tradesTodayCount) * 100;
        winRateEl.textContent = wr.toFixed(0) + "%";
    }
}

// ----- UI: education & position box -----
function renderEducationTip(portfolioValue) {
    const el = document.getElementById("educationTip");
    if (!el) return;

    const total = portfolioValue + cash;
    if (total <= 0) {
        el.textContent = "";
        return;
    }

    let maxWeight = 0;
    let maxSymbol = null;

    Object.keys(portfolio).forEach(symbol => {
        const pos = portfolio[symbol];
        if (pos.qty <= 0) return;
        const stock = stocks.find(s => s.symbol === symbol);
        const price = stock ? stock.price : pos.avgPrice;
        const value = price * pos.qty;
        const weight = value / total;
        if (weight > maxWeight) {
            maxWeight = weight;
            maxSymbol = symbol;
        }
    });

    // Suggest max position size based on mode
    let suggestedMax = 0.15;
    if (mode === "conservative") suggestedMax = 0.1;
    if (mode === "aggressive") suggestedMax = 0.3;

    if (maxWeight > suggestedMax) {
        el.textContent =
            `Mode: ${mode.toUpperCase()}. ` +
            `Your largest position (${maxSymbol}) is about ${(maxWeight * 100).toFixed(0)}% of capital. ` +
            `Try keeping positions under ${(suggestedMax * 100).toFixed(0)}% in this mode.`;
    } else if (!isMarketOpen()) {
        el.textContent =
            "Market is closed. In real life you would queue limit orders or plan your entries for the next session.";
    } else if (history.length >= 10) {
        el.textContent =
            "You’ve taken several trades. Pause and review: were you following your mode (conservative/balanced/aggressive) or just clicking?";
    } else {
        el.textContent =
            "Think in terms of risk per trade (for example, 0.5–1% of capital) instead of betting randomly sized quantities.";
    }
}

function renderCurrentPositionBox() {
    const box = document.getElementById("currentPositionBox");
    if (!box) return;

    if (!selectedSymbol || !portfolio[selectedSymbol] || portfolio[selectedSymbol].qty <= 0) {
        box.textContent = "No open position in the selected stock yet.";
        return;
    }

    const pos = portfolio[selectedSymbol];
    const stock = stocks.find(s => s.symbol === selectedSymbol);
    const lastPrice = stock ? stock.price : pos.avgPrice;
    const value = lastPrice * pos.qty;
    const cost = pos.avgPrice * pos.qty;
    const pl = value - cost;
    const plPct = cost > 0 ? (pl / cost) * 100 : 0;

    let plDisplay = plView === "amount"
        ? formatMoney(pl)
        : formatPercent(plPct);

    box.innerHTML = `
        <div><strong>${selectedSymbol}</strong> – Qty: ${pos.qty}</div>
        <div>Avg: ${formatMoney(pos.avgPrice)} | Last: ${formatMoney(lastPrice)}</div>
        <div>Value: ${formatMoney(value)}</div>
        <div>P/L:
            <span style="color:${pl >= 0 ? "#22c55e" : "#fb7185"}">
                ${plDisplay}
            </span>
        </div>
    `;
}

function renderEstimatedCost() {
    const label = document.getElementById("estimatedCost");
    if (!selectedSymbol || !label) {
        label.textContent = "–";
        return;
    }

    const qty = Number(document.getElementById("tradeQuantity").value || 0);
    const kind = document.getElementById("orderKind").value;
    const stock = stocks.find(s => s.symbol === selectedSymbol);
    if (!stock || qty <= 0) {
        label.textContent = "–";
        return;
    }

    let price = stock.price;
    if (kind === "limit") {
        const limit = Number(document.getElementById("limitPrice").value || 0);
        if (limit > 0) price = limit;
    } else {
        price = stock.price * (1 + SLIPPAGE_PCT);
    }

    const gross = price * qty;
    const total = gross + COMMISSION_PER_TRADE;
    label.textContent = formatMoney(total);
}

// ----- Selection -----
function selectSymbol(symbol) {
    selectedSymbol = symbol;
    const stock = stocks.find(s => s.symbol === symbol);
    const label = document.getElementById("selectedStockLabel");
    if (stock && label) {
        label.textContent = `${stock.symbol} • ${stock.name}`;
    }
    renderCurrentPositionBox();
    renderEstimatedCost();
}

// ----- Trading -----
function placeOrder(side, kind, limitPrice, quantity) {
    const msgEl = document.getElementById("tradeMessage");
    msgEl.textContent = "";
    msgEl.className = "message";

    if (!selectedSymbol) {
        msgEl.textContent = "Select a stock from the watchlist first.";
        msgEl.classList.add("error");
        return;
    }

    const stock = stocks.find(s => s.symbol === selectedSymbol);
    if (!stock) {
        msgEl.textContent = "Invalid stock selection.";
        msgEl.classList.add("error");
        return;
    }

    quantity = Number(quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) {
        msgEl.textContent = "Quantity must be positive.";
        msgEl.classList.add("error");
        return;
    }

    if (kind === "limit") {
        limitPrice = Number(limitPrice);
        if (!Number.isFinite(limitPrice) || limitPrice <= 0) {
            msgEl.textContent = "Limit price must be positive.";
            msgEl.classList.add("error");
            return;
        }
    }

    if (!isMarketOpen()) {
        msgEl.textContent =
            "Market is closed in this simulator. Try during market hours to see execution.";
        msgEl.classList.add("error");
        return;
    }

    let executionPrice = stock.price;

    if (kind === "market") {
        const slipFactor = side === "buy" ? 1 + SLIPPAGE_PCT : 1 - SLIPPAGE_PCT;
        executionPrice = stock.price * slipFactor;
    } else if (kind === "limit") {
        if (side === "buy" && executionPrice > limitPrice) {
            msgEl.textContent = "Buy limit not reached (price above your limit).";
            msgEl.classList.add("error");
            return;
        }
        if (side === "sell" && executionPrice < limitPrice) {
            msgEl.textContent = "Sell limit not reached (price below your limit).";
            msgEl.classList.add("error");
            return;
        }
        executionPrice = limitPrice;
    }

    const grossValue = executionPrice * quantity;
    const fees = COMMISSION_PER_TRADE;
    const totalCost = side === "buy" ? grossValue + fees : grossValue - fees;

    let tradePL = 0;

    if (side === "buy") {
        if (totalCost > cash) {
            msgEl.textContent = "Not enough cash after including commission.";
            msgEl.classList.add("error");
            return;
        }

        cash -= totalCost;

        if (!portfolio[selectedSymbol]) {
            portfolio[selectedSymbol] = { qty: 0, avgPrice: executionPrice };
        }

        const pos = portfolio[selectedSymbol];
        const newQty = pos.qty + quantity;
        const existingCost = pos.avgPrice * pos.qty;
        const newCost = existingCost + grossValue;
        pos.qty = newQty;
        pos.avgPrice = newCost / newQty;

        msgEl.textContent =
            `Bought ${quantity} ${selectedSymbol} at ${formatMoney(executionPrice)} (incl. ₹${fees.toFixed(2)} commission).`;
        msgEl.classList.add("success");
    } else {
        if (!portfolio[selectedSymbol] || portfolio[selectedSymbol].qty < quantity) {
            msgEl.textContent = "Not enough shares to sell.";
            msgEl.classList.add("error");
            return;
        }

        const pos = portfolio[selectedSymbol];
        const avg = pos.avgPrice;
        const costForThis = avg * quantity;

        pos.qty -= quantity;
        cash += totalCost;

        tradePL = grossValue - fees - costForThis;

        msgEl.textContent =
            `Sold ${quantity} ${selectedSymbol} at ${formatMoney(executionPrice)} (after ₹${fees.toFixed(2)} commission).`;
        msgEl.classList.add("success");
    }

    const now = new Date();
    history.push({
        time: now.toLocaleTimeString(),
        symbol: selectedSymbol,
        side,
        kind,
        qty: quantity,
        price: executionPrice,
        fees,
        pl: tradePL
    });

    // update stats
    tradesTodayCount += 1;
    if (tradePL > 0) winsCount += 1;

    renderPortfolio();
    renderHistory();
    renderEstimatedCost();
    renderSessionStats();
}

// ----- Reset / mode / PL toggle -----
function resetAccount() {
    cash = INITIAL_CASH;
    portfolio = {};
    history = [];
    selectedSymbol = null;
    tradesTodayCount = 0;
    winsCount = 0;

    document.getElementById("selectedStockLabel").textContent =
        "Select a stock from the watchlist";

    document.getElementById("tradeMessage").textContent = "";
    document.getElementById("tradeMessage").className = "message";

    renderStocksTable(document.getElementById("searchInput").value);
    renderPortfolio();
    renderHistory();
    renderSessionStats();
    renderEstimatedCost();
}

// ----- Events -----
document.addEventListener("DOMContentLoaded", () => {
    // starting capital select
    const capitalSelect = document.getElementById("startingCapital");
    INITIAL_CASH = Number(capitalSelect.value);
    cash = INITIAL_CASH;

    capitalSelect.addEventListener("change", () => {
        INITIAL_CASH = Number(capitalSelect.value);
        resetAccount();
    });

    // mode select
    const modeSelect = document.getElementById("modeSelect");
    modeSelect.addEventListener("change", () => {
        mode = modeSelect.value;
        renderEducationTip(0); // will be recalculated on next portfolio render
        renderPortfolio();
    });

    // PL toggle
    const plToggle = document.getElementById("plToggle");
    plToggle.addEventListener("click", () => {
        plView = plView === "amount" ? "percent" : "amount";
        plToggle.textContent = plView === "amount" ? "₹" : "%";
        renderPortfolio();
    });

    // search
    const searchInput = document.getElementById("searchInput");
    searchInput.addEventListener("input", () => {
        renderStocksTable(searchInput.value);
    });

    // side toggle
    const sideButtons = document.querySelectorAll("#sideToggle .pill");
    const tradeTypeInput = document.getElementById("tradeType");
    sideButtons.forEach(btn => {
        btn.addEventListener("click", () => {
            sideButtons.forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            tradeTypeInput.value = btn.getAttribute("data-side");
            renderEstimatedCost();
        });
    });

    // order kind / limit group
    const orderKindSelect = document.getElementById("orderKind");
    const limitGroup = document.getElementById("limitPriceGroup");
    orderKindSelect.addEventListener("change", () => {
        const showLimit = orderKindSelect.value === "limit";
        limitGroup.style.display = showLimit ? "flex" : "none";
        renderEstimatedCost();
    });

    document.getElementById("tradeQuantity").addEventListener("input", renderEstimatedCost);
    document.getElementById("limitPrice").addEventListener("input", renderEstimatedCost);

    // reset
    document.getElementById("resetBtn").addEventListener("click", resetAccount);

    // form submit
    const form = document.getElementById("tradeForm");
    form.addEventListener("submit", e => {
        e.preventDefault();
        const side = document.getElementById("tradeType").value;
        const kind = document.getElementById("orderKind").value;
        const qty = document.getElementById("tradeQuantity").value;
        const limitPrice =
            kind === "limit" ? document.getElementById("limitPrice").value : null;
        placeOrder(side, kind, limitPrice, qty);
    });

    // initial renders
    renderStocksTable();
    renderPortfolio();
    renderHistory();
    renderSessionStats();
    updateMarketStatus();
    renderEstimatedCost();

    // price + UI refresh
    setInterval(() => {
        updateStockPrices();
        renderStocksTable(document.getElementById("searchInput").value);
        renderPortfolio();
        updateMarketStatus();
        renderEstimatedCost();
    }, 2500);
});
