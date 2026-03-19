const toggleBtn = document.getElementById('toggle-input-btn');
const inputArea = document.getElementById('playlist-input-area');
const saveBtn = document.getElementById('save-playlist-btn');
const urlInput = document.getElementById('spotify-url');
const errorText = document.getElementById('input-error');
const iframe = document.getElementById('spotify-iframe');

// 1. Toggle Input Menu
toggleBtn.addEventListener('click', () => {
    inputArea.classList.toggle('hidden');
    if (!inputArea.classList.contains('hidden')) {
        urlInput.focus();
    }
});

// 2. Intelligent Regex Parser to get Spotify AND Youtube IDs
function extractMediaPath(input) {
    // Spotify checks
    if (input.includes("spotify.com")) {
        const match = input.match(/(playlist|album|track|show|episode)\/([a-zA-Z0-9]+)/);
        if (match) return { type: 'spotify', path: `${match[1]}/${match[2]}` };
    } else if (input.includes("<iframe") && input.includes("spotify")) {
        const srcMatch = input.match(/src="[^"]*embed\/([^?"]+)/);
        if (srcMatch) return { type: 'spotify', path: srcMatch[1] };
    }
    // YouTube checks
    else if (input.includes("youtube.com") || input.includes("youtu.be")) {
        const ytMatch = input.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/);
        if (ytMatch) return { type: 'youtube', path: ytMatch[1] };
    }
    // Generic Spotify ID Fallback Check 
    else {
        const cleaned = input.trim();
        if (/^[a-zA-Z0-9]{22}$/.test(cleaned)) {
            return { type: 'spotify', path: `playlist/${cleaned}` };
        }
    }
    return null;
}

// 3. Iframe State Management
function updateIframe(type, path) {
    if (type === 'spotify') {
        iframe.classList.remove('youtube-mode');
        iframe.src = `https://open.spotify.com/embed/${path}?utm_source=generator&theme=0`;
    } else if (type === 'youtube') {
        // We set the "youtube-mode" class which compacts the iframe to an audio-focused height visually
        iframe.classList.add('youtube-mode');
        iframe.src = `https://www.youtube.com/embed/${path}`;
    }
}

// 4. Hydrate state on page load from Cache
window.addEventListener('load', () => {
    const savedType = localStorage.getItem('custom_media_type');
    const savedPath = localStorage.getItem('custom_media_path');
    
    if (savedType && savedPath) {
        updateIframe(savedType, savedPath);
    }
});

// 5. Save behavior
saveBtn.addEventListener('click', () => {
    const inputVal = urlInput.value;
    const media = extractMediaPath(inputVal);
    
    if (media) {
        errorText.classList.add('hidden');
        localStorage.setItem('custom_media_type', media.type);
        localStorage.setItem('custom_media_path', media.path);
        
        updateIframe(media.type, media.path);
        
        urlInput.value = ''; 
        inputArea.classList.add('hidden'); 
    } else {
        errorText.classList.remove('hidden');
        urlInput.style.transform = 'translate(4px, 4px)';
        setTimeout(() => urlInput.style.transform = '', 150);
    }
});

// Allow 'Enter' key to trigger save seamlessly
urlInput.addEventListener('keypress', function (e) {
    if (e.key === 'Enter') saveBtn.click();
});
