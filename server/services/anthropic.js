import Anthropic from '@anthropic-ai/sdk'
import { searchFixtures, getTeamStats } from './football.js'
import { getOdds, getGoalscorerOdds } from './odds.js'
import { searchPlayer, getTopPlayers } from './fpl.js'
import { getStandings, getHeadToHead, getSquad, getTeamRecentResults } from './footballdata.js'

let _client
function getClient() {
  if (!_client) _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  return _client
}

const SYSTEM = `You are InGame, an AI sports betting research assistant for UK users.

## Step 1 — Classify the request into exactly one category

Read the user's message and pick the single best category:

- **ODDS** — asking about prices, best bookmaker, value, a specific bet market
- **FIXTURE_HISTORY** — asking about H2H record, previous meetings, historical results between two teams
- **PLAYER_IN_FIXTURE** — asking how a specific player performs against a specific opponent
- **TEAM_FORM** — asking about a team's recent results, run of form, current momentum
- **PLAYER_FORM** — asking about a player's current season stats, goals, assists, recent performances
- **NEWS** — asking about injuries, suspensions, availability, team news, likely lineups
- **PREDICTION** — phrased as "who is most likely to…", "who do you think will…", "who will score", "who's going to win" — these are odds questions in disguise

## Step 2 — Call only the tools that category needs

| Category | Tools to call | Do NOT call |
|---|---|---|
| ODDS | get_odds | everything else |
| FIXTURE_HISTORY | get_head_to_head | odds, player stats, standings |
| PLAYER_IN_FIXTURE | get_player_stats | odds, H2H, team stats |
| TEAM_FORM | get_recent_results | odds, player stats, standings |
| PLAYER_FORM | get_player_stats | everything else |
| NEWS | get_player_stats (has injury/availability data for PL players) | odds, H2H |
| PREDICTION | get_goalscorer_odds first, then get_player_stats for 1–2 key players if relevant injury or form context exists | standings, H2H, team stats |

Never call more tools than the category requires. One focused answer beats a data dump.

## Step 3 — Respond with only what was asked

**ODDS:** List the market, bookmaker prices side by side, highlight the best price for each outcome. 3–5 sentences of context max.

**FIXTURE_HISTORY:** State the overall W/D/L record on one line, then use a bullet list (not a table) for the last 5 meetings — one line per match with date, teams, and score. One short summary sentence after.

**PLAYER_IN_FIXTURE:** Share the player's season stats and note form. Be explicit that per-opponent breakdown isn't available in the data and offer what is.

**TEAM_FORM:** Use a bullet list (not a table) for each result — one line per match with date, opponent, score, and H/A. Note the trend in one sentence after the list. No odds, no player breakdowns.

**PLAYER_FORM:** Goals, assists, xG, xA, minutes, form rating. One paragraph. No team stats, no odds.

**NEWS:** Availability status, chance of playing %, and the injury/news string from FPL. If the player is available, say so clearly. Note that live press conference lineups are not available.

**PREDICTION:** You do not make predictions. Frame everything as what the market is implying:
- Lead with: "Based on the bookmakers…" or "The market is suggesting…" — never "I think" or "X will"
- If first/anytime goalscorer odds are available: list the shortest-priced players as what bookmakers consider most likely, with their prices
- If scorer odds are unavailable: use match result odds to identify the favourite, then use player form to indicate the likely attacking threats — be explicit this is form context, not a prediction
- Follow up (briefly) with any relevant injury or availability flags from get_player_stats — only if the player is at risk of not playing

## General rules
- Use UK English
- **Always display odds in UK fractional format** (e.g. 4/6, 2/1, 11/4) — the data includes a "fractional" field on every outcome, use it
- **Never put bookmaker odds in a table.** Each bookmaker must be its own separate line using exactly this markdown format:
  ![BookmakerName](logoUrl) **BookmakerName** — Home X/Y · Draw X/Y · Away X/Y
  The logoUrl comes from the data. If a bookmaker has no logoUrl, just write the name without an image.
- Keep responses short — tables are only for league standings and player stat comparisons. Use bullet lists for match results, scorelines, and fixture histories. Never use tables for bookmaker odds lines.
- Only append the responsible gambling reminder when you are recommending a specific bet to place`

