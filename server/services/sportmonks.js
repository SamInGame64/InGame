import {
  getDb,
} from '../db/index.js'
import {
  upsertTeam,
  upsertPlayer,
  upsertFixture,
  upsertPlayerFixtureStat,
  getH2HFixtures,
  getPlayerStatsVsOpponent,
  isH2HSeeded,
  markH2HSeeded,
} from '../db/queries.js'

const BASE = 'https://api.sportmonks.com/v3/football'
const LEAGUE_ID = 8 // Premier League (confirmed via Sportmonks docs)

// In-memory cache for resolved IDs within a session
const _teamCache = new Map()
const _playerCache = new Map()

async function smFetch(path, params = {}) {
  const url = new URL(`${BASE}${path}`)
  url.searchParams.set('api_token', process.env.SPORTMONKS_API_KEY)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)

  const res = await fetch(url.toString())
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Sportmonks ${res.status}: ${text.slice(0, 200)}`)
  }
  return res.json()
}

// Fetch all pages of a paginated endpoint
async function smFetchAll(path, params = {}) {
  const results = []
  let page = 1
  while (true) {
    const data = await smFetch(path, { ...params, page, per_page: 50 })
    if (data.data) results.push(...(Array.isArray(data.data) ? data.data : [data.data]))
    if (!data.pagination || page >= data.pagination.last_page) break
    page++
    await new Promise(r => setTimeout(r, 120)) // respect rate limits
  }
  return results
}

// ─── Team resolution ─────────────────────────────────────────────────────────

export async function searchTeam(name) {
  const key = name.toLowerCase().trim()
  if (_teamCache.has(key)) return _teamCache.get(key)

  const data = await smFetch(`/teams/search/${encodeURIComponent(name)}`)
  const teams = Array.isArray(data.data) ? data.data : []
  if (teams.length === 0) return null

  const team = teams[0]
  const result = { id: team.id, name: team.name, short_name: team.short_name || team.name }
  _teamCache.set(key, result)
  return result
}

// ─── Player resolution ───────────────────────────────────────────────────────

export async function searchPlayerLive(name) {
  const key = name.toLowerCase().trim()
  if (_playerCache.has(key)) return _playerCache.get(key)

  const data = await smFetch(`/players/search/${encodeURIComponent(name)}`)
  const players = Array.isArray(data.data) ? data.data : []
  if (players.length === 0) return null

  const p = players[0]
  const result = { id: p.id, name: p.display_name || p.name, position: p.position_id, nationality: p.nationality_id }
  _playerCache.set(key, result)
  return result
}

// ─── Live endpoints ───────────────────────────────────────────────────────────

export async function getCurrentFixtures(teamName) {
  try {
    const team = await searchTeam(teamName)
    if (!team) return { error: `Team not found: ${teamName}` }

    const today = new Date().toISOString().split('T')[0]
    const future = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

    const data = await smFetch(`/fixtures/between/${today}/${future}/${team.id}`, {
      include: 'participants;scores',
      per_page: 5,
    })

    const fixtures = Array.isArray(data.data) ? data.data : []
    return {
      team: team.name,
      upcomingFixtures: fixtures.map(f => {
        const home = f.participants?.find(p => p.meta?.location === 'home')
        const away = f.participants?.find(p => p.meta?.location === 'away')
        return {
          id: f.id,
          date: f.starting_at,
          home: home?.name || 'Unknown',
          away: away?.name || 'Unknown',
          status: f.state?.short_name || f.state?.name || 'Scheduled',
        }
      }),
    }
  } catch (err) {
    return { error: err.message }
  }
}

export async function getStandings() {
  try {
    // Get current season via league endpoint
    const leagueData = await smFetch(`/leagues/${LEAGUE_ID}`, { include: 'currentSeason' })
    const currentSeason = leagueData.data?.currentseason
    if (!currentSeason) return { error: 'Could not find current Premier League season' }

    const data = await smFetch(`/standings/seasons/${currentSeason.id}`, {
      include: 'participant;details',
    })

    const standings = Array.isArray(data.data) ? data.data : []
    return {
      season: currentSeason.name,
      competition: 'Premier League',
      table: standings
        .sort((a, b) => (a.position || 99) - (b.position || 99))
        .map(row => ({
          position: row.position,
          team: row.participant?.name || 'Unknown',
          played: row.details?.find(d => d.type_id === 129)?.value ?? '—',
          won: row.details?.find(d => d.type_id === 130)?.value ?? '—',
          drawn: row.details?.find(d => d.type_id === 131)?.value ?? '—',
          lost: row.details?.find(d => d.type_id === 132)?.value ?? '—',
          gf: row.details?.find(d => d.type_id === 133)?.value ?? '—',
          ga: row.details?.find(d => d.type_id === 134)?.value ?? '—',
          gd: row.details?.find(d => d.type_id === 36)?.value ?? '—',
          points: row.points,
          form: row.form || '',
        })),
    }
  } catch (err) {
    return { error: err.message }
  }
}

export async function getInjuries(teamName) {
  try {
    const team = await searchTeam(teamName)
    if (!team) return { error: `Team not found: ${teamName}` }

    const data = await smFetch('/injuries', {
      filters: `teamId:${team.id}`,
      include: 'player;type',
    })

    const injuries = Array.isArray(data.data) ? data.data : []
    if (injuries.length === 0) {
      return { team: team.name, message: 'No current injuries or suspensions reported.', players: [] }
    }

    return {
      team: team.name,
      players: injuries.map(i => ({
        name: i.player?.display_name || i.player?.name || 'Unknown',
        type: i.type?.name || 'Injury',
        description: i.description || null,
        expectedReturn: i.expected_return || null,
      })),
    }
  } catch (err) {
    return { error: err.message }
  }
}

export async function getLineup(fixtureId) {
  try {
    const data = await smFetch(`/fixtures/${fixtureId}`, {
      include: 'lineups.player;formations',
    })

    const fixture = data.data
    if (!fixture) return { error: `Fixture ${fixtureId} not found` }

    const lineups = fixture.lineups || []
    const byTeam = {}
    for (const entry of lineups) {
      const teamId = entry.team_id
      if (!byTeam[teamId]) byTeam[teamId] = { teamId, players: [] }
      byTeam[teamId].players.push({
        name: entry.player?.display_name || entry.player?.name || 'Unknown',
        position: entry.position || null,
        number: entry.jersey_number || null,
        type: entry.type?.name || 'Starting', // Starting / Substitute
      })
    }

    return {
      fixtureId,
      lineups: Object.values(byTeam),
      confirmed: lineups.length > 0,
    }
  } catch (err) {
    return { error: err.message }
  }
}

export async function getPlayerStats(playerName) {
  try {
    const player = await searchPlayerLive(playerName)
    if (!player) return { error: `Player not found: ${playerName}` }

    // Get current season via league endpoint
    const leagueData = await smFetch(`/leagues/${LEAGUE_ID}`, { include: 'currentSeason' })
    const currentSeason = leagueData.data?.currentseason

    const statsData = await smFetch(`/players/${player.id}`, {
      include: 'statistics.details;currentTeam',
      filters: currentSeason ? `seasonId:${currentSeason.id}` : '',
    })

    const p = statsData.data
    if (!p) return { error: `Could not load stats for ${playerName}` }

    const stats = p.statistics?.[0]?.details || []
    const getStat = typeId => stats.find(s => s.type_id === typeId)?.value?.total ?? 0

    return {
      name: p.display_name || p.name,
      team: p.current_team?.name || 'Unknown',
      position: p.position?.name || 'Unknown',
      season: currentSeason?.name || '2024/25',
      appearances: getStat(321),
      goals: getStat(52),
      assists: getStat(79),
      yellowCards: getStat(84),
      redCards: getStat(83),
      minutesPlayed: getStat(119),
      rating: p.statistics?.[0]?.rating || null,
    }
  } catch (err) {
    return { error: err.message }
  }
}

// ─── H2H: lazy-seeded from SQLite ─────────────────────────────────────────────

async function seedH2H(team1, team2) {
  const db = getDb()
  console.log(`[DB Seed] Starting H2H seed: ${team1.name} vs ${team2.name}`)

  try {
    // Upsert both teams into SQLite
    upsertTeam(db, { id: team1.id, name: team1.name, short_name: team1.short_name })
    upsertTeam(db, { id: team2.id, name: team2.name, short_name: team2.short_name })

    // Fetch all H2H fixtures with events (goals, assists, cards per player)
    const fixtures = await smFetchAll(`/fixtures/head-to-head/${team1.id}/${team2.id}`, {
      include: 'participants;scores;events',
    })

    console.log(`[DB Seed] Fetched ${fixtures.length} fixtures from Sportmonks`)

    let totalStatRows = 0

    for (let i = 0; i < fixtures.length; i++) {
      const f = fixtures[i]
      console.log(`[DB Seed] Seeding fixture ${i + 1}/${fixtures.length} (id: ${f.id})`)

      const home = f.participants?.find(p => p.meta?.location === 'home')
      const away = f.participants?.find(p => p.meta?.location === 'away')
      const scores = f.scores || []

      // Sportmonks scores: { description, score: { participant: 'home'|'away', goals } }
      const homeScoreObj = scores.find(s => (s.description === 'FT' || s.description === 'CURRENT') && s.score?.participant === 'home')
      const awayScoreObj = scores.find(s => (s.description === 'FT' || s.description === 'CURRENT') && s.score?.participant === 'away')

      upsertFixture(db, {
        id: f.id,
        season_id: f.season_id || 0,
        home_team_id: home?.id || 0,
        away_team_id: away?.id || 0,
        home_score: homeScoreObj?.score?.goals ?? null,
        away_score: awayScoreObj?.score?.goals ?? null,
        date: f.starting_at || '',
        competition: 'Premier League',
      })

      // Extract player stats from events (type_id 14=goal, 18=yellow, 19/20=red)
      const events = f.events || []
      const playerStatsMap = new Map()

      const ensurePlayer = (id, name) => {
        if (!id) return null
        if (!playerStatsMap.has(id)) {
          playerStatsMap.set(id, {
            player_id: id, player_name: name || 'Unknown', team_id: null,
            goals: 0, assists: 0, minutes: 0,
            yellow_cards: 0, red_cards: 0, shots: 0, shots_on_target: 0, rating: null,
          })
        }
        return playerStatsMap.get(id)
      }

      for (const ev of events) {
        if (ev.type_id === 14) {
          // Goal
          const scorer = ensurePlayer(ev.player_id, ev.player_name)
          if (scorer) { scorer.goals += 1; scorer.team_id = ev.participant_id }
          // Assist
          if (ev.related_player_id) {
            const assister = ensurePlayer(ev.related_player_id, ev.related_player_name)
            if (assister) assister.assists += 1
          }
        } else if (ev.type_id === 18) {
          const p = ensurePlayer(ev.player_id, ev.player_name)
          if (p) { p.yellow_cards += 1; p.team_id = ev.participant_id }
        } else if (ev.type_id === 19 || ev.type_id === 20) {
          const p = ensurePlayer(ev.player_id, ev.player_name)
          if (p) { p.red_cards += 1; p.team_id = ev.participant_id }
        }
      }

      for (const stat of playerStatsMap.values()) {
        upsertPlayer(db, { id: stat.player_id, name: stat.player_name, position: null, nationality: null })
        upsertPlayerFixtureStat(db, { ...stat, fixture_id: f.id })
        totalStatRows++
      }
    }

    markH2HSeeded(db, team1.id, team2.id, fixtures.length)
    console.log(`[DB Seed] Wrote ${totalStatRows} player stat rows`)
    console.log(`[DB Seed] Complete — ${team1.name} vs ${team2.name} cached in SQLite`)
    return fixtures.length
  } catch (err) {
    console.error(`[Sportmonks seed] Failed: ${err.message}`)
    // Do NOT mark as seeded — allow retry next query
    throw err
  }
}

export async function getH2H(team1Name, team2Name) {
  try {
    const [team1, team2] = await Promise.all([searchTeam(team1Name), searchTeam(team2Name)])
    if (!team1) return { error: `Team not found: ${team1Name}` }
    if (!team2) return { error: `Team not found: ${team2Name}` }

    const db = getDb()

    if (!isH2HSeeded(db, team1.id, team2.id)) {
      await seedH2H(team1, team2)
    }

    const fixtures = getH2HFixtures(db, team1.id, team2.id)

    if (fixtures.length === 0) {
      return {
        found: false,
        team1: team1.name,
        team2: team2.name,
        message: `No historical fixtures found between ${team1.name} and ${team2.name} in the database.`,
      }
    }

    const wins1 = fixtures.filter(f => {
      const t1Home = f.home_team_id === team1.id
      return t1Home ? f.home_score > f.away_score : f.away_score > f.home_score
    }).length
    const wins2 = fixtures.filter(f => {
      const t2Home = f.home_team_id === team2.id
      return t2Home ? f.home_score > f.away_score : f.away_score > f.home_score
    }).length
    const draws = fixtures.filter(f => f.home_score === f.away_score).length

    return {
      team1: team1.name,
      team2: team2.name,
      total: fixtures.length,
      wins: { [team1.name]: wins1, [team2.name]: wins2, draws },
      recentFixtures: fixtures.slice(0, 5).map(f => ({
        date: f.date,
        match: `${f.home_team_name} ${f.home_score ?? '?'}–${f.away_score ?? '?'} ${f.away_team_name}`,
      })),
    }
  } catch (err) {
    return { error: err.message }
  }
}

async function getTeamById(teamId) {
  const key = `id:${teamId}`
  if (_teamCache.has(key)) return _teamCache.get(key)
  const data = await smFetch(`/teams/${teamId}`)
  const t = data.data
  if (!t) return null
  const result = { id: t.id, name: t.name, short_name: t.short_code || t.name }
  _teamCache.set(key, result)
  return result
}

export async function getPlayerHistoryVsOpponent(playerName, opponentTeamName) {
  try {
    const [player, opponent] = await Promise.all([
      searchPlayerLive(playerName),
      searchTeam(opponentTeamName),
    ])

    if (!player) return { found: false, reason: 'player_not_found', message: `Player not found: ${playerName}` }
    if (!opponent) return { found: false, reason: 'team_not_found', message: `Team not found: ${opponentTeamName}` }

    const db = getDb()

    // Resolve player's current team via teams include (active contract = end > today)
    const playerData = await smFetch(`/players/${player.id}`, { include: 'teams' })
    const teamEntries = playerData.data?.teams || []
    const today = new Date().toISOString().split('T')[0]
    const activeEntry = teamEntries
      .filter(t => !t.end || t.end > today)
      .sort((a, b) => new Date(b.start || 0) - new Date(a.start || 0))[0]

    if (!activeEntry) {
      return { found: false, reason: 'no_team', message: `Could not determine ${playerName}'s current team.` }
    }

    const playerTeam = await getTeamById(activeEntry.team_id)
    if (!playerTeam) {
      return { found: false, reason: 'no_team', message: `Could not resolve team for ${playerName}.` }
    }

    const team1 = playerTeam
    const team2 = opponent

    if (!isH2HSeeded(db, team1.id, team2.id)) {
      await seedH2H(team1, team2)
    }

    const stats = getPlayerStatsVsOpponent(db, player.id, opponent.id)

    if (!stats) {
      return {
        found: false,
        reason: 'no_appearances',
        player: player.name,
        opponent: opponent.name,
        message: `No appearances found for ${player.name} in fixtures against ${opponent.name} in the historical database.`,
      }
    }

    return {
      found: true,
      player: player.name,
      opponent: opponent.name,
      playerTeam: team1.name,
      ...stats,
    }
  } catch (err) {
    return { error: err.message }
  }
}

