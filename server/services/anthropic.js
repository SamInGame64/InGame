import Anthropic from '@anthropic-ai/sdk'
import {
  getCurrentFixtures,
  getStandings,
  getInjuries,
  getLineup,
  getPlayerStats,
  getH2H,
  getPlayerHistoryVsOpponent,
  getRecentResults,
} from './sportmonks.js'
import { searchPlayer, getTopPlayers } from './fpl.js'
import { getOdds, getGoalscorerOdds, getSpecialMarkets } from './odds.js'

let _client
function getClient() {
  if (!_client) _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  return _client
}

const SYSTEM = `You are InGame, an AI sports betting research assistant for UK users.

## Step 1 — Classify the request into exactly one category

- **ODDS** — asking about prices, best bookmaker, value, match result / over-under / BTTS markets
- **SPECIAL_MARKETS** — asking about corners, yellow cards, Asian handicap, bookings markets
- **FIXTURE_HISTORY** — asking about H2H record, previous meetings, historical results between two teams
- **PLAYER_IN_FIXTURE** — asking how a specific player performs against a specific opponent (e.g. "how has Salah done vs Man City")
- **TEAM_FORM** — asking about a team's recent results, run of form, current momentum
- **PLAYER_FORM** — asking about a player's current season stats, goals, assists, recent performances
- **NEWS** — asking about injuries, suspensions, availability, team news, likely lineups
- **PREDICTION** — phrased as "who is most likely to…", "who do you think will…", "who will score", "who's going to win"

## Step 2 — Call only the tools that category needs

| Category | Tools to call | Do NOT call |
|---|---|---|
| ODDS | get_odds | everything else |
| SPECIAL_MARKETS | get_special_markets | odds, player stats |
| FIXTURE_HISTORY | get_h2h | odds, player stats, standings |
| PLAYER_IN_FIXTURE | get_player_history | odds, H2H, team stats |
| TEAM_FORM | get_recent_results | odds, player stats, standings |
| PLAYER_FORM | get_player_stats (Sportmonks) + get_player_availability (FPL) | everything else |
| NEWS | get_injuries for team news; get_lineup if asking about lineups | odds, H2H |
| PREDICTION | get_goalscorer_odds first, then get_player_stats for 1–2 key players if injury context is relevant | standings, H2H |

Never call more tools than the category requires.

## Step 3 — Respond with only what was asked

**ODDS:** List the market, each bookmaker on its own line with their logo. Highlight the best price for each outcome. Include Match Result, Over/Under, and Both Teams to Score if available. 3–5 sentences of context max.

**SPECIAL_MARKETS:** If available, list corners / cards / handicap lines per bookmaker. If unavailable, say so clearly — these markets typically appear closer to kick-off.

**FIXTURE_HISTORY:** State the overall W/D/L record on one line, then use a bullet list (not a table) for the last 5 meetings — one line per match with date, teams, and score. Prefix each line with 🟢 (home win) 🟡 (draw) 🔴 (away win). One short summary sentence after.

**PLAYER_IN_FIXTURE:** Lead with career appearances vs that opponent, then goals/assists/avg rating from the historical database. Note this is historical data. One paragraph max.

**TEAM_FORM:** Use a bullet list (not a table) for the 5 most recent results — one line per match with date, opponent, score, H/A, and 🟢 (win) 🟡 (draw) 🔴 (loss) at the start. Note the trend in one sentence after.

**PLAYER_FORM:** Goals, assists, minutes, yellow cards, and rating from Sportmonks. Add FPL availability status and form rating if available. One paragraph. No team stats, no odds.

**NEWS:** Lead with injury list from get_injuries. If lineup is requested, use get_lineup. Note that live press conference lineups may not be confirmed yet.

**PREDICTION:** You do not make predictions. Frame everything as what the market is implying:
- Lead with "Based on the bookmakers…" or "The market is suggesting…" — never "I think" or "X will"
- List the shortest-priced goalscorer candidates with their prices
- Follow with any relevant injury flags — only if the player is at risk of not playing

## General rules
- Use UK English
- **Always display odds in UK fractional format** (e.g. 4/6, 2/1, 11/4) — use the "fractional" field on every outcome
- **Never put bookmaker odds in a table.** Each bookmaker must be its own separate line:
  ![BookmakerName](logoUrl) **BookmakerName** — Home X/Y · Draw X/Y · Away X/Y
- Keep responses short — tables are only for league standings and player stat comparisons. Use bullet lists for match results, scorelines, and fixture histories.
- Historical player-vs-opponent data comes from a local SQLite database seeded from Sportmonks. First-time queries may take a moment to seed.
- If a market or data point is unavailable, say so plainly — never invent or estimate odds.
- Only append the responsible gambling reminder when recommending a specific bet to place.`

