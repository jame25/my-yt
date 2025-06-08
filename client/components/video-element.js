/* global HTMLElement, customElements, confirm */
import { addClickListener, removeClickListener, addToast } from '../lib/utils.js'
import Store from '../lib/store.js'
const store = new Store()

let channelDisplayNames = {}

// Fetch channel display names once
async function fetchChannelDisplayNames() {
  try {
    const response = await fetch('/api/channels/display-names')
    channelDisplayNames = await response.json()
  } catch (error) {
    console.error('Failed to fetch channel display names:', error)
  }
}

// Initialize display names
fetchChannelDisplayNames()

// Export function to refresh display names (for when new channels are imported)
window.refreshChannelDisplayNames = fetchChannelDisplayNames

class VideoElement extends HTMLElement {
  constructor () {
    super()
    this.downloadStartedText = '⚡️ Downloading..'
    this.summaryStartedText = '⚡️ Summarizing..'
  }

  connectedCallback () {
    this.video = JSON.parse(this.dataset.data)
    this.render()
  }

  disconnectedCallback () {
    this.unregisterEvents()
  }

  static get observedAttributes () {
    return ['data-data', 'data-summarizing', 'data-downloading']
  }

  attributeChangedCallback (name, _, newValue) {
    if (name === 'data-data') {
      const newVideo = JSON.parse(this.dataset.data)
      
      // Check if we should skip re-rendering to preserve playing video
      if (this.shouldSkipRerender(this.video, newVideo)) {
        // Just update the stored video data without re-rendering
        this.video = newVideo
        return
      }
      
      this.video = newVideo
      this.render()
    }
    if (name === 'data-downloading' && this.querySelector('.action.download')) {
      this.querySelector('.action.download').innerText = this.downloadStartedText
    }
    if (name === 'data-summarizing' && this.querySelector('.action.summarize')) {
      this.querySelector('.action.summarize').innerText = this.summaryStartedText
    }
  }

  render () {
    if (!this.video) return

    // Check if there's a playing video that we should preserve
    const existingVideo = this.querySelector('video')
    const isVideoPlaying = existingVideo && !existingVideo.paused && !existingVideo.ended
    
    // Store video state if playing
    let videoState = null
    if (isVideoPlaying) {
      videoState = {
        currentTime: existingVideo.currentTime,
        playbackRate: existingVideo.playbackRate,
        volume: existingVideo.volume,
        muted: existingVideo.muted
      }
    }

    this.unregisterEvents()

    this.classList.add('video')
    this.dataset.videoId = this.video.id
    this.dataset.date = this.video.publishedAt
    this.dataset.summarized = this.video.summary ? 'true' : 'false'
    this.dataset.downloaded = this.video.downloaded ? 'true' : 'false'
    this.dataset.ignored = this.video.ignored ? 'true' : 'false'

    this.innerHTML = /* html */`
      ${this.video.downloaded
      ? /* html */`
        <div class="video-wrapper">
          <div tabindex="0" class="play video-placeholder" style="background-image: url(${this.video.thumbnail})">
            <div class="play-icon"></div>
            <span class="info-duration">${this.video.duration || 'N/A'}</span>
            <span class="download-indicator">✅</span>
          </div>
        </div>
        `
      : /* html */`
        <div class="video-wrapper">
          <img title="${this.video.title}" loading="lazy" src="${this.video.thumbnail}"/>
          <span class="info-duration">${this.video.duration || 'N/A'}</span>
        </div>
      `}
      <h4 class="title">${this.video.title}</h4>
      <div class="info">
        <span class="channel-name">${channelDisplayNames[this.video.channelName] || this.video.channelName}</span>
        <div class="flex">
          <span>${this.video.viewCount}</span>
          <span>${tryFormatDate(this.video.publishedAt)}</span>
        </div>
      </div>
      <div class="actions flex">
        ${this.video.downloaded
          ? /* html */`<span tabindex="0"  class="action delete" data-video-id="${this.video.id}">🗑️ Delete</span>`
          : /* html */`<span tabindex="0"  class="action download" data-video-id="${this.video.id}">⬇️ Download</span>`}
        ${store.get(store.useTLDWTubeKey)
          /* html */? `<a target="_blank" href="https://tldw.tube/?v=${this.video.id}">📖 tldw.tube</a>`
          : this.video.watchLater
          ? /* html */`<span tabindex="0"  class="action remove-watch-later" data-video-id="${this.video.id}">✅ In Watch Later</span>`
          : /* html */`<span tabindex="0"  class="action add-watch-later" data-video-id="${this.video.id}">⏰ Watch Later</span>`}
        <span tabindex="0" class="action share" data-video-id="${this.video.id}">🔗 Share</span>
      </div>
    `

    if (window.state && window.state.downloading && window.state.downloading[this.video.id]) {
      this.dataset.downloading = 'true'
    }
    if (window.state && window.state.summarizing && window.state.summarizing[this.video.id]) {
      this.dataset.summarizing = 'true'
    }

    this.registerEvents()
    
    // Restore video state if it was playing before re-render
    if (videoState) {
      const newVideo = this.querySelector('video')
      if (newVideo) {
        newVideo.currentTime = videoState.currentTime
        newVideo.playbackRate = videoState.playbackRate
        newVideo.volume = videoState.volume
        newVideo.muted = videoState.muted
        newVideo.play().catch(error => {
          console.log('Could not resume video playback:', error)
        })
      }
    }
  }

