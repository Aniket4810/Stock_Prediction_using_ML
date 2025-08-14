import os
import pandas as pd
import numpy as np
import yfinance as yf
from flask import Flask, request, jsonify, render_template
from sklearn.model_selection import train_test_split
from sklearn.linear_model import LinearRegression
from sklearn.metrics import r2_score
from flask_cors import CORS
from pandas.tseries.offsets import BDay
import datetime
import traceback
import math # Import math for checking NaN/inf

# --- Configuration ---
app = Flask(__name__)
CORS(app)

# --- Simple Suggestion Data (Expanded) ---
COMPANY_SUGGESTIONS = {
    # Existing US Tech & Large Cap
    "Apple Inc.": "AAPL",
    "Microsoft Corporation": "MSFT",
    "Amazon.com, Inc.": "AMZN",
    "Alphabet Inc. (Google) Class A": "GOOGL",
    "Alphabet Inc. (Google) Class C": "GOOG",
    "Meta Platforms, Inc. (Facebook)": "META",
    "Tesla, Inc.": "TSLA",
    "NVIDIA Corporation": "NVDA",
    "Advanced Micro Devices, Inc.": "AMD",
    "Netflix, Inc.": "NFLX",
    "Salesforce, Inc.": "CRM",
    "Adobe Inc.": "ADBE",
    "Intel Corporation": "INTC",
    "Cisco Systems, Inc.": "CSCO",

    # Existing Finance & Healthcare & Consumer
    "Berkshire Hathaway Inc. Class B": "BRK-B",
    "Johnson & Johnson": "JNJ",
    "JPMorgan Chase & Co.": "JPM",
    "Visa Inc.": "V",
    "Procter & Gamble Co.": "PG",
    "UnitedHealth Group Inc.": "UNH",
    "Home Depot, Inc.": "HD",

    # Added US Companies
    "Walmart Inc.": "WMT",
    "Exxon Mobil Corporation": "XOM",
    "Bank of America Corp": "BAC",
    "Mastercard Incorporated": "MA",
    "Pfizer Inc.": "PFE",
    "Coca-Cola Co": "KO",
    "PepsiCo, Inc.": "PEP",
    "Costco Wholesale Corporation": "COST",
    "McDonald's Corporation": "MCD",
    "Netflix, Inc.": "NFLX",
    "Adobe Inc.": "ADBE",
    "Salesforce, Inc.": "CRM",
    "Intel Corporation": "INTC",
    "Cisco Systems, Inc.": "CSCO",
    "Walt Disney Company (The)": "DIS",
    "Verizon Communications Inc.": "VZ",
    "AT&T Inc.": "T",
    "Ford Motor Company": "F",
    "General Motors Company": "GM",
    "Starbucks Corporation": "SBUX",
    "Boeing Company (The)": "BA",
    "Goldman Sachs Group, Inc.": "GS",
    "Morgan Stanley": "MS",
    "American Express Company": "AXP",

    # Existing India Stocks
    "Tata Consultancy Services (India)": "TCS.NS",
    "Reliance Industries (India)": "RELIANCE.NS",
    

    # Added India Stocks
    "HDFC Bank Limited (India)": "HDFCBANK.NS",
    "Infosys Limited (India)": "INFY.NS",
    "ICICI Bank Limited (India)": "ICICIBANK.NS",
    "Hindustan Unilever Limited (India)": "HINDUNILVR.NS",
    "State Bank of India (India)": "SBIN.NS",
    "Bharti Airtel Limited (India)": "BHARTIARTL.NS",
    "ITC Limited (India)": "ITC.NS",

    # Added European Stocks (Examples)
    "LVMH Moët Hennessy - Louis Vuitton (France)": "MC.PA", # Paris
    "ASML Holding N.V. (Netherlands)": "ASML.AS",        # Amsterdam
    "Nestlé S.A. (Switzerland)": "NESN.SW",              # Switzerland SIX
    "SAP SE (Germany)": "SAP.DE",                         # Germany XETRA
    "Shell plc (UK)": "SHEL.L",                           # London LSE
    "TotalEnergies SE (France)": "TTE.PA",               # Paris
    "Siemens AG (Germany)": "SIE.DE",                     # Germany XETRA
    "Volkswagen AG (Germany)": "VOW3.DE",                 # Germany XETRA (Preference Shares)
    "HSBC Holdings plc (UK)": "HSBA.L",                   # London LSE
    "AstraZeneca PLC (UK)": "AZN.L",                      # London LSE

    # Added Asian Stocks (Examples)
    "Toyota Motor Corporation (Japan)": "7203.T",         # Tokyo
    "Samsung Electronics Co., Ltd. (South Korea)": "005930.KS", # Korea
    "Taiwan Semiconductor Manufacturing Co Ltd (Taiwan)": "2330.TW", # Taiwan
    "Tencent Holdings Limited (Hong Kong)": "0700.HK",      # Hong Kong
    "Alibaba Group Holding Limited (Hong Kong)": "9988.HK", # Hong Kong (Check if BABA - US listing is preferred)
    "Sony Group Corporation (Japan)": "6758.T",           # Tokyo

    # Added Canadian Stocks (Examples)
    "Royal Bank of Canada (Canada)": "RY.TO",             # Toronto
    "Shopify Inc. (Canada)": "SHOP.TO",                   # Toronto
    "Enbridge Inc. (Canada)": "ENB.TO",                   # Toronto
}

