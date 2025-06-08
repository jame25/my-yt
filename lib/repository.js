import fs from 'fs'

export default class Repository {
  constructor (basePath = './data') {
    this.channels = []
    this.videos = []
    this.basePath = basePath
    this.paths = {
      videos: `${this.basePath}/videos.json`,
      channels: `${this.basePath}/channels.json`,
      settings: `${this.basePath}/settings.json`
    }

    fs.mkdirSync(`${this.basePath}/videos`, { recursive: true })
    if (!fs.existsSync(this.paths.videos)) {
      fs.writeFileSync(this.paths.videos, '[]')
    }
    if (!fs.existsSync(this.paths.channels)) {
      fs.writeFileSync(this.paths.channels, '[]')
    }
    if (!fs.existsSync(this.paths.settings)) {
      fs.writeFileSync(this.paths.settings, JSON.stringify({
        videoQuality: 720,
        transcodeVideos: true,
        excludedTerms: []
      }, null, 2))
    }

    try {
      this.videos = JSON.parse(fs.readFileSync(this.paths.videos))
      this.channels = JSON.parse(fs.readFileSync(this.paths.channels))
      this.settings = JSON.parse(fs.readFileSync(this.paths.settings))
    } catch (err) {
      console.error(err)
    }
    if (this.settings.transcodeVideos === undefined) { this.setTranscodeVideosSetting(true) }
    if (this.settings.excludedTerms === undefined) {
      this.settings.excludedTerms = []
      this.saveSettings()
    }

    fs.readdirSync(`${this.basePath}/videos`).forEach(file => {
      const format = file.substring(file.lastIndexOf('.') + 1)
      if (!['mp4', 'webm'].includes(format)) return
      const videoId = file.replace(/\.(webm|mp4)$/, '')
      const location = `${this.basePath}/videos/${file}`
      this.updateVideo(videoId, { downloaded: true, location, format })
    })
    this.saveVideos()
  }

  getChannels () { return this.channels }
  channelExists (name) {
    return !!this.channels.find(c => c.name === name)
  }

  getChannelDisplayName (channelId) {
    const channel = this.channels.find(c => c.name === channelId)
    return channel ? (channel.displayName || channel.name) : channelId
  }

  addChannel (name, displayName = null) {
    this.channels.push({ 
      name, 
      displayName: displayName || name 
    })
    this.saveChannels()
  }

  deleteChannel (name) {
    this.channels.splice(this.channels.findIndex(c => c.name === name), 1)
    this.saveChannels()
  }

  saveChannels () {
    fs.writeFileSync(this.paths.channels, JSON.stringify(this.channels, null, 2))
  }

  saveSettings () {
    fs.writeFileSync(this.paths.settings, JSON.stringify(this.settings, null, 2))
  }

  getAllVideos () {
    return this.videos
  }

  filterByExcludedTerms (v, excludedTerms = this.getExcludedTerms()) {
    if (v.summary) return true
    if (v.downloaded) return true
    return !excludedTerms.some(term => v.title?.toLowerCase().includes(term.toLowerCase()) || v.description?.toLowerCase().includes(term.toLowerCase()))
  }

  getVideos (query = {}) {
    const filterKeys = Object.keys(query).filter(k => k !== 'filter')

    let videos = this.videos
      .filter(v => query.excluded === 'true' ? !this.filterByExcludedTerms(v) : this.filterByExcludedTerms(v))
    console.log('filtering by excluded', query.excluded === 'true', videos.length)

    if (query.filter) {
      const searchTerm = query.filter.toLowerCase()
      if (searchTerm.startsWith('@')) {
        videos = videos.filter(v => {
          return v.channelName.toLowerCase().includes(searchTerm.substring(1))
        })
      } else {
        videos = videos.filter(v => {
          return v.channelName?.toLowerCase().includes(searchTerm) ||
          v.title?.toLowerCase().includes(searchTerm) ||
          v.description?.toLowerCase().includes(searchTerm)
        })
      }
      console.log('filtering by filter', searchTerm, videos.length)
    }

    if (query.downloaded === 'true') {
      videos = videos.filter(v => v.downloaded)
      console.log('filtering by downloaded', videos.length)
    }
    if (query.ignored === 'true') {
      videos = videos.filter(v => v.ignored)
      console.log('filtering by ignored', videos.length)
    }
    if (query.summarized === 'true') {
      videos = videos.filter(v => v.summary)
      console.log('filtering by summarized', videos.length)
    }
    if (query.watchLater === 'true') {
      const watchLaterIds = this.getWatchLaterVideos()
      videos = videos.filter(v => watchLaterIds.includes(v.id))
      console.log('filtering by watch later', videos.length)
    }
    if (filterKeys.length === 0) {
      videos = videos.filter(v => !v.ignored)
      console.log('filtering by not ignored', videos.length)
    }

    videos.sort((a, b) => +new Date(b.publishedAt) - +new Date(a.publishedAt))

    videos = videos.filter((_, i) => i < 100)

    // Add watch later status to each video
    const watchLaterIds = this.getWatchLaterVideos()
    videos = videos.map(video => ({
      ...video,
      watchLater: watchLaterIds.includes(video.id)
    }))

    return videos
  }

