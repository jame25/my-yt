import fs from 'fs'
import { URL } from 'url'
import querystring from 'querystring'
import { summarizeVideo } from '../../lib/subtitles-summary.js'
import { broadcastSSE } from '../sse.js'
import { downloadVideo, extractIdFromUrl, isUnsupportedUrl, isYouTubeUrl } from '../../lib/youtube.js'
import { updateAndPersistVideosForChannel, updateAndPersistVideos } from '../../lib/update-videos.js'

const llmDefaults = {
  model: 'meta-llama-3.1-8b-instruct',
  host: 'http://127.0.0.1:1234',
  endpoint: '/v1/chat/completions',
  apiKey: '',
  temperature: 0
}

const llmSettings = {
  model: process.env.AI_MODEL ?? llmDefaults.model,
  host: process.env.AI_HOST ?? llmDefaults.host,
  endpoint: process.env.AI_ENDPOINT ?? llmDefaults.endpoint,
  apiKey: process.env.AI_APIKEY ?? llmDefaults.apiKey,
  temperature: process.env.AI_TEMPERATURE ?? llmDefaults.temperature
}

export default function apiHandler (req, res, repo, connections = [], state = {}) {
  const url = new URL(req.url, `http://${req.headers.host}`)

  if (url.pathname === '/api/channels' && req.method === 'GET') { return getChannelHandler(req, res, repo) }
  if (url.pathname === '/api/channels/display-names' && req.method === 'GET') { return getChannelDisplayNamesHandler(req, res, repo) }
  if (url.pathname === '/api/channels' && req.method === 'POST') { return addChannelHandler(req, res, repo, connections) }
  if (url.pathname === '/api/channels' && req.method === 'DELETE') { return deleteChannelHandler(req, res, repo) }
  if (url.pathname === '/api/channels/import' && req.method === 'POST') { return importChannelsHandler(req, res, repo, connections) }
  if (url.pathname === '/api/refresh-videos' && req.method === 'POST') { return refreshVideosHandler(req, res, repo, connections) }
  if (url.pathname === '/api/download-video' && req.method === 'POST') { return downloadVideoHandler(req, res, repo, connections, state) }
  if (url.pathname === '/api/summarize-video' && req.method === 'POST') { return summarizeVideoHandler(req, res, repo, connections, state, llmSettings) }
  if (url.pathname === '/api/ignore-video' && req.method === 'POST') { return ignoreVideoHandler(req, res, repo, connections) }
  if (url.pathname === '/api/delete-video' && req.method === 'POST') { return deleteVideoHandler(req, res, repo, connections) }
  if (url.pathname === '/api/videos' && req.method === 'GET') { return searchVideosHandler(req, res, repo) }
  if (url.pathname.match(/\/api\/video\/.*/) && req.method === 'GET') { return getVideoHandler(req, res, repo) }
  if (url.pathname === '/api/video-quality' && req.method === 'GET') { return getVideoQualityHandler(req, res, repo) }
  if (url.pathname === '/api/video-quality' && req.method === 'POST') { return setVideoQualityHandler(req, res, repo) }
  if (url.pathname === '/api/disk-usage' && req.method === 'GET') { return diskUsageHandler(req, res, repo) }
  if (url.pathname === '/api/reclaim-disk-space' && req.method === 'POST') { return reclaimDiskSpaceHandler(req, res, repo, connections) }
  if (url.pathname === '/api/transcode-videos' && req.method === 'GET') { return getTranscodeVideosHandler(req, res, repo) }
  if (url.pathname === '/api/transcode-videos' && req.method === 'POST') { return setTranscodeVideosHandler(req, res, repo) }
  if (url.pathname === '/api/excluded-terms' && req.method === 'GET') { return getExcludedTermsHandler(req, res, repo) }
  if (url.pathname === '/api/excluded-terms' && req.method === 'POST') { return addExcludedTermHandler(req, res, repo) }
  if (url.pathname === '/api/excluded-terms' && req.method === 'DELETE') { return removeExcludedTermHandler(req, res, repo) }
  if (url.pathname === '/api/auto-cleanup-settings' && req.method === 'GET') { return getAutoCleanupSettingsHandler(req, res, repo) }
  if (url.pathname === '/api/auto-cleanup-settings' && req.method === 'POST') { return setAutoCleanupSettingsHandler(req, res, repo) }
  if (url.pathname === '/api/auto-cleanup-preview' && req.method === 'GET') { return getAutoCleanupPreviewHandler(req, res, repo) }
  if (url.pathname === '/api/run-auto-cleanup' && req.method === 'POST') { return runAutoCleanupHandler(req, res, repo, connections) }
  if (url.pathname === '/api/watch-later' && req.method === 'POST') { return addToWatchLaterHandler(req, res, repo, connections) }
  if (url.pathname === '/api/watch-later' && req.method === 'DELETE') { return removeFromWatchLaterHandler(req, res, repo, connections) }
  if (url.pathname.match(/\/api\/watch-later\/.*/) && req.method === 'GET') { return checkWatchLaterHandler(req, res, repo) }
  if (url.pathname.match(/\/api\/videos\/.*/) && req.method === 'GET') { return watchVideoHandler(req, res, repo, connections) }
  if (url.pathname.match(/\/api\/captions\/.*/) && req.method === 'GET') { return captionsHandler(req, res, repo) }

  res.writeHead(404)
  return res.end()
}