export async function getRecentResults(teamName, limit = 5) {
  try {
    const team = await searchTeam(teamName)
    if (!team) return { error: `Team not found: ${teamName}` }

    const today = new Date().toISOString().split('T')[0]
    const past = new Date(Date.now() - 120 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

    const data = await smFetch(`/fixtures/between/${past}/${today}/${team.id}`, {
      include: 'participants;scores',
      per_page: limit,
      filters: 'fixtureStatus:FT,AET,PEN',
    })

    const fixtures = (Array.isArray(data.data) ? data.data : [])
      .sort((a, b) => new Date(b.starting_at) - new Date(a.starting_at))
      .slice(0, limit)

    return {
      team: team.name,
      results: fixtures.map(f => {
        const home = f.participants?.find(p => p.meta?.location === 'home')
        const away = f.participants?.find(p => p.meta?.location === 'away')
        const scores = f.scores || []
        const ft = scores.find(s => s.description === 'FT' || s.description === 'CURRENT')
        const homeScore = ft?.score?.home ?? '?'
        const awayScore = ft?.score?.away ?? '?'
        const isHome = home?.id === team.id
        const teamScore = isHome ? homeScore : awayScore
        const oppScore = isHome ? awayScore : homeScore
        const opponent = isHome ? away?.name : home?.name
        const result = teamScore > oppScore ? 'W' : teamScore < oppScore ? 'L' : 'D'
        return {
          date: f.starting_at?.split('T')[0] || '',
          opponent,
          score: `${homeScore}–${awayScore}`,
          venue: isHome ? 'H' : 'A',
          result,
        }
      }),
    }
  } catch (err) {
    return { error: err.message }
  }
}
