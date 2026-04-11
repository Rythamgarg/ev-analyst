# =============================================================================
# EV INVESTMENT ANALYST — Python + Streamlit App
# =============================================================================
# What you'll learn from reading this file:
#   - How to call external APIs and parse JSON data (Sections 2 & 3)
#   - How to build prompts programmatically with real data (Section 4)
#   - How to call an LLM API (Google Gemini) from Python (Section 5)
#   - How to build a web UI with Streamlit (Section 6)
#
# Run this with: streamlit run main.py
# =============================================================================


# =============================================================================
# SECTION 1: IMPORTS
# =============================================================================
# These are Python "libraries" — pre-built tools you install via pip.
# Think of them like Excel add-ins, but for Python.

import streamlit as st       # turns this Python file into a web app
import yfinance as yf        # pulls live financial data from Yahoo Finance
import requests              # makes HTTP requests (how you call any web API)
import google.generativeai as genai  # Google Gemini LLM
import os                    # lets you read environment variables (like your API key)
import json                  # for parsing JSON responses from APIs

# =============================================================================
# SECTION 2: CONFIGURATION
# =============================================================================
# os.environ.get() reads from Replit's Secrets manager.
# If the key isn't found, it returns None — we handle that gracefully below.

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")


# =============================================================================
# SECTION 3: DATA FETCHERS
# =============================================================================
# These are "functions" — reusable blocks of code you call by name.
# Each one fetches one type of data from the web.

def fetch_financial_data(ticker: str) -> dict:
    """
    Fetches live financial data for a publicly traded company using yfinance.

    yfinance is a Python wrapper around Yahoo Finance's unofficial API.
    It gives us: stock price, market cap, revenue, margins, cash, debt, and news.

    Args:
        ticker: Stock ticker symbol (e.g., "TSLA", "RIVN", "LCID")

    Returns:
        A dictionary with financial metrics, or an empty dict if fetch fails.
    """
    try:
        stock = yf.Ticker(ticker)
        info = stock.info  # a big dictionary of company facts from Yahoo Finance

        # Helper function: format large numbers as "B" (billions) or "M" (millions)
        # This is the same formatting you'd see in a real analyst report
        def fmt(num):
            if num is None or num != num:  # checks for None and NaN (not-a-number)
                return "N/A"
            if abs(num) >= 1e9:
                return f"${num/1e9:.1f}B"
            elif abs(num) >= 1e6:
                return f"${num/1e6:.1f}M"
            else:
                return f"${num:,.0f}"

        def fmt_pct(num):
            if num is None or num != num:
                return "N/A"
            return f"{num*100:.1f}%"

        def fmt_ratio(num):
            if num is None or num != num:
                return "N/A"
            return f"{num:.1f}x"

        # Pull the specific metrics we need for the memo
        data = {
            "company_name":     info.get("longName", ticker),
            "sector":           info.get("sector", "N/A"),
            "industry":         info.get("industry", "N/A"),
            "country":          info.get("country", "N/A"),
            "exchange":         info.get("exchange", "N/A"),
            "currency":         info.get("currency", "USD"),
            "current_price":    fmt(info.get("currentPrice")),
            "market_cap":       fmt(info.get("marketCap")),
            "enterprise_value": fmt(info.get("enterpriseValue")),
            "52w_high":         fmt(info.get("fiftyTwoWeekHigh")),
            "52w_low":          fmt(info.get("fiftyTwoWeekLow")),
            "revenue_ttm":      fmt(info.get("totalRevenue")),
            "gross_margin":     fmt_pct(info.get("grossMargins")),
            "operating_margin": fmt_pct(info.get("operatingMargins")),
            "net_margin":       fmt_pct(info.get("netMargins")),
            "cash":             fmt(info.get("totalCash")),
            "total_debt":       fmt(info.get("totalDebt")),
            "free_cash_flow":   fmt(info.get("freeCashflow")),
            "pe_ratio":         fmt_ratio(info.get("trailingPE")),
            "ev_revenue":       fmt_ratio(info.get("enterpriseToRevenue")),
            "ev_ebitda":        fmt_ratio(info.get("enterpriseToEbitda")),
            "employees":        f"~{info.get('fullTimeEmployees', 'N/A'):,}" if info.get("fullTimeEmployees") else "N/A",
            "ceo":              info.get("companyOfficers", [{}])[0].get("name", "N/A") if info.get("companyOfficers") else "N/A",
            "website":          info.get("website", "N/A"),
            "description":      info.get("longBusinessSummary", "")[:600],  # first 600 chars
        }

        # Fetch the 5 most recent news headlines
        try:
            raw_news = stock.news[:5]
            news_lines = []
            for item in raw_news:
                title = item.get("content", {}).get("title", "") or item.get("title", "")
                if title:
                    news_lines.append(f"• {title}")
            data["recent_news"] = "\n".join(news_lines) if news_lines else "No recent news found."
        except Exception:
            data["recent_news"] = "Could not fetch news."

        return data

    except Exception as e:
        # If yfinance fails (bad ticker, network issue, etc.), return an empty dict
        # The rest of the app handles this gracefully
        return {"error": str(e)}