async function getChannelHandler (req, res, repo) {
  const channels = repo.getChannels()
  res.writeHead(200, { 'Content-Type': 'application/json' })
  return res.end(JSON.stringify(channels))
}

async function getChannelDisplayNamesHandler (req, res, repo) {
  const channels = repo.getChannels()
  const displayNames = {}
  channels.forEach(channel => {
    displayNames[channel.name] = channel.displayName || channel.name
  })
  res.writeHead(200, { 'Content-Type': 'application/json' })
  return res.end(JSON.stringify(displayNames))
}

async function addChannelHandler (req, res, repo, connections = []) {
  const body = await getBody(req)
  let { name } = JSON.parse(body)
  name = name.trim()
  name = name.startsWith('@') ? name.substring(1) : name

  if (repo.channelExists(name)) {
    res.writeHead(409)
    return res.end('Channel already added')
  }

  const videos = await updateAndPersistVideosForChannel(name, repo)
  if (Array.isArray(videos)) {
    repo.addChannel(name)
    broadcastSSE(JSON.stringify({ type: 'new-videos', name, videos }), connections)
    res.writeHead(201)
    return res.end('Channel added')
  }

  res.writeHead(404)
  return res.end('Channel not found')
}

async function deleteChannelHandler (req, res, repo) {
  const body = await getBody(req)
  let { name } = JSON.parse(body)
  name = name.trim()

  if (!repo.channelExists(name)) {
    res.writeHead(409, { 'Content-Type': 'text/plain' })
    return res.end('Channel does not exist')
  }

  repo.deleteChannel(name)
  res.writeHead(200, { 'Content-Type': 'text/plain' })
  return res.end('Channel deleted')
}

async function importChannelsHandler (req, res, repo, connections = []) {
  const body = await getBody(req)
  const { channels } = JSON.parse(body)

  if (!Array.isArray(channels) || channels.length === 0) {
    res.writeHead(400, { 'Content-Type': 'text/plain' })
    return res.end('Invalid channels data')
  }

  let added = 0
  let skipped = 0
  let failed = 0
  const allNewVideos = []

  for (const channel of channels) {
    try {
      let channelName = channel.name.trim()
      channelName = channelName.startsWith('@') ? channelName.substring(1) : channelName

      if (repo.channelExists(channelName)) {
        skipped++
        continue
      }

      const videos = await updateAndPersistVideosForChannel(channelName, repo)
      if (Array.isArray(videos)) {
        repo.addChannel(channelName, channel.title)
        allNewVideos.push(...videos)
        added++
      } else {
        failed++
      }
    } catch (error) {
      console.error('Error importing channel:', channel, error)
      failed++
    }
  }

  if (allNewVideos.length > 0) {
    broadcastSSE(JSON.stringify({ type: 'new-videos', videos: allNewVideos }), connections)
  }

  res.writeHead(200, { 'Content-Type': 'text/plain' })
  return res.end(`Import complete: ${added} added, ${skipped} skipped, ${failed} failed`)
}

