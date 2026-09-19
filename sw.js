/* سَمْت — عامل الخدمة: يحفظ ملفات النواة ليعمل التطبيق دون إنترنت. البيانات لا تمر من هنا. */
var CACHE = "samt-shell-1.0.0-r4";
var FILES = ["./", "index.html", "loader.js", "base.css", "doc.css", "pub.css", "app.css", "app.js", "template.xlsx",
  "shared.js", "rules.js", "sign.html", "teacher.html", "xlsx.full.min.js", "moe-logo.png", "icon-192.png", "icon-512.png", "manifest.webmanifest"];
self.addEventListener("install", function (ev) { ev.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(FILES); }).then(function () { return self.skipWaiting(); })); });
self.addEventListener("activate", function (ev) {
  ev.waitUntil(caches.keys().then(function (ks) { return Promise.all(ks.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); })); }).then(function () { return self.clients.claim(); }));
});
self.addEventListener("fetch", function (ev) {
  var u = new URL(ev.request.url);
  if (ev.request.method !== "GET" || u.origin !== location.origin || u.pathname.indexOf("/relay/") >= 0 || ev.request.cache === "no-store") return; /* صندوق البريد وغيره لا يُخزَّن */
  ev.respondWith(caches.match(ev.request, { ignoreSearch: true }).then(function (r) {
    return r || fetch(ev.request).then(function (res) { if (res.ok) { var cp = res.clone(); caches.open(CACHE).then(function (c) { c.put(ev.request, cp); }); } return res; });
  }));
});
