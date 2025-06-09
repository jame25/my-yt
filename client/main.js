/* global EventSource, MutationObserver */
window.state = {
  downloading: {},
  summarizing: {},
  sseConnected: false
}
let downloadLogTimeoutHandle

window.eventSource = new EventSource('/')
window.eventSource.onopen = () => {
  console.log('[sse] connection opened')
  window.state.sseConnected = true
  if (document.querySelector('sse-connection')) document.querySelector('sse-connection').dataset.connected = true
}
window.eventSource.onerror = (err) => {
  console.log('[sse] connection error', err)
  window.state.sseConnected = false
  if (document.querySelector('sse-connection')) document.querySelector('sse-connection').dataset.connected = false
}
window.eventSource.onmessage = (message) => {
  if (document.querySelector('sse-connection')) document.querySelector('sse-connection').dataset.connected = true
  window.state.sseConnected = true
  if (!message || !message.data) return console.error('skipping empty message')
  try {
    const data = JSON.parse(message.data, {})
    console.log('[sse] message', data)

    if (data.type === 'state' && data.state) {
      Object.assign(window.state, data.state)
      Object.keys(data.state.summarizing || {}).forEach((id) => {
        const videoElement = document.querySelector(`[data-id="${id}"]`)
        if (videoElement) videoElement.dataset.summarizing = 'true'
      })
      Object.keys(data.state.downloading || {}).forEach((id) => {
        const videoElement = document.querySelector(`[data-id="${id}"]`)
        if (videoElement) videoElement.dataset.downloading = 'true'
      })
      return
    }
    if (data.type === 'download-log-line' && data.line) {
      const $state = document.querySelector('.state')
      if (!$state) { return console.warn('missing $state') }
      if (downloadLogTimeoutHandle) clearTimeout(downloadLogTimeoutHandle)

      $state.classList.add('updated')
      downloadLogTimeoutHandle = setTimeout(() => $state.classList.remove('updated'), 10000)

      // Extract download progress percentage
      const progressMatch = data.line.match(/\[download\]\s+(\d+(?:\.\d+)?)%/)
      if (progressMatch) {
        const percentage = progressMatch[1]
        const $summary = $state.querySelector('summary')
        if ($summary) {
          $summary.textContent = `state & logs (${percentage}%)`
        }
      }

      // Check for download completion
      if (data.line.includes('[download] 100%') || data.line.includes('has already been downloaded')) {
        const $summary = $state.querySelector('summary')
        if ($summary) {
          $summary.innerHTML = 'state & logs <span class="count"></span><span class="indicator"></span>'
        }
      }

      const $downloadLogLines = $state.querySelector(' .lines')
      $downloadLogLines.innerText += '\n' + data.line
      $downloadLogLines.scrollTop = $downloadLogLines.scrollHeight
      return
    }
    if (data.type === 'new-videos' && data.videos) {
      const $videosContainer = document.querySelector('videos-container')
      if (!$videosContainer) return
      let videos = JSON.parse($videosContainer.dataset.videos || '[]')
      videos = data.videos.concat(videos)
      $videosContainer.dataset.videos = JSON.stringify(videos)
      return
    }
    if (data.type === 'summary-error' && data.videoId) {
      const $videoElement = document.querySelector(`[data-video-id="${data.videoId}"]`)
      $videoElement && $videoElement.render && $videoElement.render()
      return
    }
    if (data.type === 'summary' && data.videoId && data.summary && data.transcript) {
      ;[...document.querySelectorAll(`[data-video-id="${data.videoId}"]`)].forEach($video => {
        if (!$video.dataset.data) return
        const videoData = JSON.parse($video.dataset.data)
        Object.assign(videoData, { summary: data.summary, transcript: data.transcript })
        $video.dataset.data = JSON.stringify(videoData)
      })
      return
    }
    if (data.type === 'downloaded' && data.videoId && data.downloaded !== undefined) {
      // Reset download progress in state bar when download completes
      if (data.downloaded) {
        const $state = document.querySelector('.state')
        const $summary = $state?.querySelector('summary')
        if ($summary) {
          $summary.innerHTML = 'state & logs <span class="count"></span><span class="indicator"></span>'
        }
      }
      
      // Handle watch page downloads
      if (window.watchPageDownloadHandler) {
        window.watchPageDownloadHandler(data)
      }
      
      ;[...document.querySelectorAll(`[data-video-id="${data.videoId}"]`)].forEach($video => {
        if (!$video.dataset.data) return
        const videoData = JSON.parse($video.dataset.data)
        videoData.downloaded = data.downloaded
        if (data.video) Object.assign(videoData, data.video)
        $video.dataset.data = JSON.stringify(videoData)
        
        // If video is currently streaming, update the source to use the complete file
        if (data.downloaded) {
          const video = $video.querySelector('video')
          if (video) {
            const currentSrc = video.src
            if (currentSrc.includes('/api/stream/')) {
              const newSrc = currentSrc.replace('/api/stream/', '/api/videos/')
              video.src = newSrc
              
              // Remove streaming overlay if it exists
              const overlay = $video.querySelector('.streaming-overlay')
              if (overlay) {
                overlay.innerHTML = '✅ Download complete!'
                overlay.style.backgroundColor = 'rgba(0,150,0,0.8)'
                setTimeout(() => overlay.remove(), 2000)
              }
            }
          }
        }
      })
      return
    }
    if (data.type === 'ignored' && data.videoId && data.ignored !== undefined) {
      ;[...document.querySelectorAll(`[data-video-id="${data.videoId}"]`)].forEach($video => {
        if (!$video.dataset.data) return
        const videoData = JSON.parse($video.dataset.data)
        videoData.ignored = data.ignored
        $video.dataset.data = JSON.stringify(videoData)
      })
      return
    }
    console.warn('unhandled', data)
  } catch (err) {
    console.error('sse parse error', err)
  }
}

