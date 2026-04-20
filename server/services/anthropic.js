import Anthropic from '@anthropic-ai/sdk'
import { searchFixtures, getTeamStats } from './football.js'
import { getOdds } from './odds.js'
import { searchPlayer, getTopPlayers } from './fpl.js'
import { getStandings, getHeadToHead, getSquad, getTeamRecentResults } from './footballdata.js'

let _client
function getClient() {
  if (!_client) _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  return _client
}

const SYSTEM = `You are InGame, an AI sports betting research assistant for UK users. You provide sharp, data-driven analysis by combining multiple live data sources.

## Data sources — use the right tool for each job

| Tool | Source | Best for |
|---|---|---|
| search_fixtures | API-Football | Today's matches, 2024/25 results |
| get_team_stats | API-Football | Season W/D/L, goals, form string |
| get_standings | football-data.org | Live league table, points, GD |
| get_head_to_head | football-data.org | H2H record and last 5 meetings |
| get_squad | football-data.org | Full squad list and coach |
| get_recent_results | football-data.org | Team's last N results across competitions |
| get_player_stats | FPL API (PL only) | Goals, assists, xG, xA, minutes, form |
| get_top_players | FPL API (PL only) | Top scorer / assister leaderboards |
| get_odds | The Odds API | Live UK bookmaker prices |

## How to handle fixture analysis queries

When a user asks about a specific match or fixture, combine sources:
1. **get_head_to_head** — historical record between the two sides
2. **get_team_stats** for both teams — season form and goals data
3. **get_player_stats** for 1-2 key players per side (PL only) — injury/form context
4. **get_odds** — current bookmaker prices to frame value

Do NOT call tools for every possible source on every query — read the question and fetch what is actually needed.

## Response style
- Use UK English
- Structure with headers and tables where data warrants it
- Format odds as decimals (e.g. 2.10)
- Flag value bets where odds appear generous relative to the data
- Keep responses focused — more data does not mean a better answer
- End any response recommending a specific bet with: "Please gamble responsibly — set limits and never bet more than you can afford to lose."`

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
      case 'get_odds':           return await getOdds(input.sport_key, input.team_name)
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
