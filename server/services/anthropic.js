import Anthropic from '@anthropic-ai/sdk'
import { searchFixtures, getTeamStats } from './football.js'
import { getOdds } from './odds.js'

let _client
function getClient() {
  if (!_client) _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  return _client
}

const SYSTEM = `You are InGame, an AI sports betting research assistant for UK users. You provide data-driven analysis on football matches, odds, and betting markets.

When a user asks about a match or team:
- Always use tools to fetch real fixture data and odds before responding
- Summarise upcoming fixtures and recent form clearly
- Compare odds across bookmakers and flag value where it exists
- Reference actual numbers (xG, goals, form strings) to support your analysis
- Use UK English and format odds as decimals

Keep responses concise and structured. End any response that recommends specific bets with: "Please gamble responsibly — set limits and never bet more than you can afford to lose."`

const tools = [
  {
    name: 'search_fixtures',
    description:
      "Search today's fixtures and recent results for a football team. Returns today's match (if any), plus the last 5 completed results from the 2024/25 season.",
    input_schema: {
      type: 'object',
      properties: {
        team_name: {
          type: 'string',
          description: 'Team name e.g. Arsenal, Liverpool, Manchester City, Real Madrid',
        },
        next: {
          type: 'number',
          description: 'How many upcoming fixtures to return (default 5)',
        },
      },
      required: ['team_name'],
    },
  },
  {
    name: 'get_odds',
    description:
      'Get live UK bookmaker odds (Bet365, William Hill, etc.) for football matches in a given league.',
    input_schema: {
      type: 'object',
      properties: {
        sport_key: {
          type: 'string',
          description:
            'League key — soccer_epl (Premier League), soccer_uefa_champs_league (Champions League), soccer_spain_la_liga (La Liga), soccer_italy_serie_a (Serie A), soccer_germany_bundesliga (Bundesliga), soccer_france_ligue_one (Ligue 1)',
        },
        team_name: {
          type: 'string',
          description: 'Optional team name to filter odds to matches involving this team',
        },
      },
      required: ['sport_key'],
    },
  },
  {
    name: 'get_team_stats',
    description:
      'Get season statistics for a team: form string, goals scored/conceded, wins/draws/losses, clean sheets.',
    input_schema: {
      type: 'object',
      properties: {
        team_name: { type: 'string', description: 'Team name' },
        league_id: {
          type: 'number',
          description:
            'League ID — 39 (Premier League), 140 (La Liga), 135 (Serie A), 78 (Bundesliga), 61 (Ligue 1), 2 (Champions League)',
        },
      },
      required: ['team_name', 'league_id'],
    },
  },
]

async function executeTool(name, input) {
  try {
    if (name === 'search_fixtures') return await searchFixtures(input.team_name, input.next || 5)
    if (name === 'get_odds') return await getOdds(input.sport_key, input.team_name)
    if (name === 'get_team_stats') return await getTeamStats(input.team_name, input.league_id)
    return { error: `Unknown tool: ${name}` }
  } catch (err) {
    return { error: err.message }
  }
}

export async function chat(messages) {
  const history = messages.map(({ role, content }) => ({ role, content }))

  let response = await getClient().messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
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
      max_tokens: 1024,
      system: SYSTEM,
      tools,
      messages: history,
    })
  }

  const text = response.content.find(b => b.type === 'text')
  return text?.text ?? 'Sorry, I could not generate a response.'
}
