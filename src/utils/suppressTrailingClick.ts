/**
 * Suppress the `click` the browser dispatches after a handle gesture.
 *
 * A drag that starts on a handle icon and releases anywhere else makes the
 * browser fire the trailing `click` on the nearest common ancestor of the
 * mousedown and mouseup targets — the map container. Leaflet's own
 * "suppress the click after a drag" guard only inspects the clicked target's
 * ancestor chain, so it never sees the dragged layer there and the map
 * `click` fires (which clears the selection app-side).
 *
 * Arming during the `mouseup` / `dragend` handlers is safe: the browser
 * dispatches the `click` only after those handlers return. A capture listener
 * on `document` therefore runs before Leaflet's bubble-phase listener on the
 * container, and `stopPropagation` keeps the map `click` from firing at all.
 * The listener removes itself after eating one click; the 0 ms timer covers
 * the one case where no click follows the gesture (release outside the
 * window), so a stale handler can never swallow the user's next real click.
 */
export const suppressTrailingClick = (): void => {
  const onClick = (event: MouseEvent) => {
    event.stopPropagation();
    remove();
  };
  const remove = () => {
    document.removeEventListener("click", onClick, true);
    clearTimeout(disarm);
  };

  const disarm = setTimeout(remove, 0);
  document.addEventListener("click", onClick, true);
};