async function refreshVideosHandler (req, res, repo, connections = []) {
  try {
    broadcastSSE(JSON.stringify({ type: 'download-log-line', line: 'Manual refresh started...' }), connections)
    
    await updateAndPersistVideos(repo, (err, data) => {
      if (err) {
        console.error(err)
        broadcastSSE(JSON.stringify({ type: 'download-log-line', line: `Error updating ${err.message}` }), connections)
        return
      }
      const { name, videos } = data
      const newVideos = videos.filter(v => v.addedAt > Date.now() - 60000) // Videos added in last minute
      if (newVideos.length > 0) {
        console.log('new videos for channel', name, newVideos.length)
        broadcastSSE(JSON.stringify({ type: 'new-videos', name, videos: newVideos }), connections)
        broadcastSSE(JSON.stringify({ type: 'download-log-line', line: `Found ${newVideos.length} new videos for channel ${name}` }), connections)
      } else {
        broadcastSSE(JSON.stringify({ type: 'download-log-line', line: `No new videos for channel ${name}` }), connections)
      }
    })

    res.writeHead(200, { 'Content-Type': 'text/plain' })
    return res.end('Refresh started')
  } catch (error) {
    console.error('Error refreshing videos:', error)
    res.writeHead(500, { 'Content-Type': 'text/plain' })
    return res.end('Error starting refresh')
  }
}

async function downloadVideoHandler (req, res, repo, connections = [], state = {}) {
  const body = await getBody(req)
  let { id, external } = JSON.parse(body)

  if (isUnsupportedUrl(id)) {
    console.log('unsupported url', id)
    res.writeHead(400)
    return res.end()
  }
  if (isYouTubeUrl(id)) { id = extractIdFromUrl(id) }

  state.downloading = state.downloading || {}
  state.downloading[id] = { lines: [] }

  let broadcastNewVideoOnce = false
  downloadVideo(id, repo, (line) => {
    if (external && !broadcastNewVideoOnce) {
      broadcastSSE(JSON.stringify({ type: 'new-videos', videos: [repo.getVideo(id)] }), connections)
      broadcastNewVideoOnce = true
    }
    broadcastSSE(JSON.stringify({ type: 'download-log-line', line }), connections)
  })
    .then(() => {
      const video = repo.getVideo(id)
      broadcastSSE(JSON.stringify({ type: 'downloaded', videoId: id, downloaded: true, video }), connections)
    })
    .catch((error) => {
      broadcastSSE(JSON.stringify({ type: 'download-log-line', line: error.stderr }), connections)
    })
    .finally(() => {
      delete state.downloading[id]
    })

  res.writeHead(200, { 'Content-Type': 'text/plain' })
  res.end('Download started')
}

async function summarizeVideoHandler (req, res, repo, connections = [], state = {}, llmSettings = {}) {
  const body = await getBody(req)
  const { id } = JSON.parse(body)

  state.summarizing = state.summarizing || {}
  state.summarizing[id] = { lines: [] }

  summarizeVideo(id, repo, llmSettings, (line) => {
    broadcastSSE(JSON.stringify({ type: 'download-log-line', line }), connections)
  })
    .then(({ summary, transcript }) =>
      broadcastSSE(JSON.stringify({ type: 'summary', summary, transcript, videoId: id }), connections))
    .catch((error) => {
      broadcastSSE(JSON.stringify({ type: 'download-log-line', line: error.message }), connections)
      broadcastSSE(JSON.stringify({ type: 'summary-error', videoId: id }), connections)
    })
    .finally(() => {
      delete state.summarizing[id]
    })

  res.writeHead(200, { 'Content-Type': 'text/plain' })
  res.end('Download started')
}

