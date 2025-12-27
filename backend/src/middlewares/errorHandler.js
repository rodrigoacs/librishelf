export default (err, req, res, next) => {
  const statusCode = err.status || 500
  const message = err.message || 'Internal Server Error'

  console.error(`[ERROR ${statusCode}]: \${message}`)
  if (statusCode === 500) console.error(err.stack)

  res.status(statusCode).json({
    status: 'error',
    message: message
  })
}