def fetch_wikipedia_summary(company_name: str) -> str:
    """
    Fetches the first paragraph of a company's Wikipedia article.

    Wikipedia has a free, public REST API that requires no key.
    We use the /page/summary endpoint which returns a clean JSON response.

    Args:
        company_name: The company name (e.g., "Rivian", "ChargePoint")

    Returns:
        A short text summary, or a fallback string if not found.
    """
    try:
        # Replace spaces with underscores for the Wikipedia URL format
        search_term = company_name.strip().replace(" ", "_")
        url = f"https://en.wikipedia.org/api/rest_v1/page/summary/{search_term}"

        # requests.get() makes an HTTP GET request — the same thing your browser
        # does when you visit a URL, but from Python code
        response = requests.get(url, timeout=5)

        if response.status_code == 200:
            data = response.json()  # parse the JSON response into a Python dict
            return data.get("extract", "")[:800]  # first 800 characters
        else:
            return ""
    except Exception:
        return ""


# =============================================================================
# SECTION 4: PROMPT BUILDER
# =============================================================================
# This is where we combine the live data with the prompt system.
# The key idea: instead of asking the LLM to guess financials from training data,
# we inject the REAL numbers directly into the prompt as context.

SYSTEM_PROMPT = """You are a senior investment analyst at a top-tier venture capital and \
private equity firm, specializing exclusively in the electric vehicle (EV) sector and its \
adjacent value chain (batteries, charging infrastructure, EV software, powertrain components, \
and critical minerals).

Your job is to produce crisp, thesis-driven investment memos that partners at the firm can \
read in under three minutes and use to make go/no-go decisions. You write the way senior \
VC/PE professionals write: direct, opinionated, evidence-based, and allergic to marketing fluff.

Core rules:
1. Always take a position. End with a clear verdict (Buy / Hold / Avoid / Watch).
2. Use the LIVE DATA provided below as your primary source for financial figures. \
   Do not substitute training-data estimates when real numbers are available.
3. Use memo-style language: "We like...", "The key risk is...", "Our view is...".
4. Be concise. Bullets beat paragraphs for lists. No section should pad unnecessarily.
5. Never invent numbers not present in the live data. Use "N/A" or qualitative framing instead.
6. If the company appears to be private or pre-revenue, adapt gracefully."""

FEW_SHOT_EXAMPLE = """---
EXAMPLE OF A HIGH-QUALITY MEMO (match this tone and specificity):

# BYD — EV Investment Memo

## 1. Executive Summary
BYD is the world's largest EV maker by unit volume and the only scaled player with full \
vertical integration from lithium refining to finished vehicle. We view BYD as the \
best-positioned non-Tesla EV pure-play globally, with a cost structure Western competitors \
cannot replicate this decade. Preliminary verdict: **Buy**, long-term horizon.

## 2. Company Snapshot
- **Founded:** 1995 | **HQ:** Shenzhen, China | **Ticker:** 1211.HK / 002594.SZ
- **CEO:** Wang Chuanfu | **Employees:** ~700,000
- **Business model:** OEM + Battery (vertically integrated)

## 3. Product & Technology
BYD's Blade Battery (LFP) anchors a lineup from the sub-$15K Seagull to premium Yangwang \
off-roaders. Cell-to-pack architecture delivers industry-leading safety and cost per kWh. \
~75% vertical integration is unmatched in the industry.

## 4. Market Position
Leads global EV+PHEV by volume. Dominant in China, expanding SE Asia, Latin America, Europe.
- **Tesla** — Higher margins, software moat; no sub-$25K presence.
- **Geely/Zeekr** — Close rival; weaker battery integration.
- **VW Group** — Legacy scale; structurally disadvantaged on EV unit economics.

## 5. Financial Highlights
- Revenue ~$90B, +20% YoY | Gross margin ~20%, expanding | Net margin ~5%
- Strong net cash, self-funding capex | Solidly profitable

## 6. Growth Drivers
- European factory ramp coming in 2026-27.
- Sodium-ion battery roadmap widens cost moat further.
- Premium Yangwang/Denza brands unlock higher ASPs.
- Stationary BESS storage becoming a meaningful second leg.

## 7. Key Risks
- Geopolitical/tariff exposure on EU and US exports.
- Domestic China price war compressing near-term margins.
- Governance/related-party concerns typical of Chinese listings.
- Key-person dependence on founder Wang Chuanfu.

## 8. ESG & Sustainability
LFP chemistry eliminates cobalt exposure. Below-peer lifecycle emissions. Recycling nascent \
but in-house. ESG ratings mixed — governance, not environmental, is the concern.

## 9. Valuation & Price Target
- Market cap ~$75-90B | EV/Revenue ~0.9x, EV/EBITDA ~8-10x
- ~70% discount to Tesla on forward earnings despite comparable volumes.
- 12-month target: HK$300-350 (base), multiple re-rating as export story plays out.

## 10. Investment Recommendation
- **Verdict:** Buy | **Horizon:** Long-term | **Confidence:** Medium-High
- Unmatched cost leadership trading at deep discount to peers. Key risk (geopolitics) \
  is real but already priced in.
---"""