async function ignoreVideoHandler (req, res, repo, connections = []) {
  const body = await getBody(req)
  const { id } = JSON.parse(body)
  const ignored = repo.toggleIgnoreVideo(id)
  broadcastSSE(JSON.stringify({ type: 'ignored', videoId: id, ignored }), connections)
  res.writeHead(200, { 'Content-Type': 'application/json' })
  return res.end(JSON.stringify(ignored))
}

async function deleteVideoHandler (req, res, repo, connections = []) {
  const body = await getBody(req)
  const { id } = JSON.parse(body)
  repo.deleteVideo(id)
  broadcastSSE(JSON.stringify({ type: 'downloaded', videoId: id, downloaded: false }), connections)
  res.writeHead(200)
  res.end()
}

export function searchVideosHandler (req, res, repo) {
  const query = getQuery(req)
  const videos = repo.getVideos(query)
  res.writeHead(200, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(videos))
}

function getVideoHandler (req, res, repo) {
  const videoId = req.url.replace('/api/video/', '')
  const video = repo.getVideo(videoId)
  
  if (video) {
    // Add watch later status
    const watchLaterIds = repo.getWatchLaterVideos()
    const videoWithWatchLater = {
      ...video,
      watchLater: watchLaterIds.includes(video.id)
    }
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(videoWithWatchLater))
  } else {
    res.writeHead(404, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Video not found' }))
  }
}

function getVideoQualityHandler (req, res, repo) {
  const videoQuality = repo.getVideoQualitySetting()
  res.writeHead(200, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(videoQuality))
}

async function setVideoQualityHandler (req, res, repo) {
  const body = await getBody(req)
  const videoQuality = JSON.parse(body)

  const newQuality = repo.setVideoQualitySetting(videoQuality)
  if (!newQuality) {
    res.writeHead(400)
    return res.end()
  }
  res.writeHead(200, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(newQuality))
}

function diskUsageHandler (req, res, repo) {
  const onlyIgnored = getQuery(req).onlyIgnored === 'true'
  const videos = repo.getAllVideos()

  const filterFn = onlyIgnored ? video => (video.downloaded || video.transcript) && video.ignored : video => (video.downloaded || video.transcript)

  const diskSpaceUsed = videos.filter(filterFn)
    .reduce((total, video) => {
      try {
        const filenames = fs.readdirSync('./data/videos').filter(f => f.startsWith(video.id))
        return total + filenames.reduce((acc, filename) => acc + fs.statSync(`./data/videos/${filename}`).size / Math.pow(10, 9), 0)
      } catch (err) {
        console.error(err)
        return total
      }
    }, 0)
  res.writeHead(200, { 'Content-Type': 'text/plain' })
  res.end(diskSpaceUsed.toFixed(3) + 'GB')
}

async function reclaimDiskSpaceHandler (req, res, repo, connections = []) {
  const body = await getBody(req)
  const { onlyIgnored } = JSON.parse(body)
  const videos = repo.getAllVideos()

  const filterFn = onlyIgnored ? video => (video.downloaded || video.transcript) && video.ignored : video => (video.downloaded || video.transcript)

  videos.filter(filterFn)
    .forEach((video) => {
      try {
        fs.readdir('./data/videos', (err, filenames) => {
          if (err) {
            broadcastSSE(JSON.stringify({ type: 'download-log-line', line: `error reading dir data/video: ${err.message}` }), connections)
            return console.error(err)
          }
          for (const filename of filenames) {
            if (filename.startsWith(video.id)) {
              fs.unlink(`./data/videos/${filename}`, err => {
                if (err) {
                  console.error(err)
                  broadcastSSE(JSON.stringify({ type: 'download-log-line', line: `error deleting ${filename}: ${err.message}` }), connections)
                } else {
                  console.log('deleted', filename)
                  repo.updateVideo(video.id, { downloaded: false })
                  broadcastSSE(JSON.stringify({ type: 'download-log-line', line: `deleted ${filename}` }), connections)
                }
              })
            }
          }
        })
      } catch (err) {
        console.error(err.message)
      }
    })
  repo.saveVideos()
  res.writeHead(200)
  res.end()
}

