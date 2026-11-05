# Wherewent design direction: Field Ledger

Wherewent is a tool people open dozens of times a day, so it should look like a well-kept paper ledger, not a marketing site. It uses warm paper neutrals, ink-dark text, thin hairline rules and flat surfaces. One green marks tracked time. One amber, always shown with diagonal hatching, marks time you were away. Everything else stays quiet.

The direction came from the `ui-ux-pro-max` skill (`--design-system` for a dense, calm productivity tool, plus focused searches on color, type, style and charts). The skill suggested Flat Design and Swiss minimalism, a teal productivity palette, and amber as the color for time. I kept the flat Swiss structure and the teal-to-amber idea. I deepened the teal into a forest green that passes AA with white text, replaced the cool slate neutrals with warm paper tones, and swapped the skill's Inter-only pairing for Inter plus Newsreader so the product has its own voice. I left out the orange CTA accent and the gradients on purpose: the only "accent" is the meaning of the time itself.

## Principles

1. **Two meanings, two colors.** Green means tracked. Amber with hatching means away and not tracked. No other UI uses these hues, so a glance at any screen tells you which time counts.
2. **Never color alone.** Away time always carries the hatch pattern and the words "not tracked". Project colors always appear next to the project name. The day timeline has a text alternative on every block.
3. **Calm density in the extension, more air on the landing page.** The popup and dashboard use a 4 px grid, 13 px UI text and 32 to 36 px controls. The landing page uses 16 to 18 px body text and 80 px section spacing.
4. **Numbers never jiggle.** Every duration, clock and total uses tabular figures (the `.tnum` utility).
5. **Flat.** No gradients. Borders separate things. Shadows appear only on floating windows: the popup, the return prompt, notifications and toasts.
6. **Keyboard first.** One focus style everywhere (2 px ring in `--ww-ring`, 2 px offset). Radio groups for segmented controls and project pickers, so arrow keys work. The return prompt opens with Resume focused, and Enter, P and Esc act on it directly.

## Tokens

The source of truth is `src/styles/tokens.css`. Tailwind utilities map to these tokens (`bg-surface`, `text-ink-2`, `border-line`, `bg-primary`, `text-away` and so on), and components never use raw hex values. Dark mode follows the system setting and can be forced with `data-theme="light|dark"` on `<html>`.

### Color

| Token | Light | Dark | Use |
|---|---|---|---|
| `bg` | `#f6f5f1` | `#121310` | Page background (paper) |
| `surface` | `#ffffff` | `#1a1b18` | Cards, popup header, inputs |
| `surface-2` | `#efede7` | `#222420` | Subtle fills, segmented controls |
| `surface-3` | `#e6e3db` | `#2b2d28` | Bar tracks, inactive steps |
| `line` | `#dedad0` | `#30332d` | Hairline borders |
| `line-strong` | `#c4bfb2` | `#454941` | Input and button borders |
| `ink` | `#1b1a17` | `#eceae3` | Primary text |
| `ink-2` | `#55524a` | `#b2aea3` | Secondary text |
| `ink-3` | `#6b675d` | `#9a968b` | Tertiary text and labels (still AA) |
| `primary` | `#0e6b59` | `#5cc3a9` | Tracked time, primary actions |
| `on-primary` | `#ffffff` | `#0a1f1a` | Text on primary |
| `primary-soft` | `#e1efea` | `#183129` | Selected states, info banners |
| `primary-ink` | `#0b5a4a` | `#7fd3bd` | Green text on soft or surface |
| `away` | `#9a4a07` | `#e9a752` | Away / not-tracked text |
| `away-soft` | `#f9ecd6` | `#33271a` | Hatch background |
| `away-line` | `#d9a35a` | `#8c6431` | Hatch stripes |
| `danger` | `#b3261e` | `#f2786a` | Destructive hover, errors |
| `ring` | `#0e6b59` | `#7bd1bb` | Focus ring |

Project palette (fills at least 3:1 against `surface`, labels at least 4.5:1 with `on-project`): pine, cobalt, ochre, brick, plum, olive, rose, slate. The values live in `tokens.css` as `--ww-p-*`. `on-project` is white in light mode and near-black in dark mode.

I checked every text pair above against WCAG AA (4.5:1) in both themes with a script. Nothing fails.

### Type

| Role | Family | Notes |
|---|---|---|
| UI and body | Inter Variable | Self-hosted via `@fontsource-variable/inter`. `tnum` for numbers. |
| Display | Newsreader Variable | Self-hosted. Used for the wordmark, landing headings, onboarding and return-prompt headlines. |

Extension scale: 11 px eyebrow labels (uppercase, +0.08em), 12 px meta text, 13 px UI text, 14 px controls, 44 px running clock. Landing scale: 18 px lead, 16 px body, 36 px section headings, 48 to 72 px hero.

### Shape, space and elevation

- Radius: 4 px (`sm`), 6 px (`md`, controls), 10 px (`lg`, cards and windows), full for dots and chips.
- Spacing: a 4 px base. Extension padding is 12 to 16 px. Landing sections use 80 px vertical padding inside a `max-w-6xl` container.
- Elevation: only `shadow-window`, for floating surfaces.
- Motion: 150 ms color transitions, the pulsing "Tracking" dot, and the FAQ marker rotation. All of it is turned off under `prefers-reduced-motion`.

### Signature elements

- **Logo mark:** a clock face whose green arc stops short, leaving a gap. That gap is the away time.
- **Away hatch** (`.hatch-away`): 135° amber stripes on amber-soft. It appears in the timeline, the stats, the return prompt and the auto-resume notice.
- **Dot + name:** the only way a project's color is shown.

## Anti-patterns avoided

No purple gradients. No glassmorphism. No emoji as icons (Phosphor icons only, regular weight, filled only for play, pause and stop). No placeholder-only labels. No color-only status. No third-party fonts or scripts. No fake social proof.
