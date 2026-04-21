// All SQLite read/write functions — synchronous via better-sqlite3

export function upsertTeam(db, team) {
  db.prepare(`
    INSERT OR REPLACE INTO teams (id, name, short_name)
    VALUES (@id, @name, @short_name)
  `).run(team)
}

export function upsertPlayer(db, player) {
  db.prepare(`
    INSERT OR REPLACE INTO players (id, name, position, nationality)
    VALUES (@id, @name, @position, @nationality)
  `).run(player)
}

export function upsertFixture(db, fixture) {
  db.prepare(`
    INSERT OR REPLACE INTO fixtures
      (id, season_id, home_team_id, away_team_id, home_score, away_score, date, competition)
    VALUES
      (@id, @season_id, @home_team_id, @away_team_id, @home_score, @away_score, @date, @competition)
  `).run(fixture)
}

export function upsertPlayerFixtureStat(db, stat) {
  db.prepare(`
    INSERT OR REPLACE INTO player_fixture_stats
      (player_id, fixture_id, team_id, goals, assists, minutes, yellow_cards, red_cards, shots, shots_on_target, rating)
    VALUES
      (@player_id, @fixture_id, @team_id, @goals, @assists, @minutes, @yellow_cards, @red_cards, @shots, @shots_on_target, @rating)
  `).run(stat)
}

export function getH2HFixtures(db, team1Id, team2Id) {
  return db.prepare(`
    SELECT f.*, t1.name AS home_team_name, t2.name AS away_team_name
    FROM fixtures f
    JOIN teams t1 ON f.home_team_id = t1.id
    JOIN teams t2 ON f.away_team_id = t2.id
    WHERE (f.home_team_id = ? AND f.away_team_id = ?)
       OR (f.home_team_id = ? AND f.away_team_id = ?)
    ORDER BY f.date DESC
    LIMIT 10
  `).all(team1Id, team2Id, team2Id, team1Id)
}

export function getPlayerStatsVsOpponent(db, playerId, opponentTeamId) {
  // Find all fixtures where the opponent was either home or away
  const fixtures = db.prepare(`
    SELECT id FROM fixtures
    WHERE home_team_id = ? OR away_team_id = ?
  `).all(opponentTeamId, opponentTeamId)

  if (fixtures.length === 0) return null

  const fixtureIds = fixtures.map(f => f.id)
  const placeholders = fixtureIds.map(() => '?').join(',')

  const rows = db.prepare(`
    SELECT
      pfs.*,
      f.date,
      f.home_score,
      f.away_score,
      ht.name AS home_team,
      at.name AS away_team,
      pfs.team_id = f.home_team_id AS was_home
    FROM player_fixture_stats pfs
    JOIN fixtures f ON pfs.fixture_id = f.id
    JOIN teams ht ON f.home_team_id = ht.id
    JOIN teams at ON f.away_team_id = at.id
    WHERE pfs.player_id = ?
      AND pfs.fixture_id IN (${placeholders})
    ORDER BY f.date DESC
  `).all(playerId, ...fixtureIds)

  if (rows.length === 0) return null

  const totals = rows.reduce(
    (acc, r) => ({
      appearances: acc.appearances + 1,
      goals: acc.goals + (r.goals || 0),
      assists: acc.assists + (r.assists || 0),
      minutes: acc.minutes + (r.minutes || 0),
      yellow_cards: acc.yellow_cards + (r.yellow_cards || 0),
      red_cards: acc.red_cards + (r.red_cards || 0),
      shots: acc.shots + (r.shots || 0),
      rating_sum: acc.rating_sum + (r.rating || 0),
      rating_count: acc.rating_count + (r.rating ? 1 : 0),
    }),
    { appearances: 0, goals: 0, assists: 0, minutes: 0, yellow_cards: 0, red_cards: 0, shots: 0, rating_sum: 0, rating_count: 0 }
  )

  return {
    appearances: totals.appearances,
    goals: totals.goals,
    assists: totals.assists,
    minutesPlayed: totals.minutes,
    yellowCards: totals.yellow_cards,
    redCards: totals.red_cards,
    shots: totals.shots,
    avgRating: totals.rating_count > 0 ? (totals.rating_sum / totals.rating_count).toFixed(2) : null,
    recentFixtures: rows.slice(0, 5).map(r => ({
      date: r.date,
      match: `${r.home_team} ${r.home_score}–${r.away_score} ${r.away_team}`,
      goals: r.goals,
      assists: r.assists,
      minutes: r.minutes,
      rating: r.rating,
    })),
  }
}

export function isH2HSeeded(db, team1Id, team2Id) {
  const [a, b] = [Math.min(team1Id, team2Id), Math.max(team1Id, team2Id)]
  return !!db.prepare(
    'SELECT 1 FROM h2h_seed_log WHERE team1_id = ? AND team2_id = ?'
  ).get(a, b)
}

export function markH2HSeeded(db, team1Id, team2Id, fixtureCount = 0) {
  const [a, b] = [Math.min(team1Id, team2Id), Math.max(team1Id, team2Id)]
  db.prepare(`
    INSERT OR REPLACE INTO h2h_seed_log (team1_id, team2_id, seeded_at, fixture_count)
    VALUES (?, ?, ?, ?)
  `).run(a, b, new Date().toISOString(), fixtureCount)
}
