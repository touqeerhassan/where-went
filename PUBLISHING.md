# Publishing to the Chrome Web Store

Nothing has been submitted. This is the checklist and the copy to paste when you do. Chrome Web Store requirements change. Recheck the dashboard's own hints when you fill it in, and treat the sizes below as accurate when this was written.

## 1. Register as a developer (one time)

1. Sign in at the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole) with the Google account that should own the listing. Use a shared company account, not a personal one, so the listing outlives any one person.
2. Turn on 2-Step Verification for that account. It is required to publish.
3. Accept the developer agreement and pay the one-time registration fee (US$5).
4. Complete the account settings:
   - **Publisher name:** this is shown on the listing.
   - **Contact email:** must be verified.
   - **Trader / non-trader declaration:** this is required for EU distribution. A company selling services is usually a trader, and traders must show an address and phone number.

## 2. Build the package

```bash
npm run check
```

```bash
npm run zip
```

Upload `wherewent-<version>.zip`. `manifest.json` sits at the root of the zip, and sourcemaps are excluded. Bump `version` in `package.json` for every upload, because the manifest version is taken from it. Never upload a `build:dev` zip. Its name ends in "(dev)" and it includes the 15 s test option.

## 3. Store listing

| Field | Value |
|---|---|
| Name | Wherewent |
| Summary (132 chars max) | Time tracker for people juggling many projects. Stops when you go idle, asks or resumes when you return. Local only. |
| Category | Productivity / Tools (pick the closest one offered) |
| Language | English |

**Description (suggested):**

> Wherewent is a time tracker in your toolbar for people running several projects at once.
>
> Start a project and task in one click, or restart one of your last three. Switching closes the current entry and opens the next.
>
> When you step away, the timer stops itself after 2 minutes without keyboard or mouse input (adjustable). The entry ends when you actually stopped, and time away is never counted.
>
> When you come back, choose what happens: "Ask me" shows a small window with Resume as the default, and "Auto-resume" restarts the same task and tells you.
>
> The dashboard shows time per project by day, week, month or six months, plus a timeline with your away gaps. You can edit, delete or add entries, manage projects and tasks, and export to CSV or JSON.
>
> Private by design: no account, no sync, no analytics, and the extension makes no network requests. Data stays in your browser, and entries older than 6 months are deleted automatically.

### Graphics

| Asset | Size | Notes |
|---|---|---|
| Store icon | 128 × 128 PNG | Use `public/icons/128.png`. Google's guidance is 96 × 96 artwork with transparent padding. Ours fills most of the canvas, which is acceptable but worth tightening before launch. |
| Screenshots | **1280 × 800** (preferred) or 640 × 400, PNG or JPEG, 1 to 5 of them | Square corners, no padding. Suggested set: the popup running, the return prompt, the dashboard overview, the dashboard timeline with away gaps, and Settings. Take them with `npm run build`, real (fake-name) projects, and the browser zoom at 100%. |
| Small promo tile | 440 × 280 PNG or JPEG | Required for the listing. |
| Marquee promo tile | 1400 × 560 PNG or JPEG | Optional. Only used if Google features the extension. |

## 4. Privacy practices tab

**Single purpose description:**

> Wherewent tracks how much time the user spends on their own projects and tasks. It runs a timer the user starts, stops it automatically when the user goes idle, and lets them resume or switch when they return, with all data stored only on their device.

**Permission justifications:**

| Permission | Justification |
|---|---|
| `storage` | Saves the user's projects, tasks, time entries and settings locally in `chrome.storage.local`. This is the extension's only data store. |
| `unlimitedStorage` | Up to six months of time entries are kept on the device. Without it, the default storage quota could be reached and new entries would fail to save, losing tracked time. |
| `idle` | Detects when the user stops using the computer (no input for their chosen threshold, or a locked screen), so the running timer stops and idle time is not counted. That is the extension's core feature. It reads only active, idle or locked, and nothing about what the user is doing. |
| `alarms` | A one-minute heartbeat records when the browser was last running, so time is not over-counted after sleep or after Chrome was closed. A daily alarm deletes entries older than six months. |
| `notifications` | When the user returns from idle, a notification lets them resume their previous task or choose another. With Auto-resume on, it tells them the timer resumed and offers a Switch button. |
| Host permissions | None requested. |
| Remote code | **No.** All code is in the package. The extension's CSP blocks remote scripts and all network connections (`connect-src 'none'`). |

**Data usage:** choose **none** of the data categories. Wherewent does not collect or transmit personally identifiable information, health, financial, authentication, personal communications, location, web history, user activity or website content. Idle state is used on the device only and never stored beyond the time entries the user creates. Then certify all three statements:

- [x] I do not sell or transfer user data to third parties, apart from the approved use cases.
- [x] I do not use or transfer user data for purposes unrelated to my item's single purpose.
- [x] I do not use or transfer user data to determine creditworthiness or for lending purposes.

**Privacy policy URL:** publish the landing page (`npm run build:landing`) and use `https://<your-domain>/privacy.html`. Its text matches the policy below.

## 5. Privacy policy text

> **Wherewent privacy policy**
>
> *Last updated: [date of submission]*
>
> **Short version: no data leaves your device.** Wherewent has no account, no servers and no analytics, and the extension makes no network requests.
>
> **What the extension stores.** The projects and tasks you create, your time entries (project, task, start and end time), the periods you were away while a timer was running, your settings, and a "last seen" timestamp updated once a minute.
>
> **Where it is stored.** Only in your Chrome profile's local extension storage (`chrome.storage.local`), on the device you are using. It is not synced to other devices or copied anywhere else. Uninstalling the extension removes it.
>
> **What we collect.** Nothing. The extension does not send your data, usage statistics, crash reports or identifiers to us or to anyone else. It contains no analytics or advertising code and loads no remote code.
>
> **Idle detection.** To stop the timer when you step away, Wherewent uses Chrome's built-in idle detection, which reports only whether you are active, idle or locked. It does not record what you type, the sites you visit or what is on your screen.
>
> **Notifications.** Notifications are created locally by Chrome and are not sent through any server.
>
> **Retention.** Entries older than 6 months are deleted automatically on your device. You can delete any entry at any time, or everything by uninstalling.
>
> **Export.** You can export your data as CSV or JSON. The file is created in your browser and saved to your downloads. Nothing is uploaded.
>
> **Changes.** If this policy changes, the date above changes with it. Anything that would send data off your device would be a different product, and we would say so plainly.
>
> **Contact.** [support email]

## 6. Distribution

- **Visibility:** to test with the team first, publish as **Unlisted** (anyone with the link can install) or **Private** (limited to listed testers or your Google Workspace domain), then switch to Public.
- **Regions:** all.
- **Pricing:** free. The store has no paid-extension option, so charge outside it if ever needed.

## 7. Before you click Submit

- [ ] `npm run check` passes, and `npm run e2e` passes on Linux.
- [ ] The manual checklist in [TESTING.md](./TESTING.md) has been run on macOS and Windows with a production build.
- [ ] `package.json` version has been bumped.
- [ ] The privacy policy is live at its URL and has a real contact email.
- [ ] Screenshots show no real client names.
- [ ] Expect review to take from a day to a few weeks. Narrow permissions and no host access help.
