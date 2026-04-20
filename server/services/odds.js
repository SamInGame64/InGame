const BASE = 'https://api.the-odds-api.com/v4'

const MARKET_LABELS = {
  h2h: 'Match Result',
  totals: 'Over/Under Goals',
  spreads: 'Asian Handicap',
  player_goal_scorer_anytime: 'Anytime Goalscorer',
  player_goal_scorer_first: 'First Goalscorer',
  player_goal_scorer_last: 'Last Goalscorer',
  bookie_scorer: 'First Goalscorer',
}

async function fetchMarkets(sportKey, markets) {
  const key = process.env.ODDS_API_KEY
  const url = `${BASE}/sports/${sportKey}/odds?apiKey=${key}&regions=uk&markets=${markets}&oddsFormat=decimal`
  const res = await fetch(url)
  if (!res.ok) return null
  return res.json()
}

function formatEvents(events, teamName, limit = 8) {
  let filtered = events
  if (teamName) {
    const lower = teamName.toLowerCase()
    filtered = events.filter(
      e =>
        e.home_team.toLowerCase().includes(lower) ||
        e.away_team.toLowerCase().includes(lower)
    )
    if (filtered.length === 0) filtered = events.slice(0, 6)
  } else {
    filtered = events.slice(0, limit)
  }

  return filtered.map(event => ({
    match: `${event.home_team} vs ${event.away_team}`,
    commenceTime: event.commence_time,
    bookmakers: (event.bookmakers || []).slice(0, 4).map(b => ({
      name: b.title,
      markets: (b.markets || []).map(m => ({
        type: MARKET_LABELS[m.key] || m.key,
        outcomes: m.outcomes.map(o => ({
          name: o.name,
          price: o.price,
          ...(o.point !== undefined && { point: o.point }),
        })),
      })),
    })),
  }))
}

export async function getOdds(sportKey, teamName) {
  const events = await fetchMarkets(sportKey, 'h2h,totals')
  if (!events) throw new Error('Odds API request failed')
  return formatEvents(events, teamName)
}

// Fetches goalscorer markets. Falls back gracefully if the plan doesn't support them.
export async function getGoalscorerOdds(sportKey, teamName) {
  const scorerMarkets = 'player_goal_scorer_first,player_goal_scorer_anytime'

  // Try scorer markets first, fall back to h2h if unavailable
  const [scorerEvents, matchEvents] = await Promise.all([
    fetchMarkets(sportKey, scorerMarkets).catch(() => null),
    fetchMarkets(sportKey, 'h2h'),
  ])

  const hasScorerData =
    scorerEvents &&
    Array.isArray(scorerEvents) &&
    scorerEvents.some(e => (e.bookmakers || []).some(b => b.markets?.length > 0))

  return {
    scorerOddsAvailable: hasScorerData,
    scorerMarkets: hasScorerData ? formatEvents(scorerEvents, teamName, 4) : [],
    matchOdds: matchEvents ? formatEvents(matchEvents, teamName, 4) : [],
  }
}
