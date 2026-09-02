// アプリシェル(HTML/CSS/JS)をキャッシュし、ホーム画面追加時にオフラインでも開けるようにする。
// GitHub APIやGoogle Fontsなど外部オリジンへのリクエストはキャッシュせず、常にネットワークへ流す。
const CACHE_NAME = "signal-shell-v33";
const APP_SHELL = [
  "./",
  "index.html",
  "exercises.html",
  "style.css?v=33",
  "sync.js?v=33",
  "app.js?v=33",
  "exercises.js?v=33",
  "manifest.json",
  "favicon.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== location.origin || event.request.method !== "GET") return;

  // index.html/exercises.htmlはバージョンクエリを付けられない(直接開かれるURLのため)。
  // stale-while-revalidateだと更新直後に「新しいJS + 古いHTML」が組み合わさり、
  // 新しいJSが参照するDOM要素が無くて壊れることがあった。ナビゲーション(HTML取得)
  // は常にネットワークを優先し、オフラインのときだけキャッシュにフォールバックする。
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return res;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // JS/CSSはバージョンクエリでキャッシュキーが変わるので、stale-while-revalidateで
  // 問題ない: まずキャッシュを即返しつつ、裏でネットワークから次回分を更新する。
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const network = fetch(event.request)
        .then((res) => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
