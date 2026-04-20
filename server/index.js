import 'dotenv/config'
import express from 'express'
import chatRouter from './routes/chat.js'

const requiredEnv = ['ANTHROPIC_API_KEY', 'API_FOOTBALL_KEY', 'ODDS_API_KEY']
const missing = requiredEnv.filter(k => !process.env[k])
if (missing.length > 0) {
  console.error(`Missing environment variables: ${missing.join(', ')}`)
  console.error('Create a .env file — see .env.example for the required keys.')
  process.exit(1)
}

const app = express()
app.use(express.json())
app.use('/api', chatRouter)

const PORT = process.env.PORT || 3001
app.listen(PORT, () => {
  console.log(`InGame server running on http://localhost:${PORT}`)
})
