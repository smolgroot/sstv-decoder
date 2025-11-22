const withPWA = require('next-pwa')({
  dest: 'public',
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === 'development',
  // Precache important pages for offline access
  cacheOnFrontEndNav: true,
  // Build offline support directly into the PWA
  buildExcludes: [/middleware-manifest\.json$/],
  runtimeCaching: [
    // External fonts - cache first for offline support
    {
      urlPattern: /^https:\/\/fonts\.(?:gstatic|googleapis)\.com\/.*/i,
      handler: 'CacheFirst',
      options: {
        cacheName: 'google-fonts',
        expiration: {
          maxEntries: 10,
          maxAgeSeconds: 365 * 24 * 60 * 60 // 1 year
        }
      }
    },
    // Static assets - cache first for offline support
    {
      urlPattern: /\.(?:js|css|woff2?|eot|ttf|otf)$/i,
      handler: 'CacheFirst',
      options: {
        cacheName: 'static-assets',
        expiration: {
          maxEntries: 60,
          maxAgeSeconds: 30 * 24 * 60 * 60 // 30 days
        }
      }
    },
    // Images - cache first for offline support
    {
      urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp|ico)$/i,
      handler: 'CacheFirst',
      options: {
        cacheName: 'images',
        expiration: {
          maxEntries: 60,
          maxAgeSeconds: 30 * 24 * 60 * 60 // 30 days
        }
      }
    },
    // Next.js static files - cache first for best offline experience
    {
      urlPattern: /^\/_next\/.*/i,
      handler: 'CacheFirst',
      options: {
        cacheName: 'next-assets',
        expiration: {
          maxEntries: 100,
          maxAgeSeconds: 30 * 24 * 60 * 60 // 30 days
        }
      }
    },
    // HTML pages - Network first with fast fallback to cache for offline
    {
      urlPattern: /^https?:\/\/[^\/]+\/$/,
      handler: 'NetworkFirst',
      options: {
        cacheName: 'pages',
        networkTimeoutSeconds: 2, // Quick timeout for offline detection
        expiration: {
          maxEntries: 10,
          maxAgeSeconds: 24 * 60 * 60 // 24 hours
        },
        cacheableResponse: {
          statuses: [0, 200]
        }
      }
    },
    // Catch-all for same-origin - cache first for maximum offline support
    {
      urlPattern: ({ url, request }) => {
        return url.origin === self.location.origin &&
               request.destination !== 'document';
      },
      handler: 'CacheFirst',
      options: {
        cacheName: 'app-cache',
        expiration: {
          maxEntries: 100,
          maxAgeSeconds: 30 * 24 * 60 * 60 // 30 days
        }
      }
    }
  ]
});

/** @type {import('next').NextConfig} */
const nextConfig = {}

module.exports = withPWA(nextConfig)