  shouldSkipRerender (oldVideo, newVideo) {
    if (!oldVideo || !newVideo) return false
    
    // Check if there's a currently playing video
    const existingVideo = this.querySelector('video')
    const isVideoPlaying = existingVideo && !existingVideo.paused && !existingVideo.ended
    
    if (!isVideoPlaying) return false
    
    // Define critical properties that would require a re-render
    const criticalProps = ['id', 'downloaded', 'title', 'thumbnail']
    
    // Check if any critical properties changed
    for (const prop of criticalProps) {
      if (oldVideo[prop] !== newVideo[prop]) {
        return false // Need to re-render
      }
    }
    
    // If only non-critical properties changed (like addedAt, viewCount, etc.)
    // and video is playing, skip re-render
    return true
  }

  registerEvents () {
    addClickListener(this.querySelector('.action.download'), this.downloadVideoHandler.bind(this))
    addClickListener(this.querySelector('.action.delete'), this.deleteVideoHandler.bind(this))
    addClickListener(this.querySelector('.action.add-watch-later'), this.addWatchLaterHandler.bind(this))
    addClickListener(this.querySelector('.action.remove-watch-later'), this.removeWatchLaterHandler.bind(this))
    addClickListener(this.querySelector('.action.share'), this.shareVideoHandler.bind(this))
    addClickListener(this.querySelector('.channel-name'), this.filterByChannelHandler.bind(this))
    addClickListener(this.querySelector('.play.video-placeholder'), this.watchVideoHandler.bind(this))
    addClickListener(this.querySelector('.video-wrapper img'), this.thumbnailClickHandler.bind(this))
  }

  unregisterEvents () {
    removeClickListener(this.querySelector('.action.download'), this.downloadVideoHandler.bind(this))
    removeClickListener(this.querySelector('.action.delete'), this.deleteVideoHandler.bind(this))
    removeClickListener(this.querySelector('.action.add-watch-later'), this.addWatchLaterHandler.bind(this))
    removeClickListener(this.querySelector('.action.remove-watch-later'), this.removeWatchLaterHandler.bind(this))
    removeClickListener(this.querySelector('.action.share'), this.shareVideoHandler.bind(this))
    removeClickListener(this.querySelector('.channel-name'), this.filterByChannelHandler.bind(this))
    removeClickListener(this.querySelector('.play.video-placeholder'), this.watchVideoHandler.bind(this))
    removeClickListener(this.querySelector('.video-wrapper img'), this.thumbnailClickHandler.bind(this))
    this.querySelector('video') && this.unregisterVideoEvents(this.querySelector('video'))
  }

  watchVideoHandler (event) {
    event.preventDefault()
    
    this.querySelector('.play.video-placeholder').outerHTML = /* html */`
    <div class="video-wrapper">
      <video controls playsinline style="user-select: none; width: 320px; width: -webkit-fill-available;">
        <source src="/api/videos/${this.video.id}.${this.video.format || 'mp4'}" type="video/${this.video.format || 'mp4'}" />
        ${store.get(store.showCaptionsKey)
          ? /* html */`<track default kind="captions" srclang="en" src="/api/captions/${this.video.id}" />`
          : ''}
        <p>
          Your browser does not support the video tag.
          Download the video instead <a href="/api/videos/${this.video.id}" target="_blank">here</a>
        </p>
      </video>
      <div class="video-controls">
        <button class="speed-control active" data-speed="1">1x</button>
        <button class="speed-control" data-speed="1.25">1.25x</button>
        <button class="speed-control" data-speed="1.5">1.5x</button>
        <button class="speed-control" data-speed="2">2x</button>
      </div>
    </div>`

    const video = this.querySelector('video')
    
    // Set up speed controls
    this.setupSpeedControls(video)
    
    // Resume playback from saved position
    this.resumePlayback(video)
    
    video.play()
    this.registerVideoEvents(video)
  }

