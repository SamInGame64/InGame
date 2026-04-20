const BASE = 'https://api.football-data.org/v4'

export const COMP_CODES = {
  'premier league': 'PL',
  'pl': 'PL',
  'champions league': 'CL',
  'ucl': 'CL',
  'europa league': 'EL',
  'la liga': 'PD',
  'bundesliga': 'BL1',
  'serie a': 'SA',
  'ligue 1': 'FL1',
  'championship': 'ELC',
}

const COMP_DISPLAY = {
  PL: 'Premier League',
  CL: 'UEFA Champions League',
  EL: 'UEFA Europa League',
  PD: 'La Liga',
  BL1: 'Bundesliga',
  SA: 'Serie A',
  FL1: 'Ligue 1',
  ELC: 'Championship',
}

const SEARCH_ORDER = ['PL', 'CL', 'PD', 'BL1', 'SA', 'FL1', 'EL', 'ELC']

// Per-competition team registry, cached for 12 hours
const _teamCache = {}

async function fdFetch(path) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'X-Auth-Token': process.env.FOOTBALL_DATA_KEY },
  })
  if (res.status === 429) throw new Error('football-data.org rate limit — try again shortly')
  if (!res.ok) throw new Error(`football-data.org ${res.status}: ${res.statusText}`)
  return res.json()
}

async function getCompTeams(code) {
  const now = Date.now()
  if (_teamCache[code]?.expiry > now) return _teamCache[code].teams
  try {
    const data = await fdFetch(`/competitions/${code}/teams`)
    const teams = data.teams || []
    _teamCache[code] = { teams, expiry: now + 12 * 60 * 60 * 1000 }
    return teams
  } catch {
    return []
  }
}

function scoreTeam(team, query) {
  const q = query.toLowerCase().trim()
  const name = (team.name || '').toLowerCase()
  const short = (team.shortName || '').toLowerCase()
  const tla = (team.tla || '').toLowerCase()

  if (name === q || short === q || tla === q) return 100
  if (name.startsWith(q) || short.startsWith(q)) return 80
  if (name.includes(q) || short.includes(q)) return 60
  const tokens = q.split(' ').filter(t => t.length > 2)
  const hits = tokens.filter(t => name.includes(t) || short.includes(t))
  return tokens.length > 0 ? (hits.length / tokens.length) * 40 : 0
}

async function findTeam(name) {
  for (const code of SEARCH_ORDER) {
    const teams = await getCompTeams(code)
    const best = teams
      .map(t => ({ team: t, score: scoreTeam(t, name) }))
      .filter(x => x.score >= 40)
      .sort((a, b) => b.score - a.score)[0]
    if (best) return { team: best.team, competition: code }
  }
  return null
}

function formatMatch(m) {
  const home = m.homeTeam?.name || 'Unknown'
  const away = m.awayTeam?.name || 'Unknown'
  const score =
    m.score?.fullTime?.home != null
      ? `${m.score.fullTime.home}-${m.score.fullTime.away}`
      : null
  const winner =
    m.score?.winner === 'HOME_TEAM'
      ? home
      : m.score?.winner === 'AWAY_TEAM'
        ? away
        : m.score?.winner === 'DRAW'
          ? 'Draw'
          : null
  return {
    date: m.utcDate?.slice(0, 10),
    competition: m.competition?.name,
    home,
    away,
    score,
    winner,
    matchday: m.matchday,
  }
}

// ─── Exported functions ────────────────────────────────────────────────────

export async function getStandings(competitionInput = 'PL') {
  const code = COMP_CODES[competitionInput.toLowerCase()] || competitionInput.toUpperCase()
  const data = await fdFetch(`/competitions/${code}/standings`)
  const table = data.standings?.find(s => s.type === 'TOTAL')?.table || []

  return {
    competition: COMP_DISPLAY[code] || code,
    season: data.season?.startDate?.slice(0, 4),
    table: table.map(row => ({
      position: row.position,
      team: row.team?.name,
      played: row.playedGames,
      won: row.won,
      drawn: row.draw,
      lost: row.lost,
      gf: row.goalsFor,
      ga: row.goalsAgainst,
      gd: row.goalDifference,
      points: row.points,
      form: row.form,
    })),
  }
}

export async function getHeadToHead(team1Name, team2Name) {
  const [r1, r2] = await Promise.all([findTeam(team1Name), findTeam(team2Name)])

  if (!r1) return { error: `Team not found: "${team1Name}"` }
  if (!r2) return { error: `Team not found: "${team2Name}"` }

  const team1 = r1.team
  const team2 = r2.team

  // Fetch recent matches for team1 and filter for team2
  const data = await fdFetch(`/teams/${team1.id}/matches?status=FINISHED&limit=100`)
  const h2h = (data.matches || []).filter(
    m => m.homeTeam?.id === team2.id || m.awayTeam?.id === team2.id
  )

  // Tally results from team1's perspective
  let team1Wins = 0, team2Wins = 0, draws = 0
  for (const m of h2h) {
    const t1Home = m.homeTeam?.id === team1.id
    const winner = m.score?.winner
    if (winner === 'DRAW') draws++
    else if ((winner === 'HOME_TEAM') === t1Home) team1Wins++
    else team2Wins++
  }

  return {
    team1: team1.name,
    team2: team2.name,
    totalMeetings: h2h.length,
    record: {
      [team1.name]: team1Wins,
      draws,
      [team2.name]: team2Wins,
    },
    last5: h2h.slice(0, 5).map(formatMatch),
  }
}

export async function getSquad(teamName) {
  const result = await findTeam(teamName)
  if (!result) return { error: `Team not found: "${teamName}"` }

  const data = await fdFetch(`/teams/${result.team.id}`)
  const squad = data.squad || []

  const byPosition = {}
  for (const p of squad) {
    const pos = p.position || 'Unknown'
    if (!byPosition[pos]) byPosition[pos] = []
    byPosition[pos].push({
      name: p.name,
      nationality: p.nationality,
      dateOfBirth: p.dateOfBirth?.slice(0, 10),
      marketValue: p.marketValue,
    })
  }

  return {
    team: data.name,
    competition: COMP_DISPLAY[result.competition] || result.competition,
    coach: data.coach?.name,
    founded: data.founded,
    venue: data.venue,
    squad: byPosition,
  }
}

export async function getTeamRecentResults(teamName, limit = 10) {
  const result = await findTeam(teamName)
  if (!result) return { error: `Team not found: "${teamName}"` }

  const data = await fdFetch(`/teams/${result.team.id}/matches?status=FINISHED&limit=${limit}`)
  return {
    team: result.team.name,
    results: (data.matches || []).map(formatMatch),
  }
}