  getVideo (id) {
    return this.videos.find(v => v.id === id)
  }

  getChannelVideos (name) {
    return this.videos.filter(v => v.channelName === name)
  }

  upsertVideos (videos) {
    (Array.isArray(videos) ? videos : [videos])
      .forEach(v => {
        const index = this.videos.findIndex(video => video.id === v.id)
        if (index !== -1) {
          this.videos[index] = Object.assign(this.videos[index], v)
        } else {
          this.videos.push(v)
        }
      })
    this.saveVideos()
  }

  updateVideo (id, update) {
    const index = this.videos.findIndex(v => v.id === id)
    if (index !== -1) {
      Object.assign(this.videos[index], update)
      this.saveVideos()
      return this.videos[index]
    }
  }

  deleteVideo (id) {
    this.videos = this.videos.map(v => {
      if (v.id === id) {
        return Object.assign(v, { downloaded: false })
      }
      return v
    })
    this.saveVideos()

    const files = fs.readdirSync(`${this.basePath}/videos`)
    files.forEach(file => {
      if (file.startsWith(id)) {
        fs.unlink(`${this.basePath}/videos/${file}`, err => {
          if (err) return console.error('failed to delete file', file)
          console.log('deleted video file', file)
        })
      }
    })
  }

  saveVideos () {
    fs.writeFileSync(this.paths.videos, JSON.stringify(this.videos, null, 2))
  }

  toggleIgnoreVideo (id) {
    const index = this.videos.findIndex(v => v.id === id)
    let ignored = false
    if (index !== -1) {
      ignored = this.videos[index].ignored = !this.videos[index].ignored
    } else {
      console.log('cannot set video ignored, video does not exist', id)
    }
    this.saveVideos()
    return ignored
  }

  setVideoTranscript (id, transcript = '') {
    return this.updateVideo(id, { transcript })
  }

  setVideoSummary (id, summary = '') {
    return this.updateVideo(id, { summary })
  }

  setVideoDownloaded (id, downloaded = true) {
    return this.updateVideo(id, { downloaded })
  }

  patchVideo (video) {
    if (this.getVideo(video.id)) return video
    return Object.assign(video, { addedAt: Date.now() })
  }

  getVideoQualitySetting () {
    return this.settings.videoQuality
  }

  setVideoQualitySetting (videoQuality) {
    if ([360, 480, 720, 1080, 1440, 2160].includes(videoQuality)) {
      this.settings.videoQuality = videoQuality
      this.saveSettings()
    } else {
      console.log('Invalid video quality', videoQuality)
    }
    return this.settings.videoQuality
  }

  getTranscodeVideosSetting () {
    return this.settings.transcodeVideos
  }

  setTranscodeVideosSetting (value) {
    this.settings.transcodeVideos = !!value
    this.saveSettings()
    return this.settings.transcodeVideos
  }

  getExcludedTerms () {
    return this.settings.excludedTerms || []
  }

  addExcludedTerm (term = '') {
    if (!term) return
    term = term.trim()
    const excludedTerms = this.getExcludedTerms()
    if (!excludedTerms.includes(term) && term) {
      excludedTerms.push(term)
      this.settings.excludedTerms = excludedTerms
      this.saveSettings()
    }
  }

  removeExcludedTerm (term) {
    const excludedTerms = this.getExcludedTerms()
    const index = excludedTerms.indexOf(term)
    if (index >= 0) {
      excludedTerms.splice(index, 1)
      this.settings.excludedTerms = excludedTerms
      this.saveSettings()
    }
  }

  getAutoCleanupSettings () {
    return this.settings.autoCleanup || {
      enabled: false,
      days: 30,
      hours: 0
    }
  }

  setAutoCleanupSettings (settings) {
    this.settings.autoCleanup = {
      enabled: !!settings.enabled,
      days: Math.max(0, Math.min(365, parseInt(settings.days) || 30)),
      hours: Math.max(0, Math.min(23, parseInt(settings.hours) || 0))
    }
    this.saveSettings()
    return this.settings.autoCleanup
  }

  getWatchLaterVideos () {
    return this.settings.watchLater || []
  }

  addToWatchLater (videoId) {
    if (!this.settings.watchLater) {
      this.settings.watchLater = []
    }
    if (!this.settings.watchLater.includes(videoId)) {
      this.settings.watchLater.push(videoId)
      this.saveSettings()
      return true
    }
    return false
  }

  removeFromWatchLater (videoId) {
    if (!this.settings.watchLater) {
      this.settings.watchLater = []
    }
    const index = this.settings.watchLater.indexOf(videoId)
    if (index > -1) {
      this.settings.watchLater.splice(index, 1)
      this.saveSettings()
      return true
    }
    return false
  }

  isInWatchLater (videoId) {
    return (this.settings.watchLater || []).includes(videoId)
  }
}
