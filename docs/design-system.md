# Design System — Liquid Glass

SyncSpeak uses a "Liquid Glass" design language. Every component is a translucent lens over the user's actual desktop wallpaper — not a simulated or faked background.

---

## Core Philosophy

**True transparency, not fake blur.**

The Tauri window has `transparent: true` and `decorations: false`. Windows Acrylic blur (`window_vibrancy::apply_acrylic`) is applied at the OS level. Every panel in the app must let the user's real desktop show through.

**Never:**
- Add a solid background color to any panel or root element
- Simulate wallpaper with a gradient, image, or color blob
- Use Tailwind CSS (the design system is custom CSS only)

---

## CSS Design Tokens

All tokens are defined in [src/renderer/styles/globals.css](../src/renderer/styles/globals.css).

| Token | Value | Usage |
|-------|-------|-------|
| `--glass-bg` | `rgba(15, 15, 20, 0.4)` | All panel/card backgrounds |
| `--liquid-blur` | `blur(60px) saturate(110%) brightness(1.1)` | `backdrop-filter` on all panels |
| `--glass-border` | `rgba(255, 255, 255, 0.1)` | Panel borders (top/left specular highlights) |
| `--liquid-morph` | `cubic-bezier(0.2, 0.8, 1.0, 1.0)` | All interactive transitions |
| `--accent` | `rgba(100, 200, 255, 0.8)` | Active state, translated text, active buttons |

### Applying a glass panel

```css
.my-panel {
  background: var(--glass-bg);
  backdrop-filter: var(--liquid-blur);
  -webkit-backdrop-filter: var(--liquid-blur);
  border: 1px solid var(--glass-border);
  border-radius: 20px;
}
```

### Applying spring transitions

```css
.my-button {
  transition: transform 0.3s var(--liquid-morph),
              opacity  0.3s var(--liquid-morph);
}
```

---

## Window Configuration

From [src-tauri/tauri.conf.json](../src-tauri/tauri.conf.json):

```json
{
  "width": 1000,
  "height": 720,
  "resizable": true,
  "transparent": true,
  "decorations": false,
  "backgroundColor": "#00000000"
}
```

The Acrylic blur fallback (in `lib.rs`): if the OS does not support Acrylic (VMs, older Windows), the app falls back to `Color(18, 18, 24, 200)` — a semi-opaque dark background that still reads correctly.

---

## Component Patterns

### Glass Card

The base pattern for all panels:

```tsx
<div className="glass-card">
  {/* content */}
</div>
```

```css
.glass-card {
  background: var(--glass-bg);
  backdrop-filter: var(--liquid-blur);
  -webkit-backdrop-filter: var(--liquid-blur);
  border: 1px solid var(--glass-border);
  border-radius: 16px;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.3);
}
```

### LiquidTerminal

The conversation log component ([src/renderer/components/LiquidTerminal.tsx](../src/renderer/components/LiquidTerminal.tsx)) renders three entry types:

| Type | Icon color | Text treatment |
|------|-----------|----------------|
| `heard` | Green (`#32d158`) | Dimmed — source Hindi text |
| `translated` | Blue (`#00c6ff`) | Full brightness — English output |
| `system` | Amber (`#fbbf24`) | Monospace, smaller — debug/status |

Entries animate in with a `line-emerge` keyframe (translateY(5px) → 0, opacity 0 → 1).

Copy button (`⎘`) appears on hover with `opacity: 0 → 1` (not `display: none`) for reliable hover detection.

### GlassSelect (custom dropdown)

The device and speaker dropdowns are not native `<select>` elements — they use a custom component (`GlassSelect` in `TranslatePage.tsx`) that applies the glass design system to the dropdown list. Click-outside detection is handled by a `mousedown` listener.

### Status Orb

The green pulsing dot in `LiquidTerminal.tsx`:

```css
.status-orb.live {
  background: #32d158;
  box-shadow: 0 0 10px rgba(50, 209, 88, 0.8),
              0 0 20px rgba(50, 209, 88, 0.4);
}
```

### Volume Meter

The signal level bar in the Input Settings panel shows:
- A fill bar driven by the `volume` event from Python (0–100 RMS scale)
- A threshold needle positioned at `(120 - vadLevel) / 2` percent

The bar gets the class `is-peaking` when `currentVolume > (120 - vadLevel) / 2`, which triggers a color shift from green to amber/red.

---

## Typography

| Element | Font | Size | Weight |
|---------|------|------|--------|
| Panel labels (`hig-label`) | `Inter`, `Outfit`, sans-serif | 10px | 800 |
| Terminal content | `JetBrains Mono`, `Fira Code`, monospace | 12px | 400 |
| Tags (`HEARD`, `TRANSLATED`) | `Inter`, sans-serif | 9px | 700, uppercase |
| Timestamps | monospace | 9px | — |

---

## Rules for Contributors

1. Every panel must use `var(--glass-bg)` + `backdrop-filter: var(--liquid-blur)`
2. Never add a solid background color to any root element or panel
3. Never simulate wallpaper with gradients or images
4. All transitions must use `var(--liquid-morph)` for the spring-physics feel
5. No Tailwind — all styles are custom CSS in component `.css` files or `globals.css`
6. Icons in the terminal (mic, robot, speaker, system) use inline SVGs — do not use icon libraries that add layout overhead
