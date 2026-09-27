import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { Toaster } from "@/components/ui/sonner";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, getLocale } from "next-intl/server";
import "./globals.css";

/** RTL script locales — extend this list as new languages are added. */
const RTL_LOCALES = ["ar", "he", "fa", "ur"];

export const metadata: Metadata = {
  title: {
    default: "Izah POS",
    template: "%s | Izah POS",
  },
  description: "Open-source, offline-capable Point of Sale for small businesses",
  openGraph: {
    title: "Izah POS",
    description: "Open-source, offline-capable Point of Sale for small businesses",
    type: "website",
  },
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon.ico" },
    ],
    apple: { url: "/apple-touch-icon.png", sizes: "180x180" },
    shortcut: "/favicon.ico",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Izah POS",
  },
};

export const viewport: Viewport = {
  themeColor: "#0f2044",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const [messages, locale] = await Promise.all([getMessages(), getLocale()]);
  const dir = RTL_LOCALES.includes(locale) ? "rtl" : "ltr";
  return (
    <html lang={locale} dir={dir} suppressHydrationWarning>
      <body
        className={`${GeistSans.variable} ${GeistMono.variable} antialiased`}
      >
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                var theme = localStorage.getItem('izah-theme');
                if (theme === 'dark') {
                  document.documentElement.classList.add('dark');
                } else {
                  document.documentElement.classList.remove('dark');
                }
              } catch(e) {}
            `,
          }}
        />
        <NextIntlClientProvider messages={messages}>
          {children}
          <Toaster richColors toastOptions={{ className: "text-sm" }} />
        </NextIntlClientProvider>
        {/* Client Session Bridge: preserves session token across cross-site iframes and attaches auth headers to all fetch/RSC calls */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var params = new URLSearchParams(window.location.search);
                  if (params.has('logout') || params.has('force')) {
                    try { localStorage.removeItem('izah_session_token'); } catch(e) {}
                  } else {
                    var queryToken = params.get('session_token') || params.get('token');
                    if (queryToken) {
                      try { localStorage.setItem('izah_session_token', queryToken); } catch(e) {}
                    }
                  }
                  var token = (params.get('session_token') || params.get('token') || (function() {
                    try { return localStorage.getItem('izah_session_token'); } catch(e) { return null; }
                  })());

                  if (token && !params.has('logout')) {
                    try {
                      document.cookie = 'izah_session_token=' + encodeURIComponent(token) + '; Path=/; Max-Age=604800; SameSite=None; Secure';
                      document.cookie = 'better-auth.session_token=' + encodeURIComponent(token) + '; Path=/; Max-Age=604800; SameSite=None; Secure';
                    } catch(e) {}
                  }

                  // Patch window.fetch so every client request and Next.js RSC page navigation automatically sends auth headers
                  var originalFetch = window.fetch;
                  window.fetch = function(input, init) {
                    init = init || {};
                    var curToken = null;
                    try { curToken = localStorage.getItem('izah_session_token'); } catch(e) {}
                    if (curToken) {
                      var h = new Headers(init.headers || {});
                      if (!h.has('x-session-token')) h.set('x-session-token', curToken);
                      if (!h.has('izah-session-token')) h.set('izah-session-token', curToken);
                      if (!h.has('authorization')) h.set('authorization', 'Bearer ' + curToken);
                      init.headers = h;
                    }
                    if (!init.credentials) init.credentials = 'include';
                    return originalFetch.call(this, input, init);
                  };
                } catch(err) {
                  console.warn('Session bridge init error:', err);
                }
              })();
            `,
          }}
        />
        {/* Register service worker for PWA offline support */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                window.addEventListener('load', function() {
                  navigator.serviceWorker.register('/sw.js').catch(function(err) {
                    console.warn('SW registration failed:', err);
                  });
                });
              }
            `,
          }}
        />
      </body>
    </html>
  );
}