THINKING_PROMPT = """Before writing the memo, think through these questions inside \
<thinking></thinking> tags (they will be hidden from the final output):
1. Core business model in one sentence?
2. Single strongest reason to invest?
3. Single biggest reason NOT to invest?
4. Verdict: Buy / Hold / Avoid / Watch?
5. Confidence: Low / Medium / High — why?"""

OUTPUT_TEMPLATE = """# {company} — EV Investment Memo

*Prepared by: AI Investment Analyst (prototype) | {date}*

## 1. Executive Summary
[3-4 sentences. Clear thesis. Preliminary verdict. Memo-style opener — not Wikipedia.]

## 2. Company Snapshot
- **Founded / HQ / Ticker:**
- **CEO:**
- **Employees:**
- **Business model:** (OEM / Battery / Charging / Components / Software / Other)

## 3. Product & Technology
[2-3 short paragraphs: flagship products, technology moat, manufacturing footprint.]

## 4. Market Position
[One paragraph on value chain position + geography. Bullet list of 2-3 competitors \
with one-line differentiator each.]

## 5. Financial Highlights
[Use the live data provided. Present the key metrics cleanly.]
- **Revenue & trend:**
- **Gross margin:**
- **Cash position / runway:**
- **Profitability:**
- **Valuation snapshot:**

## 6. Growth Drivers
- [Driver 1]
- [Driver 2]
- [Driver 3]
- [Driver 4 — optional]

## 7. Key Risks
- [Risk 1 — must be thesis-disconfirming, not generic]
- [Risk 2]
- [Risk 3]
- [Risk 4 — optional]

## 8. ESG & Sustainability
[Lifecycle emissions posture, supply chain ethics, battery recycling, ESG ratings.]

## 9. Valuation & Price Target
[Use the live multiples provided. Compare to peers. Give a directional 12-month target \
with one-line methodology.]
- **Market cap / EV:**
- **Key multiples vs. peers:**
- **12-month directional target:**

## 10. Investment Recommendation
- **Verdict:** Buy / Hold / Avoid / Watch
- **Time horizon:** Short / Medium / Long-term
- **Confidence:** Low / Medium / High
- **Rationale:** [2 sentences. Must trace back to Section 1 thesis.]

---
*Disclaimer: Financial figures sourced from live market data (Yahoo Finance) and may \
not reflect the most recent filings. Valuations are directional only. Not investment advice.*"""


