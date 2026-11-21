/*
 * treasure-status.js — fills the "Treasure Status" widget from mempool.space.
 * The treasure address is public by design; it lives here, and only here.
 */
(function () {
    'use strict';

    const TREASURE_ADDRESS = 'bc1qdluefrhrzu3px5p3x6qfgdcuw6qlyymwsk8kjy'; // TODO: new address (see README)

    async function checkTreasureStatus() {
        const displayEl = document.getElementById('treasure-value');
        if (!displayEl) return;
        try {
            const [addressRes, priceRes] = await Promise.all([
                fetch(`https://mempool.space/api/address/${TREASURE_ADDRESS}`),
                fetch('https://mempool.space/api/v1/prices'),
            ]);
            const addressData = await addressRes.json();
            const priceData = await priceRes.json();

            // Count unconfirmed spends too: a sweep in the mempool means the treasure is gone.
            const chain = addressData.chain_stats;
            const mempool = addressData.mempool_stats;
            const totalSats = chain.funded_txo_sum - chain.spent_txo_sum - mempool.spent_txo_sum;

            if (totalSats > 0) {
                const btcAmount = totalSats / 1e8;
                const usdValue = (btcAmount * priceData.USD).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                displayEl.innerHTML = `${totalSats.toLocaleString()} satoshis`
                    + `<br><span class="treasure-sub">${btcAmount} Bitcoin</span>`
                    + `<br><span class="treasure-sub">$${usdValue}</span>`;
            } else {
                displayEl.innerText = 'CLAIMED';
                displayEl.classList.add('treasure-claimed');
                document.getElementById('treasure-widget').style.borderColor = 'rgba(255, 107, 107, 0.3)';
            }
        } catch (error) {
            console.error('Error fetching treasure status:', error);
            displayEl.innerText = 'Status Unknown';
        }
    }

    checkTreasureStatus();
})();
