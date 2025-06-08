/* global HTMLElement, customElements, alert */
class ImportChannelsForm extends HTMLElement {
  connectedCallback () {
    this.render()
  }

  disconnectedCallback () {
    this.unregisterEvents()
  }

  registerEvents () {
    this.querySelector('form').addEventListener('submit', this.importChannelsHandler.bind(this))
    this.querySelector('#csv-file').addEventListener('change', this.handleFileChange.bind(this))
  }

  unregisterEvents () {
    this.querySelector('form').removeEventListener('submit', this.importChannelsHandler.bind(this))
    this.querySelector('#csv-file').removeEventListener('change', this.handleFileChange.bind(this))
  }

  render () {
    this.innerHTML = /* html */`
      <form id="import-channels-form">
        <div class="flex space-between">
          <label for="csv-file">Import YouTube subscriptions from CSV</label>
          <input type="file" id="csv-file" accept=".csv" required>
          <button type="submit" disabled>Import Channels<span class="loader"></span></button>
        </div>
        <div><small>Expected format: Channel Id,Channel Url,Channel Title</small></div>
        <div class="status"></div>
      </form>
    `

    this.registerEvents()
  }

  handleFileChange (event) {
    const file = event.target.files[0]
    const submitButton = this.querySelector('button[type="submit"]')
    
    if (file && file.type === 'text/csv') {
      submitButton.disabled = false
    } else {
      submitButton.disabled = true
    }
  }

  async importChannelsHandler (event) {
    event.preventDefault()

    const form = event.target
    const fileInput = form.querySelector('#csv-file')
    const loader = form.querySelector('.loader')
    const status = form.querySelector('.status')
    const submitButton = form.querySelector('button[type="submit"]')

    const file = fileInput.files[0]
    if (!file) return alert('Please select a CSV file')

    freezeForm()

    try {
      const csvText = await this.readFileAsText(file)
      const channels = this.parseCSV(csvText)
      
      if (channels.length === 0) {
        throw new Error('No valid channels found in CSV file')
      }

      status.innerText = `Importing ${channels.length} channels...`

      const response = await fetch('/api/channels/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channels })
      })

      const result = await response.text()
      
      if (response.ok) {
        form.reset()
        status.innerText = result
        // Refresh channel display names cache
        if (window.refreshChannelDisplayNames) {
          window.refreshChannelDisplayNames()
        }
      } else {
        throw new Error(result)
      }
    } catch (error) {
      console.error('Error importing channels:', error)
      status.innerText = `Error: ${error.message}`
    } finally {
      unfreezeForm()
    }

    function freezeForm () {
      fileInput.disabled = true
      submitButton.disabled = true
      loader.classList.add('show')
    }
    
    function unfreezeForm () {
      fileInput.disabled = false
      submitButton.disabled = false
      loader.classList.remove('show')
    }
  }

  readFileAsText (file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result)
      reader.onerror = () => reject(reader.error)
      reader.readAsText(file)
    })
  }

  parseCSV (csvText) {
    const lines = csvText.trim().split(/\r?\n/)
    const channels = []


    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim()
      if (!line) continue

      // Skip header line if it contains "Channel Id" or similar
      if (line.toLowerCase().includes('channel id')) {
        continue
      }

      // Handle CSV parsing with potential quoted fields
      const parts = this.parseCSVLine(line)
      
      if (parts.length >= 3) {
        const channelId = parts[0].trim()
        const channelUrl = parts[1].trim()
        const channelTitle = parts[2].trim()

        // Extract channel name from URL or use title
        let channelName = null
        
        // First priority: Try to extract from URL like http://www.youtube.com/channel/UC-qTih01HkZdIhvw119yMwQ
        if (channelUrl.includes('/channel/')) {
          const urlParts = channelUrl.split('/channel/')
          if (urlParts[1]) {
            // Remove any trailing parameters or slashes
            channelName = urlParts[1].split('?')[0].split('/')[0]
          }
        }
        // Second priority: Try to extract from URL like http://www.youtube.com/@channelname  
        else if (channelUrl.includes('/@')) {
          const urlParts = channelUrl.split('/@')
          if (urlParts[1]) {
            // Remove any trailing parameters or slashes
            channelName = urlParts[1].split('?')[0].split('/')[0]
          }
        }
        // Third priority: Try to extract from URL like http://www.youtube.com/c/channelname
        else if (channelUrl.includes('/c/')) {
          const urlParts = channelUrl.split('/c/')
          if (urlParts[1]) {
            channelName = urlParts[1].split('?')[0].split('/')[0]
          }
        }
        // Fourth priority: Try to extract from URL like http://www.youtube.com/user/username
        else if (channelUrl.includes('/user/')) {
          const urlParts = channelUrl.split('/user/')
          if (urlParts[1]) {
            channelName = urlParts[1].split('?')[0].split('/')[0]
          }
        }
        
        // Fallback: Use channel ID if available and starts with UC
        if (!channelName && channelId && channelId.startsWith('UC')) {
          channelName = channelId
        }
        
        // Final fallback: Use sanitized channel title
        if (!channelName && channelTitle) {
          // Remove problematic characters and spaces
          channelName = channelTitle.replace(/[^a-zA-Z0-9\-_]/g, '').substring(0, 50)
          if (channelName.length < 3) {
            channelName = null // Too short to be useful
          }
        }

        if (channelName) {
          const channel = {
            name: channelName.replace('@', ''),
            title: channelTitle,
            id: channelId,
            url: channelUrl
          }
          channels.push(channel)
        }
      }
    }
    return channels
  }

  parseCSVLine(line) {
    const result = []
    let current = ''
    let inQuotes = false
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i]
      
      if (char === '"') {
        inQuotes = !inQuotes
      } else if (char === ',' && !inQuotes) {
        result.push(current)
        current = ''
      } else {
        current += char
      }
    }
    
    result.push(current)
    return result
  }
}

customElements.define('import-channels-form', ImportChannelsForm)