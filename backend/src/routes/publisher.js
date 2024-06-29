import express from 'express'
import { executePublisherQuery, preparePublisherQuery } from '../database/queries.js'

const router = express.Router()

router.get('/', (req, res) => {
  const { authors } = req.query

  let query
  try {
    query = preparePublisherQuery(authors)
  } catch (error) {
    return res.status(400).send(error.message)
  }

  executePublisherQuery(query, (err, rows) => {
    if (err) {
      return res.status(500).send('Error executing the query.')
    } else {
      res.json(rows)
    }
  })
})

export default router