  downloadVideoHandler (event) {
    event.preventDefault()

    if (this.dataset.downloading === 'true') return
    this.dataset.downloading = 'true'

    const $downloadButton = event.target.classList.contains('.action') ? event.target : this.querySelector('.action.download')
    $downloadButton.innerText = this.downloadStartedText

    addToast('Downloading video...')

    fetch('/api/download-video', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: this.video.id })
    })
      .catch((error) => console.error('Error starting download:', error))
  }

  deleteVideoHandler (event) {
    event.preventDefault()
    if (!confirm('About to delete video files, are you sure?')) return
    fetch('/api/delete-video', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: this.video.id })
    })
      .then(() => {
        this.video.downloaded = false
        this.classList.remove('downloading')
        this.classList.remove('big')
        this.querySelector('video') && this.unregisterVideoEvents(this.querySelector('video'))
        this.render()
      })
      .catch((error) => console.error('Error deleting video:', error))
  }

  summarizeVideoHandler (event) {
    event.preventDefault()

    if (this.dataset.summarizing === 'true') return
    this.dataset.summarizing = 'true'

    event.target.innerText = this.summaryStartedText

    addToast('Summarizing video...')

    fetch('/api/summarize-video', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: this.video.id })
    })
      .catch((error) => console.error('Error starting summary:', error))
  }

  showSummaryHandler (event) {
    event.preventDefault()
    const video = this.video
    if (video) {
      document.querySelector('dialog#summary').showModal()
      document.querySelector('dialog#summary div').innerHTML = /* html */`
      <pre>${video.summary}</pre>
      <details>
        <summary>transcript</summary>
        <pre>${video.transcript}</pre>
      </details>
      `
    }
  }

  toggleIgnoreVideoHandler (event) {
    event.preventDefault()

    fetch('/api/ignore-video', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: this.video.id })
    })
      .then(() => this.remove())
      .catch((error) => {
        console.error('Error ignoring video:', error)
        this.classList.remove('hide')
        this.render()
      })
  }

  async shareVideoHandler (event) {
    event.preventDefault()
    
    const youtubeUrl = `https://www.youtube.com/watch?v=${this.video.id}`
    
    try {
      await navigator.clipboard.writeText(youtubeUrl)
      
      // Show visual feedback
      const button = event.target
      const originalText = button.textContent
      button.textContent = '✅ Copied!'
      
      // Reset button text after 2 seconds
      setTimeout(() => {
        button.textContent = originalText
      }, 2000)
      
    } catch (err) {
      console.error('Failed to copy to clipboard:', err)
      
      // Fallback: show the URL to user
      const button = event.target
      const originalText = button.textContent
      button.textContent = '❌ Copy failed'
      
      // Reset button text after 2 seconds
      setTimeout(() => {
        button.textContent = originalText
      }, 2000)
      
      // Also try to select the URL if possible (fallback method)
      try {
        // Create a temporary textarea with the URL
        const textarea = document.createElement('textarea')
        textarea.value = youtubeUrl
        document.body.appendChild(textarea)
        textarea.select()
        document.execCommand('copy')
        document.body.removeChild(textarea)
        
        button.textContent = '✅ Copied!'
        setTimeout(() => {
          button.textContent = originalText
        }, 2000)
      } catch (fallbackErr) {
        console.error('Fallback copy also failed:', fallbackErr)
      }
    }
  }

  addWatchLaterHandler (event) {
    event.preventDefault()

    addToast('Adding to watch later...')

    fetch('/api/watch-later', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ videoId: this.video.id })
    })
      .then(response => {
        if (response.ok) {
          this.video.watchLater = true
          this.render()
          addToast('Added to watch later!')
        } else {
          throw new Error('Failed to add to watch later')
        }
      })
      .catch((error) => {
        console.error('Error adding to watch later:', error)
        addToast('Failed to add to watch later')
      })
  }

  removeWatchLaterHandler (event) {
    event.preventDefault()

    addToast('Removing from watch later...')

    fetch('/api/watch-later', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ videoId: this.video.id })
    })
      .then(response => {
        if (response.ok) {
          this.video.watchLater = false
          this.render()
          addToast('Removed from watch later!')
        } else {
          throw new Error('Failed to remove from watch later')
        }
      })
      .catch((error) => {
        console.error('Error removing from watch later:', error)
        addToast('Failed to remove from watch later')
      })
  }

  filterByChannelHandler (event) {
    const $searchInput = document.querySelector('#search')
    const displayName = channelDisplayNames[this.video.channelName] || this.video.channelName
    const channel = `@${displayName}`
    $searchInput.value = ($searchInput && $searchInput.value !== channel) ? channel : ''
    $searchInput.dispatchEvent(new Event('input'))
  }

  thumbnailClickHandler (event) {
    event.preventDefault()
    // Do nothing for undownloaded videos
    if (!this.video.downloaded) return
  }


  setupSpeedControls (video) {
    const speedButtons = this.querySelectorAll('.speed-control')
    speedButtons.forEach(button => {
      button.addEventListener('click', (e) => {
        e.stopPropagation()
        const speed = parseFloat(button.dataset.speed)
        video.playbackRate = speed
        
        // Update active button
        speedButtons.forEach(btn => btn.classList.remove('active'))
        button.classList.add('active')
        
        // Save speed preference
        localStorage.setItem('videoPlaybackRate', speed.toString())
      })
    })
    
    // Load saved speed preference
    const savedSpeed = localStorage.getItem('videoPlaybackRate')
    if (savedSpeed) {
      const speed = parseFloat(savedSpeed)
      video.playbackRate = speed
      speedButtons.forEach(btn => {
        btn.classList.remove('active')
        if (parseFloat(btn.dataset.speed) === speed) {
          btn.classList.add('active')
        }
      })
    }
  }

  resumePlayback (video) {
    // Load saved position
    const savedPosition = this.getSavedPosition()
    if (savedPosition && savedPosition > 10) { // Only resume if more than 10 seconds in
      video.addEventListener('loadedmetadata', () => {
        video.currentTime = savedPosition
      }, { once: true })
    }
    
    // Save position every 5 seconds
    this.saveInterval = setInterval(() => {
      if (video.currentTime > 0) {
        this.savePosition(video.currentTime)
      }
    }, 5000)
    
    // Save position when video ends or is paused for a while
    video.addEventListener('ended', () => {
      this.clearSavedPosition()
      if (this.saveInterval) clearInterval(this.saveInterval)
    })
    
    video.addEventListener('pause', () => {
      this.savePosition(video.currentTime)
    })
  }

  getSavedPosition () {
    const key = `video-position-${this.video.id}`
    const saved = localStorage.getItem(key)
    return saved ? parseFloat(saved) : 0
  }

  savePosition (currentTime) {
    const key = `video-position-${this.video.id}`
    localStorage.setItem(key, currentTime.toString())
  }

  clearSavedPosition () {
    const key = `video-position-${this.video.id}`
    localStorage.removeItem(key)
  }


  registerVideoEvents (video) {
    video.addEventListener('play', () => {
      this.classList.add('big')
      setTimeout(this.scrollIntoViewWithOffset.bind(this, document.querySelector('body > header').clientHeight, 'smooth'), 110)
      this.pauseOtherVideos(video)
    })
  }

  unregisterVideoEvents (video) {
    video.removeEventListener('play', this.pauseOtherVideos.bind(this, video))
    // Clean up save interval
    if (this.saveInterval) {
      clearInterval(this.saveInterval)
      this.saveInterval = null
    }
  }

  pauseOtherVideos (video) {
    document.querySelectorAll('video').forEach(v => {
      if (v !== video) {
        v.pause()
        v.parentElement.classList.remove('big')
      }
    })
  }

  scrollIntoViewWithOffset (offset, behavior = 'smooth') {
    const top = this.getBoundingClientRect().top - offset - document.body.getBoundingClientRect().top
    window.scrollTo({ top, behavior })
  }
}

customElements.define('video-element', VideoElement)

function tryFormatDate (date) {
  try {
    return new Intl.DateTimeFormat(navigator.language, {
      year: 'numeric',
      month: 'numeric',
      day: 'numeric'
    }).format(new Date(date))
  } catch (err) {
    return (date || '').substring(0, 10)
  }
}
