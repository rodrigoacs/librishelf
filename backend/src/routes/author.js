import express from 'express'
import { executeAuthorQuery, executeAuthorByPublisherQuery } from '../database/queries.js'
import { error } from '../utils/logger.js'
import { authenticateToken } from '../middlewares/auth.js'

const router = express.Router()
router.use(authenticateToken)

router.get('/', (req, res) => {
  const publishers = req.query.publishers

  if (publishers) {
    executeAuthorByPublisherQuery(publishers, (err, rows) => {
      if (err) {
        error('Error executing GET /author query with publisher filter.' + err.message)
        return res.status(500).send('Error executing the query.')
      } else {
        res.json(rows)
      }
    })
  } else {
    executeAuthorQuery((err, rows) => {
      if (err) {
        error('Error executing GET /author query.' + err.message)
        return res.status(500).send('Error executing the query.')
      } else {
        res.json(rows)
      }
    })
  }
})

export default router
