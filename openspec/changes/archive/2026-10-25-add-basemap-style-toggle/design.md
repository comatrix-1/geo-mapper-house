# Design

## Context

See proposal.md - Why. The base layer is a single hardcoded `<TileLayer url="...lyrs=s...">` in `MapBoard.tsx`. Both target styles come from the same Google tile endpoint, differing only in the `lyrs` parameter, so no new provider or credentials are involved. The app today persists only Firestore project content and has no `localStorage` usage anywhere - this change introduces the first key. Map overlay real estate: zoom controls top-left (shifted 24px clear of the sidebar rail), toolbar top-center, hint banner bottom-center, attribution bottom-right; bottom-left is free.

## Goals / Non-Goals

**Goals:**
- Instant, in-place style switching without remounting `MapContainer`.
- Preference survives reload on the same device; degrade silently when storage is unavailable.
- The toggle is keyboard-operable for free by using real `<button>` elements.

**Non-Goals:**
- No hybrid (`lyrs=y`) or terrain (`lyrs=p`) styles - adding one later is a data change (one more entry in the style map), not a redesign.
- No per-project or cross-device preference sync; explicitly not stored in Firestore.
- No change to attribution text or `maxZoom={21}`.

## Decisions

**1. Leaflet `L.Control` (bottomleft), not a React overlay div.**
The toggle belongs to the map chrome, and a `L.Control` is Leaflet's native mechanism - it participates in map panes/z-order and corner offset rules (the existing `.leaflet-top.leaflet-left` CSS fix in `index.css` shows these matter here). Implementation: a small `BasemapToggleControl` component inside `MapContainer` that follows the established `useMap`-controller pattern (`CursorController`, `FocusController`) and adds/removes the control on mount/unmount. The control's DOM is built from plain `<button>` elements. Alternative considered: an absolutely positioned Tailwind div in `App.tsx` - simpler DOM but disconnected from the map corners and the attribution stacking context it sits beside.

**2. State owned by `MapBoard`, not `App`.**
No other component consumes the style, so keeping it in `MapBoard` avoids two new props on an already wide interface. The control writes through a callback prop passed down from `MapBoard`'s state.

**3. `localStorage` key `geo-mapper:basemap-style`, values `"satellite" | "roadmap"`.**
Read via a lazy `useState` initializer; validated against the known style map, anything else falls back to `satellite`. Written in an effect on change, wrapped so a throwing storage (private-mode Safari, quota) only loses persistence, not the view. A tiny `src/utils/basemapStyle.ts` module owns the key, the style map (`satellite -> lyrs=s`, `roadmap -> lyrs=m`), and parse/serialize - the first app-side storage convention, so it gets a named home rather than inline `JSON.parse` calls.

**4. Switching = changing the `url` prop of the existing `TileLayer`.**
react-leaflet forwards `url` changes to Leaflet's `TileLayer.setUrl()`, which reloads tiles in place; center/zoom are untouched. If verification shows the installed react-leaflet version not reacting to `url` (precedent: the codebase already keys objects on interactivity because `interactive` doesn't update in place), fall back to `key={style}` on the `TileLayer` to force replacement - visually equivalent, minor tile flash.

**5. Testing: extend the react-leaflet mock to expose `TileLayer` props.**
Current mock renders `TileLayer: () => null`. Change it to render a `div` with `data-url={url}` so assertions target the actual endpoint (`lyrs=s` vs `lyrs=m`) rather than implementation internals. The `useMap` stub already supports the control-mounting path; jsdom has no tile loading, so tests assert props and DOM, not rendered imagery.

## Risks / Trade-offs

- [`localStorage` is per-device only] → Accepted: a shared Firestore preference would couple a UI setting to signed-in state and project sync; reload persistence met the requirement.
- [`key={style}` fallback remounts the layer] → Brief blank tiles on switch; acceptable, and only if `setUrl` proves unreliable.
- [Google tile endpoints are undocumented and could change] → Same exposure as the already-shipped satellite layer; the style map keeps the blast radius to two URL constants.
- [jsdom tests never exercise real Leaflet control DOM] → The control is thin (build DOM, call back); manual check in the running app confirms placement and click behavior.

## Migration Plan

Purely additive front-end change; no data migration. Rollback = revert the commit. Stored keys from a rolled-back deploy are simply ignored (no reader), and readers tolerate absent keys via the satellite default.
