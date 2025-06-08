import os from 'os'
import Repository from './lib/repository.js'
import { createServer } from './server/http.js'

async function main ({ port = 3000 } = {}) {
  createServer(new Repository())
    .listen(port, () => {
      console.log(`Server running at http://${os.hostname()}:${port} (or http://localhost:${port})`)
    })
}

if (import.meta.url.endsWith('index.js')) {
  main({
    port: +process.env.PORT || 3000
  })
  logMemoryUsage()
  setInterval(logMemoryUsage, 5 * 60 * 1000)
}

function logMemoryUsage () {
  const memUsage = process.memoryUsage()
  console.log(`[memory] rss: ${Math.round(memUsage.rss / 1024 / 1024)} MB, heapTotal: ${Math.round(memUsage.heapTotal / 1024 / 1024)} MB, heapUsed: ${Math.round(memUsage.heapUsed / 1024 / 1024)} MB, external: ${Math.round(memUsage.external / 1024 / 1024)} MB`)
}