def build_prompt(company_name: str, ticker: str, fin_data: dict, wiki_summary: str) -> str:
    """
    Assembles the full enriched prompt by combining:
      - System prompt (persona + rules)
      - Few-shot example (quality benchmark)
      - Chain-of-thought instruction (thinking step)
      - Live data context block (real numbers from APIs)
      - Output template (10-section structure)

    The live data context is the key upgrade over the Claude artifact version —
    we're injecting real, current numbers so the LLM doesn't have to guess.
    """
    from datetime import date
    today = date.today().strftime("%B %d, %Y")

    # Build the live data block from whatever we fetched successfully
    if fin_data and "error" not in fin_data:
        live_data_block = f"""
LIVE MARKET DATA — use these numbers in the memo. Prioritise them over training-data estimates.

Company (from data):   {fin_data.get('company_name', 'N/A')}
Ticker:                {ticker.upper()}
Current Price:         {fin_data.get('current_price', 'N/A')}
Market Cap:            {fin_data.get('market_cap', 'N/A')}
Enterprise Value:      {fin_data.get('enterprise_value', 'N/A')}
52-Week Range:         {fin_data.get('52w_low', 'N/A')} – {fin_data.get('52w_high', 'N/A')}

Revenue (TTM):         {fin_data.get('revenue_ttm', 'N/A')}
Gross Margin:          {fin_data.get('gross_margin', 'N/A')}
Operating Margin:      {fin_data.get('operating_margin', 'N/A')}
Net Margin:            {fin_data.get('net_margin', 'N/A')}
Free Cash Flow (TTM):  {fin_data.get('free_cash_flow', 'N/A')}
Cash & Equivalents:    {fin_data.get('cash', 'N/A')}
Total Debt:            {fin_data.get('total_debt', 'N/A')}

P/E Ratio:             {fin_data.get('pe_ratio', 'N/A')}
EV / Revenue:          {fin_data.get('ev_revenue', 'N/A')}
EV / EBITDA:           {fin_data.get('ev_ebitda', 'N/A')}

Employees:             {fin_data.get('employees', 'N/A')}
Country:               {fin_data.get('country', 'N/A')}

Business Description (from Yahoo Finance):
{fin_data.get('description', 'N/A')}

Recent News Headlines:
{fin_data.get('recent_news', 'N/A')}
"""
    else:
        # Ticker not found or fetch failed — fall back gracefully
        live_data_block = f"""
LIVE MARKET DATA: Could not fetch data for ticker "{ticker}".
This may be a private company or an incorrect ticker.
Use your training knowledge for financial estimates, and flag where figures are estimated.
"""

    if wiki_summary:
        wiki_block = f"""
Wikipedia Summary:
{wiki_summary}
"""
    else:
        wiki_block = ""

    filled_template = OUTPUT_TEMPLATE.replace("{company}", company_name).replace("{date}", today)

    return f"""{SYSTEM_PROMPT}

{FEW_SHOT_EXAMPLE}

{THINKING_PROMPT}

---

Now produce a VC/PE investment memo for the following company.

COMPANY: {company_name}
TICKER:  {ticker.upper()}

{live_data_block}
{wiki_block}

Instructions:
1. Complete the <thinking></thinking> step first.
2. Write the memo using the exact 10-section structure below.
3. Populate Section 5 and Section 9 with the LIVE DATA figures above — do not substitute estimates where real numbers exist.
4. Fill every bracketed instruction with real content. Do not leave brackets in the output.
5. Keep the memo under ~950 words. Return the <thinking> block followed by the memo markdown only.

{filled_template}"""


# =============================================================================
# SECTION 5: LLM CALL — GOOGLE GEMINI
# =============================================================================

def strip_thinking(text: str) -> str:
    """Remove <thinking>...</thinking> blocks before rendering."""
    import re
    return re.sub(r"<thinking>[\s\S]*?</thinking>\s*", "", text, flags=re.IGNORECASE).strip()


def generate_memo(prompt: str, api_key: str, use_critique: bool = True) -> str:
    """
    Calls the Google Gemini API with our enriched prompt.

    How LLM APIs work:
      - You send a text prompt
      - The API returns a text completion
      - You pay per "token" (roughly 4 characters = 1 token)
      - Gemini free tier = 1,500 requests/day, which is plenty

    Args:
        prompt: The full assembled prompt from build_prompt()
        api_key: Your Gemini API key from Replit Secrets
        use_critique: If True, runs a second call to review and revise the draft

    Returns:
        The final memo markdown as a string
    """
    # Configure the Gemini client with your key
    genai.configure(api_key=api_key)

    # gemini-1.5-flash is fast and free-tier-friendly
    # gemini-1.5-pro gives better quality but uses more quota
    model = genai.GenerativeModel("gemini-1.5-flash")

    # CALL 1: Generate the draft
    response = model.generate_content(prompt)
    draft = strip_thinking(response.text)

    if not use_critique:
        return draft

    # CALL 2: Self-critique — review the draft against a quality rubric
    review_prompt = f"""You are a senior VC/PE partner reviewing a draft investment memo.
Apply this quality rubric silently. Fix every failure. Return ONLY the revised memo markdown.

Rubric:
1. Does Section 1 state a clear thesis in one sentence (not a generic overview)?
2. Does Section 10's verdict trace directly to Section 1's thesis?
3. Are any numbers suspiciously precise? Replace with ranges.
4. Do competitor bullets in Section 4 actually differentiate each rival?
5. Is the voice memo-style ("We view...", "The key risk is...") throughout?
6. Is the memo under 950 words? Trim Sections 3, 6, or 8 if over.
7. Are the risks in Section 7 thesis-disconfirming, not generic?

Draft memo to review:

{draft}

Return ONLY the revised final memo markdown, starting with the # heading. Nothing else."""

    review_response = model.generate_content(review_prompt)
    revised = strip_thinking(review_response.text)

    # Safety check: if the revision looks malformed, fall back to draft
    if revised and len(revised) > 200 and "##" in revised:
        return revised
    return draft


