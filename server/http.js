import http from 'http'
import { URL } from 'url'
import { handleSSE, broadcastSSE } from './sse.js'
import { updateAndPersistVideos } from '../lib/update-videos.js'
import { startAutoCleanup } from '../lib/auto-cleanup.js'
import apiHandler from './router/api.js'
import appHandler from './router/app.js'
import Repository from '../lib/repository.js'

export function createServer (repo = new Repository()) {
  const stateChangeHandler = {
    get (target, key) {
      if (typeof target[key] === 'object' && target[key] !== null) {
        return new Proxy(target[key], stateChangeHandler)
      }
      return target[key]
    },
    set (target, prop, value) {
      if (target[prop] !== value) broadcastSSE(JSON.stringify({ type: 'state', state: target }), connections)
      target[prop] = value
      return true
    }
  }

  const state = new Proxy({
    downloading: {},
    summarizing: {}
  }, stateChangeHandler)

  const connections = []

  let lastAdded = Date.now()
  setInterval(runUpdateVideos, 1000 * 60 * 30, repo, connections)
  
  // Start auto-cleanup scheduler
  startAutoCleanup(repo, connections)
  function runUpdateVideos (repo, connections) {
    console.log('update videos')
    updateAndPersistVideos(repo, (err, data) => {
      if (err) {
        console.error(err)
        return
      }
      const { name, videos } = data
      const newVideos = videos
        .filter(v => v.addedAt > lastAdded)
        .filter(v => repo.filterByExcludedTerms(v))
      lastAdded = Date.now()
      if (newVideos.length > 0) {
        console.log('new videos for channel', name, newVideos.length)
        broadcastSSE(JSON.stringify({ type: 'new-videos', name, videos: newVideos }), connections)
        broadcastSSE(JSON.stringify({ type: 'download-log-line', line: `new videos for channel ${name} ${newVideos.length}` }), connections)
      } else {
        broadcastSSE(JSON.stringify({ type: 'download-log-line', line: `no new videos for channel ${name}` }), connections)
      }
    })
  }

  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://${req.headers.host}`)

      if (req.headers.accept && req.headers.accept.indexOf('text/event-stream') >= 0) {
        handleSSE(res, connections)
        return broadcastSSE(JSON.stringify({ type: 'state', state }), connections)
      }

      if (url.pathname.startsWith('/api/')) return apiHandler(req, res, repo, connections, state)

      return appHandler(req, res)
    } catch (error) {
      console.error(error)
    }
  })
}
