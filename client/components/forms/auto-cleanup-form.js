/* global HTMLElement, customElements */
class AutoCleanupForm extends HTMLElement {
  connectedCallback () {
    this.render()
    this.registerEvents()
    this.loadSettings()
  }

  disconnectedCallback () {
    this.unregisterEvents()
  }

  registerEvents () {
    this.querySelector('#auto-cleanup-enabled').addEventListener('change', this.saveSettings.bind(this))
    this.querySelector('#auto-cleanup-days').addEventListener('input', this.saveSettings.bind(this))
    this.querySelector('#auto-cleanup-hours').addEventListener('input', this.saveSettings.bind(this))
    this.querySelector('#run-cleanup-now').addEventListener('click', this.runCleanupNow.bind(this))
  }

  unregisterEvents () {
    this.querySelector('#auto-cleanup-enabled').removeEventListener('change', this.saveSettings.bind(this))
    this.querySelector('#auto-cleanup-days').removeEventListener('input', this.saveSettings.bind(this))
    this.querySelector('#auto-cleanup-hours').removeEventListener('input', this.saveSettings.bind(this))
    this.querySelector('#run-cleanup-now').removeEventListener('click', this.runCleanupNow.bind(this))
  }

  render () {
    this.innerHTML = /* html */`
      <form>
        <div class="flex space-between">
          <div>
            <h4>Auto-cleanup Settings</h4>
            <p>Automatically delete old downloaded videos to manage disk space</p>
          </div>
        </div>
        
        <div class="p-v">
          <label for="auto-cleanup-enabled">
            <input type="checkbox" id="auto-cleanup-enabled"/>
            Enable auto-cleanup
          </label>
        </div>
        
        <div class="p-v">
          <label for="auto-cleanup-days">
            Delete videos older than:
            <input type="number" id="auto-cleanup-days" min="0" max="365" value="30" style="width: 60px; margin: 0 5px;"/>
            days
            <input type="number" id="auto-cleanup-hours" min="0" max="23" value="0" style="width: 50px; margin: 0 5px;"/>
            hours
          </label>
        </div>
        
        
        <div class="p-v">
          <button id="run-cleanup-now" type="button">Run cleanup now</button>
          <small id="cleanup-status" style="margin-left: 10px;"></small>
        </div>
        
        <div><small id="cleanup-info"></small></div>
      </form>
    `
  }

  async loadSettings () {
    try {
      const response = await fetch('/api/auto-cleanup-settings')
      if (response.ok) {
        const settings = await response.json()
        this.querySelector('#auto-cleanup-enabled').checked = settings.enabled || false
        this.querySelector('#auto-cleanup-days').value = settings.days || 30
        this.querySelector('#auto-cleanup-hours').value = settings.hours || 0
        this.updateCleanupInfo()
      }
    } catch (error) {
      console.error('Failed to load auto-cleanup settings:', error)
    }
  }

  async saveSettings () {
    const settings = {
      enabled: this.querySelector('#auto-cleanup-enabled').checked,
      days: parseInt(this.querySelector('#auto-cleanup-days').value),
      hours: parseInt(this.querySelector('#auto-cleanup-hours').value)
    }

    try {
      const response = await fetch('/api/auto-cleanup-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings)
      })
      
      if (response.ok) {
        this.updateCleanupInfo()
      }
    } catch (error) {
      console.error('Failed to save auto-cleanup settings:', error)
    }
  }

  async runCleanupNow (event) {
    event.preventDefault()
    
    const settings = {
      enabled: this.querySelector('#auto-cleanup-enabled').checked,
      days: parseInt(this.querySelector('#auto-cleanup-days').value),
      hours: parseInt(this.querySelector('#auto-cleanup-hours').value)
    }

    const statusEl = this.querySelector('#cleanup-status')
    statusEl.textContent = 'Running cleanup...'
    
    try {
      const response = await fetch('/api/run-auto-cleanup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings)
      })
      
      if (response.ok) {
        const result = await response.json()
        statusEl.textContent = `Cleanup complete: ${result.deletedCount} videos deleted, ${result.freedSpace} freed`
        this.updateCleanupInfo()
      } else {
        statusEl.textContent = 'Cleanup failed'
      }
    } catch (error) {
      console.error('Failed to run cleanup:', error)
      statusEl.textContent = 'Cleanup failed'
    }
  }

  async updateCleanupInfo () {
    const days = parseInt(this.querySelector('#auto-cleanup-days').value)
    const hours = parseInt(this.querySelector('#auto-cleanup-hours').value)
    
    try {
      const response = await fetch(`/api/auto-cleanup-preview?days=${days}&hours=${hours}`)
      if (response.ok) {
        const preview = await response.json()
        const infoEl = this.querySelector('#cleanup-info')
        infoEl.innerHTML = `
          <strong>Preview:</strong> ${preview.videoCount} videos would be deleted (${preview.totalSize} disk space)
        `
      }
    } catch (error) {
      console.error('Failed to get cleanup preview:', error)
    }
  }
}

customElements.define('auto-cleanup-form', AutoCleanupForm)