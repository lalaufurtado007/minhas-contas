/* Service worker do Minhas Contas.
   - Guarda o app no celular para abrir sem internet.
   - Abre sempre a cópia guardada (rápido) e, se tiver internet, baixa a versão nova
     em segundo plano e avisa a página ("Nova versão pronta").
   - Os dados (lançamentos, lembretes) NÃO ficam aqui: ficam no armazenamento da página,
     então atualizar o app nunca apaga nada. */
const CACHE = "minhas-contas-shell-v1";
const SHELL = ["./", "./index.html", "./manifest.webmanifest", "./icon.svg", "./icon-192.png", "./icon-512.png"];
const SHELL_KEY = "./index.html";

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("minhas-contas-") && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function isShell(req) {
  const url = new URL(req.url);
  if (url.origin !== location.origin) return false;
  const scope = new URL(self.registration.scope).pathname;
  return req.mode === "navigate" || url.pathname === scope || url.pathname === scope + "index.html";
}

async function revalidateShell() {
  try {
    const cache = await caches.open(CACHE);
    const fresh = await fetch(SHELL_KEY, { cache: "no-store" });
    if (!fresh.ok) return;
    const [newText, old] = await Promise.all([fresh.clone().text(), cache.match(SHELL_KEY)]);
    const oldText = old ? await old.text() : null;
    if (newText === oldText) return;
    await cache.put(SHELL_KEY, fresh);
    // atualiza também ícones e manifesto
    await Promise.all(SHELL.filter((u) => u !== "./" && u !== SHELL_KEY).map((u) =>
      fetch(u, { cache: "no-store" }).then((r) => r.ok && cache.put(u, r)).catch(() => {})));
    if (oldText !== null) {
      const clients = await self.clients.matchAll({ type: "window" });
      for (const c of clients) c.postMessage({ type: "app-updated" });
    }
  } catch (e) {
    /* sem internet: segue com a cópia guardada */
  }
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  if (isShell(req)) {
    event.respondWith((async () => {
      const cached = await caches.match(SHELL_KEY);
      const update = revalidateShell();
      if (cached) { event.waitUntil(update); return cached; }
      await update;
      return (await caches.match(SHELL_KEY)) || fetch(req);
    })());
    return;
  }
  if (new URL(req.url).origin === location.origin) {
    event.respondWith(caches.match(req, { ignoreSearch: true }).then((hit) => hit || fetch(req)));
  }
});

// tocar no aviso de um lembrete abre o app
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    if (all.length) return all[0].focus();
    return self.clients.openWindow("./");
  })());
});
