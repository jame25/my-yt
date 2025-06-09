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
      this.moveToPiP()
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
            
            // Check if returning from PiP mode
            this.restoreFromPiP(videoId, container)
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

    moveToPiP() {
      const videoContainer = document.getElementById('video-player-container')
      const videoElement = videoContainer?.querySelector('video')
      
      if (videoElement && !videoElement.paused) {
        const pipContainer = document.getElementById('pip-container')
        const pipWrapper = document.getElementById('pip-video-wrapper')
        
        if (pipContainer && pipWrapper) {
          // Store video metadata for PiP
          window.pipVideoData = {
            videoId: this.currentVideo?.id,
            title: this.currentVideo?.title,
            currentTime: videoElement.currentTime,
            src: videoElement.src
          }
          
          // Clone the video element to preserve state
          const clonedVideo = videoElement.cloneNode(true)
          
          // Store the original video's state before moving
          const wasPlaying = !videoElement.paused
          const currentTime = videoElement.currentTime
          
          // Immediately pause the original video to prevent duplicate playback
          videoElement.pause()
          
          // Move video to PiP container
          pipWrapper.innerHTML = ''
          pipWrapper.appendChild(clonedVideo)
          
          // Set up the cloned video to continue seamlessly
          const setupPiPVideo = () => {
            clonedVideo.currentTime = currentTime
            if (wasPlaying) {
              clonedVideo.play().catch(e => console.log('PiP autoplay prevented:', e))
            }
            console.log('Video moved to PiP mode from Watch page')
          }
          
          // If video is already loaded, set it up immediately
          if (clonedVideo.readyState >= 2) {
            setupPiPVideo()
          } else {
            // Wait for video to be ready and then set it up
            clonedVideo.addEventListener('canplay', setupPiPVideo, { once: true })
          }
          
          // Show PiP container
          pipContainer.classList.remove('hidden')
          
          // Set up PiP event handlers
          this.setupPiPControls()
          
          console.log('Video moved to PiP mode')
        }
      }
    },

    setupPiPControls() {
      const pipContainer = document.getElementById('pip-container')
      const closeBtn = document.getElementById('pip-close')
      const returnBtn = document.getElementById('pip-return')
      
      // Remove existing listeners to prevent duplicates
      closeBtn.replaceWith(closeBtn.cloneNode(true))
      returnBtn.replaceWith(returnBtn.cloneNode(true))
      
      // Get fresh references after cloning
      const newCloseBtn = document.getElementById('pip-close')
      const newReturnBtn = document.getElementById('pip-return')
      
      // Close PiP
      newCloseBtn.addEventListener('click', () => {
        this.closePiP()
      })
      
      // Return to full view
      newReturnBtn.addEventListener('click', () => {
        this.returnToFullView()
      })
    },

    closePiP() {
      const pipContainer = document.getElementById('pip-container')
      const pipWrapper = document.getElementById('pip-video-wrapper')
      
      if (pipContainer && pipWrapper) {
        pipWrapper.innerHTML = ''
        pipContainer.classList.add('hidden')
        window.pipVideoData = null
        console.log('PiP closed')
      }
    },

    returnToFullView() {
      if (window.pipVideoData && window.pipVideoData.videoId) {
        if (window.pipVideoData.fromMainUI) {
          // Return to home page and restore video in theatre mode
          history.pushState({}, '', '/')
          const popStateEvent = new PopStateEvent('popstate', {})
          dispatchEvent(popStateEvent)
          
          // Wait for the route to load, then restore the video
          setTimeout(() => {
            restoreVideoInMainUI()
          }, 100)
        } else {
          // Navigate back to watch page with current video
          const url = `/watch?v=${window.pipVideoData.videoId}`
          history.pushState({}, '', url)
          const popStateEvent = new PopStateEvent('popstate', {})
          dispatchEvent(popStateEvent)
        }
      }
    },

    restoreFromPiP(videoId, container) {
      if (window.pipVideoData && window.pipVideoData.videoId === videoId) {
        const pipWrapper = document.getElementById('pip-video-wrapper')
        const pipVideo = pipWrapper?.querySelector('video')
        
        if (pipVideo) {
          // Get the main video element that was just created
          const mainVideo = container.querySelector('video')
          
          if (mainVideo) {
            // Restore the playback position and state
            mainVideo.currentTime = pipVideo.currentTime
            if (!pipVideo.paused) {
              mainVideo.play()
            }
            
            console.log('Video restored from PiP mode')
          }
        }
        
        // Close the PiP window
        this.closePiP()
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

function checkAndMoveToPiP() {
  // Check for playing video in Watch page
  const watchVideoContainer = document.getElementById('video-player-container')
  const watchVideo = watchVideoContainer?.querySelector('video')
  
  if (watchVideo && !watchVideo.paused) {
    // Get current video ID from the current URL
    const currentUrlParams = new URLSearchParams(window.location.search)
    const currentVideoId = currentUrlParams.get('v')
    
    // Get target path and video ID from the new location
    const targetPath = location.pathname
    const targetUrlParams = new URLSearchParams(location.search)
    const targetVideoId = targetUrlParams.get('v')
    
    // Only move to PiP if we're not navigating to the same video or if leaving watch page entirely
    if (targetPath !== '/watch' || targetVideoId !== currentVideoId) {
      if (routes['/watch'] && routes['/watch'].moveToPiP) {
        routes['/watch'].moveToPiP()
        return // Exit early, watch page cleanup will handle the rest
      }
    }
  }
  
  // Check for playing video in main UI (theatre mode)
  const playingVideoElement = document.querySelector('video-element.big video')
  
  if (playingVideoElement && !playingVideoElement.paused) {
    // Get video metadata from the video-element component
    const videoElementComponent = playingVideoElement.closest('video-element')
    const videoData = videoElementComponent ? JSON.parse(videoElementComponent.dataset.data || '{}') : {}
    
    moveToPiPFromMainUI(playingVideoElement, videoData)
  }
}

function moveToPiPFromMainUI(videoElement, videoData) {
  const pipContainer = document.getElementById('pip-container')
  const pipWrapper = document.getElementById('pip-video-wrapper')
  
  if (pipContainer && pipWrapper) {
    // Store video metadata for PiP
    window.pipVideoData = {
      videoId: videoData.id,
      title: videoData.title,
      currentTime: videoElement.currentTime,
      src: videoElement.src,
      fromMainUI: true
    }
    
    // Clone the video element to preserve state
    const clonedVideo = videoElement.cloneNode(true)
    
    // Store the original video's state before moving
    const wasPlaying = !videoElement.paused
    const currentTime = videoElement.currentTime
    
    // Move video to PiP container
    pipWrapper.innerHTML = ''
    pipWrapper.appendChild(clonedVideo)
    
    // Set up the cloned video to continue seamlessly
    const setupPiPVideo = () => {
      clonedVideo.currentTime = currentTime
      if (wasPlaying) {
        clonedVideo.play().catch(e => console.log('PiP autoplay prevented:', e))
      }
    }
    
    // If video is already loaded, set it up immediately
    if (clonedVideo.readyState >= 2) {
      setupPiPVideo()
    } else {
      // Wait for video to be ready and then set it up
      clonedVideo.addEventListener('canplay', setupPiPVideo, { once: true })
    }
    
    // Show PiP container
    pipContainer.classList.remove('hidden')
    
    // Set up global PiP controls (they're already set up, but make sure they work)
    console.log('Video moved to PiP mode from main UI')
    
    // Remove big class to exit theatre mode (but don't pause the original video)
    const videoElementComponent = videoElement.closest('video-element')
    if (videoElementComponent) {
      videoElementComponent.classList.remove('big')
    }
  }
}

function restoreVideoInMainUI() {
  if (window.pipVideoData && window.pipVideoData.fromMainUI) {
    const pipWrapper = document.getElementById('pip-video-wrapper')
    const pipVideo = pipWrapper?.querySelector('video')
    
    if (pipVideo && window.pipVideoData.videoId) {
      console.log('Attempting to restore video:', window.pipVideoData.videoId)
      
      // Find the video element with matching ID
      const targetVideoElement = document.querySelector(`video-element[data-video-id="${window.pipVideoData.videoId}"]`)
      
      if (targetVideoElement) {
        console.log('Found target video element')
        
        // Get the video element and restore playback
        let videoElement = targetVideoElement.querySelector('video')
        
        if (videoElement) {
          console.log('Video element exists, restoring playback')
          // Restore playback position and state
          videoElement.currentTime = pipVideo.currentTime
          if (!pipVideo.paused) {
            videoElement.play()
          }
          
          // Re-enter theatre mode
          targetVideoElement.classList.add('big')
          
          console.log('Video restored to main UI theatre mode')
          closePiPAfterRestore()
        } else {
          console.log('Video element does not exist, triggering watch button')
          // If video element doesn't exist, trigger watch action to create it
          const watchBtn = targetVideoElement.querySelector('.play.video-placeholder')
          if (watchBtn) {
            watchBtn.click()
            
            // Wait for video element to be created, then restore
            setTimeout(() => {
              const newVideoElement = targetVideoElement.querySelector('video')
              if (newVideoElement) {
                console.log('New video element created, restoring')
                newVideoElement.currentTime = pipVideo.currentTime
                if (!pipVideo.paused) {
                  newVideoElement.play()
                }
                targetVideoElement.classList.add('big')
                closePiPAfterRestore()
              } else {
                console.log('Failed to create video element')
              }
            }, 100)
          } else {
            console.log('Watch button not found')
          }
        }
      } else {
        console.log('Target video element not found for ID:', window.pipVideoData.videoId)
      }
    }
  }
}

function closePiPAfterRestore() {
  // Close PiP only after successful restoration
  const pipContainer = document.getElementById('pip-container')
  const pipWrapper = document.getElementById('pip-video-wrapper')
  
  if (pipContainer && pipWrapper) {
    pipWrapper.innerHTML = ''
    pipContainer.classList.add('hidden')
    window.pipVideoData = null
    console.log('PiP closed after successful restoration')
  }
}

// Make restoreVideoInMainUI globally accessible
window.restoreVideoInMainUI = restoreVideoInMainUI

function handleRoute () {
  // Check for playing videos and move to PiP before route change
  checkAndMoveToPiP()
  
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
