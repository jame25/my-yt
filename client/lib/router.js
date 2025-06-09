/* global MutationObserver, history, PopStateEvent, location, dispatchEvent */
import { applyShowBigPlayer, applyShowThumbnails, applyTheatreMode } from '../lib/utils.js'
import Store from '../lib/store.js'
const store = new Store()

const routes = {
  '/': {
    template: document.getElementById('main-template'),
    async initialize () {
      document.getElementById('home-link').classList.add('hide')

      document.querySelector('search-videos #search').removeAttribute('disabled', 'disabled')
      document.querySelector('search-videos').classList.remove('hide')

      document.querySelector('search-videos').searchHandler()

      const channels = await fetch('/api/channels').then(res => res.json())
      document.querySelector('channels-list').dataset.list = JSON.stringify(channels.map(c => c.displayName || c.name).filter(Boolean))

      document.querySelector('empty-state').dataset.hasChannels = channels.length > 0
      handleEmptyState()

      new MutationObserver((mutationList, observer) => {
        handleEmptyState()
      }).observe(document.querySelector('videos-container'), { attributes: false, childList: true, subtree: true })

      applyShowThumbnails(store.get(store.showThumbnailsKey))
      applyShowBigPlayer(store.get(store.showBigPlayerKey))
      applyTheatreMode(store.get(store.theatreModeKey))
    }
  },
  '/settings': {
    template: document.getElementById('settings-template'),
    async initialize () {
      document.getElementById('home-link').classList.remove('hide')

      document.querySelector('search-videos #search').setAttribute('disabled', 'disabled')
      document.querySelector('search-videos').classList.add('hide')

      const $showThumbnails = document.getElementById('show-thumbnails')
      store.get(store.showThumbnailsKey) ? $showThumbnails.setAttribute('checked', 'true') : $showThumbnails.removeAttribute('checked')

      $showThumbnails.addEventListener('click', (event) => {
        store.toggle(store.showThumbnailsKey)
        applyShowThumbnails(store.get(store.showThumbnailsKey))
      })

      const $showBigPlayer = document.getElementById('show-big-player')
      store.get(store.showBigPlayerKey) ? $showBigPlayer.setAttribute('checked', 'true') : $showBigPlayer.removeAttribute('checked')

      $showBigPlayer.addEventListener('click', (event) => {
        store.toggle(store.showBigPlayerKey)
        applyShowBigPlayer(store.get(store.showBigPlayerKey))
      })

      const $showOriginalThumbnail = document.getElementById('show-original-thumbnail')
      store.get(store.showOriginalThumbnailKey) ? $showOriginalThumbnail.setAttribute('checked', 'true') : $showOriginalThumbnail.removeAttribute('checked')

      $showOriginalThumbnail.addEventListener('click', (event) => {
        store.toggle(store.showOriginalThumbnailKey)
      })

      const $useTLDWTube = document.getElementById('use-tldw-tube')
      store.get(store.useTLDWTubeKey) ? $useTLDWTube.setAttribute('checked', 'true') : $useTLDWTube.removeAttribute('checked')

      $useTLDWTube.addEventListener('click', (event) => {
        store.toggle(store.useTLDWTubeKey)
      })

      const $showCaptions = document.getElementById('show-captions')
      store.get(store.showCaptionsKey) ? $showCaptions.setAttribute('checked', 'true') : $showCaptions.removeAttribute('checked')

      $showCaptions.addEventListener('click', (event) => {
        store.toggle(store.showCaptionsKey)
      })

      const $theatreMode = document.getElementById('theatre-mode')
      store.get(store.theatreModeKey) ? $theatreMode.setAttribute('checked', 'true') : $theatreMode.removeAttribute('checked')

      $theatreMode.addEventListener('click', (event) => {
        store.toggle(store.theatreModeKey)
        applyTheatreMode(store.get(store.theatreModeKey))
      })
    }
  },
  '/watch': {
    template: document.getElementById('watch-template'),
    async initialize () {
      document.getElementById('home-link').classList.remove('hide')
      document.querySelector('search-videos #search').setAttribute('disabled', 'disabled')
      document.querySelector('search-videos').classList.add('hide')

      const urlParams = new URLSearchParams(window.location.search)
      const videoId = urlParams.get('v')
      
      if (!videoId) {
        window.location.href = '/404'
        return
      }

      await this.loadVideo(videoId)
    },

    cleanup () {
      this.cleanupDownloadListener()
    },
    
    async loadVideo(videoId) {
      const container = document.getElementById('video-player-container')
      const title = document.getElementById('video-title')
      const channel = document.getElementById('video-channel')
      const date = document.getElementById('video-date')
      const views = document.getElementById('video-views')
      const downloadBtn = document.getElementById('download-video')
      const watchLaterBtn = document.getElementById('watch-later-video')
      const theatreModeBtn = document.getElementById('theatre-mode')
      const shareBtn = document.getElementById('share-video')

      try {
        // Try to get video info from existing data first
        let video = await this.getVideoFromApi(videoId)
        
        if (!video) {
          // If not found, show video info from YouTube without downloading
          video = await this.getVideoInfoFromYoutube(videoId)
        }

        if (video) {
          // Store current video state for button handlers
          this.currentVideo = video
          
          title.textContent = video.title || 'Unknown Title'
          channel.textContent = video.channelName || 'Unknown Channel'
          date.textContent = this.formatDate(video.publishedAt)
          views.textContent = video.viewCount || 'Unknown views'

          if (video.downloaded) {
            this.setupVideoPlayer(container, video)
          } else {
            // Show thumbnail instead of downloading automatically
            this.setupThumbnailView(container, video)
          }

          this.setupActionButtons(downloadBtn, watchLaterBtn, theatreModeBtn, shareBtn, video)
        } else {
          container.innerHTML = '<div class="error">Could not load video information</div>'
        }
      } catch (error) {
        console.error('Error loading video:', error)
        container.innerHTML = '<div class="error">Error loading video</div>'
      }
    },

    async getVideoFromApi(videoId) {
      try {
        const response = await fetch(`/api/video/${videoId}`)
        if (response.status === 404) {
          return null
        }
        const video = await response.json()
        return video
      } catch (error) {
        console.error('Error fetching video:', error)
        return null
      }
    },

    async getVideoInfoFromYoutube(videoId) {
      try {
        // Create a basic video object with YouTube data
        const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`
        const thumbnailUrl = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`
        
        return {
          id: videoId,
          title: 'Loading...',
          channelName: 'Loading...',
          publishedAt: new Date().toISOString(),
          viewCount: 'Loading...',
          thumbnail: thumbnailUrl,
          downloaded: false,
          watchLater: false
        }
      } catch (error) {
        console.error('Error creating YouTube video info:', error)
        return null
      }
    },

    setupThumbnailView(container, video) {
      container.innerHTML = `
        <div class="thumbnail-view">
          <div class="thumbnail-container">
            <img src="${video.thumbnail}" alt="${video.title}" class="video-thumbnail" />
          </div>
        </div>
      `
    },

    async initiateVideoDownload(videoId, container) {
      // Keep the thumbnail visible during download, just set up the listener
      try {
        await this.downloadVideo(videoId)
        this.setupDownloadListener(videoId, container)
      } catch (error) {
        console.error('Error starting download:', error)
        container.innerHTML = '<div class="error">Failed to start download</div>'
      }
    },

    async downloadVideo(videoId) {
      try {
        const response = await fetch('/api/download-video', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: videoId, external: true })
        })
        return response.ok
      } catch (error) {
        console.error('Error downloading video:', error)
        return false
      }
    },

    setupVideoPlayer(container, video) {
      const videoSrc = video.downloaded 
        ? `/api/videos/${video.id}.${video.format || 'mp4'}`
        : `/api/stream/${video.id}.${video.format || 'mp4'}`
        
      container.innerHTML = `
        <video controls playsinline style="width: 100%; max-width: 800px;">
          <source src="${videoSrc}" type="video/${video.format || 'mp4'}" />
          ${store.get(store.showCaptionsKey) 
            ? `<track default kind="captions" srclang="en" src="/api/captions/${video.id}" />`
            : ''}
          <p>Your browser does not support the video tag.</p>
        </video>
      `
      
      if (!video.downloaded) {
        container.innerHTML += `<div style="margin-top: 10px; color: #666;">⏳ Streaming while downloading...</div>`
      }
    },

    setupDownloadListener(videoId, container) {
      // Store the current video ID for the watch page
      this.currentWatchVideoId = videoId
      
      // Set up a custom handler that will be called by the existing SSE system
      window.watchPageDownloadHandler = (data) => {
        if (data.type === 'downloaded' && data.videoId === videoId && data.downloaded) {
          console.log('Video download completed for watch page:', videoId)
          
          // Get updated video data and set up player
          this.getVideoFromApi(videoId).then(video => {
            if (video && video.downloaded) {
              this.setupVideoPlayer(container, video)
              
              // Update video info section
              const title = document.getElementById('video-title')
              const channel = document.getElementById('video-channel')
              const date = document.getElementById('video-date')
              const views = document.getElementById('video-views')
              
              if (title && channel && date && views) {
                title.textContent = video.title || 'Unknown Title'
                channel.textContent = video.channelName || 'Unknown Channel'
                date.textContent = this.formatDate(video.publishedAt)
                views.textContent = video.viewCount || 'Unknown views'
              }
              
              // Update action buttons if they exist  
              const downloadBtn = document.getElementById('download-video')
              const watchLaterBtn = document.getElementById('watch-later-video')
              const theatreModeBtn = document.getElementById('theatre-mode')
              const shareBtn = document.getElementById('share-video')
              if (downloadBtn && watchLaterBtn && theatreModeBtn && shareBtn) {
                // Update video object and stored state to reflect downloaded status
                video.downloaded = true
                this.currentVideo = video
                this.setupActionButtons(downloadBtn, watchLaterBtn, theatreModeBtn, shareBtn, video)
              }
            }
          })
          
          // Clear the handler after use
          window.watchPageDownloadHandler = null
        }
      }
    },

    cleanupDownloadListener() {
      // Clean up any existing listeners when leaving the watch page
      this.currentWatchVideoId = null
      window.watchPageDownloadHandler = null
    },

    setupActionButtons(downloadBtn, watchLaterBtn, theatreModeBtn, shareBtn, video) {
      downloadBtn.onclick = () => {
        // Use current stored video state to check download status
        const currentVideoState = this.currentVideo || video
        if (!currentVideoState.downloaded) {
          const container = document.getElementById('video-player-container')
          this.initiateVideoDownload(currentVideoState.id, container)
          downloadBtn.textContent = '⚡️ Downloading...'
        } else {
          // Delete video functionality
          if (confirm('Are you sure you want to delete this video?')) {
            this.deleteVideo(currentVideoState.id)
          }
        }
      }

      watchLaterBtn.onclick = () => {
        if (video.watchLater) {
          this.removeFromWatchLater(video.id)
          watchLaterBtn.textContent = '⏰ Watch Later'
          video.watchLater = false
        } else {
          this.addToWatchLater(video.id)
          watchLaterBtn.textContent = '✅ In Watch Later'
          video.watchLater = true
        }
      }

      theatreModeBtn.onclick = () => {
        const watchDiv = document.getElementById('watch')
        const videoElement = watchDiv.querySelector('video')
        
        if (watchDiv.classList.contains('theatre-mode')) {
          // Exit theatre mode
          watchDiv.classList.remove('theatre-mode')
          theatreModeBtn.textContent = '🎭 Theatre Mode'
          theatreModeBtn.title = 'Enter theatre mode'
        } else {
          // Enter theatre mode
          watchDiv.classList.add('theatre-mode')
          theatreModeBtn.textContent = '🔲 Exit Theatre'
          theatreModeBtn.title = 'Exit theatre mode'
          
          // Scroll video into view when entering theatre mode
          if (videoElement) {
            videoElement.scrollIntoView({ behavior: 'smooth', block: 'start' })
          }
        }
      }

      shareBtn.onclick = async () => {
        const youtubeUrl = `https://www.youtube.com/watch?v=${video.id}`
        
        try {
          await navigator.clipboard.writeText(youtubeUrl)
          
          const originalText = shareBtn.textContent
          shareBtn.textContent = '✅ Copied!'
          
          setTimeout(() => {
            shareBtn.textContent = originalText
          }, 2000)
          
        } catch (err) {
          console.error('Failed to copy to clipboard:', err)
          
          const originalText = shareBtn.textContent
          shareBtn.textContent = '❌ Copy failed'
          
          setTimeout(() => {
            shareBtn.textContent = originalText
          }, 2000)
          
          try {
            const textarea = document.createElement('textarea')
            textarea.value = youtubeUrl
            document.body.appendChild(textarea)
            textarea.select()
            document.execCommand('copy')
            document.body.removeChild(textarea)
            
            shareBtn.textContent = '✅ Copied!'
            setTimeout(() => {
              shareBtn.textContent = originalText
            }, 2000)
          } catch (fallbackErr) {
            console.error('Fallback copy also failed:', fallbackErr)
          }
        }
      }

      // Always show the download/delete button
      downloadBtn.style.display = 'inline-block'
      downloadBtn.textContent = video.downloaded ? '🗑️ Delete' : '⬇️ Download'
      downloadBtn.title = video.downloaded ? 'Delete video files' : 'Download video'
      
      watchLaterBtn.textContent = video.watchLater ? '✅ In Watch Later' : '⏰ Watch Later'
      theatreModeBtn.textContent = '🎭 Theatre Mode'
      theatreModeBtn.title = 'Enter theatre mode'
    },

    async addToWatchLater(videoId) {
      try {
        await fetch('/api/watch-later', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ videoId })
        })
      } catch (error) {
        console.error('Error adding to watch later:', error)
      }
    },

    async removeFromWatchLater(videoId) {
      try {
        await fetch('/api/watch-later', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ videoId })
        })
      } catch (error) {
        console.error('Error removing from watch later:', error)
      }
    },

    async deleteVideo(videoId) {
      try {
        const response = await fetch('/api/delete-video', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: videoId })
        })
        
        if (response.ok) {
          // Get updated video info and refresh the view
          const container = document.getElementById('video-player-container')
          let video = await this.getVideoFromApi(videoId)
          
          // If video still exists but is now not downloaded, show thumbnail
          if (video && !video.downloaded) {
            this.setupThumbnailView(container, video)
          } else {
            // If video doesn't exist in local database, create YouTube info
            video = await this.getVideoInfoFromYoutube(videoId)
            if (video) {
              this.setupThumbnailView(container, video)
            }
          }
          
          // Update all action buttons with correct state
          const downloadBtn = document.getElementById('download-video')
          const watchLaterBtn = document.getElementById('watch-later-video')
          const theatreModeBtn = document.getElementById('theatre-mode')
          const shareBtn = document.getElementById('share-video')
          
          if (downloadBtn && watchLaterBtn && theatreModeBtn && shareBtn && video) {
            video.downloaded = false // Ensure downloaded is false after deletion
            this.currentVideo = video // Update stored state
            this.setupActionButtons(downloadBtn, watchLaterBtn, theatreModeBtn, shareBtn, video)
          }
        }
      } catch (error) {
        console.error('Error deleting video:', error)
      }
    },

    formatDate(dateString) {
      try {
        return new Intl.DateTimeFormat(navigator.language, {
          year: 'numeric',
          month: 'numeric',
          day: 'numeric'
        }).format(new Date(dateString))
      } catch (err) {
        return (dateString || '').substring(0, 10)
      }
    }
  },
  '/404': {
    template: document.getElementById('not-found-template'),
    async initialize () {
      document.querySelector('search-videos #search').setAttribute('disabled', 'disabled')
      document.querySelector('search-videos').classList.add('hide')
      window.alert(window.location.pathname + ' not found')
    }
  }
}

