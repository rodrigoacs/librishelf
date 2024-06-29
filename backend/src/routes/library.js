import express from 'express'
import { prepareLibraryQuery, executeLibraryQuery } from '../database/queries.js'
import { info, error } from '../utils/logger.js'

const router = express.Router()

router.get('/', (req, res) => {
  const { fields } = req.query

  let query
  try {
    query = prepareLibraryQuery(null, fields)
  } catch (error) {
    error('Error preparing GET /library query.' + error.message)
    return res.status(400).send(error.message)
  }

  executeLibraryQuery(query, (err, rows) => {
    if (err) {
      error('Error executing GET /library query.' + err.message)
      return res.status(500).send('Error executing the query.')
    } else {
      info('GET /library query executed successfully.')
      res.json(rows)
    }
  })
})

router.get('/:id', (req, res) => {
  const { id } = req.params

  const query = prepareLibraryQuery(id)

  executeLibraryQuery(query, (err, rows) => {
    if (err) {
      error('Error executing GET /library/:id query.' + err.message)
      return res.status(500).send('Error executing the query.')
    } else {
      info('GET /library/:id query executed successfully.')
      res.json(rows[0])
    }
  })
})


export default router
