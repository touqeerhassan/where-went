import { Popup } from '../extension/Popup'
import { dashboardUrl, mount } from './mount'

void mount(() => (
  <Popup
    onOpenDashboard={async () => {
      // Reuse an open dashboard tab instead of stacking new ones.
      const [tab] = await chrome.tabs.query({ url: dashboardUrl() })
      if (tab?.id != null) {
        await chrome.tabs.update(tab.id, { active: true })
        if (tab.windowId != null) await chrome.windows.update(tab.windowId, { focused: true })
      } else {
        await chrome.tabs.create({ url: dashboardUrl() })
      }
      window.close()
    }}
  />
))
