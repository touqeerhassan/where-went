/**
 * Manifest V3. Least privilege:
 *  - no host permissions, no content scripts, no externally_connectable
 *  - storage + unlimitedStorage: entries live in chrome.storage.local
 *  - idle: stop the timer when the user goes idle or locks the screen
 *  - alarms: the one-minute lastSeen heartbeat and the daily retention prune
 *  - notifications: the return-from-idle and auto-resume notices
 * The CSP forbids remote scripts and any network connection from extension pages.
 */
export function buildManifest(version: string, dev = false) {
  return {
    manifest_version: 3,
    name: dev ? 'Wherewent (dev)' : 'Wherewent',
    short_name: 'Wherewent',
    version,
    description: 'Time tracker for people juggling many projects. Stops when you go idle, asks or resumes when you return. Local only.',
    minimum_chrome_version: '116',
    icons: { 16: 'icons/16.png', 32: 'icons/32.png', 48: 'icons/48.png', 128: 'icons/128.png' },
    action: {
      default_title: 'Wherewent',
      default_popup: 'popup.html',
      default_icon: { 16: 'icons/16.png', 32: 'icons/32.png' },
    },
    options_ui: { page: 'dashboard.html', open_in_tab: true },
    background: { service_worker: 'background.js', type: 'module' },
    permissions: ['storage', 'unlimitedStorage', 'idle', 'alarms', 'notifications'],
    content_security_policy: {
      extension_pages: "script-src 'self'; object-src 'none'; connect-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    },
  }
}