async function getExcludedTermsHandler (req, res, repo) {
  const excludedTerms = repo.getExcludedTerms()
  res.writeHead(200, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(excludedTerms))
}
async function addExcludedTermHandler (req, res, repo) {
  const body = await getBody(req)
  const term = JSON.parse(body).term
  repo.addExcludedTerm(term)
  res.writeHead(200)
  res.end()
}
async function removeExcludedTermHandler (req, res, repo) {
  const body = await getBody(req)
  const term = JSON.parse(body).term
  repo.removeExcludedTerm(term)
  res.writeHead(200)
  res.end()
}
async function getTranscodeVideosHandler (req, res, repo) {
  const transcodeVideos = repo.getTranscodeVideosSetting()
  res.writeHead(200, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(transcodeVideos))
}
async function setTranscodeVideosHandler (req, res, repo) {
  const body = await getBody(req)
  const transcodeVideos = JSON.parse(body)

  repo.setTranscodeVideosSetting(transcodeVideos)
  res.writeHead(200)
  res.end()
}

function watchVideoHandler (req, res, repo, connections = []) {
  const id = req.url.replace('/api/videos/', '').replace(/\.(webm|mp4)$/, '')
  const video = repo.getVideo(id)
  const location = video.location || `./data/videos/${id}.mp4`
  const contentType = video.format ? `video/${video.format}` : 'video/mp4'
  if (!fs.existsSync(location)) {
    res.writeHead(404, { 'Content-Type': 'text/plain' })
    res.end('Video not found')
    broadcastSSE(JSON.stringify({ type: 'download-log-line', line: `video does not exist ${location}` }), connections)
    return
  }

  // https://github.com/bootstrapping-microservices/video-streaming-example/blob/master/index.js
  // https://blog.logrocket.com/streaming-video-in-safari/

  const options = {}

  let start
  let end

  const range = req.headers.range
  if (range) {
    const bytesPrefix = 'bytes='
    if (range.startsWith(bytesPrefix)) {
      const bytesRange = range.substring(bytesPrefix.length)
      const parts = bytesRange.split('-')
      if (parts.length === 2) {
        const rangeStart = parts[0] && parts[0].trim()
        if (rangeStart && rangeStart.length > 0) {
          options.start = start = parseInt(rangeStart)
        }
        const rangeEnd = parts[1] && parts[1].trim()
        if (rangeEnd && rangeEnd.length > 0) {
          options.end = end = parseInt(rangeEnd)
        }
      }
    }
  }

  res.setHeader('content-type', contentType)

  const stat = fs.statSync(location)

  const contentLength = stat.size

  if (req.method === 'HEAD') {
    res.statusCode = 200
    res.setHeader('accept-ranges', 'bytes')
    res.setHeader('content-length', contentLength)
    return res.end()
  }
  let retrievedLength = contentLength
  if (start !== undefined && end !== undefined) {
    retrievedLength = end - start + 1
  } else if (start !== undefined) {
    retrievedLength = contentLength - start
  }

  res.statusCode = (start !== undefined || end !== undefined) ? 206 : 200

  res.setHeader('content-length', retrievedLength)

  if (range !== undefined) {
    res.setHeader('accept-ranges', 'bytes')
    res.setHeader('content-range', `bytes ${start || 0}-${end || (contentLength - 1)}/${contentLength}`)
  }

  broadcastSSE(JSON.stringify({ type: 'download-log-line', line: `video range requested ${location} ${start || 0}-${end || (contentLength - 1)}/${contentLength}` }), connections)

  const fileStream = fs.createReadStream(location, options)
  fileStream.on('error', error => {
    console.error(`Error reading file ${location}.`, error)
    broadcastSSE(JSON.stringify({ type: 'download-log-line', line: `video stream error ${location}: ${error.message}` }), connections)

    res.writeHead(500)
    res.end()
  })

  fileStream.pipe(res)
}


function captionsHandler (req, res) {
  const captionsPath = './data' + req.url.replace('api/captions', 'videos') + '.en.vtt'
  if (!fs.existsSync(captionsPath)) {
    res.writeHead(404)
    res.end()
  } else {
    const fileStream = fs.createReadStream(captionsPath)
    fileStream.pipe(res)
  }
}