const tools = [
  {
    name: 'get_fixtures',
    description: 'Get upcoming fixtures and recent results for a Premier League team (Sportmonks). Returns next 5 fixtures.',
    input_schema: {
      type: 'object',
      properties: {
        team_name: { type: 'string', description: 'Team name e.g. Arsenal, Liverpool, Manchester City' },
      },
      required: ['team_name'],
    },
  },
  {
    name: 'get_recent_results',
    description: "Get a team's last 5 completed results across all competitions (Sportmonks). Use for TEAM_FORM queries.",
    input_schema: {
      type: 'object',
      properties: {
        team_name: { type: 'string', description: 'Team name' },
        limit: { type: 'number', description: 'Number of results (default 5, max 10)' },
      },
      required: ['team_name'],
    },
  },
  {
    name: 'get_player_stats',
    description: 'Get current season stats for a Premier League player from Sportmonks: goals, assists, minutes, cards, rating.',
    input_schema: {
      type: 'object',
      properties: {
        player_name: { type: 'string', description: 'Player name or surname e.g. "Salah", "Haaland", "Saka"' },
      },
      required: ['player_name'],
    },
  },
  {
    name: 'get_player_availability',
    description: 'Get FPL availability status, form rating, and injury news for a Premier League player. Use alongside get_player_stats for PLAYER_FORM queries.',
    input_schema: {
      type: 'object',
      properties: {
        player_name: { type: 'string', description: 'Player name or surname' },
      },
      required: ['player_name'],
    },
  },
  {
    name: 'get_player_history',
    description: 'Get a player\'s historical stats against a specific opponent — appearances, goals, assists, avg rating — from the local SQLite database (lazy-seeded from Sportmonks). Use for PLAYER_IN_FIXTURE queries.',
    input_schema: {
      type: 'object',
      properties: {
        player_name: { type: 'string', description: 'Player name e.g. "Salah", "Haaland"' },
        opponent_team: { type: 'string', description: 'Opponent team name e.g. "Manchester City", "Arsenal"' },
      },
      required: ['player_name', 'opponent_team'],
    },
  },
  {
    name: 'get_h2h',
    description: 'Get historical head-to-head record between two teams from the local SQLite database (lazy-seeded from Sportmonks). Returns W/D/L tally and last 5 scorelines.',
    input_schema: {
      type: 'object',
      properties: {
        team1: { type: 'string', description: 'First team name' },
        team2: { type: 'string', description: 'Second team name' },
      },
      required: ['team1', 'team2'],
    },
  },
  {
    name: 'get_standings',
    description: 'Get the current Premier League table from Sportmonks — positions, points, GD, form.',
    input_schema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'get_injuries',
    description: 'Get current injury and suspension list for a Premier League team from Sportmonks.',
    input_schema: {
      type: 'object',
      properties: {
        team_name: { type: 'string', description: 'Team name' },
      },
      required: ['team_name'],
    },
  },
  {
    name: 'get_lineup',
    description: 'Get the confirmed or expected lineup for a specific fixture from Sportmonks.',
    input_schema: {
      type: 'object',
      properties: {
        fixture_id: { type: 'number', description: 'Sportmonks fixture ID — obtain from get_fixtures first' },
      },
      required: ['fixture_id'],
    },
  },
  {
    name: 'get_odds',
    description: 'Get live UK bookmaker odds for a match — Match Result, Over/Under Goals, and Both Teams to Score (BTTS). Use for ODDS queries.',
    input_schema: {
      type: 'object',
      properties: {
        sport_key: {
          type: 'string',
          description: 'soccer_epl (Premier League), soccer_uefa_champs_league, soccer_spain_la_liga, soccer_italy_serie_a, soccer_germany_bundesliga, soccer_france_ligue_one',
        },
        team_name: { type: 'string', description: 'Filter to matches involving this team' },
      },
      required: ['sport_key'],
    },
  },
  {
    name: 'get_goalscorer_odds',
    description: 'Get first goalscorer and anytime goalscorer odds from UK bookmakers. Use for PREDICTION queries about who will score.',
    input_schema: {
      type: 'object',
      properties: {
        sport_key: { type: 'string', description: 'soccer_epl, soccer_uefa_champs_league, etc.' },
        team_name: { type: 'string', description: 'One of the teams in the match' },
      },
      required: ['sport_key', 'team_name'],
    },
  },
  {
    name: 'get_special_markets',
    description: 'Get corners over/under, yellow cards over/under, and Asian handicap odds from UK bookmakers. Use for SPECIAL_MARKETS queries.',
    input_schema: {
      type: 'object',
      properties: {
        sport_key: { type: 'string', description: 'soccer_epl, soccer_uefa_champs_league, etc.' },
        team_name: { type: 'string', description: 'One of the teams in the match' },
      },
      required: ['sport_key', 'team_name'],
    },
  },
  {
    name: 'get_top_players',
    description: 'Get top Premier League players ranked by a stat for 2024/25 (FPL API). Use for "who are the top scorers" questions.',
    input_schema: {
      type: 'object',
      properties: {
        stat: { type: 'string', description: 'goals_scored, assists, total_points, minutes, clean_sheets, saves, bonus' },
        limit: { type: 'number', description: 'Number of players to return (default 10)' },
      },
      required: ['stat'],
    },
  },
]

