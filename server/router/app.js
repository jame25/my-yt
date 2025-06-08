import fs from 'fs'
import { URL } from 'url'

export default function apiHandler (req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`)
  console.log(req.method, url.pathname)
  if (url.pathname === '/main.css') { return fileHandler('client/main.css', 'text/css')(req, res) }
  if (url.pathname === '/normalize.css') { return fileHandler('client/normalize.css', 'text/css')(req, res) }
  if (url.pathname === '/main.js') { return fileHandler('client/main.js', 'application/javascript')(req, res) }
  if (url.pathname === '/lib/store.js') { return fileHandler('client/lib/store.js', 'application/javascript')(req, res) }
  if (url.pathname === '/lib/router.js') { return fileHandler('client/lib/router.js', 'application/javascript')(req, res) }
  if (url.pathname === '/lib/utils.js') { return fileHandler('client/lib/utils.js', 'application/javascript')(req, res) }
  if (url.pathname === '/components/video-element.js') { return fileHandler('client/components/video-element.js', 'application/javascript')(req, res) }
  if (url.pathname === '/components/forms/add-channel-form.js') { return fileHandler('client/components/forms/add-channel-form.js', 'application/javascript')(req, res) }
  if (url.pathname === '/components/forms/import-channels-form.js') { return fileHandler('client/components/forms/import-channels-form.js', 'application/javascript')(req, res) }
  if (url.pathname === '/components/forms/manage-channels-form.js') { return fileHandler('client/components/forms/manage-channels-form.js', 'application/javascript')(req, res) }
  if (url.pathname === '/components/forms/video-quality-form.js') { return fileHandler('client/components/forms/video-quality-form.js', 'application/javascript')(req, res) }
  if (url.pathname === '/components/forms/manage-disk-space-form.js') { return fileHandler('client/components/forms/manage-disk-space-form.js', 'application/javascript')(req, res) }
  if (url.pathname === '/components/forms/transcode-videos-form.js') { return fileHandler('client/components/forms/transcode-videos-form.js', 'application/javascript')(req, res) }
  if (url.pathname === '/components/forms/excluded-terms-form.js') { return fileHandler('client/components/forms/excluded-terms-form.js', 'application/javascript')(req, res) }
  if (url.pathname === '/components/forms/auto-cleanup-form.js') { return fileHandler('client/components/forms/auto-cleanup-form.js', 'application/javascript')(req, res) }
  if (url.pathname === '/components/videos-container.js') { return fileHandler('client/components/videos-container.js', 'application/javascript')(req, res) }
  if (url.pathname === '/components/sse-connection.js') { return fileHandler('client/components/sse-connection.js', 'application/javascript')(req, res) }
  if (url.pathname === '/components/search-videos.js') { return fileHandler('client/components/search-videos.js', 'application/javascript')(req, res) }
  if (url.pathname === '/components/channels-list.js') { return fileHandler('client/components/channels-list.js', 'application/javascript')(req, res) }
  if (url.pathname === '/components/empty-state.js') { return fileHandler('client/components/empty-state.js', 'application/javascript')(req, res) }
  if (url.pathname === '/manifest.json') { return fileHandler('client/manifest.json', 'text/json')(req, res) }
  if (url.pathname === '/icon.png') { return fileHandler('client/icon.png', 'image/png')(req, res) }
  if (url.pathname === '/favicon.ico') { return fileHandler('client/favicon.ico', 'image/x-icon')(req, res) }
  if (url.pathname === '/favicon.svg') { return fileHandler('client/favicon.svg', 'image/svg+xml')(req, res) }
  if (url.pathname === '/apple-touch-icon.png') { return fileHandler('client/apple-touch-icon.png', 'image/png')(req, res) }

  // Handle embed routes
  if (url.pathname.startsWith('/embed/')) {
    return embedHandler(req, res)
  }

  return fileHandler('client/index.html', 'text/html')(req, res)
}

function embedHandler (req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`)
  const videoId = url.pathname.replace('/embed/', '')
  const autoplay = url.searchParams.get('autoplay') === '1'
  
  const embedHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Video Player</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background: #000; overflow: hidden; }
    video { width: 100vw; height: 100vh; object-fit: contain; }
    .error { 
      color: white; 
      font-family: Arial, sans-serif; 
      text-align: center; 
      padding: 50px; 
      font-size: 18px; 
    }
  </style>
</head>
<body>
  <video id="video" controls ${autoplay ? 'autoplay' : ''} playsinline>
    <source src="/api/videos/${videoId}.mp4" type="video/mp4" />
    <source src="/api/videos/${videoId}.webm" type="video/webm" />
    <p class="error">Your browser does not support the video tag.</p>
  </video>
  
  <script>
    const video = document.getElementById('video');
    
    video.addEventListener('error', function() {
      document.body.innerHTML = '<div class="error">Video not available or still downloading.</div>';
    });
    
    // Handle autoplay policy restrictions
    if (${autoplay}) {
      const playPromise = video.play();
      if (playPromise !== undefined) {
        playPromise.catch(error => {
          console.log('Autoplay prevented:', error);
          // Show play button or handle autoplay failure
        });
      }
    }
  </script>
</body>
</html>`

  res.writeHead(200, { 
    'Content-Type': 'text/html',
    'X-Frame-Options': 'ALLOWALL',
    'Access-Control-Allow-Origin': '*'
  })
  res.end(embedHtml)
}

function fileHandler (filePath, contentType) {
  return (req, res) => {
    const headers = { 'Content-Type': contentType }
    
    // Add cache-busting headers for icon files to ensure they update
    if (filePath.includes('icon.png') || filePath.includes('favicon.ico')) {
      headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
      headers['Pragma'] = 'no-cache'
      headers['Expires'] = '0'
    }
    
    res.writeHead(200, headers)
    
    // For images, read as buffer, for text files as utf8
    if (contentType.startsWith('image/')) {
      res.end(fs.readFileSync(filePath))
    } else {
      res.end(fs.readFileSync(filePath, 'utf8'))
    }
  }
}
