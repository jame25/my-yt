export function addToast (text) {
  const $notificationsContainer = document.getElementById('notifications-container')
  if ($notificationsContainer) {
    const $toast = document.createElement('div')
    $toast.classList.add('toast')
    $toast.textContent = text
    $notificationsContainer.appendChild($toast)
    setTimeout(() => {
      $toast.remove()
    }, 5000)
  }
}

export function applyShowThumbnails (showThumbnails) {
  if (showThumbnails) {
    document.body.classList.remove('hide-thumbnails')
  } else {
    document.body.classList.add('hide-thumbnails')
  }
  const $showThumbnailsCheckbox = document.getElementById('show-thumbnails')
  if ($showThumbnailsCheckbox) $showThumbnailsCheckbox.checked = showThumbnails
}

export function applyShowBigPlayer (showBigPlayer) {
  if (showBigPlayer) {
    document.body.classList.add('show-big-player')
  } else {
    document.body.classList.remove('show-big-player')
  }
  const $showBigPlayerCheckbox = document.getElementById('show-big-player')
  if ($showBigPlayerCheckbox) $showBigPlayerCheckbox.checked = showBigPlayer
}

export function applyTheatreMode (theatreMode) {
  if (theatreMode) {
    document.body.classList.add('theatre-mode')
  } else {
    document.body.classList.remove('theatre-mode')
  }
  const $theatreModeCheckbox = document.getElementById('theatre-mode')
  if ($theatreModeCheckbox) $theatreModeCheckbox.checked = theatreMode
}

export function addClickListener ($el, handler) {
  if (!$el) return
  $el.addEventListener('click', handler)
  $el.addEventListener('keydown', (event) => event.key === 'Enter' && handler(event))
}

export function removeClickListener ($el, handler) {
  if (!$el) return
  $el.removeEventListener('click', handler)
  $el.removeEventListener('keydown', (event) => event.key === 'Enter' && handler(event))
}
