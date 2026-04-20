const BASE = 'https://api.the-odds-api.com/v4'

export async function getOdds(sportKey, teamName) {
  const key = process.env.ODDS_API_KEY
  const url = `${BASE}/sports/${sportKey}/odds?apiKey=${key}&regions=uk&markets=h2h,totals&oddsFormat=decimal`

  const res = await fetch(url)
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Odds API ${res.status}: ${text}`)
  }

  const events = await res.json()

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
    filtered = events.slice(0, 8)
  }

  return filtered.map(event => ({
    match: `${event.home_team} vs ${event.away_team}`,
    commenceTime: event.commence_time,
    bookmakers: (event.bookmakers || []).slice(0, 4).map(b => ({
      name: b.title,
      markets: (b.markets || []).map(m => ({
        type: m.key === 'h2h' ? 'Match Result' : m.key === 'totals' ? 'Over/Under' : m.key,
        outcomes: m.outcomes.map(o => ({
          name: o.name,
          price: o.price,
          ...(o.point !== undefined && { point: o.point }),
        })),
      })),
    })),
  }))
}
