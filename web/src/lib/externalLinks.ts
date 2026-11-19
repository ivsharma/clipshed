interface AndroidShellBridge {
  openExternal?: (url: string) => void;
}

const EXTERNAL_PROTOCOLS = new Set(["http:", "https:"]);

/** Returns the absolute URL when it leaves the app and can open in a browser. */
export function externalHttpUrl(href: string, base: string, origin: string): string | null {
  try {
    const url = new URL(href, base);
    if (!EXTERNAL_PROTOCOLS.has(url.protocol) || url.origin === origin) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function shellBridge(): AndroidShellBridge | undefined {
  return (window as Window & { ClipshedShell?: AndroidShellBridge }).ClipshedShell;
}

/**
 * Android WebViews do not hand popup links to the system browser. Route
 * external links through the shell, while desktop and browser builds keep
 * their normal behavior.
 */
export function installExternalLinkHandler(): void {
  document.addEventListener("click", (event) => {
    if (event.defaultPrevented || event.button !== 0) return;

    const target = event.target;
    if (!(target instanceof Element)) return;
    const anchor = target.closest("a[href]");
    if (!(anchor instanceof HTMLAnchorElement)) return;

    const url = externalHttpUrl(anchor.href, window.location.href, window.location.origin);
    if (!url) return;

    const bridge = shellBridge();
    if (!bridge?.openExternal) return;

    try {
      bridge.openExternal(url);
      event.preventDefault();
    } catch {
      // Let the WebView handle the link if the native call fails.
    }
  });
}