async function executeTool(name, input) {
  try {
    switch (name) {
      case 'get_fixtures':          return await getCurrentFixtures(input.team_name)
      case 'get_recent_results':    return await getRecentResults(input.team_name, Math.min(input.limit || 5, 10))
      case 'get_player_stats':      return await getPlayerStats(input.player_name)
      case 'get_player_availability': return await searchPlayer(input.player_name)
      case 'get_player_history':    return await getPlayerHistoryVsOpponent(input.player_name, input.opponent_team)
      case 'get_h2h':               return await getH2H(input.team1, input.team2)
      case 'get_standings':         return await getStandings()
      case 'get_injuries':          return await getInjuries(input.team_name)
      case 'get_lineup':            return await getLineup(input.fixture_id)
      case 'get_odds':              return await getOdds(input.sport_key, input.team_name)
      case 'get_goalscorer_odds':   return await getGoalscorerOdds(input.sport_key, input.team_name)
      case 'get_special_markets':   return await getSpecialMarkets(input.sport_key, input.team_name)
      case 'get_top_players':       return await getTopPlayers(input.stat, input.limit || 10)
      default: return { error: `Unknown tool: ${name}` }
    }
  } catch (err) {
    return { error: err.message }
  }
}

export async function chat(messages) {
  const history = messages.map(({ role, content }) => ({ role, content }))

  let response = await getClient().messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1500,
    system: SYSTEM,
    tools,
    messages: history,
  })

  while (response.stop_reason === 'tool_use') {
    const toolUses = response.content.filter(b => b.type === 'tool_use')

    const toolResults = await Promise.all(
      toolUses.map(async tu => ({
        type: 'tool_result',
        tool_use_id: tu.id,
        content: JSON.stringify(await executeTool(tu.name, tu.input)),
      }))
    )

    history.push({ role: 'assistant', content: response.content })
    history.push({ role: 'user', content: toolResults })

    response = await getClient().messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1500,
      system: SYSTEM,
      tools,
      messages: history,
    })
  }

  const text = response.content.find(b => b.type === 'text')
  return text?.text ?? 'Sorry, I could not generate a response.'
}
