import express from 'express'
import { executeAuthorQuery } from '../database/queries.js'

const router = express.Router()

router.get('/', (req, res) => {
  executeAuthorQuery((err, rows) => {
    if (err) {
      return res.status(500).send('Error executing the query.')
    } else {
      res.json(rows)
    }
  }
  )
})

export default router