const $summary = document.querySelector('dialog#summary')
const $closeSummary = $summary.querySelector('button')
$closeSummary.addEventListener('click', () => $summary.close())
$summary.addEventListener('close', () => {})

observeDialogOpenPreventScroll($summary)

function observeDialogOpenPreventScroll (dialog) {
  new MutationObserver((mutationList, observer) => {
    for (const mutation of mutationList) {
      if (mutation.type === 'attributes' && mutation.attributeName === 'open') {
        document.body.classList[mutation.target.open ? 'add' : 'remove']('dialog-opened')
      }
    }
  }).observe(dialog, { attributes: true, childList: true, subtree: true })
}

const $state = document.querySelector('details.state')
if ($state) {
  new MutationObserver((mutationList, observer) => {
    for (const mutation of mutationList) {
      if (mutation.type === 'attributes' && mutation.attributeName === 'open') $state.classList.remove('updated')
    }
  }).observe($state, { attributes: true, childList: false, subtree: false })
}

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    // Handle main page theatre mode
    if (document.body.classList.contains('theatre-mode')) {
      const playingVideo = document.querySelector('video-element.big video')
      if (playingVideo) {
        playingVideo.pause()
        playingVideo.parentElement.classList.remove('big')
      }
    }
    
    // Handle watch page theatre mode
    const watchDiv = document.getElementById('watch')
    if (watchDiv && watchDiv.classList.contains('theatre-mode')) {
      watchDiv.classList.remove('theatre-mode')
      const theatreModeBtn = document.getElementById('theatre-mode')
      if (theatreModeBtn) {
        theatreModeBtn.textContent = '🎭 Theatre Mode'
        theatreModeBtn.title = 'Enter theatre mode'
      }
    }
  }
})

