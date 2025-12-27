export default (err, req, res, next) => {
  const statusCode = err.status || 500
  const message = err.message || 'Internal Server Error'

  console.error(`\x1b[31m[ERROR ${statusCode}]: ${message} \x1b[0m`)
  if (statusCode === 500) console.error(err.stack)

  res.status(statusCode).json({
    status: 'error',
    message: message
  })
}