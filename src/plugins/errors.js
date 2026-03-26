export default {
  name: 'errors',
  register(server) {
    server.ext('onPreResponse', (request, h) => {
      const { response } = request

      if (!response.isBoom) return h.continue

      const statusCode = response.output.statusCode
      const is404 = statusCode === 404

      return h
        .view('error', {
          title: is404 ? 'Page not found' : 'Sorry, there is a problem with the service',
          statusCode,
          message: is404
            ? 'If you typed the web address, check it is correct.'
            : 'Try again later.',
        })
        .code(statusCode)
    })
  },
}
