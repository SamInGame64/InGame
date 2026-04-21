const BASE = 'https://api.the-odds-api.com/v4'

const MARKET_LABELS = {
  h2h: 'Match Result',
  totals: 'Over/Under Goals',
  btts: 'Both Teams to Score',
  spreads: 'Asian Handicap',
  alternate_totals_corners: 'Corners Over/Under',
  alternate_totals_cards: 'Cards Over/Under',
  player_goal_scorer_anytime: 'Anytime Goalscorer',
  player_goal_scorer_first: 'First Goalscorer',
  player_goal_scorer_last: 'Last Goalscorer',
  bookie_scorer: 'First Goalscorer',
}

const BOOKMAKER_META = {
  'Betfair':      { domain: 'betfair.com' },
  'Betfair Exchange': { domain: 'betfair.com' },
  'William Hill': { domain: 'williamhill.com' },
  'Bet365':       { domain: 'bet365.com' },
  'Paddy Power':  { domain: 'paddypower.com' },
  'Sky Bet':      { domain: 'skybet.com' },
  'Unibet':       { domain: 'unibet.co.uk' },
  'Coral':        { domain: 'coral.co.uk' },
  'Ladbrokes':    { domain: 'ladbrokes.com' },
  'Betway':       { domain: 'betway.com' },
  'BoyleSports':  { domain: 'boylesports.com' },
  'BetVictor':    { domain: 'betvictor.com' },
  '888sport':     { domain: '888sport.com' },
  'Spreadex':     { domain: 'spreadex.com' },
  'Matchbook':    { domain: 'matchbook.com' },
}

function logoUrl(name) {
  const meta = BOOKMAKER_META[name]
  return meta ? `https://www.google.com/s2/favicons?domain=${meta.domain}&sz=32` : null
}

function gcd(a, b) {
  return b === 0 ? a : gcd(b, a % b)
}

export function decimalToFractional(decimal) {
  if (!decimal || decimal <= 1) return 'N/A'
  if (Math.abs(decimal - 2.0) < 0.005) return 'Evs'

  const value = decimal - 1
  let bestNum = 1, bestDen = 1, bestErr = Infinity

  for (let den = 1; den <= 100; den++) {
    const num = Math.round(value * den)
    if (num <= 0) continue
    const err = Math.abs(value - num / den)
    if (err < bestErr) {
      bestErr = err
      bestNum = num
      bestDen = den
    }
    if (bestErr < 0.005) break
  }

  const g = gcd(bestNum, bestDen)
  return `${bestNum / g}/${bestDen / g}`
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
    bookmakers: (event.bookmakers || []).slice(0, 5).map(b => ({
      name: b.title,
      logoUrl: logoUrl(b.title),
      markets: (b.markets || []).map(m => ({
        type: MARKET_LABELS[m.key] || m.key,
        outcomes: m.outcomes.map(o => ({
          name: o.name,
          decimal: o.price,
          fractional: decimalToFractional(o.price),
          ...(o.point !== undefined && { point: o.point }),
        })),
      })),
    })),
  }))
}

export async function getOdds(sportKey, teamName) {
  const events = await fetchMarkets(sportKey, 'h2h,totals,btts')
  if (!events) throw new Error('Odds API request failed')
  return formatEvents(events, teamName)
}

export async function getSpecialMarkets(sportKey, teamName) {
  const events = await fetchMarkets(sportKey, 'alternate_totals_corners,alternate_totals_cards,spreads').catch(() => null)

  if (!events || !Array.isArray(events)) {
    return { available: false, message: 'Special markets (corners, cards, handicap) are not currently available for this competition.' }
  }

  const formatted = formatEvents(events, teamName, 4)
  const hasData = formatted.some(e => e.bookmakers.some(b => b.markets.length > 0))

  if (!hasData) {
    return { available: false, message: 'Corners, cards, and handicap markets are not yet available for this match. They typically appear closer to kick-off.' }
  }

  // Flag which specific markets have data
  const sample = formatted.flatMap(e => e.bookmakers.flatMap(b => b.markets.map(m => m.type)))
  const unique = [...new Set(sample)]

  return {
    available: true,
    marketsPresent: unique,
    cornersAvailable: unique.includes('Corners Over/Under'),
    cardMarketsAvailable: unique.includes('Cards Over/Under'),
    handicapAvailable: unique.includes('Asian Handicap'),
    events: formatted,
  }
}

export async function getGoalscorerOdds(sportKey, teamName) {
  const [scorerEvents, matchEvents] = await Promise.all([
    fetchMarkets(sportKey, 'player_goal_scorer_first,player_goal_scorer_anytime').catch(() => null),
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
