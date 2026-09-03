// content/main-world.js
// Runs in the MAIN world execution context of YouTube
// to access page-level variables and player methods (e.g. movie_player.getPlayerResponse()).

(function () {
  'use strict';

  function getPlayerResponse() {
    try {
      const player = document.getElementById('movie_player');
      if (player && typeof player.getPlayerResponse === 'function') {
        const res = player.getPlayerResponse();
        if (res) return res;
      }
    } catch (e) {
      // Ignored
    }

    if (window.ytInitialPlayerResponse) {
      return window.ytInitialPlayerResponse;
    }

    return null;
  }

  // Listen for requests from the isolated content script
  window.addEventListener('YOUTUBE_EXTENSION_GET_PLAYER_RESPONSE', (event) => {
    const requestId = event.detail?.requestId;
    const playerResponse = getPlayerResponse();

    window.dispatchEvent(
      new CustomEvent('YOUTUBE_EXTENSION_PLAYER_RESPONSE_RESULT', {
        detail: {
          requestId,
          playerResponse: playerResponse ? JSON.parse(JSON.stringify(playerResponse)) : null
        }
      })
    );
  });
})();
