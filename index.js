import os from 'os'
import Repository from './lib/repository.js'
import { createServer } from './server/http.js'

async function main ({ port = 3000, https = false } = {}) {
  const useHttps = https || process.env.HTTPS === 'true'
  const protocol = useHttps ? 'https' : 'http'
  
  createServer(new Repository(), useHttps)
    .listen(port, () => {
      console.log(`Server running at ${protocol}://${os.hostname()}:${port} (or ${protocol}://localhost:${port})`)
      if (useHttps) {
        console.log('HTTPS enabled - mixed content issues should be resolved')
      } else {
        console.log('Running on HTTP - may have mixed content issues with HTTPS sites')
        console.log('To enable HTTPS, set HTTPS=true environment variable and ensure SSL certificates are in ./ssl/ directory')
      }
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
