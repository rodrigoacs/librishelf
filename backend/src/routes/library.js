import express from 'express'
import { prepareLibraryQuery, executeLibraryQuery } from '../database/queries.js'
import { error } from '../utils/logger.js'

const router = express.Router()

router.get('/', (req, res) => {
  const { fields, readState } = req.query
  let query

  try {
    query = prepareLibraryQuery(null, fields)
    if (readState === 'true') {
      query += "WHERE timestamp != '0101-01-01 00:00:00.000'"
    } else if (readState === 'false') {
      query += "WHERE timestamp = '0101-01-01 00:00:00.000'"
    }
  } catch (error) {
    error('Error preparing GET /library query.' + error.message)
    return res.status(400).send(error.message)
  }

  executeLibraryQuery(query, (err, rows) => {
    if (err) {
      error('Error executing GET /library query.' + err.message)
      return res.status(500).send('Error executing the query.')
    } else {
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
      res.json(rows[0])
    }
  })
})


export default router