async function getBody (req) {
  return new Promise((resolve, reject) => {
    let body = ''
    req.on('data', chunk => {
      body += chunk.toString()
    })
    req.on('end', () => resolve(body))
    req.on('error', reject)
  })
}

function getQuery (req) {
  return (req.url && req.url.indexOf('?') >= 0)
    ? querystring.parse(req.url.substring(req.url.indexOf('?') + 1))
    : {}
}

async function getAutoCleanupSettingsHandler (req, res, repo) {
  const settings = repo.getAutoCleanupSettings()
  res.writeHead(200, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(settings))
}

async function setAutoCleanupSettingsHandler (req, res, repo) {
  const body = await getBody(req)
  const settings = JSON.parse(body)
  
  repo.setAutoCleanupSettings(settings)
  res.writeHead(200, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(settings))
}

async function getAutoCleanupPreviewHandler (req, res, repo) {
  const query = getQuery(req)
  const days = parseInt(query.days) || 30
  const hours = parseInt(query.hours) || 0
  
  const videos = repo.getAllVideos()
  const cutoffDate = Date.now() - ((days * 24 + hours) * 60 * 60 * 1000)
  
  console.log('Auto-cleanup preview:', { totalVideos: videos.length, days, hours, cutoffDate: new Date(cutoffDate) })
  
  // Check how many videos are marked as downloaded
  const downloadedVideos = videos.filter(v => v.downloaded)
  console.log('Videos marked as downloaded:', downloadedVideos.length)
  
  // Check what files actually exist
  try {
    const actualFiles = fs.readdirSync('./data/videos').filter(f => f.endsWith('.mp4') || f.endsWith('.webm'))
    console.log('Actual video files found:', actualFiles.length, actualFiles)
  } catch (err) {
    console.log('Error reading videos directory:', err.message)
  }
  
  const eligibleVideos = []
  let totalSize = 0
  
  // Check each video that's marked as downloaded
  videos.forEach(video => {
    if (!video.downloaded) {
      console.log(`Video ${video.id} not marked as downloaded`)
      return
    }
    
    try {
      // Check if actual files exist and get their modification date
      const filenames = fs.readdirSync('./data/videos').filter(f => f.startsWith(video.id))
      
      if (filenames.length === 0) return // No files found
      
      // Get the oldest file modification date (when it was downloaded)
      let oldestFileDate = Date.now()
      let videoSize = 0
      
      filenames.forEach(filename => {
        const filePath = `./data/videos/${filename}`
        const stats = fs.statSync(filePath)
        videoSize += stats.size
        if (stats.mtime.getTime() < oldestFileDate) {
          oldestFileDate = stats.mtime.getTime()
        }
      })
      
      const isOld = oldestFileDate < cutoffDate
      const hoursOld = Math.round((Date.now() - oldestFileDate) / (1000 * 60 * 60) * 10) / 10
      console.log(`Video ${video.id}: ${video.title}, downloaded: ${new Date(oldestFileDate)}, ${hoursOld} hours old, cutoff: ${days} days ${hours} hours, isOld: ${isOld}, size: ${(videoSize / Math.pow(10, 9)).toFixed(3)}GB`)
      
      if (isOld) {
        eligibleVideos.push(video)
        totalSize += videoSize
      }
      
    } catch (err) {
      console.log(`Error checking video ${video.id}:`, err.message)
    }
  })
  
  console.log('Eligible videos for cleanup:', eligibleVideos.length)
  
  res.writeHead(200, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({
    videoCount: eligibleVideos.length,
    totalSize: `${(totalSize / Math.pow(10, 9)).toFixed(3)}GB`
  }))
}