# --- Helper Function to Safely Convert Numerics for JSON ---
def safe_float(value):
    """Converts value to float, handling NaN/inf -> None."""
    if value is None or isinstance(value, str): # Avoid trying to convert None or strings
        return None
    try:
        f_value = float(value)
        if math.isnan(f_value) or math.isinf(f_value):
            return None # Convert NaN and Infinity to None for JSON
        return f_value
    except (ValueError, TypeError):
        return None # Handle potential conversion errors

def safe_int(value):
    """Converts value to int, handling NaN/inf/None -> None."""
    f_value = safe_float(value) # First check if it's a valid finite float
    if f_value is None:
        return None
    try:
        # Check if it's reasonably close to an integer if it was float
        if abs(f_value - round(f_value)) < 1e-9:
             return int(round(f_value))
        else: # Don't convert if it has significant decimal part
             print(f"Warning: Cannot safely convert non-integer float {f_value} to int.")
             return None
    except (ValueError, TypeError):
         return None


# --- Routes ---
@app.route('/')
def index():
    return render_template('index.html')

@app.route('/suggest')
def suggest():
    query = request.args.get('q', '').lower()
    if not query: return jsonify({"suggestions": []})
    matches = []
    for name, ticker in COMPANY_SUGGESTIONS.items():
        if query in name.lower() or query in ticker.lower():
            matches.append({"name": name, "ticker": ticker})
    return jsonify({"suggestions": matches[:10]})

