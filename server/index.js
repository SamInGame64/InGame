import { createRequire } from 'module'
import { resolve } from 'path'
import { fileURLToPath } from 'url'

const require = createRequire(import.meta.url)
const dotenv = require('dotenv')
dotenv.config({ path: resolve(fileURLToPath(import.meta.url), '../../.env'), override: true })

import express from 'express'
import chatRouter from './routes/chat.js'
import { getDb } from './db/index.js'

const requiredEnv = ['ANTHROPIC_API_KEY', 'SPORTMONKS_API_KEY', 'ODDS_API_KEY']
const missing = requiredEnv.filter(k => !process.env[k])
if (missing.length > 0) {
  console.error(`Missing environment variables: ${missing.join(', ')}`)
  console.error('Add them to your .env file.')
  process.exit(1)
}

// Initialise SQLite — creates the file and runs schema migrations on first run
try {
  getDb()
  console.log('SQLite database initialised')
} catch (err) {
  console.error('Failed to initialise SQLite database:', err.message)
  process.exit(1)
}

const app = express()
app.use(express.json())
app.use('/api', chatRouter)

const PORT = process.env.PORT || 3001
app.listen(PORT, () => {
  console.log(`InGame server running on http://localhost:${PORT}`)
})