// Manual refresh functionality
document.addEventListener('DOMContentLoaded', () => {
  const refreshButton = document.getElementById('refresh-videos')
  if (refreshButton) {
    refreshButton.addEventListener('click', async () => {
      refreshButton.disabled = true
      refreshButton.textContent = '⏳'
      refreshButton.title = 'Checking for new videos...'
      
      try {
        const response = await fetch('/api/refresh-videos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        })
        
        if (response.ok) {
          // The SSE connection will handle showing the results
          setTimeout(() => {
            refreshButton.disabled = false
            refreshButton.textContent = '🔄'
            refreshButton.title = 'Check for new videos'
          }, 2000)
        } else {
          throw new Error('Failed to start refresh')
        }
      } catch (error) {
        console.error('Error refreshing videos:', error)
        refreshButton.disabled = false
        refreshButton.textContent = '❌'
        refreshButton.title = 'Error occurred'
        setTimeout(() => {
          refreshButton.textContent = '🔄'
          refreshButton.title = 'Check for new videos'
        }, 3000)
      }
    })
  }
})

// Global PiP Controls Management
function setupGlobalPiPControls() {
  const closeBtn = document.getElementById('pip-close')
  const returnBtn = document.getElementById('pip-return')
  
  if (closeBtn && returnBtn) {
    closeBtn.addEventListener('click', () => {
      const pipContainer = document.getElementById('pip-container')
      const pipWrapper = document.getElementById('pip-video-wrapper')
      
      if (pipContainer && pipWrapper) {
        pipWrapper.innerHTML = ''
        pipContainer.classList.add('hidden')
        window.pipVideoData = null
        console.log('PiP closed globally')
      }
    })
    
    returnBtn.addEventListener('click', () => {
      if (window.pipVideoData && window.pipVideoData.videoId) {
        if (window.pipVideoData.fromMainUI) {
          // Return to home page and restore video in theatre mode
          history.pushState({}, '', '/')
          const popStateEvent = new PopStateEvent('popstate', {})
          dispatchEvent(popStateEvent)
          
          // Wait for the route to load, then restore the video
          setTimeout(() => {
            if (window.restoreVideoInMainUI) {
              window.restoreVideoInMainUI()
            }
          }, 100)
        } else {
          // Navigate back to watch page with current video
          const url = `/watch?v=${window.pipVideoData.videoId}`
          history.pushState({}, '', url)
          const popStateEvent = new PopStateEvent('popstate', {})
          dispatchEvent(popStateEvent)
        }
      }
    })
  }
}

// Initialize global PiP controls when page loads
setupGlobalPiPControls()

// Make PiP window draggable
function makePiPDraggable() {
  const pipContainer = document.getElementById('pip-container')
  let isDragging = false
  let currentX
  let currentY
  let initialX
  let initialY
  let xOffset = 0
  let yOffset = 0

  function dragStart(e) {
    if (e.target.closest('.pip-controls')) return // Don't drag when clicking controls
    
    if (e.type === "touchstart") {
      initialX = e.touches[0].clientX - xOffset
      initialY = e.touches[0].clientY - yOffset
    } else {
      initialX = e.clientX - xOffset
      initialY = e.clientY - yOffset
    }

    if (e.target === pipContainer || e.target.closest('#pip-video-wrapper')) {
      isDragging = true
      pipContainer.style.cursor = 'grabbing'
    }
  }

  function dragEnd(e) {
    initialX = currentX
    initialY = currentY
    isDragging = false
    pipContainer.style.cursor = 'grab'
  }

  function drag(e) {
    if (isDragging) {
      e.preventDefault()
      
      if (e.type === "touchmove") {
        currentX = e.touches[0].clientX - initialX
        currentY = e.touches[0].clientY - initialY
      } else {
        currentX = e.clientX - initialX
        currentY = e.clientY - initialY
      }

      xOffset = currentX
      yOffset = currentY

      // Keep PiP within viewport bounds
      const rect = pipContainer.getBoundingClientRect()
      const maxX = window.innerWidth - rect.width
      const maxY = window.innerHeight - rect.height
      
      xOffset = Math.max(0, Math.min(maxX, xOffset))
      yOffset = Math.max(0, Math.min(maxY, yOffset))

      pipContainer.style.transform = `translate(${xOffset}px, ${yOffset}px)`
    }
  }

  pipContainer.addEventListener("touchstart", dragStart, false)
  pipContainer.addEventListener("touchend", dragEnd, false)
  pipContainer.addEventListener("touchmove", drag, false)
  pipContainer.addEventListener("mousedown", dragStart, false)
  pipContainer.addEventListener("mouseup", dragEnd, false)
  pipContainer.addEventListener("mousemove", drag, false)
  
  pipContainer.style.cursor = 'grab'
}

// Initialize drag functionality
makePiPDraggable()
