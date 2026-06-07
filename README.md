# Gulf CX Intelligence Agent

A multi-agent AI system that analyses the customer experience quality of any UAE enterprise using public data sources.

## What it does

Enter any UAE company name and the system deploys four specialised AI agents that work in parallel to build a comprehensive CX intelligence brief. The agents scrape and analyse app store reviews (in both Arabic and English), social media complaints from platforms like Twitter and Google Maps, public job postings to infer tech stack and CX maturity signals, and then a final LLM synthesis agent aggregates all findings into a structured CX gap analysis. The output includes a CX maturity score (1-5), identified experience gaps, and ranked AI opportunity recommendations — all presented through an interactive Streamlit dashboard.

## Architecture

```
                         ┌─────────────────────┐
                         │    Company Name      │
                         │   (User Input)       │
                         └─────────┬───────────┘
                                   │
                    ┌──────────────┼──────────────┐
                    │              │              │
                    ▼              ▼              ▼
          ┌─────────────┐ ┌──────────────┐ ┌─────────────┐
          │  Agent 1:   │ │  Agent 2:    │ │  Agent 3:   │
          │ App Reviews │ │   Social     │ │ Tech Stack  │
          │ (AR + EN)   │ │ Complaints   │ │  & Jobs     │
          └──────┬──────┘ └──────┬───────┘ └──────┬──────┘
                 │               │                │
                 └───────────────┼────────────────┘
                                 │
                                 ▼
                       ┌─────────────────┐
                       │    Agent 4:     │
                       │ LLM Synthesis   │
                       │ (Gap Analysis)  │
                       └────────┬────────┘
                                │
                                ▼
                     ┌────────────────────┐
                     │    Streamlit       │
                     │    Dashboard       │
                     └────────────────────┘
```

## Tech Stack

| Dependency | Purpose |
|---|---|
| **LangGraph** | Orchestrates the multi-agent pipeline as a stateful directed graph |
| **LangChain** | Provides LLM abstractions, prompt templates, and chain composition |
| **OpenAI GPT-4** | Powers the synthesis agent for CX gap analysis and recommendations |
| **Streamlit** | Serves the interactive dashboard for exploring CX intelligence output |
| **BeautifulSoup4** | Parses HTML from app store pages and social platforms for scraping |
| **Playwright** | Handles JavaScript-rendered pages that BeautifulSoup alone cannot scrape |
| **google-play-scraper** | Extracts app reviews and ratings from Google Play Store |
| **ChromaDB** | Stores and retrieves review embeddings for semantic search during synthesis |
| **Pandas** | Structures and transforms scraped data for analysis and dashboard display |
| **python-dotenv** | Loads environment variables from `.env` for API key management |

## Setup & Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/rythamgarg/gulf-cx-agent.git
   cd gulf-cx-agent
   ```

2. **Create a virtual environment**
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

3. **Install dependencies**
   ```bash
   pip install -r requirements.txt
   ```

4. **Configure environment variables**
   ```bash
   cp .env.example .env
   ```
   Open `.env` and add your OpenAI API key.

5. **Run the dashboard**
   ```bash
   streamlit run dashboard/app.py
   ```

## Example Output

> Screenshot coming soon

The dashboard displays a company-level CX intelligence brief with:
- Overall CX maturity score (1-5) with a visual gauge
- Sentiment breakdown across app reviews and social mentions
- Identified CX gaps ranked by severity
- AI opportunity recommendations with estimated impact
- Raw data explorer for reviews, complaints, and job postings

## Why I built this

After years of deploying contact center transformations and conversational AI solutions for Fortune 500 clients, I noticed the same pattern repeating across UAE enterprises — significant gaps between the customer experience companies think they deliver and what their customers actually report. The data to diagnose these gaps already exists publicly in app reviews, social complaints, and hiring patterns, but nobody was connecting the dots systematically. I built this tool to automate the CX due diligence process I was doing manually, turning hours of research into a structured intelligence brief generated in minutes.

## Roadmap

- [ ] Add competitor comparison mode
- [ ] Arabic sentiment scoring with CAMeL Tools
- [ ] Export CX brief as PDF
- [ ] Add UAE bank benchmark dataset

## License

MIT