@app.route('/predict', methods=['POST'])
def predict():
    data = request.get_json()
    ticker_symbol = data.get('ticker')
    prediction_days = data.get('prediction_days', 30)
    try:
        prediction_days = int(prediction_days);
        if not (7 <= prediction_days <= 180): prediction_days = 30
    except: prediction_days = 30

    if not ticker_symbol: return jsonify({"error": "Ticker symbol not provided"}), 400

    latest_stats = None

        # 1. Fetch Data
    end_date = datetime.datetime.today()
    if end_date.weekday() >= 5:
     end_date -= BDay(1)   
    try:

        start_date = end_date - datetime.timedelta(days=5 * 365)
        print(f"Fetching data for {ticker_symbol} from {start_date.date()} to {end_date.date()}")
        stock_data = yf.download(ticker_symbol, start=start_date, end=end_date, auto_adjust=True, progress=False)
        print("Downloaded data:", stock_data.head())

        if stock_data.empty: return jsonify({"error": f"Could not fetch data for {ticker_symbol}."}), 404
        if not isinstance(stock_data.index, pd.DatetimeIndex): stock_data.index = pd.to_datetime(stock_data.index)
        print(f"Data fetched successfully for {ticker_symbol}. Shape: {stock_data.shape}. Columns: {stock_data.columns.tolist()}")

        close_col, open_col, high_col, low_col, volume_col = 'Close', 'Open', 'High', 'Low', 'Volume'

        if isinstance(stock_data.columns, pd.MultiIndex):
             print("Detected MultiIndex columns, flattening.")
             cols_map={}; [cols_map.update({col_tuple: col_tuple[0]}) if col_tuple[0] not in cols_map.values() else cols_map.update({col_tuple: f"{col_tuple[0]}_{col_tuple[1]}"}) for col_tuple in stock_data.columns]
             stock_data.columns = [cols_map.get(col, '_'.join(map(str, col))) for col in stock_data.columns]
             print(f"Flattened columns: {stock_data.columns.tolist()}")

        required_cols = [close_col, open_col, high_col, low_col, volume_col]
        if not all(col in stock_data.columns for col in required_cols):
            missing = [col for col in required_cols if col not in stock_data.columns]; print(f"Error: Missing columns: {missing}")
            return jsonify({"error": f"Data format error: Missing columns {missing}"}), 500

        # 2. Prepare Target Variable (y)
        y = stock_data[close_col].copy()

        # 3. Calculate SMAs
        sma_short_window, sma_long_window = 20, 50
        stock_data[f'SMA_{sma_short_window}'] = y.rolling(window=sma_short_window).mean()
        stock_data[f'SMA_{sma_long_window}'] = y.rolling(window=sma_long_window).mean()

        # 4. Get Latest Statistics (using safe converters)
        if not stock_data.empty:
             try:
                 last_row = stock_data.iloc[-1]
                 latest_stats = {
                     "date": last_row.name.strftime('%Y-%m-%d'),
                     # Use safe_float which handles NaN/inf -> None
                     "open": safe_float(last_row[open_col]),
                     "high": safe_float(last_row[high_col]),
                     "low": safe_float(last_row[low_col]),
                     "close": safe_float(last_row[close_col]),
                     # Use safe_int which handles NaN/inf/None -> None
                     "volume": safe_int(last_row[volume_col])
                 }
                 # Round floats AFTER checking they are not None
                 for key in ["open", "high", "low", "close"]:
                      if latest_stats[key] is not None:
                           latest_stats[key] = round(latest_stats[key], 2)

             except IndexError: print(f"Warning: Could not get last row for stats"); latest_stats = None

        # 5. Prepare Feature Variable (X)
        features_df = stock_data.reset_index(); features_df.rename(columns={'index': 'Date'}, inplace=True, errors='ignore')
        if 'Date' not in features_df.columns:
             if isinstance(stock_data.index, pd.DatetimeIndex): features_df['Date'] = stock_data.index
             else: return jsonify({"error": "Internal data processing error (Date)."}), 500
        features_df['TimeIndex'] = np.arange(len(features_df)); X = features_df[['TimeIndex']]

        # 6. Split data
        X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, shuffle=False)

        # 7. Train Model
        model = LinearRegression(); model.fit(X_train.values, y_train.values)

        # 8. Evaluate Model Fit
        y_pred_test = model.predict(X_test.values)
        # Ensure y_test.values doesn't contain NaN before scoring if possible, though r2_score might handle it
        valid_indices_test = ~np.isnan(y_test.values) & ~np.isnan(y_pred_test)
        if np.any(valid_indices_test): # Only score if there are valid points
             model_fit_score = r2_score(y_test.values[valid_indices_test], y_pred_test[valid_indices_test])
             accuracy_percent = max(0, model_fit_score) * 100
        else:
             accuracy_percent = 0 # Default to 0 if no valid comparison points

        # 9. Predict Future Prices
        last_time_index = X['TimeIndex'].iloc[-1]
        future_indices_np = np.arange(last_time_index + 1, last_time_index + 1 + prediction_days).reshape(-1, 1)
        future_predictions = model.predict(future_indices_np)

        # Create future dates
        last_date = features_df['Date'].iloc[-1]
        future_dates = [(last_date + datetime.timedelta(days=i)).strftime('%Y-%m-%d') for i in range(1, prediction_days + 1)]

        # 10. Prepare Data for Charting (Apply NaN/inf -> None conversion robustly)

        # ***** FIX: Apply safe_float to ALL list elements *****
        historical_prices_list = [safe_float(p) for p in y.tolist()]
        historical_volume_list = [safe_int(v) for v in stock_data[volume_col].tolist()]
        sma_short_data = [safe_float(sma) for sma in stock_data[f'SMA_{sma_short_window}'].tolist()]
        sma_long_data = [safe_float(sma) for sma in stock_data[f'SMA_{sma_long_window}'].tolist()]
        predicted_prices_list = [safe_float(p) for p in future_predictions.flatten()] # Use flatten for 1D list
        # ***** END FIX *****

        chart_data = {
            "historical_dates": features_df['Date'].dt.strftime('%Y-%m-%d').tolist(),
            "historical_prices": historical_prices_list,
            "historical_volume": historical_volume_list,
            "sma_short": sma_short_data,
            "sma_long": sma_long_data,
            "predicted_dates": future_dates,
            "predicted_prices": predicted_prices_list,
            "model_fit_percentage": round(accuracy_percent, 2),
            "ticker": ticker_symbol,
            "company_name": next((name for name, tk in COMPANY_SUGGESTIONS.items() if tk == ticker_symbol), ticker_symbol),
            "latest_stats": latest_stats,
            "yahoo_finance_url": f"https://finance.yahoo.com/quote/{ticker_symbol}"
        }

        print(f"Prediction successful for {ticker_symbol}")
        return jsonify(chart_data) # This should now contain only JSON-serializable types

    except Exception as e:
        print(f"Error processing request for {ticker_symbol}:"); print(traceback.format_exc())
        error_message = "An internal error occurred during prediction."
        return jsonify({"error": error_message, "latest_stats": latest_stats}), 500


# --- Main Execution ---
if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000)); app.run(host='0.0.0.0', port=port, debug=True)