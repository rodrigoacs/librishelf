import express from 'express'
import { executePublisherQuery, preparePublisherQuery } from '../database/queries.js'
import { error } from '../utils/logger.js'
import { authenticateToken } from '../middlewares/auth.js'

const router = express.Router()
router.use(authenticateToken)

router.get('/', (req, res) => {
  const { authors } = req.query

  let query
  try {
    query = preparePublisherQuery(authors)
  } catch (error) {
    error('Error preparing GET /publisher query.' + error.message)
    return res.status(400).send(error.message)
  }

  executePublisherQuery(query, (err, rows) => {
    if (err) {
      error('Error executing GET /publisher query.' + err.message)
      return res.status(500).send('Error executing the query.')
    } else {
      res.json(rows)
    }
  })
})

export default router