# =============================================================================
# SECTION 6: STREAMLIT UI
# =============================================================================
# Streamlit turns Python functions into web UI elements.
# st.title() creates a heading. st.text_input() creates a text box.
# st.button() creates a button. st.markdown() renders formatted text.
# Streamlit re-runs the whole script top-to-bottom on every interaction.

def main():
    # --- Page config ---
    st.set_page_config(
        page_title="EV Investment Analyst",
        page_icon="⚡",
        layout="centered"
    )

    # --- Header ---
    st.title("⚡ EV Investment Analyst")
    st.caption("VC/PE-style memos powered by live market data + Google Gemini")
    st.divider()

    # --- API key check ---
    if not GEMINI_API_KEY:
        st.error(
            "**Gemini API key not found.** "
            "Go to the 🔒 Secrets tab in Replit and add: "
            "`GEMINI_API_KEY` = your key from aistudio.google.com"
        )
        st.stop()  # halt the app here — nothing else will render

    # --- Input form ---
    col1, col2 = st.columns([2, 1])  # two columns, left is wider

    with col1:
        company_name = st.text_input(
            "Company name",
            placeholder="e.g. Rivian, ChargePoint, Lucid Motors"
        )

    with col2:
        ticker = st.text_input(
            "Stock ticker",
            placeholder="e.g. RIVN, CHPT, LCID"
        )

    st.caption(
        "💡 For private companies, enter the name and leave the ticker blank — "
        "the memo will be based on public knowledge only."
    )

    use_critique = st.checkbox(
        "Enable self-critique (2 LLM calls, higher quality, ~2x slower)",
        value=True
    )

    generate_btn = st.button("Generate Memo", type="primary", use_container_width=True)

    # --- Generation logic ---
    if generate_btn:
        if not company_name:
            st.warning("Please enter a company name.")
            st.stop()

        # Use ticker if provided, else use company name as fallback
        ticker_clean = ticker.strip().upper() if ticker.strip() else ""

        # Step 1: Fetch data
        with st.status("Fetching live market data…", expanded=True) as status:

            fin_data = {}
            wiki_summary = ""

            if ticker_clean:
                st.write(f"📈 Pulling financials for **{ticker_clean}** from Yahoo Finance…")
                fin_data = fetch_financial_data(ticker_clean)
                if "error" in fin_data:
                    st.warning(f"Ticker not found: {fin_data['error']}. Proceeding without live data.")
                    fin_data = {}
                else:
                    st.write(f"✅ Got financials — revenue {fin_data.get('revenue_ttm', 'N/A')}, "
                             f"market cap {fin_data.get('market_cap', 'N/A')}")

            st.write(f"📖 Fetching Wikipedia summary for **{company_name}**…")
            wiki_summary = fetch_wikipedia_summary(company_name)
            if wiki_summary:
                st.write("✅ Wikipedia summary loaded.")
            else:
                st.write("⚠️ No Wikipedia summary found — proceeding without it.")

            status.update(label="Data fetched. Building prompt…", state="running")

        # Step 2: Build prompt
        prompt = build_prompt(company_name, ticker_clean or "N/A", fin_data, wiki_summary)

        # Step 3: Generate memo
        step_label = "Generating memo (2 LLM calls — draft + self-critique)…" if use_critique \
                     else "Generating memo…"

        with st.spinner(step_label):
            try:
                memo = generate_memo(prompt, GEMINI_API_KEY, use_critique=use_critique)
            except Exception as e:
                st.error(f"LLM call failed: {e}")
                st.stop()

        # Step 4: Display
        st.success("Memo generated!")
        st.divider()
        st.markdown(memo)
        st.divider()

        # Download button
        safe_name = company_name.replace(" ", "_")
        st.download_button(
            label="⬇️ Download memo as .md",
            data=memo,
            file_name=f"{safe_name}_EV_investment_memo.md",
            mime="text/markdown"
        )

    # --- Footer ---
    st.divider()
    st.caption(
        "Data sources: Yahoo Finance (yfinance) · Wikipedia REST API · Google Gemini 1.5 Flash  \n"
        "Financials and valuations are directional only. Not investment advice."
    )


# This is the Python convention for "run main() when this file is executed directly"
if __name__ == "__main__" or True:
    main()
