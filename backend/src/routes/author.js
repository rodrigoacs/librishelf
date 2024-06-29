import express from 'express'
import { executeAuthorQuery } from '../database/queries.js'
import { info, error } from '../utils/logger.js'

const router = express.Router()

router.get('/', (req, res) => {
  executeAuthorQuery((err, rows) => {
    if (err) {
      error('Error executing GET /author query.' + err.message)
      return res.status(500).send('Error executing the query.')
    } else {
      info('GET /author query executed successfully.')
      res.json(rows)
    }
  }
  )
})

export default router