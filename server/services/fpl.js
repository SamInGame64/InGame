const FPL_URL = 'https://fantasy.premierleague.com/api/bootstrap-static/'

const POSITIONS = { 1: 'Goalkeeper', 2: 'Defender', 3: 'Midfielder', 4: 'Forward' }

let cache = null
let cacheExpiry = 0

async function getBootstrap() {
  if (cache && Date.now() < cacheExpiry) return cache

  const res = await fetch(FPL_URL, {
    headers: { 'User-Agent': 'InGame/1.0' },
  })
  if (!res.ok) throw new Error(`FPL API ${res.status}: ${res.statusText}`)

  const data = await res.json()
  cache = data
  cacheExpiry = Date.now() + 60 * 60 * 1000 // 1 hour TTL
  return data
}

function score(player, query) {
  const full = `${player.first_name} ${player.second_name}`.toLowerCase()
  const web = player.web_name.toLowerCase()
  const q = query.toLowerCase()

  if (full === q || web === q) return 100
  if (full.startsWith(q) || web.startsWith(q)) return 80
  if (full.includes(q) || web.includes(q)) return 60

  // partial token match
  const tokens = q.split(' ')
  const matches = tokens.filter(t => full.includes(t) || web.includes(t))
  return (matches.length / tokens.length) * 40
}

export async function searchPlayer(playerName, topN = 1) {
  const data = await getBootstrap()
  const teamMap = Object.fromEntries(data.teams.map(t => [t.id, t.name]))

  const scored = data.elements
    .map(p => ({ player: p, score: score(p, playerName) }))
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topN)

  if (scored.length === 0) return { error: `No player found matching "${playerName}"` }

  return scored.map(({ player: p }) => ({
    name: `${p.first_name} ${p.second_name}`,
    knownAs: p.web_name,
    team: teamMap[p.team] || 'Unknown',
    position: POSITIONS[p.element_type] || 'Unknown',
    season: '2024/25',
    minutes: p.minutes,
    goals: p.goals_scored,
    assists: p.assists,
    cleanSheets: p.clean_sheets,
    yellowCards: p.yellow_cards,
    redCards: p.red_cards,
    saves: p.saves || 0,
    bonus: p.bonus,
    totalPoints: p.total_points,
    pointsPerGame: p.points_per_game,
    form: p.form,
    priceM: (p.now_cost / 10).toFixed(1),
    selectedByPercent: p.selected_by_percent,
    goalsInvolvements: p.goals_scored + p.assists,
    expectedGoals: p.expected_goals,
    expectedAssists: p.expected_assists,
    expectedGoalInvolvements: p.expected_goal_involvements,
    expectedGoalsConceded: p.expected_goals_conceded,
    availabilityStatus: { a: 'Available', i: 'Injured', d: 'Doubtful', s: 'Suspended', u: 'Unavailable' }[p.status] || p.status,
    news: p.news || null,
    chanceOfPlayingNextRound: p.chance_of_playing_next_round,
  }))
}

export async function getTopPlayers(stat = 'goals_scored', limit = 10) {
  const data = await getBootstrap()
  const teamMap = Object.fromEntries(data.teams.map(t => [t.id, t.name]))

  const STAT_LABELS = {
    goals_scored: 'Goals',
    assists: 'Assists',
    total_points: 'FPL Points',
    minutes: 'Minutes',
    clean_sheets: 'Clean Sheets',
    saves: 'Saves',
    bonus: 'Bonus Points',
  }

  const sorted = [...data.elements]
    .filter(p => p.minutes > 0)
    .sort((a, b) => (b[stat] ?? 0) - (a[stat] ?? 0))
    .slice(0, limit)

  return {
    stat: STAT_LABELS[stat] || stat,
    season: '2024/25',
    players: sorted.map(p => ({
      name: p.web_name,
      fullName: `${p.first_name} ${p.second_name}`,
      team: teamMap[p.team] || 'Unknown',
      position: POSITIONS[p.element_type],
      value: p[stat],
      minutes: p.minutes,
      priceM: (p.now_cost / 10).toFixed(1),
    })),
  }
}