handleRoute()
window.addEventListener('popstate', handleRoute)
document.querySelectorAll('[href="/"],[href="/settings"]').forEach(($el) => {
  $el.addEventListener('click', (event) => {
    event.preventDefault()
    const path = new URL($el.href, location.origin).pathname
    history.pushState({}, '', path)
    const popStateEvent = new PopStateEvent('popstate', {})
    dispatchEvent(popStateEvent)
  })
})

function handleRoute () {
  // Clean up previous route if it has a cleanup method
  if (window.currentRoute && routes[window.currentRoute] && routes[window.currentRoute].cleanup) {
    routes[window.currentRoute].cleanup()
  }
  
  let route = location.pathname
  if (route === '/index.html') route = '/'
  
  // Store current route for cleanup later
  window.currentRoute = route
  
  if (routes[route]) {
    document.querySelector('main').replaceChildren(routes[route].template.content.cloneNode(true))
    routes[route].initialize && routes[route].initialize()
  } else {
    document.querySelector('main').replaceChildren(routes['/404'].template.content.cloneNode(true))
    routes['/404'].initialize && routes['/404'].initialize()
  }
}

function handleEmptyState () {
  if (document.querySelectorAll('video-element').length === 0) {
    document.querySelector('empty-state').style.display = ''
  } else {
    document.querySelector('empty-state').style.display = 'none'
  }
}
