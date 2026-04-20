const BASE = 'https://v3.football.api-sports.io'

function headers() {
  return { 'x-apisports-key': process.env.API_FOOTBALL_KEY }
}

async function apiFetch(path) {
  const res = await fetch(`${BASE}${path}`, { headers: headers() })
  if (!res.ok) throw new Error(`API-Football ${res.status}: ${res.statusText}`)
  const data = await res.json()
  if (data.errors && Object.keys(data.errors).length > 0) {
    throw new Error(`API-Football error: ${JSON.stringify(data.errors)}`)
  }
  return data
}

async function findTeam(name) {
  const data = await apiFetch(`/teams?name=${encodeURIComponent(name)}`)
  const exact = data.response?.find(
    t => t.team.name.toLowerCase() === name.toLowerCase()
  )
  return exact || data.response?.[0] || null
}

function formatFixture(f) {
  return {
    date: f.fixture.date,
    home: f.teams.home.name,
    away: f.teams.away.name,
    venue: f.fixture.venue?.name || 'TBC',
    league: f.league.name,
    status: f.fixture.status.long,
    score: f.goals.home !== null ? `${f.goals.home}-${f.goals.away}` : null,
    winner: f.teams.home.winner === true
      ? f.teams.home.name
      : f.teams.away.winner === true
        ? f.teams.away.name
        : f.teams.home.winner === false && f.teams.away.winner === false
          ? 'Draw'
          : null,
  }
}

export async function searchFixtures(teamName, next = 5) {
  const team = await findTeam(teamName)
  if (!team) return { error: `Team "${teamName}" not found` }

  const id = team.team.id
  const [upcomingData, recentData] = await Promise.all([
    apiFetch(`/fixtures?team=${id}&next=${next}&timezone=Europe/London`),
    apiFetch(`/fixtures?team=${id}&last=5&timezone=Europe/London`),
  ])

  return {
    team: team.team.name,
    country: team.team.country,
    upcoming: (upcomingData.response || []).map(formatFixture),
    recent: (recentData.response || []).map(formatFixture),
  }
}

export async function getTeamStats(teamName, leagueId) {
  const team = await findTeam(teamName)
  if (!team) return { error: `Team "${teamName}" not found` }

  const data = await apiFetch(
    `/teams/statistics?team=${team.team.id}&league=${leagueId}&season=2024`
  )
  const s = data.response
  if (!s) return { error: 'No statistics found for this team/league combination' }

  return {
    team: s.team?.name,
    league: s.league?.name,
    season: s.league?.season,
    form: s.form,
    played: s.fixtures?.played,
    wins: s.fixtures?.wins,
    draws: s.fixtures?.draws,
    loses: s.fixtures?.loses,
    goalsFor: s.goals?.for?.total,
    goalsAgainst: s.goals?.against?.total,
    avgGoalsFor: s.goals?.for?.average,
    avgGoalsAgainst: s.goals?.against?.average,
    cleanSheets: s.clean_sheet?.total,
    failedToScore: s.failed_to_score?.total,
    biggestWin: s.biggest?.wins,
    biggestLoss: s.biggest?.loses,
  }
}
