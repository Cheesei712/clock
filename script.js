// ============================================================================
// Spotify Web API Configuration (OAuth 2.0 PKCE Flow)
// ============================================================================

// TODO: Replace this immediately with your actual App Client ID.
const clientId = '7963116672a549afb0c979ec1b3f6796';

// Dynamically calculates the callback URL based on deployment context (Local or Github Pages)
// It will look like: http://localhost:5500/ or https://username.github.io/repo/
const redirectUri = window.location.origin + window.location.pathname;
console.log("👉 REDIRECT URI BẠN CẦN ĐIỀN VÀO SPOTIFY DASHBOARD LÀ:", redirectUri);

// References
const authorizeBtn = document.getElementById('spotify-login-btn');
const loginContainer = document.getElementById('spotify-login-container');
const nowPlayingContainer = document.getElementById('spotify-now-playing');
const trackNameEl = document.getElementById('track-name');
const artistNameEl = document.getElementById('artist-name');
const albumArtEl = document.getElementById('album-art');

// ----------------------------------------------------------------------------
// 1. Auth Flow Initialization (Step 1 of PKCE)
// ----------------------------------------------------------------------------
authorizeBtn.addEventListener('click', async () => {
    if (!clientId) {
        alert("CRITICAL: You must edit script.js and paste your actual Spotify Client ID for the app to function!");
        return;
    }

    // We generate a code verifier and code challenge to secure the authorization code
    const codeVerifier = generateRandomString(128);
    const codeChallenge = await generateCodeChallenge(codeVerifier);

    // Save to local storage for the callback retrieval
    localStorage.setItem('spotify_code_verifier', codeVerifier);

    const args = new URLSearchParams({
        response_type: 'code',
        client_id: clientId,
        scope: 'user-read-currently-playing',
        redirect_uri: redirectUri,
        code_challenge_method: 'S256',
        code_challenge: codeChallenge
    });

    // Send the user to the official spotify app login page
    window.location = 'https://accounts.spotify.com/authorize?' + args;
});

// ----------------------------------------------------------------------------
// 2. Cryptographic Code Challenge Utilities 
// ----------------------------------------------------------------------------
function generateRandomString(length) {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < length; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}

async function generateCodeChallenge(codeVerifier) {
    function base64encode(string) {
        return btoa(String.fromCharCode.apply(null, new Uint8Array(string)))
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/, '');
    }
    const encoder = new TextEncoder();
    const data = encoder.encode(codeVerifier);
    const digest = await window.crypto.subtle.digest('SHA-256', data);
    return base64encode(digest);
}

// ----------------------------------------------------------------------------
// 3. Callback Handler (Returns with auth code to convert to Access Token)
// ----------------------------------------------------------------------------
async function handleCallback() {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');

    if (code) {
        // Strip out the auth code string from the URL immediately for aesthetic reasons
        window.history.replaceState({}, document.title, window.location.pathname);

        const codeVerifier = localStorage.getItem('spotify_code_verifier');

        try {
            const body = new URLSearchParams({
                grant_type: 'authorization_code',
                code: code,
                redirect_uri: redirectUri,
                client_id: clientId,
                code_verifier: codeVerifier
            });

            const response = await fetch('https://accounts.spotify.com/api/token', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                body: body
            });

            if (!response.ok) {
                throw new Error('HTTP status ' + response.status);
            }

            const data = await response.json();

            // Persist the tokens so user stays logged in across sessions
            localStorage.setItem('spotify_access_token', data.access_token);
            if (data.refresh_token) {
                localStorage.setItem('spotify_refresh_token', data.refresh_token);
            }

            // Calculate and persist exactly when this token naturally expires
            const expirationTime = new Date().getTime() + (data.expires_in * 1000);
            localStorage.setItem('spotify_token_expiration', expirationTime);

            startPolling();
        } catch (error) {
            console.error('Error fetching token:', error);
            alert("Error logging into Spotify. Please check the developer console.");
        }
    }
}

