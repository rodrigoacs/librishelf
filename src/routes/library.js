import express from 'express'
import { prepareLibraryQuery, executeLibraryQuery } from '../database/queries.js'

const router = express.Router()

router.get('/', (req, res) => {
  const { fields } = req.query

  let query
  try {
    query = prepareLibraryQuery(fields)
  } catch (error) {
    return res.status(400).send(error.message)
  }

  executeLibraryQuery(query, (err, rows) => {
    if (err) {
      return res.status(500).send('Error executing the query.')
    } else {
      res.json(rows)
    }
  })
})

export default router