const tools = [
  {
    name: 'search_fixtures',
    description:
      "Search today's fixtures and recent results for a football team (API-Football). Returns today's match if any, plus last 5 completed results from the 2024/25 season.",
    input_schema: {
      type: 'object',
      properties: {
        team_name: { type: 'string', description: 'Team name e.g. Arsenal, Liverpool, Real Madrid' },
      },
      required: ['team_name'],
    },
  },
  {
    name: 'get_odds',
    description: 'Get live UK bookmaker odds (Bet365, William Hill, Paddy Power etc.) for matches in a competition.',
    input_schema: {
      type: 'object',
      properties: {
        sport_key: {
          type: 'string',
          description:
            'soccer_epl (Premier League), soccer_uefa_champs_league (Champions League), soccer_spain_la_liga (La Liga), soccer_italy_serie_a (Serie A), soccer_germany_bundesliga (Bundesliga), soccer_france_ligue_one (Ligue 1)',
        },
        team_name: {
          type: 'string',
          description: 'Optional — filter to matches involving this team',
        },
      },
      required: ['sport_key'],
    },
  },
  {
    name: 'get_team_stats',
    description:
      'Get 2024/25 season statistics for a team from API-Football: form string, goals scored/conceded, wins/draws/losses, clean sheets, biggest wins.',
    input_schema: {
      type: 'object',
      properties: {
        team_name: { type: 'string', description: 'Team name' },
        league_id: {
          type: 'number',
          description:
            '39 = Premier League, 140 = La Liga, 135 = Serie A, 78 = Bundesliga, 61 = Ligue 1, 2 = Champions League',
        },
      },
      required: ['team_name', 'league_id'],
    },
  },
  {
    name: 'get_standings',
    description:
      'Get the current league table from football-data.org. Returns positions, points, GD, form for all clubs.',
    input_schema: {
      type: 'object',
      properties: {
        competition: {
          type: 'string',
          description:
            'Competition code or name: PL (Premier League), CL (Champions League), PD (La Liga), BL1 (Bundesliga), SA (Serie A), FL1 (Ligue 1), ELC (Championship)',
        },
      },
      required: ['competition'],
    },
  },
  {
    name: 'get_head_to_head',
    description:
      'Get historical head-to-head record between two teams from football-data.org. Returns overall W/D/L tally and last 5 meetings with scores.',
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
    name: 'get_squad',
    description:
      'Get the full squad list and coaching staff for a team from football-data.org. Useful for injury context and squad depth questions.',
    input_schema: {
      type: 'object',
      properties: {
        team_name: { type: 'string', description: 'Team name' },
      },
      required: ['team_name'],
    },
  },
  {
    name: 'get_recent_results',
    description:
      'Get a team\'s last N results across all competitions from football-data.org. More comprehensive than search_fixtures as it covers cup games and European fixtures.',
    input_schema: {
      type: 'object',
      properties: {
        team_name: { type: 'string', description: 'Team name' },
        limit: { type: 'number', description: 'Number of results to return (default 10, max 20)' },
      },
      required: ['team_name'],
    },
  },
  {
    name: 'get_player_stats',
    description:
      'Get 2024/25 season stats for a Premier League player from the FPL API: goals, assists, xG, xA, minutes, form, FPL price. Use whenever a user mentions a specific player.',
    input_schema: {
      type: 'object',
      properties: {
        player_name: {
          type: 'string',
          description: 'Player name or surname e.g. "Salah", "Haaland", "Saka"',
        },
      },
      required: ['player_name'],
    },
  },
  {
    name: 'get_goalscorer_odds',
    description:
      'Get first goalscorer and anytime goalscorer odds from UK bookmakers for a match. Use this for PREDICTION questions: "who is most likely to score", "who will score first", "who do you think will get on the scoresheet". Falls back to match result odds if scorer markets are unavailable.',
    input_schema: {
      type: 'object',
      properties: {
        sport_key: {
          type: 'string',
          description:
            'soccer_epl (Premier League), soccer_uefa_champs_league (Champions League), soccer_spain_la_liga (La Liga), soccer_italy_serie_a (Serie A), soccer_germany_bundesliga (Bundesliga), soccer_france_ligue_one (Ligue 1)',
        },
        team_name: {
          type: 'string',
          description: 'One of the team names in the match to filter results',
        },
      },
      required: ['sport_key', 'team_name'],
    },
  },
  {
    name: 'get_top_players',
    description:
      'Get top Premier League players ranked by a stat for 2024/25 (FPL API). Use for "who are the top scorers" type questions.',
    input_schema: {
      type: 'object',
      properties: {
        stat: {
          type: 'string',
          description: 'goals_scored, assists, total_points, minutes, clean_sheets, saves, bonus',
        },
        limit: { type: 'number', description: 'Number of players to return (default 10)' },
      },
      required: ['stat'],
    },
  },
]

async function executeTool(name, input) {
  try {
    switch (name) {
      case 'search_fixtures':    return await searchFixtures(input.team_name)
      case 'get_odds':              return await getOdds(input.sport_key, input.team_name)
      case 'get_goalscorer_odds':   return await getGoalscorerOdds(input.sport_key, input.team_name)
      case 'get_team_stats':     return await getTeamStats(input.team_name, input.league_id)
      case 'get_standings':      return await getStandings(input.competition)
      case 'get_head_to_head':   return await getHeadToHead(input.team1, input.team2)
      case 'get_squad':          return await getSquad(input.team_name)
      case 'get_recent_results': return await getTeamRecentResults(input.team_name, Math.min(input.limit || 10, 20))
      case 'get_player_stats':   return await searchPlayer(input.player_name)
      case 'get_top_players':    return await getTopPlayers(input.stat, input.limit || 10)
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
