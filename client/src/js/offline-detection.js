/**
 * Farm Connect - Offline Detection
 * Non-intrusive banner that appears when the user loses network connectivity.
 * Works with the Service Worker for basic offline support.
 */
(function () {
    'use strict';

    let banner = null;

    function createBanner() {
        if (banner) return;
        banner = document.createElement('div');
        banner.id = 'offline-banner';
        banner.className = 'offline-banner';
        banner.innerHTML =
            '<i class="fas fa-exclamation-triangle" style="margin-right:8px; color:#f59e0b"></i>' +
            '<span>You are currently offline. Some features may be unavailable.</span>' +
            '<button onclick="location.reload()" style="margin-left:12px;padding:4px 12px;border:1px solid #fff;background:transparent;color:#fff;border-radius:4px;cursor:pointer;font-size:12px">Retry</button>';
        document.body.prepend(banner);

        // Trigger animation
        requestAnimationFrame(function () {
            banner.classList.add('show');
        });
    }

    function removeBanner() {
        if (!banner) return;
        banner.classList.remove('show');
        banner.classList.add('hide');
        setTimeout(function () {
            if (banner && banner.parentNode) {
                banner.parentNode.removeChild(banner);
            }
            banner = null;
        }, 400);
    }

    // Listen for online/offline events
    window.addEventListener('offline', createBanner);
    window.addEventListener('online', removeBanner);

    // Check initial state
    if (!navigator.onLine) {
        createBanner();
    }
})();
