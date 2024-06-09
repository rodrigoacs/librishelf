import express from 'express'
import { prepareQuery, executeQuery } from '../database/queries.js'

const router = express.Router()

router.get('/library', (req, res) => {
  const { fields } = req.query

  let query
  try {
    query = prepareQuery(fields)
  } catch (error) {
    return res.status(400).send(error.message)
  }

  executeQuery(query, (err, rows) => {
    if (err) {
      return res.status(500).send('Error executing the query.')
    } else {
      res.json(rows)
    }
  })
})

export default router