async function runAutoCleanupHandler (req, res, repo, connections = []) {
  const body = await getBody(req)
  const { days, hours } = JSON.parse(body)
  
  const videos = repo.getAllVideos()
  const cutoffDate = Date.now() - ((days * 24 + hours) * 60 * 60 * 1000)
  
  console.log('Running auto-cleanup:', { totalVideos: videos.length, days, hours, cutoffDate: new Date(cutoffDate) })
  
  const videosToDelete = []
  
  // Check each video that's marked as downloaded
  videos.forEach(video => {
    if (!video.downloaded) return
    
    try {
      // Check if actual files exist and get their modification date
      const filenames = fs.readdirSync('./data/videos').filter(f => f.startsWith(video.id))
      
      if (filenames.length === 0) return // No files found
      
      // Get the oldest file modification date (when it was downloaded)
      let oldestFileDate = Date.now()
      
      filenames.forEach(filename => {
        const filePath = `./data/videos/${filename}`
        const stats = fs.statSync(filePath)
        if (stats.mtime.getTime() < oldestFileDate) {
          oldestFileDate = stats.mtime.getTime()
        }
      })
      
      const isOld = oldestFileDate < cutoffDate
      const hoursOld = Math.round((Date.now() - oldestFileDate) / (1000 * 60 * 60) * 10) / 10
      console.log(`Video ${video.id}: ${video.title}, downloaded: ${new Date(oldestFileDate)}, ${hoursOld} hours old, cutoff: ${days} days ${hours} hours, isOld: ${isOld}`)
      
      if (isOld) {
        videosToDelete.push(video)
      }
      
    } catch (err) {
      console.log(`Error checking video ${video.id}:`, err.message)
    }
  })
  
  let deletedCount = 0
  let freedSpace = 0
  
  for (const video of videosToDelete) {
    try {
      const filenames = fs.readdirSync('./data/videos').filter(f => f.startsWith(video.id))
      
      for (const filename of filenames) {
        const filePath = `./data/videos/${filename}`
        const stats = fs.statSync(filePath)
        freedSpace += stats.size
        fs.unlinkSync(filePath)
        
        broadcastSSE(JSON.stringify({ 
          type: 'download-log-line', 
          line: `Auto-cleanup: deleted ${filename}` 
        }), connections)
      }
      
      repo.updateVideo(video.id, { downloaded: false })
      deletedCount++
      
    } catch (error) {
      console.error(`Error deleting video ${video.id}:`, error)
      broadcastSSE(JSON.stringify({ 
        type: 'download-log-line', 
        line: `Auto-cleanup error: failed to delete ${video.id}` 
      }), connections)
    }
  }
  
  repo.saveVideos()
  
  res.writeHead(200, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({
    deletedCount,
    freedSpace: `${(freedSpace / Math.pow(10, 9)).toFixed(3)}GB`
  }))
}

async function addToWatchLaterHandler (req, res, repo, connections = []) {
  const body = await getBody(req)
  const { videoId } = JSON.parse(body)

  const added = repo.addToWatchLater(videoId)
  
  if (added) {
    // Download the video if it's not already downloaded
    const video = repo.getVideo(videoId)
    if (video && !video.downloaded) {
      downloadVideo(videoId, repo, (line) => {
        broadcastSSE(JSON.stringify({ type: 'download-log-line', line }), connections)
      })
        .then(() => {
          const updatedVideo = repo.getVideo(videoId)
          broadcastSSE(JSON.stringify({ type: 'downloaded', videoId, downloaded: true, video: updatedVideo }), connections)
        })
        .catch((error) => {
          broadcastSSE(JSON.stringify({ type: 'download-log-line', line: error.stderr }), connections)
        })
    }
    
    broadcastSSE(JSON.stringify({ type: 'watch-later-added', videoId }), connections)
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ success: true }))
  } else {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ success: false, message: 'Already in watch later' }))
  }
}

async function removeFromWatchLaterHandler (req, res, repo, connections = []) {
  const body = await getBody(req)
  const { videoId } = JSON.parse(body)

  const removed = repo.removeFromWatchLater(videoId)
  
  if (removed) {
    broadcastSSE(JSON.stringify({ type: 'watch-later-removed', videoId }), connections)
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ success: true }))
  } else {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ success: false, message: 'Not in watch later' }))
  }
}

async function checkWatchLaterHandler (req, res, repo) {
  const videoId = req.url.replace('/api/watch-later/', '')
  const inWatchLater = repo.isInWatchLater(videoId)
  
  res.writeHead(200, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ inWatchLater }))
}
