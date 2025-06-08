import fs from 'fs'
import { broadcastSSE } from '../server/sse.js'

let cleanupInterval = null

export function startAutoCleanup (repo, connections = []) {
  // Stop any existing interval
  stopAutoCleanup()
  
  // Check for cleanup every hour
  cleanupInterval = setInterval(async () => {
    await runScheduledCleanup(repo, connections)
  }, 60 * 60 * 1000) // 1 hour
  
  console.log('Auto-cleanup scheduler started')
}

export function stopAutoCleanup () {
  if (cleanupInterval) {
    clearInterval(cleanupInterval)
    cleanupInterval = null
    console.log('Auto-cleanup scheduler stopped')
  }
}

async function runScheduledCleanup (repo, connections = []) {
  try {
    const settings = repo.getAutoCleanupSettings()
    
    if (!settings.enabled) {
      return // Auto-cleanup is disabled
    }
    
    console.log('Running scheduled auto-cleanup...')
    
    const videos = repo.getAllVideos()
    const cutoffDate = Date.now() - ((settings.days * 24 + settings.hours) * 60 * 60 * 1000)
    
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
        
        if (isOld) {
          videosToDelete.push(video)
        }
        
      } catch (err) {
        console.error(`Auto-cleanup error checking video ${video.id}:`, err.message)
      }
    })
    
    if (videosToDelete.length === 0) {
      console.log('Auto-cleanup: No videos to delete')
      return
    }
    
    let deletedCount = 0
    let freedSpace = 0
    
    broadcastSSE(JSON.stringify({ 
      type: 'download-log-line', 
      line: `Auto-cleanup: Starting cleanup of ${videosToDelete.length} videos older than ${settings.days} days ${settings.hours} hours` 
    }), connections)
    
    for (const video of videosToDelete) {
      try {
        const filenames = fs.readdirSync('./data/videos').filter(f => f.startsWith(video.id))
        
        for (const filename of filenames) {
          const filePath = `./data/videos/${filename}`
          const stats = fs.statSync(filePath)
          freedSpace += stats.size
          fs.unlinkSync(filePath)
        }
        
        repo.updateVideo(video.id, { downloaded: false })
        deletedCount++
        
      } catch (error) {
        console.error(`Auto-cleanup error deleting video ${video.id}:`, error)
      }
    }
    
    repo.saveVideos()
    
    const freedSpaceGB = (freedSpace / Math.pow(10, 9)).toFixed(3)
    const message = `Auto-cleanup complete: ${deletedCount} videos deleted, ${freedSpaceGB}GB freed`
    
    console.log(message)
    broadcastSSE(JSON.stringify({ 
      type: 'download-log-line', 
      line: message 
    }), connections)
    
  } catch (error) {
    console.error('Auto-cleanup error:', error)
    broadcastSSE(JSON.stringify({ 
      type: 'download-log-line', 
      line: `Auto-cleanup error: ${error.message}` 
    }), connections)
  }
}