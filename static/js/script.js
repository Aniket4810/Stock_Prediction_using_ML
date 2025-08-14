document.addEventListener('DOMContentLoaded', () => {
    // --- Element References ---
    const searchInput = document.getElementById('companySearch');
    const suggestionsDiv = document.getElementById('suggestions');
    const resultsDiv = document.getElementById('results');
    const resultTitle = document.getElementById('result-title');
    const accuracyInfo = document.getElementById('accuracy-info');
    const priceChartCanvas = document.getElementById('stockChart');
    const errorMessage = document.getElementById('error-message');
    const loadingIndicator = document.getElementById('loading-indicator');
    const initialMessageDiv = document.getElementById('initial-message');
    const predictionDaysSelect = document.getElementById('predictionDays');
    const latestStatsDiv = document.getElementById('latest-stats');
    const statsDateSpan = document.getElementById('stats-date');
    const statsOpenSpan = document.getElementById('stats-open');
    const statsHighSpan = document.getElementById('stats-high');
    const statsLowSpan = document.getElementById('stats-low');
    const statsCloseSpan = document.getElementById('stats-close');
    const statsVolumeSpan = document.getElementById('stats-volume');
    const yahooLink = document.getElementById('yahoo-link');
    const volumeChartCanvas = document.getElementById('volumeChart');

    // --- Chart Instances ---
    let priceChart = null;
    let volumeChart = null;

    let suggestionTimeout;

    // --- Event Listeners ---
    searchInput.addEventListener('input', (e) => {
        const query = e.target.value.trim();
        clearTimeout(suggestionTimeout);
        if (query.length > 0) {
            suggestionTimeout = setTimeout(() => fetchSuggestions(query), 300);
        } else {
            suggestionsDiv.style.display = 'none';
        }
    });

    searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            triggerPrediction(); // Use a helper function
        }
    });

    document.addEventListener('click', (e) => {
        if (!searchInput.contains(e.target) && !suggestionsDiv.contains(e.target)) {
            suggestionsDiv.style.display = 'none';
        }
    });

    predictionDaysSelect.addEventListener('change', () => {
        if (resultsDiv.style.display !== 'none' && searchInput.dataset.currentTicker) {
             console.log("Prediction days changed, refetching prediction...");
             triggerPrediction(); // Refetch with new days
        }
    });

    // --- Helper Functions ---
    function triggerPrediction() {
         const query = searchInput.value.trim();
         const firstSuggestion = suggestionsDiv.querySelector('div');
         const predictionDays = predictionDaysSelect.value;

         // Prioritize selected suggestion's ticker if available
         let targetTicker = searchInput.dataset.currentTicker; // Use stored ticker if available
         let targetName = searchInput.dataset.currentName;

         if (firstSuggestion && suggestionsDiv.style.display !== 'none' && firstSuggestion.dataset.ticker) {
            // If suggestions are visible and one is implicitly selected (e.g. by arrow keys or mouse over)
            // Or if user presses Enter right after typing matches a suggestion
             targetTicker = firstSuggestion.dataset.ticker;
             targetName = firstSuggestion.dataset.name;
             searchInput.value = targetName; // Update input field to match selection
             console.log("Using first suggestion:", targetName, targetTicker);
         } else if (!targetTicker && query) {
             // If no ticker stored and query exists, use the query directly
             targetTicker = query;
             targetName = query; // Use query as name too
             console.warn("Attempting prediction directly with input:", query);
         } else if (!targetTicker && !query) {
             // No ticker, no query - do nothing
             console.log("No company selected or entered.");
             return;
         }
         // If targetTicker and targetName are now set
         if (targetTicker) {
             fetchPrediction(targetName, targetTicker, predictionDays);
             suggestionsDiv.style.display = 'none'; // Hide suggestions after triggering
         }
    }


    async function fetchSuggestions(query) {
        try {
            const response = await fetch(`/suggest?q=${encodeURIComponent(query)}`);
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const data = await response.json();
            displaySuggestions(data.suggestions);
        } catch (error) {
            console.error("Error fetching suggestions:", error);
            suggestionsDiv.innerHTML = '<div class="error">Could not load suggestions</div>';
            suggestionsDiv.style.display = 'block';
        }
    }

    function displaySuggestions(suggestions) {
        suggestionsDiv.innerHTML = '';
        if (suggestions.length === 0) {
            suggestionsDiv.style.display = 'none';
            return;
        }
        suggestions.forEach(suggestion => {
            const div = document.createElement('div');
            div.innerHTML = `${suggestion.name} (<strong>${suggestion.ticker}</strong>)`;
            div.dataset.name = suggestion.name;
            div.dataset.ticker = suggestion.ticker;
            div.addEventListener('click', () => {
                 const predictionDays = predictionDaysSelect.value;
                 // Store selection details before fetching
                 searchInput.value = suggestion.name;
                 searchInput.dataset.currentName = suggestion.name;
                 searchInput.dataset.currentTicker = suggestion.ticker;
                 suggestionsDiv.style.display = 'none';
                 fetchPrediction(suggestion.name, suggestion.ticker, predictionDays);
            });
            suggestionsDiv.appendChild(div);
        });
        suggestionsDiv.style.display = 'block';
    }

    // Removed handleSuggestionClick as logic is now in displaySuggestions and triggerPrediction

    async function fetchPrediction(companyName, ticker, predictionDays) {
        // Store current ticker/name for potential refetch on day change
        searchInput.dataset.currentName = companyName;
        searchInput.dataset.currentTicker = ticker;

        resultsDiv.style.display = 'block';
        initialMessageDiv.style.display = 'none';
        loadingIndicator.style.display = 'block';
        errorMessage.textContent = '';
        accuracyInfo.textContent = '';
        resultTitle.textContent = `Loading prediction for ${companyName || ticker}...`;
        latestStatsDiv.style.display = 'none'; // Hide stats initially

        if (priceChart) priceChart.destroy();
        if (volumeChart) volumeChart.destroy();
        priceChart = null;
        volumeChart = null;

        try {
            const response = await fetch('/predict', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ticker: ticker,
                    prediction_days: parseInt(predictionDays, 10)
                 }),
            });

            const data = await response.json();

            if (!response.ok) {
                // Display error from backend if available
                throw new Error(data.error || `Prediction failed: ${response.status}`);
            }
            // If response is OK, but data is somehow empty (shouldn't happen with backend checks)
             if (!data || Object.keys(data).length === 0) {
                throw new Error("Received empty response from server.");
            }
            // Check specifically if the error key exists even with 200 OK (shouldn't happen with proper backend)
            if (data.error) {
                throw new Error(data.error);
            }

            displayResults(data); // Process and display results

        } catch (error) {
            console.error("Error during prediction fetch or processing:", error); // Log the actual error
            errorMessage.textContent = `Error: ${error.message}`; // Display user-friendly message
            resultTitle.textContent = 'Prediction Failed';
            // Optionally hide stats div again on error
            latestStatsDiv.style.display = 'none';
        } finally {
            loadingIndicator.style.display = 'none'; // Always hide loader
        }
    }

    function displayResults(data) {
        // Ensure data is valid before proceeding
        if (!data || !data.historical_dates || !data.historical_prices) {
             console.error("Invalid data received for display:", data);
             errorMessage.textContent = "Error: Received invalid data structure from server.";
             resultTitle.textContent = 'Display Error';
             latestStatsDiv.style.display = 'none';
             return; // Stop execution if essential data is missing
        }

        resultTitle.textContent = `Stock Analysis for ${data.company_name || data.ticker}`;

        // --- Display Latest Stats (with checks) ---
        // ***** FIX: Check if latest_stats exists and has values *****
        if (data.latest_stats && data.latest_stats.date) { // Check existence and a key property
            latestStatsDiv.style.display = 'block';
            statsDateSpan.textContent = data.latest_stats.date;
            // Check each value before displaying, show 'N/A' if null/undefined
            statsOpenSpan.textContent = data.latest_stats.open != null ? `$${data.latest_stats.open.toFixed(2)}` : 'N/A';
            statsHighSpan.textContent = data.latest_stats.high != null ? `$${data.latest_stats.high.toFixed(2)}` : 'N/A';
            statsLowSpan.textContent = data.latest_stats.low != null ? `$${data.latest_stats.low.toFixed(2)}` : 'N/A';
            statsCloseSpan.textContent = data.latest_stats.close != null ? `$${data.latest_stats.close.toFixed(2)}` : 'N/A';
            statsVolumeSpan.textContent = data.latest_stats.volume != null ? data.latest_stats.volume.toLocaleString() : 'N/A';
            yahooLink.href = data.yahoo_finance_url || '#'; // Default to '#' if URL missing
        } else {
            console.log("Latest stats data is missing or incomplete.");
            latestStatsDiv.style.display = 'none'; // Hide section if no valid stats
        }
        // --- End Stats Fix ---

        accuracyInfo.innerHTML = `Simple Linear Model Fit (R-squared on past test data): <strong>${data.model_fit_percentage}%</strong> <br>
                                  <small>Note: An R² of 0% means this simple time-based line model didn't explain past variance well. It's illustrative, not investment advice. SMAs show trends.</small>`;

        const allDates = data.historical_dates.concat(data.predicted_dates || []); // Ensure predicted_dates exists
        // Ensure predicted_prices exists, handle potential length mismatch carefully
        let predictionDataPoints = [];
         if (data.predicted_prices && data.historical_prices) {
              predictionDataPoints = Array(data.historical_prices.length).fill(null).concat(data.predicted_prices);
         } else {
            console.warn("Prediction prices missing, chart will not show predictions.");
             predictionDataPoints = Array(data.historical_prices.length).fill(null); // Fill historical part only
        }


        // --- Render Price Chart ---
        const priceCtx = priceChartCanvas.getContext('2d');
        if (priceChart) priceChart.destroy();

        priceChart = new Chart(priceCtx, {
            type: 'line',
            data: {
                labels: allDates,
                datasets: [
                    { label: 'Historical Close', data: data.historical_prices, borderColor: 'rgb(54, 162, 235)', backgroundColor: 'rgba(54, 162, 235, 0.1)', tension: 0.1, pointRadius: 1, borderWidth: 2, yAxisID: 'yPrice' },
                    { label: 'SMA 20', data: data.sma_short || [], borderColor: 'rgb(255, 159, 64)', backgroundColor: 'rgba(255, 159, 64, 0.1)', tension: 0.2, pointRadius: 0, borderWidth: 1.5, yAxisID: 'yPrice' }, // Add default empty array
                    { label: 'SMA 50', data: data.sma_long || [], borderColor: 'rgb(153, 102, 255)', backgroundColor: 'rgba(153, 102, 255, 0.1)', tension: 0.2, pointRadius: 0, borderWidth: 1.5, yAxisID: 'yPrice' }, // Add default empty array
                    { label: 'Predicted Price', data: predictionDataPoints, borderColor: 'rgb(255, 99, 132)', backgroundColor: 'rgba(255, 99, 132, 0.1)', borderDash: [5, 5], tension: 0.1, pointRadius: 2, borderWidth: 2, yAxisID: 'yPrice' }
                ]
            },
             options: { /* ... options from previous version ... */
                responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
                scales: {
                    x: { type: 'time', time: { unit: 'month', tooltipFormat: 'll' }, title: { display: true, text: 'Date' }, ticks: { maxRotation: 45, minRotation: 45, autoSkip: true, maxTicksLimit: 15 } },
                    yPrice: { type: 'linear', position: 'left', title: { display: true, text: 'Price' }, ticks: { callback: value => '$' + value.toFixed(2) } }
                },
                plugins: {
                    tooltip: { mode: 'index', intersect: false, callbacks: { label: function(context) { /* ... tooltip callback ... */
                        let label = context.dataset.label || ''; if (label) label += ': '; if (context.parsed.y !== null) { if (context.dataset.yAxisID === 'yPrice') { label += new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(context.parsed.y); } else { label += context.parsed.y; } } return label;
                    }}},
                    legend: { position: 'top' },
                }
            }
        });

        // --- Render Volume Chart ---
        const volumeCtx = volumeChartCanvas.getContext('2d');
        if (volumeChart) volumeChart.destroy();

        volumeChart = new Chart(volumeCtx, {
            type: 'bar',
            data: {
                labels: data.historical_dates, // Use historical dates only
                datasets: [{
                    label: 'Volume',
                    data: data.historical_volume || [], // Add default empty array
                    backgroundColor: 'rgba(75, 192, 192, 0.5)',
                    borderColor: 'rgb(75, 192, 192)',
                    borderWidth: 1,
                    yAxisID: 'yVolume'
                }]
            },
            options: { /* ... options from previous version ... */
                responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
                scales: {
                    x: { type: 'time', time: { unit: 'month' }, display: false, },
                    yVolume: { type: 'linear', position: 'left', title: { display: true, text: 'Volume' }, ticks: { callback: value => { if (value >= 1e9) return (value / 1e9).toFixed(1) + 'B'; if (value >= 1e6) return (value / 1e6).toFixed(1) + 'M'; if (value >= 1e3) return (value / 1e3).toFixed(1) + 'K'; return value; } }, grid: { drawOnChartArea: false } }
                },
                 plugins: {
                    legend: { display: false },
                    tooltip: { enabled: true, mode: 'index', intersect: false, callbacks: { label: function(context) { /* ... volume tooltip callback ... */
                         let label = context.dataset.label || ''; if (label) label += ': '; if (context.parsed.y !== null) { label += context.parsed.y.toLocaleString(); } return label;
                     }}}
                }
            }
        });

    } // End displayResults

}); // End DOMContentLoaded