// ----------------------------------------------------------------------------
// 4. Token Refresh Logic (Automatically called when access token expires)
// ----------------------------------------------------------------------------
async function refreshAccessToken() {
    const refreshToken = localStorage.getItem('spotify_refresh_token');
    if (!refreshToken) return false;

    try {
        const response = await fetch('https://accounts.spotify.com/api/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: new URLSearchParams({
                grant_type: 'refresh_token',
                refresh_token: refreshToken,
                client_id: clientId
            })
        });

        if (response.ok) {
            const data = await response.json();
            localStorage.setItem('spotify_access_token', data.access_token);
            if (data.refresh_token) {
                localStorage.setItem('spotify_refresh_token', data.refresh_token);
            }
            const expirationTime = new Date().getTime() + (data.expires_in * 1000);
            localStorage.setItem('spotify_token_expiration', expirationTime);
            return true;
        }
    } catch (e) {
        console.error('Failed to refresh token', e);
    }

    // Purge broken tokens to force a clean re-login
    localStorage.removeItem('spotify_access_token');
    localStorage.removeItem('spotify_refresh_token');
    return false;
}

// ----------------------------------------------------------------------------
// 5. Currently Playing Fetch (The main workhorse)
// ----------------------------------------------------------------------------
async function fetchCurrentlyPlaying() {
    let accessToken = localStorage.getItem('spotify_access_token');
    const expiration = localStorage.getItem('spotify_token_expiration');

    // Auto-refresh mechanism
    if (!accessToken || !expiration || new Date().getTime() > parseInt(expiration)) {
        const refreshed = await refreshAccessToken();
        if (!refreshed) {
            showLogin();
            return;
        }
        accessToken = localStorage.getItem('spotify_access_token');
    }

    try {
        const response = await fetch('https://api.spotify.com/v1/me/player/currently-playing', {
            headers: {
                Authorization: 'Bearer ' + accessToken
            }
        });

        if (response.status === 204) {
            // "No Content" basically signifies paused/sleep state in Spotify Web Api
            updateUI(null);
        } else if (response.status === 200) {
            const data = await response.json();

            // Do not update the UI if the song is technically stopped or disconnected
            if (data.is_playing) {
                updateUI(data);
            } else {
                updateUI(null);
            }
        } else if (response.status === 401) {
            await refreshAccessToken();
        }
    } catch (error) {
        console.error("Error fetching currently playing track:", error);
    }
}

// ----------------------------------------------------------------------------
// 6. UI Render Utilities
// ----------------------------------------------------------------------------
function updateUI(data) {
    loginContainer.style.display = 'none';
    nowPlayingContainer.style.display = 'block';

    if (!data || !data.item) {
        trackNameEl.textContent = "Not Playing";
        artistNameEl.textContent = "Playback is paused";
        albumArtEl.classList.add('hidden');
    } else {
        const track = data.item;
        const artistNames = track.artists.map(a => a.name).join(', ');

        trackNameEl.textContent = track.name;
        artistNameEl.textContent = artistNames;

        if (track.album && track.album.images.length > 0) {
            // Find an appropriately sized image (usually mid-size array index 1 is fine, but index 0 is high-res)
            albumArtEl.src = track.album.images[0].url;
            albumArtEl.classList.remove('hidden');
        } else {
            albumArtEl.classList.add('hidden');
        }
    }
}

function showLogin() {
    loginContainer.style.display = 'block';
    nowPlayingContainer.style.display = 'none';
}

function startPolling() {
    fetchCurrentlyPlaying();
    // Poll Spotify servers every 5 seconds to provide accurate tracking
    setInterval(fetchCurrentlyPlaying, 5000);
}

// ----------------------------------------------------------------------------
// 7. Initial Bootstrap
// ----------------------------------------------------------------------------
window.addEventListener('load', () => {
    // Check if this page load is actually a redirect return from spotify!
    if (window.location.search.includes('code=')) {
        handleCallback();
    } else {
        const token = localStorage.getItem('spotify_access_token');
        if (token) {
            startPolling();
        } else {
            showLogin();
        }
    }
});
