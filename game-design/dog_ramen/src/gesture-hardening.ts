// Games run inside a WebView and must not behave like a browser tab: no
// text-selection, no long-press callout/tap-highlight, no browser-level
// overscroll bounce, and no pinch/double-tap page zoom.
//
// `touch-action: pan-x pan-y` (not `none`) blocks pinch/double-tap zoom at
// the CSS layer while leaving normal single-finger panning/scrolling
// untouched, so a game's own HTML/CSS UI (menus, scrollable lists, dialogs)
// keeps working. hardenViewport()'s `maximum-scale`/`user-scalable` tokens
// are what actually close the double-tap-zoom gap this CSS alone leaves
// open on WKWebView — `touch-action` CSS alone is not sufficient there.
//
// `input`/`textarea` opt back in to text selection since native form
// fields still need copy/paste to work normally.

const STYLE_TAG_ID = '__game-boot-gesture-hardening-styles';

// Tokens required on the viewport meta tag. Games ship their own index.html,
// so this can't be a static per-file edit — it has to be enforced here, at
// runtime, same as hardenGestures()'s CSS injection, so every game gets it
// with zero per-game work. `maximum-scale=1.0` + `user-scalable=no` is what
// actually kills double-tap-to-zoom on WKWebView — `touch-action` CSS alone
// was not sufficient there.
//
// `viewport-fit=cover` is included (the upstream scaffold this was ported
// from omits it) because a game's index.html is agent-editable: if an edit
// drops that token, the safe-area `env()` insets the rest of the template
// depends on stop being populated at all. Merging it back in here means the
// live viewport meta always has it regardless of what the game's own HTML
// shipped with.
const REQUIRED_VIEWPORT_TOKENS: Record<string, string> = {
  'maximum-scale': '1.0',
  'user-scalable': 'no',
  'viewport-fit': 'cover',
};

export function hardenViewport(): void {
  let meta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
  if (!meta) {
    meta = document.createElement('meta');
    meta.name = 'viewport';
    document.head.appendChild(meta);
  }

  // Merge into whatever tokens are already present rather than replacing the
  // tag outright — a game's own viewport meta may carry tokens this module
  // doesn't know about, and clobbering the tag would drop them.
  const parts = new Map<string, string>();
  for (const pair of meta.content.split(',')) {
    const [key, value] = pair.split('=').map((s) => s.trim());
    if (key) parts.set(key, value ?? '');
  }
  if (!parts.has('width')) parts.set('width', 'device-width');
  if (!parts.has('initial-scale')) parts.set('initial-scale', '1.0');
  for (const [key, value] of Object.entries(REQUIRED_VIEWPORT_TOKENS)) {
    parts.set(key, value);
  }

  meta.content = Array.from(parts.entries())
    .map(([key, value]) => (value ? `${key}=${value}` : key))
    .join(', ');
}

export function hardenGestures(): void {
  if (document.getElementById(STYLE_TAG_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_TAG_ID;
  style.textContent = `
    html, body {
      touch-action: pan-x pan-y;
      user-select: none;
      -webkit-user-select: none;
      -webkit-touch-callout: none;
      -webkit-tap-highlight-color: transparent;
      overscroll-behavior: none;
    }
    :where(input, textarea) {
      user-select: text;
      -webkit-user-select: text;
      -webkit-touch-callout: default;
    }
  `;
  document.head.appendChild(style);
}
