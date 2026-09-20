/* سَمْت 1.0.0 — حزمة الواجهة */
/* سَمْت — أدوات مشتركة بين التطبيق وصفحة التوقيع وصفحة رصد المعلم.
   لا تتصل بأي خادم: كل ما يُرسل يُحمل داخل الرابط أو رسالة واتساب. */
(function () {
  "use strict";
  var SL = window.SL = window.SL || {};

  SL.esc = function (s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  };

  /* ————— التواريخ (أرقام غربية) ————— */
  var fH = null, fD = null;
  try { fH = new Intl.DateTimeFormat("ar-SA-u-ca-islamic-umalqura-nu-latn", { year: "numeric", month: "2-digit", day: "2-digit" }); } catch (e) {}
  try { fD = new Intl.DateTimeFormat("ar-SA-u-nu-latn", { weekday: "long" }); } catch (e) {}
  function toD(x) { return x instanceof Date ? x : new Date(x); }
  SL.hijri = function (x) {
    var d = toD(x); if (!fH || isNaN(d)) return "";
    var p = {}; fH.formatToParts(d).forEach(function (q) { p[q.type] = q.value; });
    return (p.year || "").replace(/\D/g, "") + "/" + p.month + "/" + p.day + "هـ";
  };
  SL.greg = function (x) { var d = toD(x); if (isNaN(d)) return ""; return d.getFullYear() + "/" + String(d.getMonth() + 1).padStart(2, "0") + "/" + String(d.getDate()).padStart(2, "0") + "م"; };
  SL.dayName = function (x) { var d = toD(x); return fD && !isNaN(d) ? fD.format(d) : ""; };
  SL.both = function (x) { return SL.hijri(x) + " — " + SL.greg(x); };
  SL.time = function (x) { var d = toD(x); return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0"); };
  SL.isoDay = function (x) { var d = toD(x || new Date()); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };

  /* ————— الجوال وواتساب ————— */
  SL.normPhone = function (p) {
    var s = String(p == null ? "" : p).replace(/[٠-٩]/g, function (d) { return "٠١٢٣٤٥٦٧٨٩".indexOf(d); }).replace(/\D/g, "");
    if (!s) return "";
    if (s.indexOf("00") === 0) s = s.slice(2);
    if (/^05\d{8}$/.test(s)) return "966" + s.slice(1);
    if (/^5\d{8}$/.test(s)) return "966" + s;
    return s;
  };
  SL.showPhone = function (p) { var s = SL.normPhone(p); return /^9665\d{8}$/.test(s) ? "0" + s.slice(3) : s; };
  SL.validPhone = function (p) { return /^9665\d{8}$/.test(SL.normPhone(p)); };
  SL.wa = function (phone, text) {
    var n = SL.normPhone(phone);
    return "https://wa.me/" + (n || "") + "?text=" + encodeURIComponent(text || "");
  };
  SL.openWa = function (phone, text) { var w = window.open(SL.wa(phone, text), "_blank"); if (!w) location.href = SL.wa(phone, text); };

  /* ————— عشوائي وبصمات ————— */
  var B32 = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  SL.rid = function (n) { var a = new Uint8Array(n || 12); crypto.getRandomValues(a); var s = ""; for (var i = 0; i < a.length; i++) s += B32[a[i] % 32]; return s; };
  SL.sha256 = async function (str) {
    var b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
    return Array.prototype.map.call(new Uint8Array(b), function (x) { return x.toString(16).padStart(2, "0"); }).join("");
  };

  /* ————— ترميز مضغوط للروابط والرسائل ————— */
  function b64u(bytes) { var s = ""; for (var i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }
  function unb64u(s) { s = String(s).replace(/-/g, "+").replace(/_/g, "/"); while (s.length % 4) s += "="; var b = atob(s), a = new Uint8Array(b.length); for (var i = 0; i < b.length; i++) a[i] = b.charCodeAt(i); return a; }
  SL.b64u = b64u; SL.unb64u = unb64u;
  async function pipe(bytes, stream) {
    var s = new Blob([bytes]).stream().pipeThrough(stream);
    return new Uint8Array(await new Response(s).arrayBuffer());
  }
  SL.pack = async function (obj) {
    var raw = new TextEncoder().encode(JSON.stringify(obj));
    if (typeof CompressionStream === "function") return "z" + b64u(await pipe(raw, new CompressionStream("deflate-raw")));
    return "j" + b64u(raw);
  };
  SL.unpack = async function (str) {
    str = String(str || "").trim(); var kind = str[0], body = unb64u(str.slice(1));
    if (kind === "z") body = await pipe(body, new DecompressionStream("deflate-raw"));
    else if (kind !== "j") throw new Error("bad");
    return JSON.parse(new TextDecoder().decode(body));
  };

  /* ————— لوحة التوقيع: خطوط متجهية مضغوطة (بايت لكل إحداثي) ————— */
  SL.SigPad = function (canvas) {
    var ctx = canvas.getContext("2d"), strokes = [], cur = null, self = this;
    function fit() {
      var r = canvas.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
      canvas.width = Math.max(10, r.width * dpr); canvas.height = Math.max(10, r.height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); redraw();
    }
    function pt(e) { var r = canvas.getBoundingClientRect(); return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height]; }
    function redraw() {
      var r = canvas.getBoundingClientRect(); ctx.clearRect(0, 0, r.width, r.height);
      ctx.lineWidth = 2.4; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.strokeStyle = "#0b2a4a";
      strokes.forEach(function (s) { ctx.beginPath(); s.forEach(function (p, i) { var x = p[0] * r.width, y = p[1] * r.height; if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); }); if (s.length === 1) ctx.lineTo(s[0][0] * r.width + .5, s[0][1] * r.height); ctx.stroke(); });
    }
    canvas.style.touchAction = "none";
    canvas.addEventListener("pointerdown", function (e) { e.preventDefault(); canvas.setPointerCapture(e.pointerId); cur = [pt(e)]; strokes.push(cur); redraw(); });
    canvas.addEventListener("pointermove", function (e) { if (!cur) return; var p = pt(e), l = cur[cur.length - 1]; if (Math.abs(p[0] - l[0]) + Math.abs(p[1] - l[1]) > 0.004) { cur.push(p); redraw(); } });
    function end() { cur = null; if (self.onchange) self.onchange(); }
    canvas.addEventListener("pointerup", end); canvas.addEventListener("pointercancel", end);
    window.addEventListener("resize", fit);
    this.clear = function () { strokes = []; redraw(); if (self.onchange) self.onchange(); };
    this.isEmpty = function () { var n = 0; strokes.forEach(function (s) { n += s.length; }); return n < 6; };
    this.encode = function () {
      var out = [];
      strokes.forEach(function (s) {
        if (out.length) out.push(255);
        s.forEach(function (p) { out.push(Math.max(0, Math.min(254, Math.round(p[0] * 254))), Math.max(0, Math.min(254, Math.round(p[1] * 254)))); });
      });
      return b64u(new Uint8Array(out));
    };
    this.fit = fit;
    setTimeout(fit, 0);
  };
  /* الخطوط المرمّزة ← SVG قابل للطباعة */
  SL.sigSvg = function (enc, w, h) {
    w = w || 240; h = h || 90;
    if (!enc) return "";
    var a; try { a = unb64u(enc); } catch (e) { return ""; }
    var paths = [], d = "", first = true;
    for (var i = 0; i < a.length;) {
      if (a[i] === 255) { if (d) paths.push(d); d = ""; first = true; i++; continue; }
      var x = (a[i] / 254 * w).toFixed(1), y = (a[i + 1] / 254 * h).toFixed(1); i += 2;
      d += (first ? "M" : "L") + x + " " + y + " "; first = false;
    }
    if (d) paths.push(d);
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + w + " " + h + '" width="' + w + '" height="' + h + '" class="sigsvg"><g fill="none" stroke="#0b2a4a" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">' +
      paths.map(function (p) { return '<path d="' + p + '"/>'; }).join("") + "</g></svg>";
  };

  /* ————— عرض النموذج (نموذج بيانات موحّد ← HTML للطباعة أو لصفحة التوقيع) —————
     doc = { id, title, secret, fields:[[k,v]...], blocks:[{k:'p'|'ol'|'table'|'checks'|'reply'|'note'|'fields', ...}], signers:[{role,label,name}] }
     opts = { header:{region,school,admin}, logo, sigs:{role:{svg,name,date,text}}, compact } */
  SL.renderDoc = function (doc, opts) {
    opts = opts || {}; var e = SL.esc, h = opts.header || {}, sigs = opts.sigs || {};
    var html = '<article class="doc' + (opts.compact ? " compact" : "") + '">';
    if (!opts.compact) {
      html += '<header class="doc-h"><div class="doc-hr">المملكة العربية السعودية<br>وزارة التعليم' + (h.admin ? "<br>" + e(h.admin) : "") + "</div>" +
        '<div class="doc-hc">' + (opts.logo ? '<img src="' + e(opts.logo) + '" alt="">' : "") + "</div>" +
        '<div class="doc-hl">المنطقة/المحافظة: ' + e(h.region || "") + "<br>المدرسة: " + e(h.school || "") + "</div></header>";
    }
    if (doc.secret) html += '<div class="doc-secret">' + (doc.secret === 2 ? "(سري للغاية)" : "سري") + "</div>";
    html += '<h1 class="doc-t">' + e(doc.title) + "</h1>";
    if (doc.fields && doc.fields.length) html += fieldsHtml(doc.fields);
    (doc.blocks || []).forEach(function (b) {
      if (b.k === "p") html += '<p class="doc-p' + (b.c ? " " + e(b.c) : "") + '">' + e(b.t) + "</p>";
      else if (b.k === "h") html += '<h3 class="doc-sh">' + e(b.t) + "</h3>";
      else if (b.k === "note") html += '<p class="doc-note">' + e(b.t) + "</p>";
      else if (b.k === "fields") html += fieldsHtml(b.rows);
      else if (b.k === "ol") html += '<ol class="doc-ol">' + b.items.map(function (x) { return "<li>" + e(x) + "</li>"; }).join("") + "</ol>";
      else if (b.k === "checks") html += '<ul class="doc-checks">' + b.items.map(function (x) { return "<li><span class=\"box\">" + (x[1] ? "☑" : "☐") + "</span> " + e(x[0]) + "</li>"; }).join("") + "</ul>";
      else if (b.k === "reply") html += '<div class="doc-reply"><b>رد ولي الأمر:</b>' + b.options.map(function (x, i) { return '<div><span class="box">' + (b.chosen === i ? "☑" : "☐") + "</span> " + e(x) + "</div>"; }).join("") + (b.extra ? '<div class="doc-p">' + e(b.extra) + "</div>" : "") + "</div>";
      else if (b.k === "table") {
        html += '<table class="doc-tb"><thead><tr>' + b.head.map(function (x) { return "<th>" + e(x) + "</th>"; }).join("") + "</tr></thead><tbody>" +
          b.rows.map(function (r) { return "<tr>" + r.map(function (x) { return "<td>" + (x && x.svg ? x.svg : e(x)) + "</td>"; }).join("") + "</tr>"; }).join("") + "</tbody></table>";
      }
    });
    if (doc.signers && doc.signers.length) {
      html += '<div class="doc-sigs n' + doc.signers.length + '">';
      doc.signers.forEach(function (s) {
        var g = sigs[s.role] || {};
        html += '<div class="doc-sig"><div class="doc-sig-l">' + e(s.label) + "</div>" +
          "<div>الاسم: " + e(g.name || s.name || "") + "</div>" +
          '<div class="doc-sig-img">التوقيع: ' + (g.svg || (g.text ? '<span class="refused">' + e(g.text) + "</span>" : "")) + "</div>" +
          "<div>التاريخ: " + e(g.date || "") + "</div></div>";
      });
      html += "</div>";
    }
    if (doc.stamp) html += '<div class="doc-stamp">الختم</div>';
    if (doc.footer) html += '<div class="doc-foot">' + doc.footer.map(function (x) { return "<div>" + e(x) + "</div>"; }).join("") + "</div>";
    return html + "</article>";
    function fieldsHtml(rows) {
      return '<dl class="doc-f">' + rows.map(function (r) { return '<div class="' + (r[2] ? "w" : "") + '"><dt>' + e(r[0]) + ":</dt><dd>" + e(r[1] == null || r[1] === "" ? "…………………" : r[1]) + "</dd></div>"; }).join("") + "</dl>";
    }
  };

  /* ————— تشفير طرف-لطرف (AES-GCM) — الوسيط لا يرى إلا نصاً مشفراً ————— */
  SL.newKey = function () { var a = new Uint8Array(32); crypto.getRandomValues(a); return b64u(a); };
  async function imp(k) { return crypto.subtle.importKey("raw", unb64u(k), "AES-GCM", false, ["encrypt", "decrypt"]); }
  SL.seal = async function (k, obj) {
    var iv = new Uint8Array(12); crypto.getRandomValues(iv);
    var pt = new TextEncoder().encode(await SL.pack(obj));
    var ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv }, await imp(k), pt));
    return b64u(iv) + "." + b64u(ct);
  };
  SL.open = async function (k, s) {
    var p = String(s).split(".");
    var pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64u(p[0]) }, await imp(k), unb64u(p[1]));
    return SL.unpack(new TextDecoder().decode(pt));
  };

  /* ————— الوسيط (صندوق بريد مؤقت على Firebase Realtime Database عبر REST) —————
     المسار: /relay/<صندوق الجهاز>/<رمز الطلب> ← نص مشفر، يحذفه الجهاز فور استلامه */
  function rurl(base, path) { return String(base).replace(/\/+$/, "") + "/relay/" + path + ".json"; }
  SL.relay = {
    put: async function (base, box, tok, str) {
      var r = await fetch(rurl(base, box + "/" + tok), { method: "PUT", body: JSON.stringify(str) });
      if (!r.ok) throw new Error("relay " + r.status); return true;
    },
    list: async function (base, box) {
      var r = await fetch(rurl(base, box), { cache: "no-store" });
      if (!r.ok) throw new Error("relay " + r.status); return (await r.json()) || {};
    },
    del: async function (base, box, tok) { try { await fetch(rurl(base, box + "/" + tok), { method: "DELETE" }); } catch (e) {} }
  };

  /* ————— الروابط القصيرة —————
     يُرفع النموذج مشفراً إلى /relay/L/<بصمة الرمز>، والرابط يحمل الرمز فقط (11 حرفاً).
     مفتاح فك التشفير مشتق من الرمز، فلا يستطيع الوسيط قراءة المحتوى. */
  SL.DEFAULT_RELAY = "https://samt-app-4132d-default-rtdb.europe-west1.firebasedatabase.app";
  var B56 = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  function code(n) { var s = ""; while (s.length < n) { var a = new Uint8Array(n * 2); crypto.getRandomValues(a); for (var i = 0; i < a.length && s.length < n; i++) if (a[i] < 224) s += B56[a[i] % 56]; } return s; }
  async function codeKey(c) { var b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("samt-link|" + c)); return b64u(new Uint8Array(b)); }
  async function codeId(c) { return (await SL.sha256("samt-lid|" + c)).slice(0, 24); }
  SL.linkRelay = function (base) { var h = ""; try { h = new URL(base).hostname; } catch (e) {} return /^(localhost|127\.)/.test(h) ? new URL(base).origin : SL.DEFAULT_RELAY; };
  SL.short = {
    put: async function (relay, obj) { var c = code(11); await SL.relay.put(relay, "L", await codeId(c), await SL.seal(await codeKey(c), obj)); return c; },
    get: async function (relay, c) {
      var r = await fetch(rurl(relay, "L/" + (await codeId(c))), { cache: "no-store" });
      if (!r.ok) throw new Error("relay " + r.status);
      var v = await r.json(); if (!v) throw new Error("gone");
      return SL.open(await codeKey(c), v);
    },
    del: async function (relay, c) { if (c) await SL.relay.del(relay, "L", await codeId(c)); },
    url: function (base, c) { return base + (/github\.io\/$/.test(base) ? "s#" : "s.html#") + c; }
  };
  /* يعيد رابطاً قصيراً إن أمكن، وإلا الرابط الكامل */
  SL.makeLink = async function (base, page, relay, obj) {
    try {
      if (String(relay || "").replace(/\/+$/, "") === SL.linkRelay(base).replace(/\/+$/, "")) { var c = await SL.short.put(relay, obj); return { url: SL.short.url(base, c), code: c }; }
    } catch (e) {}
    return { url: base + page + "#" + (await SL.pack(obj)), code: "" };
  };

  /* قاعدة الروابط العامة (صفحة التوقيع وصفحة المعلم) */
  SL.base = function (configured) {
    if (configured) return String(configured).replace(/\/?$/, "/");
    if (/^https?:/.test(location.protocol)) return location.href.replace(/[#?].*$/, "").replace(/[^/]*$/, "");
    return "";
  };
})();

/* سَمْت — أيقونات خطية موحّدة (SVG) */
(function () {
  "use strict";
  var P = {
    home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V20h5v-6h4v6h5V9.5"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.8c1.9.8 3.1 2.5 3.5 5.2"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    alert: '<path d="M12 3 2.5 20h19L12 3z"/><path d="M12 10v4.5M12 17.5v.01"/>',
    more: '<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>',
    star: '<path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/>',
    calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
    pen: '<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4z"/><path d="m13.5 6.5 4 4"/>',
    inbox: '<path d="M3.5 13.5 6 5h12l2.5 8.5V19a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 19z"/><path d="M3.5 13.5H8l1.5 2.5h5l1.5-2.5h4.5"/>',
    check: '<circle cx="12" cy="12" r="9"/><path d="m8 12.3 2.7 2.7L16.2 9.5"/>',
    doc: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4M9 12h6M9 16h6"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M4.2 5.6l2.1 2.1M17.7 16.3l2.1 2.1M2.5 12h3M18.5 12h3M4.2 18.4l2.1-2.1M17.7 7.7l2.1-2.1"/>',
    upload: '<path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v3.5A1.5 1.5 0 0 0 5.5 21h13a1.5 1.5 0 0 0 1.5-1.5V16"/>',
    teacher: '<circle cx="12" cy="7" r="3.5"/><path d="M5 21v-2.5A5.5 5.5 0 0 1 10.5 13h3a5.5 5.5 0 0 1 5.5 5.5V21"/>',
    list: '<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="18" r="1"/>',
    shield: '<path d="M12 3 4.5 6v5.5c0 4.6 3.1 8.2 7.5 9.5 4.4-1.3 7.5-4.9 7.5-9.5V6z"/><path d="m9 12 2.2 2.2L15.5 10"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>',
    whatsapp: '<path d="M4 20l1.2-3.9A8.5 8.5 0 1 1 8 19z"/><path d="M9 8.8c0 3.4 2.8 6.2 6.2 6.2l1.3-1.5-2-1-1 .9a4.3 4.3 0 0 1-2.9-2.9l.9-1-1-2z"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/>',
    chevron: '<path d="m14.5 6-6 6 6 6"/>',
    download: '<path d="M12 4v12M7 11l5 5 5-5"/><path d="M4 16v3.5A1.5 1.5 0 0 0 5.5 21h13a1.5 1.5 0 0 0 1.5-1.5V16"/>',
    folder: '<path d="M3.5 6.5A1.5 1.5 0 0 1 5 5h4.5l2 2H19a1.5 1.5 0 0 1 1.5 1.5V18a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 18z"/>'
  };
  window.SLI = function (name, cls) {
    return '<svg class="ic ' + (cls || "") + '" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + (P[name] || "") + "</svg>";
  };
})();

(function(){
"use strict";
/* قواعد السلوك والمواظبة لطلبة التعليم العام — الإصدار الخامس 1447هـ / 2025م
   ترميز المواد (6–16) للتعليم الحضوري، وجدول الحسم، والسلوك المتميز، والمواظبة (31–34).
   كل «إجراء» يحمل: نص البنود كما وردت + درجات الحسم + النماذج + أعلام تشغيلية للمحرك. */

const SOURCE = "قواعد السلوك والمواظبة لطلبة التعليم العام — الإصدار الخامس 1447هـ / 2025م";

const DEDUCT = { 1: 1, 2: 2, 3: 3, 4: 10, 5: 15 };
const DEGREE_NAME = { 1: "الأولى", 2: "الثانية", 3: "الثالثة", 4: "الرابعة", 5: "الخامسة" };

/* النماذج الرسمية (الملحق) — sign: من يوقّع؛ secret: سري؛ noWa: لا يُرسل بالواتساب إطلاقاً */
const FORMS = {
  F1:  { t: "نموذج الالتزام المدرسي", sign: ["student", "parent"] },
  F2:  { t: "نموذج رصد درجات السلوك المتميز", sign: ["principal"] },
  F3:  { t: "نموذج خطة تعديل السلوك", sign: ["counselor"] },
  F4:  { t: "نموذج رصد المعلم لمشكلة سلوكية", sign: ["teacher"] },
  F5:  { t: "نموذج رصد المشكلات السلوكية", sign: ["student", "parent", "principal"] },
  F6:  { t: "نموذج فرص تعويض درجات السلوك الإيجابي", sign: ["student", "principal"] },
  F7:  { t: "إحالة طالب", secret: true, sign: ["deputy"] },
  F8:  { t: "تعهد سلوكي", sign: ["student", "parent", "principal"] },
  F9:  { t: "إشعار ولي أمر الطالب بمشكلة سلوكية", secret: true, sign: ["parent", "principal"] },
  F10: { t: "خطاب دعوة ولي الأمر", sign: ["parent", "principal"], reply: true },
  F11: { t: "محضر ضبط واقعة", secret: true, sign: ["student", "parent", "principal"] },
  F12: { t: "محضر اجتماع لجنة التوجيه الطلابي بالمدرسة", secret: true, sign: ["principal"] },
  F13: { t: "نموذج إبلاغ عن حالة إيذاء لمركز البلاغات بوزارة الموارد البشرية والتنمية الاجتماعية", secret: true, noWa: true, sign: ["principal"] },
  F14: { t: "نموذج إبلاغ عن حالة عالية الخطورة", secret: true, noWa: true, sign: ["principal"] },
  F15: { t: "نموذج إجراءات الغياب بعذر", sign: ["student", "parent", "principal"] },
  F16: { t: "نموذج إجراءات الغياب بدون عذر", sign: ["student", "parent", "principal"] },
  F17: { t: "تعهد الالتزام بالحضور", sign: ["student", "parent", "principal"] }
};

const SIGNER = { student: "الطالب", parent: "ولي الأمر", principal: "مدير المدرسة", deputy: "وكيل شؤون الطلبة", counselor: "الموجه الطلابي", teacher: "المعلم" };

/* أعلام تشغيلية: notify=إشعار ولي الأمر، invite=دعوة حضورية، pledge=تعهد، refer=إحالة للموجه،
   plan=خطة تعديل سلوك، committee=لجنة التوجيه، report=محضر ضبط واقعة/مصادرة،
   classMove=نقل لفصل آخر، schoolMove=رفع لإدارة التعليم لنقل المدرسة، warnMove=إنذار كتابي بالنقل */
function step(title, actions, o) { return Object.assign({ title, actions }, o || {}); }

const T = {
  v1: "التنبيه الشفهي الأول من المعلم أو إدارة المدرسة للطالب عن السلوك والأضرار المترتبة عليه، وكونه سلوكاً غير مرغوب به وذلك بأسلوب تربوي حكيم.",
  v2: "التنبيه الشفهي الثاني من المعلم أو إدارة المدرسة عند مباشرة الموقف بأسلوب تربوي حكيم، وتعزيز السلوك الإيجابي.",
  obs: "ملاحظة الطالب وحصر السلوكيات السلبية والإيجابية، ومسببات حدوثها، والبدء بالحد من مسببات السلوك السلبي، وتعزيز السلوك الإيجابي.",
  log: "تدوين المشكلة السلوكية من المعلم المباشر للموقف في سجل المشكلات السلوكية وتوقيع الطالب عليها.",
  phone: "إشعار ولي أمر الطالب هاتفياً بمشكلة الطالب السلوكية.",
  d1: "حسم درجة من درجات السلوك الإيجابي للطالب من قبل إدارة المدرسة، مع تمكينه من فرص التعويض وإشعار ولي الأمر بذلك.",
  toC: "تحويل الطالب إلى الموجه الطلابي لدراسة حالته.",
  inv1: "دعوة ولي أمر الطالب وإخطاره بسلوك الطالب غير المرغوب فيه، والاتفاق على خطة لتعديل السلوك بين الأسرة والمدرسة يقوم بها الموجه الطلابي.",
  com: "تحويل الطالب إلى لجنة التوجيه الطلابي في المدرسة لبحث أسباب عدم استجابة الطالب لإجراءات تعديل السلوك، وإيجاد الحلول المناسبة للمشكلات السلوكية وفق تقرير دراسة الحالة من الموجه الطلابي في المدرسة.",
  fu: "متابعة حالة الطالب من قبل الموجه الطلابي لتقديم الخدمات التربوية.",
  phoneT: "إشعار ولي الأمر هاتفياً بمشكلة الطالب السلوكية والإجراءات المتخذة.",
  apol: "الاعتذار إلى من أساء إليهم.",
  fix: "إصلاح ما أتلفه الطالب أو إحضار بديل عنه.",
  plan: "دعوة ولي أمر الطالب، ومناقشته في خطة تعديل السلوك، ووضع برنامج وقائي مشترك مع الأسرة وأخذ تعهد خطي على الطالب بعدم تكرار السلوك غير المرغوب فيه، وتوقيع ولي الأمر بالعلم.",
  conf: "مصادرة ما بحوزة الطالب من مواد ممنوعة وإتلافها من قبل لجنة التوجيه الطلابي في المدرسة وذلك فيما لم يرد فيه نص نظامي وإعداد محضر بذلك.",
  cls: "نقل الطالب إلى فصل آخر وفقاً لقرار لجنة التوجيه الطلابي.",
  offic: "ترفع إدارة المدرسة رسمياً وبصفة عاجلة لإدارة التعليم محضر اجتماع لجنة التوجيه في المدرسة بخصوص القضية.",
  sch: "يصدر مدير التعليم قرار بنقل الطالب إلى مدرسة أخرى، مع استمراره بالدراسة حتى النقل، ومع الأخذ برأي ولي الأمر في المدرسة التي سينتقل إليها الطالب (وفي حال عدم موافقة ولي الأمر على المدرسة ينقل الطالب إلى أقرب مدرسة لمقر سكنه).",
  newC: "إحالة الحالة للموجه الطلابي في المدرسة المنقول إليها الطالب لتقديم برنامج تربوي يشتمل على جلسات في تعديل السلوك.",
  newP: "يُكتب تعهد خطي من قبل الطالب وبحضور ولي الأمر بالالتزام بالانضباط، والسلوك الحسن بعد استكمال البرنامج التربوي من قبل الموجه الطلابي.",
  newF: "متابعة الحالة من الموجه الطلابي في المدرسة المنقول إليها الطالب لتقديم الخدمات التربوية.",
  rep: "تُدوّن إدارة المدرسة محضراً لإثبات الواقعة.",
  invT: "دعوة ولي أمر الطالب، وتبليغه بمشكلة الطالب والإجراءات المترتبة على ذلك.",
  meet: "اجتماع لجنة التوجيه الطلابي في المدرسة بعد وقوع القضية مباشرة لدراسة ظروفها وملابساتها.",
  comp: "تمكين الطالب من فرص التعويض لتعديل سلوكه وتعويض الدرجات المحسومة في المدرسة المنقول إليها، وإشعار ولي أمره بذلك."
};

const NOTE_ALL = [
  "استدعاء الهلال الأحمر لنقل الطالب المصاب إلى أقرب مركز صحي (إذا تطلب الأمر ذلك).",
  "تبليغ الجهات الأمنية المختصة فور وقوع المشكلة، بعد إشعار ولي الأمر، وتوثيق الإجراءات المتخذة."
];
const NOTE_1919 = "في حال تصنيف المشكلة ضمن حالات الإيذاء والإهمال أو غيره الواردة في النظام، وبعد استنفاذ جميع الإجراءات الواردة في الدليل؛ فإنه يتم التواصل مباشرة مع مركز تلقي البلاغات (1919) للتبليغ عن الحالة وإكمال اللازم.";

/* الدرجة الأولى — مشتركة البنية بين المادتين 6 و10 */
const STEPS_DEG1 = [
  step("الإجراء الأول", [T.v1], { deduct: 0, forms: [] }),
  step("الإجراء الثاني", [T.v2, T.obs], { deduct: 0, forms: [] }),
  step("الإجراء الثالث", [T.log, T.phone, T.d1, "بعد تنفيذ الإجراء: " + T.toC], { deduct: 1, notify: true, refer: true, forms: ["F4", "F5", "F7"] }),
  step("الإجراء الرابع", [T.inv1, "حسم درجة من درجات السلوك الإيجابي للطالب مع تمكينه من فرص التعويض وإشعار ولي الأمر بذلك.", T.com, T.fu], { deduct: 1, invite: true, plan: true, committee: true, forms: ["F5", "F10", "F3", "F12"] })
];

const ARTICLES = [
  /* ———————————————— المرحلة الابتدائية ———————————————— */
  { id: 6, stage: "p", degree: 1, title: "المشكلات السلوكية من الدرجة الأولى للمرحلة الابتدائية",
    items: ["عدم التقيد بالزي المدرسي.", "التأخر الصباحي.", "عدم حضور الاصطفاف الصباحي -في حال كان الطالب متواجداً داخل المدرسة-.",
      "التأخر عن الاصطفاف الصباحي -في حال كان الطالب متواجداً داخل المدرسة- أو العبث أثناءه.", "التأخر في الدخول إلى الحصص.",
      "تناول الأطعمة أو المشروبات أثناء الدرس بدون استئذان.", "النوم داخل الفصل.", "تكرار خروج ودخول الطلبة من البوابة قبل وقت الحضور والانصراف.", "التجمهر أمام بوابة المدرسة."],
    steps: STEPS_DEG1, notes: [] },

  { id: 7, stage: "p", degree: 2, title: "المشكلات السلوكية من الدرجة الثانية للمرحلة الابتدائية",
    items: ["عدم حضور الحصة الدراسية أو الهروب منها.", "الدخول أو الخروج من الفصل دون استئذان.", "دخول فصل آخر دون استئذان.",
      "إثارة الفوضى داخل الفصل أو المدرسة أو في وسائل النقل المدرسي.", "الشجار أو الاشتراك في مضاربة جماعية.", "الإشارة بحركات مخلة بالأدب تجاه الطلبة.",
      "التلفظ بكلمات نابية على الطلبة، أو تهديدهم، أو السخرية منهم.", "إلحاق الضرر المتعمد بممتلكات الطلبة.",
      "العبث بتجهيزات المدرسة أو مبانيها (كأجهزة الحاسوب، أدوات ومعدات الأمن والسلامة المدرسية، الكهرباء، المعامل، حافلة المدرسة، والكتابة على الجدار وغيره).", "امتهان الكتب الدراسية."],
    steps: [
      step("الإجراء الأول", ["تحويل الطالب إلى إدارة المدرسة لاتخاذ ما يلي:", "إشعار ولي الأمر هاتفياً بمشكلة الطالب السلوكية والإجراءات المتخذة.",
        "حسم درجتين من درجات السلوك الإيجابي للطالب، مع تمكينه من فرص التعويض وإشعار ولي الأمر بذلك.", T.apol, T.fix, "إحالة الطالب للموجه الطلابي لدراسة حالته."],
        { deduct: 2, notify: true, refer: true, forms: ["F5", "F9", "F7"] }),
      step("الإجراء الثاني", ["جميع ما ذكر في الإجراء الأول مع تغيير إجراءات خطة تعديل السلوك.",
        "دعوة ولي أمر الطالب، ومناقشته في خطة تعديل السلوك، ووضع برنامج وقائي مشترك مع الأسرة وأخذ تعهد خطي على الطالب بعدم تكرار السلوك غير المرغوب فيه، وتوقيع ولي الأمر بالعلم.", T.fu],
        { deduct: 2, notify: true, refer: true, invite: true, plan: true, pledge: true, forms: ["F5", "F9", "F10", "F3", "F8"] }),
      step("الإجراء الثالث", ["جميع ما ذكر في الإجراء الثاني مع تغيير إجراءات خطة تعديل السلوك.", T.com, "نقل الطالب إلى فصل آخر وفقاً لقرار لجنة التوجيه الطلابي في المدرسة."],
        { deduct: 2, notify: true, invite: true, plan: true, pledge: true, committee: true, classMove: true, forms: ["F5", "F9", "F10", "F3", "F8", "F12"] })
    ], notes: NOTE_ALL },

  { id: 8, stage: "p", degree: 3, title: "المشكلات السلوكية من الدرجة الثالثة للمرحلة الابتدائية",
    items: ["إلحاق الضرر المتعمد بتجهيزات المدرسة أو مبانيها (كأجهزة الحاسوب، أدوات ومعدات الأمن والسلامة المدرسية، الكهرباء، المعامل، الحافلة المدرسية).",
      "سرقة شيء من ممتلكات الطلبة أو المدرسة.", "التعرض لأحد الطلبة بالضرب.", "التصوير أو التسجيل الصوتي للطلبة.", "الهروب من المدرسة.",
      "التوقيع عن ولي الأمر من غير علمه على المكاتبات المتبادلة بين المدرسة وولي الأمر.",
      "إحضار أو استخدام المواد أو الألعاب الخطرة إلى المدرسة، مثل (الألعاب النارية، البخاخات الغازية الملونة، المواد الكيميائية)."],
    steps: [
      step("الإجراء الأول", ["تحويل الطالب إلى إدارة المدرسة لاتخاذ ما يلي:", T.plan,
        "حسم ثلاث درجات من درجات السلوك الإيجابي للطالب، مع تمكينه من فرص التعويض وإشعار ولي الأمر بذلك.", T.apol, T.fix, T.conf, "إحالة الطالب إلى الموجه الطلابي لدراسة حالته."],
        { deduct: 3, notify: true, invite: true, plan: true, pledge: true, refer: true, report: true, forms: ["F5", "F9", "F10", "F3", "F8", "F7", "F11"] }),
      step("الإجراء الثاني", ["تحويل الطالب لإدارة المدرسة لاتخاذ ما يلي:", "جميع ما ذكر في الإجراء الأول مع تغيير إجراءات خطة تعديل السلوك.",
        "نقل الطالب إلى فصل آخر وفقاً لقرار لجنة التوجيه الطلابي.", T.fu],
        { deduct: 3, notify: true, invite: true, plan: true, pledge: true, committee: true, classMove: true, forms: ["F5", "F9", "F10", "F3", "F8", "F12"] }),
      step("الإجراء الثالث", ["تحويل الطالب إلى إدارة المدرسة لاتخاذ ما يلي:", "جميع ما ذكر في الإجراء الثاني، مع تغيير إجراءات خطة تعديل السلوك.", T.offic, T.sch, T.newC, T.newP, T.newF],
        { deduct: 3, notify: true, invite: true, pledge: true, committee: true, schoolMove: true, forms: ["F5", "F9", "F10", "F8", "F12"] })
    ], notes: NOTE_ALL },

  { id: 9, stage: "p", degree: 4, title: "المشكلات السلوكية من الدرجة الرابعة للمرحلة الابتدائية",
    items: ["الإساءة أو الاستهزاء بشيء من شعائر الإسلام.", "الإساءة للدولة أو رموزها.", "التحرش الجنسي.", "إشعال النار داخل المدرسة.", "حيازة السجائر بأنواعها.",
      "التدخين بأنواعه داخل المدرسة.", "حيازة آلة حادة (مثل السكاكين).", "الجرائم المعلوماتية بكافة أنواعها.",
      "المظاهر أو الصور أو الشعارات التي تدل على الشذوذ الجنسي أو الترويج لها.", "التنمّر بجميع أنواعه وأشكاله.", "حيازة أو عرض المواد الإعلامية الممنوعة المقروءة، أو المسموعة، أو المرئية."],
    steps: [
      step("الإجراء", ["تحويل الطالب إلى إدارة المدرسة لاتخاذ ما يلي:",
        "دعوة ولي أمر الطالب، وتوضيح الإجراءات المترتبة على هذا السلوك، ومناقشته في خطة تعديل السلوك، ووضع برنامج وقائي مشترك مع الأسرة، وأخذ تعهد خطي على الطالب بعدم تكرار السلوك غير المرغوب فيه وتوقيع ولي الأمر بالعلم.",
        "حسم عشر درجات من درجات السلوك الإيجابي للطالب، مع تمكينه من فرص التعويض وإشعار ولي الأمر بذلك.", T.apol, T.toC, T.offic, T.sch, T.newC, T.newP, T.newF],
        { deduct: 10, notify: true, invite: true, plan: true, pledge: true, refer: true, committee: true, schoolMove: true, forms: ["F5", "F9", "F10", "F3", "F8", "F7", "F12"] })
    ], notes: NOTE_ALL.concat([NOTE_1919]) },

  /* ———————————————— المرحلتان المتوسطة والثانوية ———————————————— */
  { id: 10, stage: "ms", degree: 1, title: "المشكلات السلوكية من الدرجة الأولى للمرحلة المتوسطة والثانوية",
    items: ["التأخر الصباحي.", "عدم حضور الاصطفاف الصباحي -في حال كان الطالب متواجداً داخل المدرسة-.",
      "التأخر عن الاصطفاف الصباحي -في حال كان الطالب متواجداً داخل المدرسة- أو العبث أثناءه.", "التأخر في الدخول إلى الحصص.",
      "إعاقة سير الحصص الدراسية مثل: الحديث الجانبي، المقاطعة المستمرة غير الهادفة لشرح المعلم، تناول الأطعمة أو المشروبات أثناء الدرس.",
      "النوم داخل الفصل.", "تكرار خروج ودخول الطلبة من البوابة قبل وقت الحضور والانصراف.", "التجمهر أمام بوابة المدرسة."],
    steps: STEPS_DEG1, notes: [] },

  { id: 11, stage: "ms", degree: 2, title: "المشكلات السلوكية من الدرجة الثانية للمرحلة المتوسطة والثانوية",
    items: ["عدم حضور الحصة الدراسية أو الهروب منها.", "الدخول أو الخروج من الفصل دون استئذان.", "دخول فصل آخر دون استئذان.",
      "إثارة الفوضى داخل الفصل أو المدرسة أو في وسائل النقل المدرسي."],
    steps: [
      step("الإجراء الأول", ["تحويل الطالب إلى إدارة المدرسة لاتخاذ ما يلي:", "إشعار ولي الأمر هاتفياً بمشكلة الطالب السلوكية والإجراءات المتخذة.",
        "حسم درجتين من درجات السلوك الإيجابي للطالب، مع تمكينه من فرص التعويض لتعديل سلوكه ولتعويض الدرجات المحسومة، وإشعار ولي الأمر بذلك.",
        "أخذ تعهد خطي على الطالب بعدم تكرار المخالفة.", T.toC],
        { deduct: 2, notify: true, pledge: true, refer: true, forms: ["F5", "F9", "F8", "F7"] }),
      step("الإجراء الثاني", ["جميع ما ذكر في الإجراء الأول.", "دعوة ولي أمر الطالب حضورياً، ومناقشته في خطة تعديل السلوك، ووضع برنامج وقائي مشترك مع الأسرة، وتوقيع ولي الأمر بالعلم.", T.fu],
        { deduct: 2, notify: true, pledge: true, refer: true, invite: true, plan: true, forms: ["F5", "F9", "F8", "F10", "F3"] }),
      step("الإجراء الثالث", ["تنفيذ جميع ما ذكر في الإجراء الثاني.", "نقل الطالب إلى فصل آخر وفقاً لقرار لجنة التوجيه الطلابي في المدرسة.",
        "تحويل الطالب المخالف إلى لجنة التوجيه الطلابي في المدرسة لوضع الحلول المناسبة لمخالفته، وفقاً لتقرير دراسة الحالة من الموجه الطلابي في المدرسة."],
        { deduct: 2, notify: true, pledge: true, invite: true, plan: true, committee: true, classMove: true, forms: ["F5", "F9", "F8", "F10", "F3", "F12"] })
    ], notes: [] },

  { id: 12, stage: "ms", degree: 3, title: "المشكلات السلوكية من الدرجة الثالثة للمرحلة المتوسطة والثانوية",
    items: ["عدم التقيد بالزي المدرسي.", "الشجار أو الاشتراك في مضاربة جماعية.", "الإشارة بحركات مخلة بالأدب تجاه الطلبة.",
      "التلفظ بكلمات نابية على الطلبة، أو تهديدهم، أو السخرية منهم.", "إلحاق الضرر المتعمد بممتلكات الطلبة.",
      "العبث بتجهيزات المدرسة أو مبانيها (كأجهزة الحاسوب، أدوات ومعدات الأمن والسلامة المدرسية، الكهرباء، المعامل، حافلة المدرسة، والكتابة على الجدار وغيره).",
      "إحضار المواد أو الألعاب الخطرة إلى المدرسة دون استخدامها، وذلك مثل (الألعاب النارية، البخاخات الغازية الملونة، المواد الكيميائية).",
      "حيازة السجائر بأنواعها.", "حيازة المواد الإعلامية الممنوعة المقروءة، أو المسموعة، أو المرئية.",
      "التوقيع عن ولي الأمر من غير علمه على المكاتبات المتبادلة بين المدرسة وولي الأمر.", "امتهان الكتب الدراسية."],
    steps: [
      step("الإجراء الأول", ["تحويل الطالب إلى إدارة المدرسة لاتخاذ ما يلي:",
        "دعوة ولي أمر الطالب، وتوضيح الإجراءات المترتبة على هذا السلوك في حال تكراره، ومناقشته في خطة تعديل السلوك، ووضع برنامج وقائي مشترك مع الأسرة، وأخذ تعهد خطي على الطالب بعدم تكرار السلوك غير المرغوب فيه وتوقيع ولي الأمر بالعلم.",
        "حسم ثلاث درجات من درجات السلوك الإيجابي للطالب، مع تمكينه من فرص التعويض وإشعار ولي الأمر بذلك.", T.apol, T.fix, T.conf, T.toC],
        { deduct: 3, notify: true, invite: true, plan: true, pledge: true, refer: true, report: true, forms: ["F5", "F9", "F10", "F3", "F8", "F7", "F11"] }),
      step("الإجراء الثاني", ["تحويل الطالب إلى إدارة المدرسة لاتخاذ ما يلي:", "تنفيذ جميع ما ورد في الإجراء الأول.",
        "دعوة ولي أمر الطالب، وإنذار الطالب كتابياً بالنقل إلى مدرسة أخرى في حال تكرار المخالفة، وتوقيع ولي الأمر بالعلم بذلك.",
        "تحويل الحالة إلى لجنة التوجيه الطلابي في المدرسة لوضع الحلول المناسبة لمخالفته وفقاً لتقرير دراسة الحالة من الموجه الطلابي في المدرسة.",
        "نقل الطالب المخالف سلوكياً إلى فصل آخر وفقاً لقرار لجنة التوجيه الطلابي في المدرسة.", T.fu],
        { deduct: 3, notify: true, invite: true, plan: true, pledge: true, committee: true, classMove: true, warnMove: true, forms: ["F5", "F9", "F10", "F3", "F8", "F12"] }),
      step("الإجراء الثالث", ["تحويل الطالب إلى إدارة المدرسة لاتخاذ ما يلي:", "تنفيذ جميع ما ورد في الإجراء الأول.", T.offic,
        "يصدر مدير التعليم قرار بنقل الطالب إلى مدرسة أخرى (الصفين الثاني والثالث الثانوي يتم التعامل معهم وفق نظام المسارات) مع استمراره بالدراسة حتى النقل، مع الأخذ برأي ولي الأمر في المدرسة التي سينتقل إليها الطالب (وفي حال عدم موافقة ولي الأمر على المدرسة يتم نقل الطالب إلى أقرب مدرسة لمقر سكنه).",
        "متابعة الحالة من الموجه الطلابي في المدرسة المنقول إليها الطالب لتقديم الخدمات التربوية."],
        { deduct: 3, notify: true, invite: true, pledge: true, committee: true, schoolMove: true, forms: ["F5", "F9", "F10", "F8", "F12"] })
    ], notes: NOTE_ALL },

  { id: 13, stage: "ms", degree: 4, title: "المشكلات السلوكية من الدرجة الرابعة للمرحلة المتوسطة والثانوية",
    items: ["تعمد إصابة أحد الطلبة عن طريق الضرب باليد أو استخدام أدوات غير حادة تحدث إصابة (جرحاً، أو نزفاً، أو كسراً).",
      "سرقة شيء من ممتلكات الطلبة أو المدرسة.", "التصوير أو التسجيل الصوتي للطلبة.",
      "إلحاق الضرر المتعمد بتجهيزات المدرسة أو مبانيها (كأجهزة الحاسوب، أدوات ومعدات الأمن والسلامة المدرسية، الكهرباء، المعامل، الحافلة المدرسية).",
      "التدخين بأنواعه داخل المدرسة.", "الهروب من المدرسة.",
      "إحضار أو استخدام المواد أو الألعاب الخطرة إلى المدرسة، مثل (الألعاب النارية، البخاخات الغازية الملونة، المواد الكيميائية).",
      "عرض أو توزيع المواد الإعلامية الممنوعة المقروءة أو المسموعة أو المرئية."],
    steps: [
      step("الإجراء الأول", ["إحالة الطالب من قبل إدارة المدرسة إلى لجنة التوجيه الطلابي لدراسة مشكلته السلوكية بعد حدوثها مباشرة لاتخاذ ما يلي:",
        "دعوة ولي أمر الطالب، وتوضيح الإجراءات المترتبة على هذا السلوك في حال تكراره، ومناقشة خطة تعديل السلوك، ووضع برنامج وقائي مشترك مع الأسرة، وأخذ تعهد خطي على الطالب بعدم تكرار السلوك غير المرغوب فيه، وإنذاره بالنقل إلى مدرسة أخرى في حالة إعادة تكرار المشكلة، وتوقيع ولي الأمر بالعلم.",
        "حسم عشر درجات من درجات السلوك الإيجابي للطالب، مع تمكينه من فرص التعويض، وإشعار ولي الأمر بذلك.", "تقديم الاعتذار لمن أُسيء إليهم.",
        "إصلاح ما أتلفه الطالب أو إحضار بديل عنه، وإشعار ولي الأمر بذلك.",
        "مصادرة ما بحوزة الطالب من مواد ممنوعة، وإتلافها (وذلك فيما لم يرد فيه نص نظامي)، وإعداد محضر بذلك من قبل لجنة التوجيه الطلابي في المدرسة.",
        "نقل الطالب من فصل إلى آخر وفقاً لقرار لجنة التوجيه الطلابي في المدرسة.", "متابعة حالة الطالب من الموجه الطلابي، وتقديم الخدمات التربوية."],
        { deduct: 10, notify: true, invite: true, plan: true, pledge: true, committee: true, report: true, classMove: true, warnMove: true, forms: ["F5", "F9", "F10", "F3", "F8", "F11", "F12"] }),
      step("الإجراء الثاني", ["تنفيذ جميع ما ورد في الإجراء الأول، باستثناء نقل الطالب من الفصل.",
        "رفع محضر اجتماع لجنة التوجيه في المدرسة إلى إدارة التعليم رسمياً وبصفة عاجلة بخصوص القضية.",
        "إصدار قرار من مدير التعليم بنقل الطالب إلى مدرسة أخرى (الصفين الثاني والثالث الثانوي يتم التعامل معهم وفق نظام المسارات)، مع استمراره بالدراسة حتى النقل، وأخذ رأي ولي الأمر في المدرسة التي سينتقل إليها الطالب (وفي حال عدم موافقة ولي الأمر على المدرسة، يتم نقل الطالب إلى أقرب مدرسة لمقر سكنه).",
        "تمكين الطالب من فرص التعويض لتعديل سلوكه وتعويض الدرجات المحسومة في المدرسة المنقول إليها، وإشعار ولي أمره بذلك.",
        "متابعة الحالة من الموجه الطلابي في المدرسة المنقول إليها الطالب، وتقديم الخدمات التربوية."],
        { deduct: 10, notify: true, invite: true, pledge: true, committee: true, report: true, schoolMove: true, forms: ["F5", "F9", "F10", "F8", "F11", "F12"] })
    ], notes: NOTE_ALL.concat([NOTE_1919]) },

  { id: 14, stage: "ms", degree: 5, title: "المشكلات السلوكية من الدرجة الخامسة للمرحلة المتوسطة والثانوية",
    items: ["الإساءة أو الاستهزاء بشيء من شعائر الإسلام.", "الإساءة للدولة أو رموزها.",
      "بث أو ترويج أفكار ومعتقدات متطرفة، أو تكفيرية، أو إلحادية، أو مسيئة لنظم المجتمع السياسية والاجتماعية.",
      "الإساءة إلى الأديان السماوية، أو إثارة كل ما يسبب العنصرية، أو الفتن القبلية، أو الطائفية، أو المذهبية.",
      "التزوير أو الاستخدام أو الاستفادة من الوثائق، أو الأختام الرسمية بطريقة غير مشروعة نظاماً.", "التحرش الجنسي.",
      "المظاهر أو الصور أو الشعارات التي تدل على الشذوذ الجنسي أو الترويج لها.", "إشعال النار داخل المدرسة.",
      "حيازة أو استخدام أو تهديد الطلبة بالأسلحة النارية أو ما في حكمها (مثل: السكاكين والأدوات الحادة والرصاص بدون مسدس).",
      "حيازة، أو تعاطي، أو ترويج المخدرات، أو المسكرات.", "الجرائم المعلوماتية بكافة أنواعها.", "ابتزاز الطلبة.", "التنمر بجميع أنواعه وأشكاله."],
    steps: [
      step("الإجراء", [T.rep, T.invT,
        "حسم خمس عشرة درجة من درجات السلوك الإيجابي للطالب، مع تمكينه من فرص التعويض لتعديل سلوكه وتعويض الدرجات المحسومة في المدرسة المنقول إليها، وإشعار ولي أمره بذلك.",
        T.meet, "متابعة الحالة من الموجه الطلابي وتقديم الخدمات التربوية.", "رفع محضر اجتماع لجنة التوجيه الطلابي في المدرسة بخصوص القضية إلى إدارة التعليم رسمياً وبصفة عاجلة.",
        "إصدار قرار من مدير التعليم بنقل الطالب إلى مدرسة أخرى (الصفين الثاني والثالث الثانوي يتم التعامل معهم وفق نظام المسارات)، مع استمراره بالدراسة حتى النقل، وأخذ رأي ولي الأمر في المدرسة التي سينتقل إليها الطالب (وفي حال عدم موافقته، يتم نقل الطالب إلى أقرب مدرسة لمقر سكنه).",
        "متابعة الحالة من الموجه الطلابي في المدرسة المنقول إليها الطالب، وتقديم الخدمات التربوية."],
        { deduct: 15, notify: true, invite: true, committee: true, report: true, schoolMove: true, forms: ["F11", "F5", "F9", "F10", "F12"] })
    ], notes: NOTE_ALL.concat([NOTE_1919]) },

  /* ———————————————— تجاه الهيئة التعليمية والإدارية (جميع المراحل) ———————————————— */
  { id: 15, stage: "all", degree: 4, title: "المشكلات السلوكية من الدرجة الرابعة للطلبة (جميع المراحل الدراسية) تجاه الهيئة التعليمية والإدارية",
    items: ["تهديد المعلمين أو الإداريين، أو من في حكمهم من منسوبي المدرسة.", "التلفظ بألفاظ غير لائقة تجاه المعلمين، أو الإداريين، أو من في حكمهم من منسوبي المدرسة.",
      "السخرية من المعلمين، أو الإداريين، أو من في حكمهم من منسوبي المدرسة، قولاً أو فعلاً.",
      "التوقيع عن أحد منسوبي المدرسة على المكاتبات المتبادلة بين المدرسة وأولياء الأمور.",
      "تصوير المعلمين، أو الإداريين، أو من في حكمهم من منسوبي المدرسة، أو التسجيل الصوتي لهم (ما لم يؤخذ إذن خطي بالموافقة الصريحة على ذلك)."],
    steps: [
      step("الإجراء الأول", ["إحالة الطالب من قبل إدارة المدرسة إلى لجنة التوجيه الطلابي لدراسة مشكلته السلوكية بعد حدوثها مباشرة وتتخذ معه ما يلي:",
        "دعوة ولي أمر الطالب، وتوضيح الإجراءات المترتبة على هذا السلوك في حال تكراره، ومناقشته في خطة تعديل السلوك، ووضع برنامج وقائي مشترك مع الأسرة، وأخذ تعهد خطي على الطالب بعدم تكرار السلوك غير المرغوب فيه، وإنذاره بالنقل إلى مدرسة أخرى في حالة إعادة تكرار المشكلة، وتوقيع ولي الأمر بالعلم.",
        "حسم عشر درجات من درجات السلوك الإيجابي للطالب، مع تمكينه من فرص التعويض وإشعار ولي الأمر بذلك.",
        "مصادرة ما بحوزة الطالب من مواد وإتلافها وذلك فيما لم يرد فيه نص نظامي من قبل لجنة التوجيه الطلابي في المدرسة وإعداد محضر بذلك.",
        "الاعتذار لمن أُسيء إليهم.", "نقل الطالب إلى فصل آخر وفقاً لقرار لجنة التوجيه الطلابي في المدرسة.", T.toC],
        { deduct: 10, notify: true, invite: true, plan: true, pledge: true, committee: true, report: true, classMove: true, warnMove: true, refer: true, forms: ["F5", "F9", "F10", "F3", "F8", "F11", "F12", "F7"] }),
      step("الإجراء الثاني", ["تنفيذ جميع ما ورد في الإجراء الأول -باستثناء نقل الطالب من الفصل-.", T.offic,
        "يصدر مدير التعليم قرار بنقل الطالب إلى مدرسة أخرى (الصفين الثاني والثالث الثانوي يتم التعامل معهم وفق نظام المسارات) مع استمراره بالدراسة حتى النقل، ومع الأخذ برأي ولي الأمر في المدرسة التي سينتقل إليها الطالب (وفي حال عدم موافقة ولي الأمر على المدرسة يتم نقل الطالب إلى أقرب مدرسة لمقر سكنه).",
        "تمكين الطالب من فرص التعويض لتعديل سلوكه وتعويض الدرجات المحسومة في المدرسة المنقول إليها، وإشعار ولي أمره بذلك.",
        "متابعة الحالة من الموجه الطلابي في المدرسة المنقول إليها الطالب لتقديم الخدمات التربوية."],
        { deduct: 10, notify: true, invite: true, pledge: true, committee: true, report: true, schoolMove: true, forms: ["F5", "F9", "F10", "F8", "F11", "F12"] })
    ], notes: [NOTE_ALL[1]] },

  { id: 16, stage: "all", degree: 5, title: "المشكلات السلوكية من الدرجة الخامسة للطلبة (جميع المراحل الدراسية) تجاه الهيئة التعليمية والإدارية",
    items: ["إلحاق الضرر بممتلكات المعلمين أو الإداريين، أو من في حكمهم من منسوبي المدرسة، أو سرقتها.",
      "الإشارة بحركات مخلة بالأدب تجاه المعلمين أو الإداريين، أو من في حكمهم من منسوبي المدرسة.",
      "الاعتداء بالضرب على المعلمين أو الإداريين أو من في حكمهم من منسوبي المدرسة.",
      "ابتزاز المعلمين، أو الإداريين، أو من في حكمهم من منسوبي المدرسة.", "الجرائم المعلوماتية تجاه المعلمين، أو الإداريين، أو من في حكمهم من منسوبي المدرسة."],
    steps: [
      step("الإجراء", [T.rep, T.invT,
        "حسم خمس عشرة درجة من درجات السلوك الإيجابي للطالب، مع تمكينه من فرص التعويض لتعديل سلوكه وتعويض الدرجات المحسومة في المدرسة المنقول إليها، وإشعار ولي أمره بذلك.",
        "اجتماع لجنة التوجيه الطلابي في المدرسة بعد وقوع القضية مباشرة لدراسة ظروفها وملابساتها.", "إصلاح ما أتلفه الطالب أو إحضار بديل عنه، وإشعار ولي الأمر بذلك.",
        "تقديم الاعتذار لمن أُسيء إليهم.", "رفع محضر اجتماع لجنة التوجيه في المدرسة رسمياً وبصفة عاجلة إلى إدارة التعليم بخصوص القضية.",
        "إصدار قرار من مدير التعليم بنقل الطالب إلى مدرسة أخرى (الصفين الثاني والثالث الثانوي يتم التعامل معهم وفق نظام المسارات)، مع استمراره بالدراسة حتى النقل، وأخذ رأي ولي الأمر في المدرسة التي سينتقل إليها الطالب (وفي حال عدم موافقته، يتم نقل الطالب إلى أقرب مدرسة لمقر سكنه).",
        "متابعة الحالة من الموجه الطلابي في المدرسة المنقول إليها الطالب، وتقديم الخدمات التربوية."],
        { deduct: 15, notify: true, invite: true, committee: true, report: true, schoolMove: true, forms: ["F11", "F5", "F9", "F10", "F12"] })
    ], notes: [NOTE_ALL[1]] }
];

/* ممارسات السلوك المتميز المقترحة (المادة 5) — الدرجة لكل مشاركة */
const MERITS = [
  { id: "m1", t: "انضباط الطالب وعدم غيابه بدون عذر خلال الفصل الدراسي", pts: 6, once: true },
  { id: "m2", t: "المشاركة في الخدمة المجتمعية خارج المدرسة", pts: 6 },
  { id: "m3", t: "تقديم فعالية حوارية", pts: 6 },
  { id: "m4", t: "المشاركة في حملة توعوية", pts: 6 },
  { id: "m5", t: "عرض تجارب شخصية ناجحة", pts: 6 },
  { id: "m6", t: "الالتحاق ببرنامج أو دورة", pts: 6 },
  { id: "m7", t: "مهارات الاتصال (العمل الجماعي، التعلم بالأقران...)", pts: 4 },
  { id: "m8", t: "مهارات القيادة والمسؤولية (التخطيط، التحفيز...)", pts: 4 },
  { id: "m9", t: "المهارات الرقمية (إعداد العروض، تصميم المحتوى الإلكتروني)", pts: 4 },
  { id: "m10", t: "مهارة إدارة الوقت", pts: 4 },
  { id: "m11", t: "كتابة رسالة شكر (للوطن، للقيادة الرشيدة، للأسرة، للمعلم...)", pts: 2 },
  { id: "m12", t: "المشاركة في الإذاعة", pts: 2 },
  { id: "m13", t: "تقديم مقترح لصالح المجتمع المدرسي", pts: 2 },
  { id: "m14", t: "التعاون مع الزملاء والمعلمين وإدارة المدرسة", pts: 2 },
  { id: "m15", t: "سلوك متميز غير مذكور (تقدّره المدرسة بتوصية لجنة التوجيه الطلابي بما لا يتجاوز ست درجات)", pts: 6, custom: true }
];
const MERIT_TOPICS = ["الولاء للقيادة والوطن", "تاريخ المملكة أو أحد رموزها", "تعزيز اللغة العربية", "التوعية بالاعتدال ونبذ التطرف",
  "تعزيز التسامح والاحترام ونبذ التمييز والعنصرية", "تعزيز الرفق ونبذ العنف", "تنمية مهارات الحوار", "الحد من التنمر", "أخطار المخدرات",
  "المهارات النفسية والاجتماعية", "التطوير الشخصي", "الاعتناء بالبيئة المدرسية"];
const VALUES = ["الانتماء الوطني", "الانضباط", "العزيمة", "التسامح", "الأمانة", "التعاون"];

/* المواظبة — المادتان 33 و34 */
const ABSENCE = {
  ex: { article: 33, title: "إجراءات التعامل مع الطلبة المتغيبين بعذر خلال العام الدراسي", form: "F15",
    levels: [
      { days: 3, short: "تحويل للموجه الطلابي (خطة التعلم) واستدعاء ولي الأمر", actions: ["تحويل الطالب للموجه الطلابي لتقديم الدعم والخدمات التربوية المناسبة له (خطة التعلم في أيام الغياب)، ودراسة الحالة إذا احتاج الأمر.",
        "استدعاء ولي الأمر، وعقد اجتماع حضوري معه يتضمن: إبلاغه بالإجراءات المترتبة على غياب ابنه، وتقييم الخدمات التربوية والخطة العلاجية المقدمة للطالب وتحديثها بما يلزم وفق الحالة."], invite: true },
      { days: 5, short: "إحالة للجنة التوجيه وجلسة توعوية لولي الأمر", actions: ["في حال عدم التزام ولي الأمر بالخطة التربوية (خطة التعلم في أيام الغياب)، يُحال الطالب إلى لجنة التوجيه الطلابي، ويتم تنظيم جلسة توعوية مع ولي الأمر للتأكيد على أهمية اتباع الخطط التربوية والعلاجية."], committee: true },
      { days: 10, short: "مخاطبة الجهات المختصة وإشعار إدارة التعليم", actions: ["في حال الاشتباه بتعرض الطالب للإهمال تخاطب المدرسة الجهات ذات الاختصاص حيال تطبيق ما ورد في نظام حماية الطفل ونظام الحماية من الإيذاء ولائحتيهما التنفيذية، وإشعار إدارة التعليم بذلك.",
        "تتخذ المدرسة الإجراءات النظامية المطلوبة بالتنسيق والمتابعة مع الجهات ذات الاختصاص حيال ما تم من إجراءات للحالات المحالة لهم."], authorities: true }
    ] },
  un: { article: 34, title: "إجراءات التعامل مع الطلبة المتغيبين بدون عذر خلال العام الدراسي", form: "F16",
    levels: [
      { days: 3, short: "تحويل للموجه الطلابي واستدعاء ولي الأمر وأخذ التعهد", actions: ["تحويل الطالب للموجه الطلابي لدراسة الحالة وتقديم الخدمات التربوية المناسبة له.",
        "عند استمرار الغياب يُستدعى ولي الأمر، ويُعقد اجتماع حضوري معه يتضمن: إبلاغه بالإجراءات المترتبة على غياب ابنه، وتقييم الخدمات التربوية والخطة العلاجية وتحديثها، وأخذ التعهد الخطي من الطالب وولي الأمر بالالتزام بالخطة المقدمة.",
        "استمرار تقديم الخدمات التربوية للطالب ومتابعة حالته."], invite: true, pledge: true },
      { days: 5, short: "استدعاء ولي الأمر وإحالة للجنة التوجيه الطلابي", actions: ["استدعاء ولي الأمر لمناقشة أسباب الغياب.", "إحالة الطالب للجنة التوجيه الطلابي، وعقد اجتماع لمراجعة الخطة التربوية والعلاجية المقدمة للطالب وتحديثها بما يلزم وفق الحالة.",
        "استمرار تقديم الخدمات التربوية للطالب ومتابعة حالته.", "تنبيه ولي الأمر بالإجراءات المترتبة على استمرار غياب ابنه."], invite: true, committee: true },
      { days: 10, short: "مخاطبة الجهات المختصة وإشعار إدارة التعليم", actions: ["مخاطبة الجهات ذات الاختصاص من قبل المدرسة حيال تطبيق ما ورد في نظام حماية الطفل ونظام الحماية من الإيذاء ولائحتيهما التنفيذية، مع إشعار إدارة التعليم بذلك.",
        "متابعة الإجراءات والتنسيق من قبل المدرسة بعد اتخاذ الإجراءات النظامية المطلوبة مع الجهات ذات الاختصاص حيال ما تم من إجراءات للحالات المحالة لهم."], authorities: true }
    ],
    consecutive: "في حال كانت أيام الغياب متصلة (3 أيام أو أكثر) تخاطب المدرسة الجهات ذات الاختصاص حيال تطبيق ما ورد في نظام حماية الطفل ونظام الحماية من الإيذاء ولائحتيهما التنفيذية." },
  notes: ["تُحسم درجة واحدة من درجات المواظبة عن غياب كل يوم دراسي بدون عذر (المادة 31/7).",
    "يُحرم الطالب من الانتقال في حال تجاوز نسبة غيابه بدون عذر (10%) خلال العام الدراسي (المادة 31/3).",
    "يُمنح الطالب وولي أمره مهلة ثلاثة أيام عمل بعد الغياب لتقديم العذر (المادة 31/6)."]
};

/* قواعد عامة من المادة 28 يطبّقها المحرك أو يذكّر بها */
const GENERAL = {
  highest: "عند ارتكاب الطالب أكثر من مشكلة سلوكية في وقت واحد تُتخذ إجراءات المشكلة الأعلى درجة (المادة 28/11).",
  repeat: "يُطبق الإجراء التالي مباشرة عند تكرار الطالب لنفس المشكلة السلوكية (المادة 28/15)، وكذلك بعد منحه فرصة التعويض (المادة 28/34).",
  refuse: "يُوثّق رفض الطالب المخالف سلوكياً أو ولي أمره توقيع التعهد، مع الاستمرار في بقية الإجراءات (المادة 28/16).",
  noShow: "في حال عدم حضور ولي الأمر بعد إبلاغه يتم تنفيذ الإجراءات بحضوره أو بدونه، مع إبلاغ مركز الحماية وتوثيق ذلك (المادة 28/17).",
  exhausted: "إحالة وضع الطالب المخالف سلوكياً إلى إدارة التعليم بعد استنفاد المدرسة لجميع الإجراءات المنصوص عليها في الدرجات الأولى والثانية والثالثة (المادة 28/18).",
  lastWeek: "يُؤجَّل قرار نقل الطالب المخالف سلوكياً إلى بداية الفصل الدراسي القادم إذا ارتكب المشكلة خلال الأسبوع الأخير من الدراسة أو أثناء الاختبارات النهائية (المادة 28/21).",
  counselor: "عدم إشراك الموجه الطلابي في رصد درجات السلوك ولا في تنفيذ الإجراءات الواجب تنفيذها على الطالب المخالف سلوكياً (المادة 28/4–5).",
  secret: "الحفاظ على سرية معلومات الطالب المخالف سلوكياً والإجراءات المتخذة بحقه من قبل إدارة المدرسة (المادة 28/28).",
  noor: "توثيق المشكلات السلوكية والإجراءات المتخذة حيالها على الطالب في نظام نور (دور إدارة المدرسة 13).",
  qualitative: "التقدير الكيفي لسلوك الصفين الأول والثاني الابتدائي (المادة 5/1) — لا تُحسم درجات.",
  exam: "عند ارتكاب الطالب مشكلة سلوكية قبل أسبوع من الاختبارات النهائية أو أثناءها، تُتاح له فرص التعويض في الدرجات المحسومة إلى نهاية العام الدراسي (المادة 28/36).",
  abuse: "حالات الإيذاء والإهمال لا تتطلب التدرج: إبلاغ المدير فوراً وبشكل سري، ثم مركز البلاغات 1919 عند الحاجة (المادة 29)."
};

const EMERGENCY = [
  { n: "1919", t: "مركز بلاغات العنف الأسري وحماية الطفل" },
  { n: "911", t: "الجهات الأمنية" },
  { n: "937", t: "وزارة الصحة" }
];

/* مساعدات */
function articlesFor(stage) {
  const s = stage === "p" ? "p" : "ms";
  return ARTICLES.filter(a => a.stage === s || a.stage === "all");
}
function articleById(id) { return ARTICLES.find(a => a.id === +id); }
function stageOf(schoolStage) { return /ابتدائ/.test(schoolStage || "") ? "p" : "ms"; }

window.RULES = { SOURCE, DEDUCT, DEGREE_NAME, FORMS, SIGNER, ARTICLES, MERITS, MERIT_TOPICS, VALUES, ABSENCE, GENERAL, EMERGENCY, articlesFor, articleById, stageOf };
})();

/* سَمْت — النماذج الرسمية (ملحق قواعد السلوك والمواظبة) كنماذج بيانات تُعرض بـ SL.renderDoc */
(function () {
  "use strict";
  var R = window.RULES, SL = window.SL;
  var F = window.FORMS = {};
  var D = "…………………";

  function degName(n) { return n ? "الدرجة " + R.DEGREE_NAME[n] : ""; }
  function stuFields(c, extra) {
    var s = c.student || {};
    var rows = [["اسم الطالب", s.name, 1], ["المرحلة", c.stageLabel || ""], ["الصف", s.grade || ""], ["الفصل", s.section || ""]];
    return rows.concat(extra || []);
  }
  function sgn(c, roles) {
    return roles.map(function (r) {
      var nm = r === "principal" ? c.school.principal : r === "deputy" ? c.school.deputy : r === "counselor" ? c.school.counselor : r === "student" ? (c.student || {}).name : r === "parent" ? (c.student || {}).parentName : r === "teacher" ? c.teacherName : "";
      var lbl = { student: "الطالب", parent: "ولي الأمر", principal: "مدير المدرسة", deputy: "وكيل شؤون الطلبة", counselor: "القائم بتعديل السلوك (الموجه الطلابي)", teacher: "المعلم" }[r];
      return { role: r, label: lbl, name: nm || "" };
    });
  }
  function incLine(c) { var i = c.incident || {}; return i.itemText || ""; }
  function when(c) { var i = c.incident || {}; return i.date ? SL.dayName(i.date) + " " + SL.hijri(i.date) + " الموافق " + SL.greg(i.date) : D; }

  /* 1 — الالتزام المدرسي */
  F.F1 = function (c) {
    var s = c.student || {};
    return { id: "F1", title: R.FORMS.F1.t,
      fields: [["الاسم", s.name, 1], ["المرحلة", c.stageLabel], ["الصف", (s.grade || "") + (s.section ? " / " + s.section : "")]],
      blocks: [
        { k: "h", t: "خاص بالطالب" },
        { k: "p", t: "نعم أنا الطالب الموضح اسمه وبياناته أعلاه. قد اطلعت على محتوى قواعد السلوك والمواظبة. وبناء عليه أتعهد أن ألتزم بالأنظمة والتعليمات الخاصة بقواعد السلوك والمواظبة." },
        { k: "h", t: "خاص بولي الأمر" },
        { k: "p", t: "نعم أنا ولي أمر الطالب الموضح اسمه وبياناته أعلاه. قد اطلعت على محتوى قواعد السلوك والمواظبة. وبناء عليه أتعهد أن أتعاون مع إدارة المدرسة في سبيل مصلحة ابني، ليكون ملتزماً بالأنظمة والتعليمات الخاصة بقواعد السلوك والمواظبة، وأتحمل مسؤولية صحة أرقام التواصل التالية:" },
        { k: "fields", rows: [["اسم ولي الأمر", s.parentName, 1], ["رقم الجوال", SL.showPhone(s.parentPhone)], ["رقم آخر", SL.showPhone(s.parentPhone2)]] }
      ],
      signers: sgn(c, ["student", "parent"]),
      footer: ["ملحوظة: يؤخذ توقيع الطالب وولي الأمر في بداية العام الدراسي، وتحفظ النماذج في ملف خاص لدى وكيل شؤون الطلبة."] };
  };

  /* 2 — رصد درجات السلوك المتميز */
  F.F2 = function (c) {
    var rows = (c.merits || []).map(function (m) { return [m.topic || "", m.practice || "", SL.hijri(m.date), m.evidence || "", String(m.pts), m.by || "", ""]; });
    while (rows.length < 4) rows.push(["", "", "", "", "", "", ""]);
    return { id: "F2", title: R.FORMS.F2.t, fields: [["اسم الطالب", c.student.name, 1], ["المرحلة", c.stageLabel], ["الصف", c.student.grade]],
      blocks: [{ k: "table", head: ["موضوع ممارسة السلوك المتميز", "نوع ممارسة السلوك المتميز", "تاريخ التنفيذ", "شواهد السلوك المتميز", "الدرجة المكتسبة", "اسم راصد السلوك", "توقيع راصد السلوك"], rows: rows }],
      signers: sgn(c, ["principal"]) };
  };

  /* 3 — خطة تعديل السلوك */
  F.F3 = function (c) {
    var i = c.incident || {}, p = i.plan || {};
    return { id: "F3", title: R.FORMS.F3.t,
      blocks: [
        { k: "h", t: "أولاً: البيانات الأولية" },
        { k: "fields", rows: [["اسم الطالب", c.student.name, 1], ["الصف", c.student.grade], ["الفصل", c.student.section], ["تاريخ البداية", p.start ? SL.hijri(p.start) : ""], ["تاريخ النهاية", p.end ? SL.hijri(p.end) : ""]] },
        { k: "h", t: "ثانياً: تحديد المشكلة السلوكية" },
        { k: "fields", rows: [["المشكلة السلوكية", incLine(c), 1], ["درجتها", degName(i.degree)], ["وصف المشكلة السلوكية", i.desc || "", 1], ["المظاهر السلوكية التي تبدو عند الطالب", p.signs || "", 1]] },
        { k: "h", t: "ثالثاً: قياس شدة أو تكرار السلوك" },
        { k: "table", head: ["اليوم", "التاريخ", "فترة الملاحظة", "1", "2", "3", "4", "5", "المجموع"], rows: [["", "", "", "", "", "", "", "", ""]] },
        { k: "h", t: "رابعاً: تحديد المشكلة السلوكية" },
        { k: "fields", rows: [["المثيرات القبلية للسلوك", p.pre || "", 1], ["المثيرات البعدية", p.post || "", 1], ["ما الذي يحققه الطالب من خلال السلوك غير المرغوب فيه؟", p.gain || "", 1], ["الإجراءات السابقة التي تم استخدامها للحد من السلوك", p.prev || "", 1]] },
        { k: "h", t: "خامساً: تصميم خطة تعديل السلوك" },
        { k: "fields", rows: [["تعريف السلوك المرغوب في إكسابه للطالب إجرائياً", p.target || "", 1]] },
        { k: "ol", items: (p.steps && p.steps.length ? p.steps : ["", "", "", ""]).map(function (x, n) { return "الإجراء " + (n + 1) + ": " + (x || D); }) },
        { k: "h", t: "متابعة السلوك" },
        { k: "table", head: ["اليوم", "التاريخ", "فترة الملاحظة", "1", "2", "3", "4", "5", "المجموع"], rows: [["", "", "", "", "", "", "", "", ""]] },
        { k: "h", t: "سادساً: تقييم فاعلية الخطة أو البرنامج" },
        { k: "fields", rows: [["رأي وكيل المدرسة", p.evalDeputy || "", 1], ["رأي معلم الفصل", p.evalTeacher || "", 1], ["رأي ولي الأمر", p.evalParent || "", 1]] }
      ],
      signers: sgn(c, ["counselor"]) };
  };

  /* 4 — رصد المعلم لمشكلة سلوكية */
  F.F4 = function (c) {
    var rows = (c.teacherRows || []).map(function (r, n) { return [String(n + 1), r.name, r.item, degName(r.degree), r.action || "", r.response || "", String(r.count || 1), SL.hijri(r.date), r.period || ""]; });
    while (rows.length < 5) rows.push(["", "", "", "", "", "", "", "", ""]);
    return { id: "F4", title: R.FORMS.F4.t, fields: [["المادة", c.subject || ""], ["الصف", c.classLabel || ""]],
      blocks: [{ k: "table", head: ["م", "اسم الطالب", "المشكلة السلوكية", "درجة المشكلة", "الإجراء المتخذ", "مدى الاستجابة", "عدد مرات تكرار المشكلة السلوكية", "التاريخ", "الحصة"], rows: rows }],
      signers: sgn(c, ["teacher"]) };
  };

  /* 5 — رصد المشكلات السلوكية (سجل الطالب) */
  F.F5 = function (c) {
    var rows = (c.history || []).map(function (h) {
      return [h.itemText, degName(h.degree), SL.hijri(h.date), String(h.deduct || 0), h.actionsText || "", h.actionDate ? SL.hijri(h.actionDate) : "", h.sigStudent ? { svg: h.sigStudent } : "", h.sigParent ? { svg: h.sigParent } : ""];
    });
    while (rows.length < 3) rows.push(["", "", "", "", "", "", "", ""]);
    return { id: "F5", title: R.FORMS.F5.t, fields: [["اسم الطالب", c.student.name, 1], ["الصف", c.student.grade], ["الفصل", c.student.section]],
      blocks: [{ k: "table", head: ["المشكلة السلوكية", "نوعها ودرجتها", "تاريخها", "درجات السلوك المحسومة", "الإجراءات المتخذة", "تاريخ الإجراء", "توقيع الطالب", "توقيع ولي الأمر"], rows: rows }],
      signers: sgn(c, ["principal"]) };
  };

  /* 6 — فرص تعويض درجات السلوك الإيجابي */
  F.F6 = function (c) {
    var rows = (c.compRows || []).map(function (r) { return [r.itemText, degName(r.degree), String(r.deduct || 0), r.chance || "", String(r.gained || ""), ""]; });
    while (rows.length < 3) rows.push(["", "", "", "", "", ""]);
    return { id: "F6", title: R.FORMS.F6.t, fields: [["اسم الطالب", c.student.name, 1], ["المرحلة", c.stageLabel], ["الصف", c.student.grade]],
      blocks: [{ k: "table", head: ["المشكلة السلوكية", "نوعها ودرجتها", "درجات السلوك المحسومة", "فرص التعويض", "الدرجات المكتسبة", "توقيع الطالب"], rows: rows }],
      signers: sgn(c, ["principal"]) };
  };

  /* 7 — إحالة طالب (سري) */
  F.F7 = function (c) {
    var i = c.incident || {};
    return { id: "F7", title: R.FORMS.F7.t, secret: 1, stamp: true,
      blocks: [
        { k: "p", t: "المكرم الموجه الطلابي", c: "b" }, { k: "p", t: "السلام عليكم ورحمة الله وبركاته", c: "center" },
        { k: "p", t: "نحيل إليكم الطالب: " + c.student.name + " بالصف: " + (c.student.grade || D) + (c.student.section ? " / " + c.student.section : "") + " ذي المشكلة السلوكية من " + degName(i.degree) + " وهي: " + incLine(c) },
        { k: "p", t: "يرجى منكم متابعة الطالب ودراسة حالته، ووضع الحلول التربوية والعلاجية المناسبة." }
      ],
      signers: sgn(c, ["deputy"]) };
  };

  /* 8 — تعهد سلوكي */
  F.F8 = function (c) {
    var i = c.incident || {};
    return { id: "F8", title: R.FORMS.F8.t,
      blocks: [
        { k: "fields", rows: [["أنا الطالب", c.student.name, 1], ["بالصف", (c.student.grade || "") + (c.student.section ? " / " + c.student.section : ""), 1], ["أنني قمت في يوم", when(c), 1], ["بمشكلة سلوكية من", degName(i.degree), 1], ["وهي", incLine(c), 1]] },
        { k: "p", t: "وأتعهد بعدم تكرار أي مشكلة سلوكية مستقبلاً وعلى ذلك جرى التوقيع." }
      ].concat(i.warnMove ? [{ k: "note", t: "وقد أُنذرت كتابياً بالنقل إلى مدرسة أخرى في حال تكرار المخالفة، وفق قواعد السلوك والمواظبة." }] : []),
      signers: sgn(c, ["student", "parent", "principal"]) };
  };

  /* 9 — إشعار ولي الأمر بمشكلة سلوكية (سري) */
  F.F9 = function (c) {
    var i = c.incident || {}, acts = (i.notifyActions && i.notifyActions.length ? i.notifyActions : ["", "", ""]);
    return { id: "F9", title: R.FORMS.F9.t, secret: 1, stamp: true,
      blocks: [
        { k: "fields", rows: [["المكرم ولي أمر الطالب", c.student.name, 1], ["بالصف", (c.student.grade || "") + (c.student.section ? " / " + c.student.section : ""), 1]] },
        { k: "p", t: "السلام عليكم ورحمة الله وبركاته", c: "center" },
        { k: "p", t: "نشعركم بأن الطالب قام بمشكلة سلوكية من " + degName(i.degree) + " وهي: " + incLine(c) },
        { k: "p", t: "وقد قُررت الإجراءات التالية حياله وفق ما ورد في قواعد السلوك والمواظبة:" },
        { k: "ol", items: acts },
        { k: "p", t: "لذا يرجى منكم المتابعة والتعاون مع المدرسة بما يسهم في انضباط سلوك ابنكم." }
      ],
      signers: sgn(c, ["principal", "parent"]).map(function (s) { if (s.role === "parent") s.label = "ولي الأمر (إقرار بالعلم)"; return s; }) };
  };

  /* 10 — خطاب دعوة ولي الأمر */
  F.F10 = function (c) {
    var i = c.incident || {}, m = i.meeting || {};
    var reply = { k: "reply", options: ["أقر بالعلم، وسأحضر في الموعد المحدد.", "أقر بالعلم، وأرغب بتغيير الموعد (خلال نفس الأسبوع)."], chosen: m.reply == null ? null : m.reply, extra: m.altDate ? "الموعد المقترح: " + m.altDate : "" };
    return { id: "F10", title: R.FORMS.F10.t, stamp: true,
      blocks: [
        { k: "fields", rows: [["المكرم ولي أمر الطالب", c.student.name, 1], ["بالصف", (c.student.grade || "") + (c.student.section ? " / " + c.student.section : ""), 1]] },
        { k: "p", t: "السلام عليكم ورحمة الله وبركاته", c: "center" },
        { k: "p", t: "نأمل منكم الحضور إلى المدرسة في يوم " + (m.date ? SL.dayName(m.date) + " الموافق " + SL.hijri(m.date) + (m.time ? " الساعة " + m.time : "") : D) + " لمقابلة مدير المدرسة، وذلك بهدف: " + (m.purpose || "مناقشة وضع الطالب السلوكي والإجراءات المتخذة وفق قواعد السلوك والمواظبة.") },
        { k: "p", t: "شاكرين لكم تعاونكم معنا لتحقيق مصلحة الطالب.", c: "center" },
        reply
      ],
      signers: sgn(c, ["principal", "parent"]) };
  };

  /* 11 — محضر ضبط واقعة (سري) */
  F.F11 = function (c) {
    var i = c.incident || {}, ev = i.evidence || {}, w = (i.witnesses || []).slice();
    var rows = w.map(function (x, n) { return [String(n + 1), x.name || "", x.job || "", x.task || "", ""]; });
    while (rows.length < 3) rows.push([String(rows.length + 1), "", "", "", ""]);
    return { id: "F11", title: R.FORMS.F11.t, secret: 1,
      fields: [["اسم الطالب", c.student.name, 1], ["المرحلة", c.stageLabel], ["الصف", c.student.grade], ["المشكلة السلوكية", incLine(c), 1], ["درجتها", degName(i.degree)]],
      blocks: [
        { k: "p", t: "نوع المشاهدة المضبوطة:", c: "b" },
        { k: "checks", items: [["صور", !!ev.photo], ["مقاطع فيديو", !!ev.video], ["محادثات", !!ev.chat], ["أخرى: " + (ev.other || ""), !!ev.other]] },
        { k: "fields", rows: [["مكان ضبط الواقعة", i.place || "", 1]] },
        { k: "p", t: "شهود الواقعة:", c: "b" },
        { k: "table", head: ["م", "الاسم", "الوظيفة", "العمل المسند إليه", "التوقيع"], rows: rows }
      ],
      signers: sgn(c, ["student", "parent", "principal"]) };
  };

  /* 12 — محضر اجتماع لجنة التوجيه الطلابي (سري) */
  F.F12 = function (c) {
    var i = c.incident || {}, cm = i.committee || {}, mem = c.committeeMembers || [];
    var rows = [["وكيل المدرسة لشؤون الطلبة", "رئيس"], ["وكيل المدرسة للشؤون التعليمية", "عضو"], ["الموجه الطلابي", "مقرر"], ["معلم متميز", "عضو"], ["معلم متميز", "عضو"], ["معلم متميز", "عضو"]]
      .map(function (r, n) { return [String(n + 1), (mem[n] || ""), r[0], r[1], ""]; });
    return { id: "F12", title: R.FORMS.F12.t, secret: 1,
      blocks: [
        { k: "fields", rows: [["عناصر الاجتماع", cm.agenda || ("دراسة حالة الطالب: " + c.student.name + " — " + (c.student.grade || "")), 1],
          ["وصف المشكلة السلوكية", (incLine(c) + (i.desc ? " — " + i.desc : "")), 1],
          ["تصنيف المشكلة السلوكية درجة ونوعاً", degName(i.degree) + " — المادة (" + (i.articleId || "") + ")", 1],
          ["قرارات اللجنة", cm.decisions || "", 1]] },
        { k: "p", t: "أعضاء لجنة التوجيه الطلابي:", c: "b" },
        { k: "table", head: ["م", "اسم العضو المشارك", "الوظيفة", "العمل المسند إليه", "التوقيع"], rows: rows }
      ],
      signers: sgn(c, ["principal"]) };
  };

  /* 13 — إبلاغ عن حالة إيذاء (سري للغاية — لا يُرسل بالواتساب) */
  F.F13 = function (c) {
    var a = c.abuse || {}, s = c.student || {};
    return { id: "F13", title: R.FORMS.F13.t, secret: 2, stamp: true,
      fields: [["اليوم", SL.dayName(a.date || Date.now())], ["الساعة", a.time || ""], ["التاريخ", SL.hijri(a.date || Date.now())]],
      blocks: [
        { k: "h", t: "بيانات الحالة المتعرضة للعنف" },
        { k: "fields", rows: [["الاسم", s.name], ["العمر", a.age || ""], ["الحالة الاجتماعية", a.social || ""], ["الجنس", a.gender || "ذكر"], ["رقم السجل المدني", s.sid], ["الجنسية", a.nationality || ""], ["رقم الهاتف", ""], ["رقم الجوال", SL.showPhone(s.parentPhone)], ["العنوان", a.address || "", 1]] },
        { k: "h", t: "اسم الجهة المبلغة" },
        { k: "fields", rows: [["اسم المبلغ", a.reporter || c.school.principal], ["رقم السجل المدني", a.reporterSid || ""], ["الجنسية", a.reporterNat || ""], ["رقم الجوال", a.reporterPhone || ""], ["العنوان", c.school.name, 1]] },
        { k: "fields", rows: [["ملخص المشكلة", a.summary || "", 1], ["أبرز الإجراءات المتخذة", a.actions || "", 1]] }
      ],
      signers: sgn(c, ["principal"]) };
  };

  /* 14 — إبلاغ عن حالة عالية الخطورة */
  F.F14 = function (c) {
    var a = c.abuse || {}, ch = a.checks || {};
    return { id: "F14", title: R.FORMS.F14.t, secret: 2,
      fields: [["اسم الطالب", c.student.name, 1], ["الصف الدراسي", c.student.grade]],
      blocks: [
        { k: "fields", rows: [["وصف الحالة", a.summary || "", 1], ["اسم راصد الحالة", a.reporter || ""], ["تاريخ الرصد", SL.hijri(a.date || Date.now())], ["وقت الرصد", a.time || ""]] },
        { k: "p", t: "الإجراءات المتخذة مع الحالة:", c: "b" },
        { k: "checks", items: [["تبليغ إدارة التعليم.", !!ch.edu], ["تبليغ الجهات الأمنية.", !!ch.police], ["تبليغ الحماية من العنف الأسري وحماية الطفل.", !!ch.p1919], ["تبليغ وزارة الصحة.", !!ch.health],
          ["التواصل مع الأسرة لإخطارها بوضع الحالة.", !!ch.family], ["عقد اجتماع طارئ للجنة التوجيه الطلابي لدراسة الحالة ووضع خطة لمعالجتها بالتكامل مع الجهات ذات العلاقة.", !!ch.committee], ["رفع بلاغ عن الحالة في الأنظمة التقنية الخاصة بالبلاغات.", !!ch.system]] }
      ],
      signers: sgn(c, ["principal"]) };
  };

  /* 15/16 — إجراءات الغياب */
  function absForm(id, c, kind) {
    var a = c.absence || {}, done = a.done || {}, cfg = R.ABSENCE[kind];
    var levels = kind === "un" ? [{ d: 3, l: "3 أيام" }, { d: "3c", l: "3 أيام متصلة" }, { d: 5, l: "5 أيام" }, { d: 10, l: "10 أيام" }] : [{ d: 3, l: "3 أيام" }, { d: 5, l: "5 أيام" }, { d: 10, l: "10 أيام" }];
    var rows = levels.map(function (L) {
      var k = kind + L.d, x = done[k] || {};
      var r = [L.l, x.text || "", x.date ? SL.hijri(x.date) : "", x.sigStudent ? { svg: x.sigStudent } : "", x.sigParent ? { svg: x.sigParent } : ""];
      if (kind === "un") r.push(x.deducted != null ? String(x.deducted) : "");
      return r;
    });
    var head = ["عدد أيام الغياب", "الإجراء المتخذ", "تاريخ الإجراء", "توقيع الطالب", "توقيع ولي الأمر"];
    if (kind === "un") head.push("عدد درجات المواظبة المحسومة");
    return { id: id, title: R.FORMS[id].t, fields: [["اسم الطالب", c.student.name, 1], ["المرحلة", c.stageLabel], ["الصف", c.student.grade]],
      blocks: [{ k: "table", head: head, rows: rows }, { k: "note", t: "المرجع: المادة (" + cfg.article + ") " + cfg.title + "." }],
      signers: sgn(c, ["principal"]) };
  }
  F.F15 = function (c) { return absForm("F15", c, "ex"); };
  F.F16 = function (c) { return absForm("F16", c, "un"); };

  /* 17 — تعهد الالتزام بالحضور */
  F.F17 = function (c) {
    var a = c.absence || {};
    return { id: "F17", title: R.FORMS.F17.t,
      blocks: [
        { k: "fields", rows: [["أنا الطالب", c.student.name, 1], ["بالصف", (c.student.grade || "") + (c.student.section ? " / " + c.student.section : ""), 1],
          ["أنني تغيبت عن الحضور للمدرسة بدون عذر لمدة", (a.un != null ? a.un + " أيام" : D) + (a.range ? "، بتاريخ " + a.range : ""), 1]] },
        { k: "p", t: "وأتعهد بالالتزام بالخطة التربوية والعلاجية المقدمة لتحسين الحضور، وعلى ذلك جرى التوقيع." }
      ],
      signers: sgn(c, ["student", "parent", "principal"]) };
  };

  F.build = function (id, ctx) { return F[id] ? F[id](ctx) : null; };
})();

/* سَمْت — الحالة والمحرك والأدوات العامة للواجهة */
(function () {
  "use strict";
  var R = window.RULES, SL = window.SL, C = window.SLCore;
  var A = window.APP = { S: null };
  var e = SL.esc;

  /* ————— الحالة والتخزين ————— */
  var TYPES = { stu: "students", stf: "staff", inc: "incidents", mer: "merits", sig: "sigs", abs: "absences", log: "log" };
  /* الخدمة الرسمية لسَمْت: صفحتا التوقيع والرصد + صندوق البريد المشفّر */
  A.BASE = "https://samt-app.github.io/";
  A.RELAY = "https://samt-app-4132d-default-rtdb.europe-west1.firebasedatabase.app";
  A.defaults = function () {
    return {
      schools: [], schoolWa: "", relayUrl: A.RELAY, publicBase: A.BASE, box: SL.rid(22), linkHours: 72, pin: "",
      wahajCode: "", wahajCodes: {}, useLogo: true, lastBackup: 0,
      tpl: {
        sign: "المكرم ولي أمر الطالب {الطالب}\nالسلام عليكم ورحمة الله وبركاته\nنأمل التكرم بالاطلاع على «{النموذج}» والتوقيع عليه عبر الرابط التالي:\n{الرابط}\nللتحقق يُطلب آخر 4 أرقام من السجل المدني للطالب، والرابط صالح {المدة} ساعة.\n{المدرسة}",
        notify: "المكرم ولي أمر الطالب {الطالب}\nالسلام عليكم ورحمة الله وبركاته\nنفيدكم بوجود ملاحظة سلوكية تخص ابنكم، نأمل التواصل مع وكيل شؤون الطلبة أو مراجعة المدرسة.\n{المدرسة}",
        absence: "المكرم ولي أمر الطالب {الطالب}\nالسلام عليكم ورحمة الله وبركاته\nنفيدكم بأن غياب ابنكم {النوع} بلغ {العدد} أيام، ونأمل مراجعة المدرسة لمقابلة الموجه الطلابي وفق قواعد السلوك والمواظبة.\n{المدرسة}",
        counselorLink: "الأستاذ {المعلم} — الموجه الطلابي\nالسلام عليكم ورحمة الله وبركاته\nهذا رابط الرصد الخاص بك، ويشمل جميع طلاب المدرسة. ما ترصده يصل إلى جهاز المدرسة ويُعتمد من الإدارة:\n{الرابط}\n{المدرسة}",
        teacherLink: "الأستاذ {المعلم}\nالسلام عليكم ورحمة الله وبركاته\nهذا رابط رصد المشكلات السلوكية الخاص بك — يصل الرصد مباشرة إلى وكيل شؤون الطلبة:\n{الرابط}\n{المدرسة}",
        teacherDone: "الأستاذ {المعلم}\nتم اعتماد رصدك للطالب {الطالب} ({المشكلة}) واتخاذ: {الإجراء}.\nشكراً لتعاونك.\n{المدرسة}",
        referral: "المكرم الموجه الطلابي {الموجه}\nتمت إحالة الطالب {الطالب} ({الصف}) إليكم لدراسة حالته وفق قواعد السلوك والمواظبة. تفاصيل الإحالة لدى وكيل شؤون الطلبة.\n{المدرسة}"
      }
    };
  };
  A.load = async function () {
    var S = { settings: Object.assign(A.defaults(), (await C.DB.get("settings")) || {}) };
    S.settings.tpl = Object.assign(A.defaults().tpl, S.settings.tpl || {});
    if (!S.settings.relayUrl) S.settings.relayUrl = A.RELAY;
    if (!S.settings.publicBase && /samt-app\.github\.io$/.test(location.hostname)) S.settings.publicBase = A.BASE;
    var all = await C.DB.all();
    Object.keys(TYPES).forEach(function (t) { S[TYPES[t]] = []; });
    all.forEach(function (r) { if (TYPES[r.t]) S[TYPES[r.t]].push(r); });
    A.S = S;
    if (!(await C.DB.get("settings"))) await A.saveSettings();
    A.index();
    return S;
  };
  A.index = function () {
    var S = A.S; A.byId = {};
    ["students", "staff", "incidents", "merits", "sigs", "absences"].forEach(function (k) { S[k].forEach(function (r) { A.byId[r.id] = r; }); });
  };
  A.saveSettings = function () { return C.DB.set("settings", A.S.settings).then(function () { if (C.fsSchedule) C.fsSchedule(); }); };
  A.save = async function (rec) {
    rec.updatedAt = Date.now();
    var list = A.S[TYPES[rec.t]], i = list.findIndex(function (x) { return x.id === rec.id; });
    if (i < 0) list.push(rec); else list[i] = rec;
    A.byId[rec.id] = rec;
    await C.DB.put(rec); if (C.fsSchedule) C.fsSchedule();
    return rec;
  };
  A.saveMany = async function (recs) {
    recs.forEach(function (rec) {
      rec.updatedAt = Date.now();
      var list = A.S[TYPES[rec.t]], i = list.findIndex(function (x) { return x.id === rec.id; });
      if (i < 0) list.push(rec); else list[i] = rec; A.byId[rec.id] = rec;
    });
    await C.DB.putMany(recs); if (C.fsSchedule) C.fsSchedule();
  };
  A.remove = async function (rec) {
    var list = A.S[TYPES[rec.t]], i = list.findIndex(function (x) { return x.id === rec.id; });
    if (i >= 0) list.splice(i, 1); delete A.byId[rec.id];
    await C.DB.del(rec.id); if (C.fsSchedule) C.fsSchedule();
  };
  A.log = function (text, ref) { var r = { id: "L" + SL.rid(10), t: "log", at: Date.now(), text: text, ref: ref || "" }; A.S.log.push(r); C.DB.put(r); };

  /* ————— المدارس والطلاب ————— */
  /* مرحلتا المدرسة المدمجة */
  A.combinedStages = function (z) { return !z || !/^مدمجة/.test(z.stage || "") ? null : z.stage === "مدمجة-ث" ? ["متوسط", "ثانوي"] : ["ابتدائي", "متوسط"]; };
  A.school = function (id) { return A.S.settings.schools.find(function (s) { return s.id === id; }) || A.S.settings.schools[0] || { id: "", name: "", stage: "متوسط" }; };
  /* مرحلة الطالب: من نص الصف أولاً (يدعم المدرسة المدمجة: ابتدائي + متوسط)، ثم من مرحلة المدرسة */
  A.stageText = function (stu) {
    if (stu && stu.stageHint) return stu.stageHint;
    var g = String((stu && stu.grade) || "");
    if (/ابتدائ/.test(g)) return "ابتدائي"; if (/متوسط/.test(g)) return "متوسط"; if (/ثانو/.test(g)) return "ثانوي";
    var s = A.school(stu && stu.school).stage || "";
    if (s === "مدمجة-ث") return "متوسط"; /* متوسط + ثانوي: الافتراضي متوسط، وطلاب الثانوي يُحددون من «تحديد مراحل الطلاب» أو من نص الصف */
    if (/مدمج/.test(s)) return A.gradeNum(g) >= 4 ? "ابتدائي" : "متوسط"; /* الصفوف 4–6 ابتدائية حتماً؛ غيرها يُحدد من ملف الطالب */
    return s;
  };
  A.stageOf = function (stu) { return R.stageOf(A.stageText(stu)); };
  A.stageLabel = function (stu) { var s = A.stageText(stu); return /ابتدائ/.test(s) ? "الابتدائية" : /ثانو/.test(s) ? "الثانوية" : "المتوسطة"; };
  var ORD = { "الأول": 1, "الاول": 1, "أول": 1, "الثاني": 2, "ثاني": 2, "الثالث": 3, "ثالث": 3, "الرابع": 4, "الخامس": 5, "السادس": 6 };
  A.gradeNum = function (g) {
    var s = String(g || ""); var m = s.match(/\d+/); if (m) return +m[0];
    for (var k in ORD) if (s.indexOf(k) >= 0) return ORD[k];
    return 0;
  };
  A.qualitative = function (stu) { return A.stageOf(stu) === "p" && A.gradeNum(stu.grade) > 0 && A.gradeNum(stu.grade) <= 2; };
  /* مفتاح الفصل: يضاف اسم المرحلة إن لم يذكره الصف (لتمييز «الأول» الابتدائي عن «الأول» المتوسط في المدرسة المدمجة) */
  A.classKey = function (stu) {
    var g = stu.grade || "—", st = /ابتدائ|متوسط|ثانو/.test(g) ? "" : A.stageText(stu);
    return g + (st && (stu.stageHint || /مدمج/.test(A.school(stu.school).stage || "")) ? " " + (st === "ابتدائي" ? "الابتدائي" : st === "متوسط" ? "المتوسط" : "الثانوي") : "") + " / " + (stu.section || "—");
  };
  A.staffBy = function (role, school) {
    return A.S.staff.filter(function (x) { return x.role === role && (!school || !x.school || x.school === school); });
  };
  A.staffName = function (role, school) { var s = A.staffBy(role, school)[0]; return s ? s.name : ""; };
  A.norm = function (s) {
    return String(s || "").replace(/[ً-ْـ]/g, "").replace(/[أإآٱ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه").replace(/\s+/g, " ").trim();
  };

  /* ————— المحرك: تحديد الإجراء وفق التكرار ————— */
  A.plan = function (stu, artId, itemIdx, date, excludeId) {
    var art = R.articleById(artId); if (!art) return null;
    var t = new Date(date || Date.now()).getTime();
    var prior = A.S.incidents.filter(function (x) {
      return x.stu === stu.id && x.id !== excludeId && x.status !== "void" && x.status !== "reported" && x.art === art.id && x.item === +itemIdx && new Date(x.date).getTime() <= t;
    }).length;
    var n = art.steps.length, idx = Math.min(prior, n - 1), st = art.steps[idx];
    var qual = A.qualitative(stu);
    var warn = [];
    if (prior >= n && n > 1) warn.push(R.GENERAL.exhausted);
    if (prior >= n && n === 1) warn.push("تكرار لمشكلة إجراؤها واحد: تُطبق إجراءاتها كاملة مجدداً، ويُرفع الوضع لإدارة التعليم (المادة 28/18).");
    if (qual && st.deduct) warn.push(R.GENERAL.qualitative);
    if (art.degree >= 4) warn.push(R.GENERAL.abuse);
    var sameDay = A.S.incidents.filter(function (x) { return x.stu === stu.id && x.id !== excludeId && x.status !== "void" && SL.isoDay(x.date) === SL.isoDay(t); });
    if (sameDay.length) warn.push(R.GENERAL.highest + " — للطالب " + sameDay.length + " مخالفة أخرى في اليوم نفسه.");
    return { art: art, step: st, stepIdx: idx, prior: prior, total: n, deduct: qual ? 0 : (st.deduct || 0), qualitative: qual, warnings: warn, forms: st.forms.slice() };
  };

  /* ————— درجة السلوك (المادة 5): 80 إيجابي + 20 متميز، ولا تتجاوز 100 ————— */
  A.score = function (stu) {
    var ded = 0, mer = 0;
    A.S.incidents.forEach(function (x) { if (x.stu === stu.id && (x.status === "open" || x.status === "closed")) ded += x.deduct || 0; });
    A.S.merits.forEach(function (m) { if (m.stu === stu.id) mer += m.pts || 0; });
    var raw = 80 - ded + mer, total = Math.max(0, Math.min(100, raw));
    return { deducted: ded, merits: mer, total: total, positive: Math.max(0, Math.min(80, 80 - ded + mer)), excellent: Math.max(0, total - 80), qualitative: A.qualitative(stu) };
  };

  /* ————— سياق النماذج ————— */
  A.schoolCtx = function (stu) {
    var sc = A.school(stu && stu.school);
    return { id: sc.id, name: sc.name, region: sc.region || "", admin: sc.admin || "", principal: A.staffName("principal", sc.id), deputy: A.staffName("deputy", sc.id), counselor: A.staffName("counselor", sc.id) };
  };
  A.sigFor = function (ref, form, role) {
    return A.S.sigs.filter(function (g) { return g.ref === ref && g.form === form && g.role === role && (g.status === "signed" || g.status === "refused"); })
      .sort(function (a, b) { return (b.at || 0) - (a.at || 0); })[0];
  };
  A.pendingFor = function (ref, form, role) {
    return A.S.sigs.find(function (g) { return g.ref === ref && g.form === form && g.role === role && g.status === "pending" && g.exp > Date.now(); });
  };
  A.historyRows = function (stu, focusInc) {
    return A.S.incidents.filter(function (x) { return x.stu === stu.id && (x.status === "open" || x.status === "closed"); })
      .sort(function (a, b) { return new Date(a.date) - new Date(b.date); })
      .map(function (x) {
        var st = (R.articleById(x.art) || { steps: [] }).steps[x.stepIdx] || { title: "" };
        var gs = A.sigFor(x.id, "F5", "student"), gp = A.sigFor(x.id, "F5", "parent");
        return { itemText: x.itemText, degree: x.degree, date: x.date, deduct: x.deduct, actionsText: st.title + (x.stepNote ? " — " + x.stepNote : ""),
          actionDate: x.approvedAt || x.date, sigStudent: gs && gs.enc ? SL.sigSvg(gs.enc, 110, 40) : "", sigParent: gp && gp.enc ? SL.sigSvg(gp.enc, 110, 40) : "" };
      });
  };
  A.ctxFor = function (kind, ref, fid) {
    var stu, ctx;
    if (kind === "inc") {
      var inc = A.byId[ref]; stu = A.byId[inc.stu];
      var st = (R.articleById(inc.art) || { steps: [] }).steps[inc.stepIdx] || { actions: [] };
      var inc2 = Object.assign({}, inc, { articleId: inc.art, notifyActions: inc.notifyActions && inc.notifyActions.length ? inc.notifyActions : st.actions.filter(function (a) { return !/^تحويل الطالب إلى إدارة المدرسة/.test(a); }).slice(0, 6), warnMove: st.warnMove });
      var by = A.byId[inc.by];
      ctx = { incident: inc2, history: A.historyRows(stu), teacherName: inc.byName || (by && by.name) || "",
        teacherRows: [{ name: stu.name, item: inc.itemText, degree: inc.degree, action: st.title, count: (inc.prior || 0) + 1, date: inc.date, period: inc.period || "" }],
        subject: (by && by.subject) || "", classLabel: A.classKey(stu) };
    } else if (kind === "stu") {
      stu = A.byId[ref];
      ctx = { history: A.historyRows(stu) };
      ctx.merits = A.S.merits.filter(function (m) { return m.stu === stu.id; }).map(function (m) { var p = R.MERITS.find(function (x) { return x.id === m.practice; }); return { topic: m.topic, practice: (p ? p.t : "") + (m.note ? " — " + m.note : ""), date: m.date, evidence: m.evidence, pts: m.pts, by: m.byName }; });
      var mtxt = ctx.merits.map(function (m) { return m.practice; }).join("، ");
      ctx.compRows = A.S.incidents.filter(function (x) { return x.stu === stu.id && x.deduct && (x.status === "open" || x.status === "closed"); })
        .map(function (x) { return { itemText: x.itemText, degree: x.degree, deduct: x.deduct, chance: mtxt, gained: "" }; });
    } else if (kind === "abs") {
      var ab = A.byId[ref]; stu = A.byId[ab.stu];
      var done = {};
      Object.keys(ab.done || {}).forEach(function (k) {
        var d = ab.done[k], fid2 = k.indexOf("un") === 0 ? "F16" : "F15";
        var gs = A.sigFor(ab.id, fid2 + ":" + k, "student"), gp = A.sigFor(ab.id, fid2 + ":" + k, "parent");
        done[k] = { text: d.text, date: d.date, deducted: d.deducted, sigStudent: gs && gs.enc ? SL.sigSvg(gs.enc, 110, 40) : "", sigParent: gp && gp.enc ? SL.sigSvg(gp.enc, 110, 40) : "" };
      });
      ctx = { absence: { un: ab.un, ex: ab.ex, range: ab.range, done: done } };
    }
    ctx.student = stu; ctx.school = A.schoolCtx(stu); ctx.stageLabel = A.stageLabel(stu);
    ctx.committeeMembers = [A.staffName("deputy", stu.school), A.staffName("deputyEdu", stu.school), A.staffName("counselor", stu.school)];
    return ctx;
  };
  A.doc = function (kind, ref, fid) {
    var parts = fid.split(":"), ctx = A.ctxFor(kind, ref, fid), doc = window.FORMS.build(parts[0], ctx);
    if (parts[1]) {
      var lv = parts[1].slice(2);
      doc.title += " — " + (lv === "3c" ? "3 أيام متصلة" : lv + " أيام");
      doc.signers = [{ role: "student", label: "الطالب", name: ctx.student.name }, { role: "parent", label: "ولي الأمر", name: ctx.student.parentName || "" }];
    }
    return doc;
  };
  A.docSigs = function (ref, fid, doc) {
    var out = {};
    (doc.signers || []).forEach(function (s) {
      var g = A.sigFor(ref, fid, s.role);
      if (g) out[s.role] = { svg: g.enc ? SL.sigSvg(g.enc, 170, 60) : "", text: g.status === "refused" ? "رفض التوقيع" + (g.note ? " — " + g.note : "") : "", name: g.name, date: SL.hijri(g.at) };
    });
    return out;
  };
  A.docHash = async function (doc) { return (await SL.sha256(JSON.stringify(doc))).slice(0, 16); };

  /* ————— قوالب الرسائل ————— */
  A.fill = function (tpl, vars) {
    return String(tpl || "").replace(/\{([^}]+)\}/g, function (m, k) { return vars[k] != null ? vars[k] : m; });
  };

  /* ————— أدوات الواجهة ————— */
  A.e = e;
  A.$ = function (s, r) { return (r || document).querySelector(s); };
  A.$$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  A.toast = function (msg, kind) {
    Array.prototype.forEach.call(document.querySelectorAll(".toast"), function (x) { x.remove(); });
    var t = document.createElement("div"); t.className = "toast " + (kind || ""); t.textContent = msg;
    document.body.appendChild(t); setTimeout(function () { t.classList.add("in"); }, 10);
    setTimeout(function () { t.classList.remove("in"); setTimeout(function () { t.remove(); }, 300); }, 3200);
  };
  A.sheet = function (title, html, opts) {
    opts = opts || {};
    var w = document.createElement("div"); w.className = "sheet-wrap";
    w.innerHTML = '<div class="sheet' + (opts.wide ? " wide" : "") + '" role="dialog" aria-modal="true"><div class="sheet-h"><h2>' + e(title) + '</h2><button class="icon-btn x" type="button" aria-label="إغلاق">✕</button></div><div class="sheet-b">' + html + "</div></div>";
    document.body.appendChild(w);
    function close() { w.classList.remove("in"); setTimeout(function () { w.remove(); }, 200); if (opts.onClose) opts.onClose(); }
    w.addEventListener("click", function (ev) { if (ev.target === w) close(); });
    A.$(".x", w).onclick = close;
    setTimeout(function () { w.classList.add("in"); }, 10);
    return { el: w, body: A.$(".sheet-b", w), close: close };
  };
  A.confirm = function (msg) { return Promise.resolve(window.confirm(msg)); };
  A.degChip = function (d) { return '<span class="deg d' + d + '">' + e(R.DEGREE_NAME[d] || "") + "</span>"; };
  A.scoreChip = function (stu) {
    var s = A.score(stu); if (s.qualitative) return '<span class="score q">كيفي</span>';
    var c = s.total >= 90 ? "g" : s.total >= 80 ? "y" : s.total >= 70 ? "o" : "r";
    return '<span class="score ' + c + '">' + s.total + "</span>";
  };
  A.go = function (h) { if (location.hash === "#" + h) A.route(); else location.hash = h; };
  A.readFileText = function (f) { return f.text(); };
  A.loadScript = function (src) {
    return new Promise(function (res, rej) { if (A.loaded && A.loaded[src]) return res(); var s = document.createElement("script"); s.src = src; s.onload = function () { (A.loaded = A.loaded || {})[src] = 1; res(); }; s.onerror = rej; document.head.appendChild(s); });
  };
})();

/* سَمْت — الشاشات */
(function () {
  "use strict";
  var R = window.RULES, SL = window.SL, C = window.SLCore, A = window.APP, e = SL.esc;
  var $ = A.$, $$ = A.$$;
  var V = A.views = {};
  var ROLE = { principal: "مدير المدرسة", deputy: "وكيل شؤون الطلبة", deputyEdu: "وكيل الشؤون التعليمية", counselor: "الموجه الطلابي", activity: "رائد النشاط", teacher: "معلم", admin: "إداري" };
  A.ROLE = ROLE;

  function main() { return document.getElementById("main"); }
  function setTitle(t) { $("#top-title").textContent = t; document.title = t + " — سَمْت"; }
  function stuLine(s) { var ck = A.classKey(s); return e(s.name) + ' <small class="mut">' + (/ابتدائ|متوسط|ثانو/.test(ck) ? "" : e(A.stageText(s) || "") + " · ") + e(ck) + (A.S.settings.schools.length > 1 ? " · " + e(A.school(s.school).name) : "") + "</small>"; }
  function empty(msg, btn) { return '<div class="empty"><p>' + e(msg) + "</p>" + (btn || "") + "</div>"; }
  function fmtDate(d) { return SL.hijri(d) + ' <small class="mut">' + SL.greg(d) + "</small>"; }
  function statusChip(x) {
    var m = { reported: ["بلاغ معلم — بانتظار الاعتماد", "st-rep"], open: ["قيد المتابعة", "st-open"], closed: ["مغلقة", "st-closed"], void: ["ملغاة", "st-void"] }[x.status] || ["", ""];
    if (x.status === "reported" && x.src === "counselor") m = ["بلاغ الموجه — بانتظار الاعتماد", "st-rep"];
    return '<span class="chip ' + m[1] + '">' + m[0] + "</span>";
  }

  /* ————— الموجّه ————— */
  A.route = function () {
    var h = decodeURIComponent(location.hash.replace(/^#/, "")) || "home", p = h.split("/"), q = {};
    if (p[p.length - 1].indexOf("?") >= 0) { var sp = p[p.length - 1].split("?"); p[p.length - 1] = sp[0]; sp[1].split("&").forEach(function (kv) { var z = kv.split("="); q[z[0]] = z[1]; }); }
    $$(".nav a, .snav a").forEach(function (a) { a.classList.toggle("on", a.getAttribute("href") === "#" + p[0] || (p[0] === "student" && a.getAttribute("href") === "#students") || (p[0] === "inc" && a.getAttribute("href") === "#incidents") || (p[0] === "doc" && a.getAttribute("href") === "#incidents")); });
    var mn = main(); mn.classList.remove("enter"); void mn.offsetWidth; mn.classList.add("enter");
    window.scrollTo(0, 0);
    var fn = V[p[0]] || V.home;
    try { fn(p.slice(1), q); } catch (err) { console.error(err); main().innerHTML = empty("حدث خطأ في عرض الصفحة: " + err.message); }
  };

  /* ————— الرئيسية ————— */
  V.home = function () {
    setTitle("الرئيسية");
    var S = A.S, now = new Date(), month = now.getMonth(), year = now.getFullYear();
    if (!S.students.length) {
      main().innerHTML = '<section class="welcome card"><h2>أهلاً بك في «سَمْت»</h2><p>ابدأ بثلاث خطوات:</p><ol class="steps">' +
        '<li><a href="#settings">أدخل بيانات المدرسة</a> (الاسم والمرحلة)</li><li><a href="#import">استورد ملف Excel</a> للطلاب والمعلمين والإدارة</li><li>سجّل أول مخالفة من زر <b>رصد</b></li></ol>' +
        '<a class="btn pri" href="#settings">البدء بالإعدادات</a> <a class="btn" href="template.xlsx" download>تنزيل قالب Excel</a></section>';
      return;
    }
    var DAY = 864e5, t0 = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    var live = S.incidents.filter(function (x) { return x.status !== "void" && x.status !== "reported"; });
    var reported = S.incidents.filter(function (x) { return x.status === "reported"; });
    var monthInc = live.filter(function (x) { var d = new Date(x.date); return d.getMonth() === month && d.getFullYear() === year; });
    var prevM = new Date(year, month - 1, 1), prevInc = live.filter(function (x) { var d = new Date(x.date); return d.getMonth() === prevM.getMonth() && d.getFullYear() === prevM.getFullYear(); });
    var todayInc = live.filter(function (x) { return new Date(x.date).getTime() >= t0; });
    var linkSigs = S.sigs.filter(function (g) { return g.via === "link" && g.status !== "replaced"; });
    var pend = linkSigs.filter(function (g) { return g.status === "pending" && g.exp > Date.now(); });
    var signedToday = linkSigs.filter(function (g) { return g.status === "signed" && (g.recvAt || g.at) >= t0; });
    var low = S.students.filter(function (s) { return !A.qualitative(s) && A.score(s).total < 80; }).sort(function (a, b) { return A.score(a).total - A.score(b).total; }).slice(0, 8);
    var recent = S.incidents.filter(function (x) { return x.status !== "void"; }).sort(function (a, b) { return (b.createdAt || 0) - (a.createdAt || 0); }).slice(0, 7);
    var withInc = {}; monthInc.forEach(function (x) { if (x.stu) withInc[x.stu] = 1; });
    var discipline = S.students.length ? Math.round((1 - Object.keys(withInc).length / S.students.length) * 100) : 100;
    var classes = {}; S.students.forEach(function (st) { classes[A.classKey(st)] = 1; });
    function daily(arr, key, days) { var out = []; for (var i = days - 1; i >= 0; i--) { var a0 = t0 - i * DAY, a1 = a0 + DAY; out.push(arr.filter(function (x) { var t = new Date(key(x)).getTime(); return t >= a0 && t < a1; }).length); } return out; }
    function weekly(arr, key, weeks) { var out = []; for (var i = weeks - 1; i >= 0; i--) { var a1 = t0 + DAY - i * 7 * DAY, a0 = a1 - 7 * DAY; out.push(arr.filter(function (x) { var t = new Date(key(x)).getTime(); return t >= a0 && t < a1; }).length); } return out; }
    var bak = S.settings.lastBackup ? Math.floor((Date.now() - S.settings.lastBackup) / DAY) : null;
    var FS = C.FS || {}, alerts = "";
    if (FS.supported && !FS.ok) alerts += '<a class="alert warn" href="#settings?tab=backup">' + SLI("folder") + ' مجلد البيانات <b>sammt</b> غير مربوط — مسح المتصفح قد يُفقد البيانات. <u>ربط المجلد الآن</u></a>';
    else if (!FS.supported && (bak === null || bak >= 7)) alerts += '<a class="alert warn" href="#settings?tab=backup">البيانات محفوظة في هذا المتصفح فقط. ' + (bak === null ? "لم تُنشأ نسخة احتياطية بعد." : "آخر نسخة احتياطية قبل " + bak + " يوماً.") + " <u>إنشاء نسخة الآن</u></a>";
    if (!S.settings.relayUrl) alerts += '<a class="alert" href="#settings?tab=links">لتفعيل التوقيع عن بُعد ووصول بلاغات المعلمين تلقائياً أكمل <u>إعداد الروابط</u>.</a>';
    var hr = now.getHours(), greet = hr < 12 ? "صباح الخير" : "مساء الخير";
    var schoolNames = S.settings.schools.map(function (z) { return z.name; }).filter(Boolean).join(" · ") || "سَمْت — ضبط السلوك والمواظبة";

    var html = '<section class="hero">' + PATTERN + '<div class="hero-t"><span class="date">' + SLI("calendar") + " " + e(SL.dayName(now)) + " " + e(SL.hijri(now)) + " — " + e(SL.greg(now)) + "</span>" +
      "<h2>" + greet + '</h2><p class="hero-s">' + e(schoolNames) + "</p>" +
      '<div class="today"><div><b data-n="' + todayInc.length + '">0</b><span>مخالفات اليوم</span></div><div><b data-n="' + signedToday.length + '">0</b><span>توقيعات وصلت اليوم</span></div><div><b data-n="' + discipline + '" data-s="%">0</b><span>نسبة الانضباط هذا الشهر</span></div></div></div>' +
      '<div class="hero-a"><a class="b1" href="#new">' + SLI("plus") + '<span><b>رصد مخالفة</b><small>تسجيل مع إجراءات تلقائية</small></span></a><a href="#merit">' + SLI("star") + '<span><b>سلوك متميز</b><small>تعويض درجات السلوك</small></span></a>' +
      '<a href="#absence">' + SLI("calendar") + '<span><b>الغياب</b><small>مستويات 3 / 5 / 10 أيام</small></span></a><a href="#import">' + SLI("upload") + '<span><b>استيراد Excel</b><small>الطلاب والمنسوبون</small></span></a>' +
      '<button type="button" class="inst-btn" id="hm-inst">' + SLI("download") + "<span><b>تثبيت التطبيق</b><small>على هذا الجهاز</small></span></button></div></section>" + alerts;

    var dm = prevInc.length ? Math.round((monthInc.length - prevInc.length) / prevInc.length * 100) : null;
    html += '<section class="kpis">' +
      kpi("users", "الطلاب", S.students.length, "#students", "c1", Object.keys(classes).length + " فصل", null) +
      kpi("alert", "مخالفات هذا الشهر", monthInc.length, "#incidents", "c2", dm == null ? "" : (dm > 0 ? "▲ " : dm < 0 ? "▼ " : "") + Math.abs(dm) + "%", weekly(live, function (x) { return x.date; }, 8), dm != null && dm <= 0 ? "good" : dm > 0 ? "bad" : "") +
      kpi("inbox", "بلاغات معلمين جديدة", reported.length, "#incidents?f=reported", reported.length ? "c3 hot" : "c3", reported.length ? "بانتظار اعتمادك" : "لا جديد", daily(reported, function (x) { return x.createdAt || x.date; }, 7)) +
      kpi("clock", "توقيعات بانتظار الرد", pend.length, "#sigs", "c4", "روابط سارية", daily(linkSigs, function (x) { return x.createdAt; }, 7)) +
      kpi("check", "وُقّع عن بُعد اليوم", signedToday.length, "#sigs", "c5", "يصل تلقائياً", daily(linkSigs.filter(function (g) { return g.status === "signed"; }), function (x) { return x.recvAt || x.at; }, 7)) + "</section>";

    /* المخالفات حسب الشهر الهجري */
    var hm = hijriMonths(12);
    html += '<div class="dash"><section class="card span2"><div class="c-h"><div><h3>المخالفات حسب الشهر</h3><small>بالتقويم الهجري</small></div><div class="seg" id="ch-seg"><button type="button" data-m="4">4 أشهر</button><button type="button" data-m="6" class="on">6 أشهر</button><button type="button" data-m="12">12 شهراً</button></div></div><div id="ch-box"></div></section>';

    var degs = [1, 2, 3, 4, 5].map(function (d) { return monthInc.filter(function (x) { return +x.degree === d; }).length; }), tot = degs.reduce(function (a, b) { return a + b; }, 0);
    var off = 0, C_ = 263.9, segs = tot ? degs.map(function (v, i) { if (!v) return ""; var L = v / tot * C_, g = Math.min(2, L / 3); var c = '<circle class="dn d' + (i + 1) + '" cx="50" cy="50" r="42" stroke-dasharray="' + (L - g).toFixed(1) + " " + (C_ - L + g).toFixed(1) + '" stroke-dashoffset="' + (-off).toFixed(1) + '"/>'; off += L; return c; }).join("") : "";
    html += '<section class="card"><div class="c-h"><div><h3>توزيع الدرجات</h3><small>مخالفات هذا الشهر</small></div></div><div class="donut"><svg viewBox="0 0 100 100"><circle class="dn-bg" cx="50" cy="50" r="42"/>' + segs + '</svg><div class="dn-c"><b data-n="' + tot + '">0</b><small>مخالفة</small></div></div>' +
      '<ul class="legend">' + degs.map(function (v, i) { return '<li><i class="d' + (i + 1) + '"></i>' + e(R.DEGREE_NAME[i + 1]) + "<b>" + v + "</b></li>"; }).join("") + "</ul></section>";

    html += '<section class="card span2"><div class="c-h"><div><h3>آخر المخالفات</h3><small>تُحدَّث تلقائياً</small></div><a class="more" href="#incidents">عرض الكل ' + SLI("chevron") + "</a></div>" + (recent.length ? rowList(recent) : '<div class="empty-s">' + SLI("check") + "<p>لا توجد مخالفات مسجلة.</p></div>") + "</section>";

    html += '<section class="card"><div class="c-h"><div><h3>بلاغات المعلمين والموجه</h3><small>' + (reported.length ? reported.length + " بانتظار الاعتماد" : "لا بلاغات جديدة") + "</small></div></div>" + (reported.length ? '<ul class="reps">' + reported.slice(0, 5).map(function (x) {
      var st = A.byId[x.stu] || { name: x.stuName || "؟" };
      return '<li><a href="#inc/' + x.id + '"><span class="av sm">' + e((x.byName || "م").trim().charAt(0)) + "</span><span><b>" + e(x.byName || "معلم") + " ← " + e(st.name) + "</b><small>" + e(x.itemText) + '</small></span><span class="go">' + SLI("chevron") + "</span></a></li>";
    }).join("") + "</ul>" : '<div class="empty-s">' + SLI("inbox") + "<p>تصل بلاغات المعلمين هنا تلقائياً عبر روابطهم.</p></div>") + "</section>";

    var wk = linkSigs.filter(function (g) { return (g.createdAt || 0) >= t0 - 6 * DAY; }), wS = wk.filter(function (g) { return g.status === "signed"; }).length, wR = wk.filter(function (g) { return g.status === "refused"; }).length, wP = wk.length - wS - wR;
    var rate = wk.length ? Math.round(wS / wk.length * 100) : 0;
    html += '<section class="card"><div class="c-h"><div><h3>التوقيعات عن بُعد</h3><small>آخر 7 أيام</small></div><a class="more" href="#sigs">التفاصيل ' + SLI("chevron") + '</a></div><div class="ringw"><svg viewBox="0 0 120 120" class="ring"><circle cx="60" cy="60" r="50" class="rg-bg"/><circle cx="60" cy="60" r="50" class="rg" stroke-dasharray="' + (314 * rate / 100).toFixed(0) + ' 314"/></svg><div class="rg-c"><b data-n="' + rate + '" data-s="%">0</b><small>نسبة التوقيع</small></div></div>' +
      '<div class="minis"><div><b>' + wS + "</b><small>وقّع</small></div><div><b>" + wP + "</b><small>بانتظار</small></div><div><b>" + wR + "</b><small>رفض</small></div></div></section>";

    html += '<section class="card span2"><div class="c-h"><div><h3>طلاب يحتاجون متابعة</h3><small>درجة السلوك أقل من 80</small></div><a class="more" href="#students">كل الطلاب ' + SLI("chevron") + "</a></div>" + (low.length ? '<ul class="lows">' + low.map(function (st) {
      var v = A.score(st).total, c = v < 65 ? "r" : v < 75 ? "o" : "y";
      return '<li><a href="#student/' + st.id + '"><span class="av sm ' + c + '">' + e(st.name.trim().charAt(0)) + "</span><span><b>" + e(st.name) + "</b><small>" + e(A.classKey(st)) + '</small></span><span class="sc"><span class="sc-b"><i class="' + c + '" style="width:' + v + '%"></i></span><b>' + v + "</b></span></a></li>";
    }).join("") + "</ul>" : '<div class="empty-s">' + SLI("shield") + "<p>جميع الطلاب درجاتهم 80 فأكثر — ممتاز.</p></div>") + "</section></div>";

    main().innerHTML = html;
    var hb = $("#hm-inst"); if (hb) hb.onclick = A.install;
    function chart(n) {
      var ms = hm.slice(-n), vals = ms.map(function (m) { return live.filter(function (x) { return hkey(new Date(x.date)) === m.k; }).length; });
      var mx = Math.max.apply(null, vals.concat([4])), W = 400, bw = Math.min(40, (W - 30) / n * .55), step = (W - 30) / n;
      $("#ch-box").innerHTML = '<svg class="chart" viewBox="0 0 400 200">' + [0.25, 0.5, 0.75, 1].map(function (f) { return '<line class="gl" x1="10" x2="390" y1="' + (160 - 140 * f) + '" y2="' + (160 - 140 * f) + '"/>'; }).join("") + ms.map(function (m, i) {
        var h = Math.max(vals[i] ? 6 : 2, vals[i] / mx * 140), x = 20 + i * step + (step - bw) / 2, last = i === n - 1;
        return '<g class="bar-g"><rect class="bar-f' + (last ? " hi" : "") + '" x="' + x.toFixed(1) + '" y="' + (160 - h).toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + h.toFixed(1) + '" rx="' + Math.min(10, bw / 3).toFixed(1) + '" style="animation-delay:' + i * 50 + 'ms"/>' +
          '<text class="bar-v" x="' + (x + bw / 2).toFixed(1) + '" y="' + (152 - h).toFixed(1) + '">' + vals[i] + '</text><text class="bar-x" x="' + (x + bw / 2).toFixed(1) + '" y="182">' + e(m.l) + "</text></g>";
      }).join("") + "</svg>";
    }
    chart(6);
    $$("#ch-seg button").forEach(function (b) { b.onclick = function () { $$("#ch-seg button").forEach(function (x) { x.classList.toggle("on", x === b); }); chart(+b.dataset.m); }; });
    countUp(main());
    function kpi(ic, l, n, href, c, sub, sp, tone) {
      return '<a class="kpi ' + c + '" href="' + href + '"><span class="k-top"><span class="k-i">' + SLI(ic) + "</span>" + (sub ? '<span class="k-sub ' + (tone || "") + '">' + e(sub) + "</span>" : "") + '</span><b data-n="' + n + '">0</b><span class="k-l">' + e(l) + "</span>" + (sp ? spark(sp) : '<span class="spark-e"></span>') + "</a>";
    }
  };
  var PATTERN = '<svg class="pat" aria-hidden="true"><defs><pattern id="hp" width="56" height="56" patternUnits="userSpaceOnUse"><path d="M28 3 35 21 53 28 35 35 28 53 21 35 3 28 21 21Z" fill="none" stroke="currentColor" stroke-width=".9"/><circle cx="28" cy="28" r="6.5" fill="none" stroke="currentColor" stroke-width=".9"/></pattern></defs><rect width="100%" height="100%" fill="url(#hp)"/></svg>';
  function spark(p) {
    var mx = Math.max.apply(null, p), mn = Math.min.apply(null, p), n = p.length;
    var pts = p.map(function (v, i) { return (i * 100 / (n - 1)).toFixed(1) + "," + (28 - (mx === mn ? 10 : (v - mn) / (mx - mn) * 22)).toFixed(1); });
    return '<svg class="spark" viewBox="0 0 100 30" preserveAspectRatio="none"><path class="sp-a" d="M' + pts.join(" L") + ' L100,30 L0,30Z"/><path class="sp-l" d="M' + pts.join(" L") + '"/></svg>';
  }
  var fHM = null; try { fHM = new Intl.DateTimeFormat("ar-SA-u-ca-islamic-umalqura-nu-latn", { month: "long", year: "numeric" }); } catch (err) {}
  function hkey(d) { return fHM ? fHM.format(d) : d.getFullYear() + "-" + d.getMonth(); }
  function hijriMonths(n) {
    var out = [], seen = {}, d = new Date();
    for (var i = 0; out.length < n && i < 400; i++) {
      var dd = new Date(d.getTime() - i * 864e5), k = hkey(dd);
      if (!seen[k]) { seen[k] = 1; var l = fHM ? new Intl.DateTimeFormat("ar-SA-u-ca-islamic-umalqura-nu-latn", { month: "long" }).format(dd) : String(dd.getMonth() + 1); out.unshift({ k: k, l: l.replace("الأول", "١").replace("الآخر", "٢").replace("الثاني", "٢").replace("الأولى", "١").replace("الآخرة", "٢") }); }
    }
    return out;
  }
  function countUp(root) {
    $$("[data-n]", root).forEach(function (el) {
      var to = +el.dataset.n, suf = el.dataset.s || "", t0 = null;
      if (!to || window.matchMedia("(prefers-reduced-motion: reduce)").matches) { el.textContent = to + suf; return; }
      function step(ts) { if (!t0) t0 = ts; var k = Math.min(1, (ts - t0) / 700); el.textContent = Math.round(to * (1 - Math.pow(1 - k, 3))) + suf; if (k < 1) requestAnimationFrame(step); }
      requestAnimationFrame(step);
    });
  }
  A.countUp = countUp;
  function ago(t) {
    var m = Math.floor((Date.now() - t) / 6e4);
    if (m < 1) return "الآن"; if (m < 60) return "قبل " + m + " دقيقة"; var h = Math.floor(m / 60); if (h < 24) return "قبل " + h + " ساعة";
    var d = Math.floor(h / 24); return d === 1 ? "أمس" : d < 7 ? "قبل " + d + " أيام" : SL.hijri(t);
  }
  A.ago = ago;
  function rowList(arr) {
    return '<ul class="rows">' + arr.map(function (x) {
      var st = A.byId[x.stu] || { name: x.stuName || "؟" };
      return '<li><a href="#inc/' + x.id + '"><span class="av d' + x.degree + '">' + e((st.name || "؟").trim().charAt(0)) + '</span><span class="r-m"><b>' + e(st.name) + "</b><small>" + e(st.grade ? A.classKey(st) : x.cls || "") + '</small></span><span class="r-t">' + e(x.itemText) + "</span>" + A.degChip(x.degree) + statusChip(x) + "<time>" + e(ago(x.createdAt || new Date(x.date).getTime())) + "</time></a></li>";
    }).join("") + "</ul>";
  }
  function incList(arr) {
    return '<ul class="list">' + arr.map(function (x) {
      var s = A.byId[x.stu] || { name: x.stuName || "؟" };
      return '<li><a href="#inc/' + x.id + '"><div class="row1">' + A.degChip(x.degree) + " <b>" + e(s.name) + '</b> <small class="mut">' + e(s.grade ? A.classKey(s) : "") + "</small></div>" +
        '<div class="row2">' + e(x.itemText) + "</div><div class=\"row3\">" + fmtDate(x.date) + " " + statusChip(x) + (x.stepIdx != null && x.status !== "reported" ? ' <span class="chip">' + e((R.articleById(x.art).steps[x.stepIdx] || {}).title || "") + "</span>" : "") + "</div></a></li>";
    }).join("") + "</ul>";
  }

  /* ————— الطلاب ————— */
  V.students = function (p, q) {
    setTitle("الطلاب");
    var S = A.S;
    var schools = S.settings.schools;
    var grades = {}; S.students.forEach(function (s) { grades[A.classKey(s)] = 1; });
    main().innerHTML = '<div class="toolbar"><input id="st-q" type="search" placeholder="بحث بالاسم أو السجل المدني أو الجوال" value="' + e(q.q || "") + '">' +
      (schools.length > 1 ? '<select id="st-sc"><option value="">كل المدارس</option>' + schools.map(function (s) { return '<option value="' + e(s.id) + '">' + e(s.name) + "</option>"; }).join("") + "</select>" : "") +
      '<select id="st-stg"><option value="">كل المراحل</option><option>ابتدائي</option><option>متوسط</option><option>ثانوي</option></select>' +
      '<select id="st-cl"><option value="">كل الفصول</option>' + Object.keys(grades).sort().map(function (g) { return "<option>" + e(g) + "</option>"; }).join("") + '</select></div><div id="st-list"></div>' +
      '<div class="toolbar end"><button class="btn pri" id="st-stages" type="button">تحديد مراحل الطلاب</button><a class="btn" href="#import">استيراد من Excel</a><button class="btn" id="st-add" type="button">إضافة طالب</button></div>';
    function draw() {
      var qq = A.norm($("#st-q").value), sc = $("#st-sc") ? $("#st-sc").value : "", cl = $("#st-cl").value, sg = $("#st-stg").value;
      var list = S.students.filter(function (s) {
        if (sc && s.school !== sc) return false; if (cl && A.classKey(s) !== cl) return false; if (sg && A.stageText(s) !== sg) return false;
        if (!qq) return true; return A.norm(s.name).indexOf(qq) >= 0 || String(s.sid || "").indexOf(qq) >= 0 || SL.normPhone(s.parentPhone).indexOf(SL.normPhone(qq) || "@") >= 0;
      }).sort(function (a, b) { return A.classKey(a).localeCompare(A.classKey(b), "ar") || a.name.localeCompare(b.name, "ar"); });
      $("#st-list").innerHTML = list.length ? '<p class="mut">' + list.length + ' طالب</p><ul class="list">' + list.slice(0, 400).map(function (s) {
        return '<li><a href="#student/' + s.id + '">' + A.scoreChip(s) + " " + stuLine(s) + (SL.validPhone(s.parentPhone) ? "" : ' <span class="chip warnc">بلا جوال</span>') + "</a></li>";
      }).join("") + "</ul>" : empty(S.students.length ? "لا نتائج." : "لا يوجد طلاب بعد.", '<a class="btn pri" href="#import">استيراد من Excel</a>');
    }
    ["#st-q", "#st-sc", "#st-cl", "#st-stg"].forEach(function (s) { var el = $(s); if (el) el.addEventListener("input", draw); });
    $("#st-stages").onclick = stagesTool;
    $("#st-add").onclick = function () { editStudent(null); };
    draw();
  };

  /* تحديد مرحلة الطلاب حسب الفصل — تختلف المواد والإجراءات بين الابتدائي (6–9) والمتوسط/الثانوي (10–14) */
  function stagesTool() {
    var groups = {};
    A.S.students.forEach(function (s) { var k = s.school + "|" + (s.grade || "—") + " / " + (s.section || "—") + "|" + A.stageText(s); (groups[k] = groups[k] || []).push(s); });
    var keys = Object.keys(groups).sort(function (a, b) { return a.localeCompare(b, "ar"); });
    var sh = A.sheet("تحديد مراحل الطلاب", '<p class="mut">حدّد مرحلة كل فصل. تُطبق على طلابه مواد وإجراءات تلك المرحلة: الابتدائية (المواد 6–9) أو المتوسطة والثانوية (10–14)، والمادتان (15–16) للجميع. الصفان الأول والثاني الابتدائي تقديرهما كيفي بلا حسم.</p>' +
      '<div class="actions wrap"><button class="btn sm" type="button" data-all="ابتدائي">الكل ابتدائي</button><button class="btn sm" type="button" data-all="متوسط">الكل متوسط</button><button class="btn sm" type="button" data-all="">الكل تلقائي</button></div>' +
      '<table class="tbl stg"><thead><tr><th>الفصل</th><th>الطلاب</th><th>المرحلة</th></tr></thead><tbody>' + keys.map(function (k, i) {
        var l = groups[k], s0 = l[0], hints = {}; l.forEach(function (s) { hints[s.stageHint || ""] = 1; });
        var cur = Object.keys(hints).length === 1 ? Object.keys(hints)[0] : "mixed";
        return "<tr><td>" + e((s0.grade || "—") + " / " + (s0.section || "—")) + (A.S.settings.schools.length > 1 ? '<br><small class="mut">' + e(A.school(s0.school).name) + "</small>" : "") + "</td><td>" + l.length + '</td><td><select data-g="' + i + '">' +
          [["", "تلقائي (" + A.stageText(Object.assign({}, s0, { stageHint: "" })) + ")"], ["ابتدائي", "ابتدائي"], ["متوسط", "متوسط"], ["ثانوي", "ثانوي"]].concat(cur === "mixed" ? [["mixed", "مختلط — دون تغيير"]] : [])
            .map(function (o) { return '<option value="' + o[0] + '"' + (o[0] === cur ? " selected" : "") + ">" + e(o[1]) + "</option>"; }).join("") + "</select></td></tr>";
      }).join("") + '</tbody></table><div class="actions"><button class="btn pri" type="button" id="stg-save">حفظ</button></div>', { wide: true });
    $$("[data-all]", sh.body).forEach(function (b) { b.onclick = function () { $$("[data-g]", sh.body).forEach(function (s) { s.value = b.dataset.all; }); }; });
    $("#stg-save", sh.body).onclick = async function () {
      var recs = [];
      $$("[data-g]", sh.body).forEach(function (sel) { if (sel.value === "mixed") return; groups[keys[+sel.dataset.g]].forEach(function (s) { if ((s.stageHint || "") !== sel.value) { s.stageHint = sel.value; recs.push(s); } }); });
      await A.saveMany(recs); sh.close(); A.toast("تم تحديث مرحلة " + recs.length + " طالب"); A.route();
    };
  }

  function editStudent(stu) {
    var s = stu || { school: (A.S.settings.schools[0] || {}).id };
    var sh = A.sheet(stu ? "تعديل بيانات الطالب" : "إضافة طالب",
      '<form class="form" id="fs">' +
      fld("name", "اسم الطالب", s.name, 1) + fld("sid", "رقم السجل المدني", s.sid) +
      (A.S.settings.schools.length > 1 ? '<label>المدرسة<select name="school">' + A.S.settings.schools.map(function (x) { return '<option value="' + e(x.id) + '"' + (x.id === s.school ? " selected" : "") + ">" + e(x.name) + "</option>"; }).join("") + "</select></label>" : "") +
      '<label>المرحلة<select name="stageHint">' + [["", "تلقائي (من الصف أو المدرسة)"], ["ابتدائي", "ابتدائي"], ["متوسط", "متوسط"], ["ثانوي", "ثانوي"]].map(function (o) { return '<option value="' + o[0] + '"' + ((s.stageHint || "") === o[0] ? " selected" : "") + ">" + o[1] + "</option>"; }).join("") + "</select></label>" +
      fld("grade", "الصف", s.grade) + fld("section", "الفصل", s.section) + fld("parentName", "اسم ولي الأمر", s.parentName) +
      fld("parentPhone", "جوال ولي الأمر", SL.showPhone(s.parentPhone), 0, "tel") + fld("parentPhone2", "جوال آخر", SL.showPhone(s.parentPhone2), 0, "tel") +
      '<div class="actions"><button class="btn pri" type="submit">حفظ</button>' + (stu ? '<button class="btn danger" type="button" id="fs-del">حذف الطالب</button>' : "") + "</div></form>");
    $("#fs", sh.body).onsubmit = async function (ev) {
      ev.preventDefault(); var f = new FormData(this);
      var rec = Object.assign({}, s, { t: "stu", id: s.id || "S" + SL.rid(10) });
      ["name", "sid", "grade", "section", "parentName", "stageHint"].forEach(function (k) { rec[k] = String(f.get(k) || "").trim(); });
      rec.parentPhone = SL.normPhone(f.get("parentPhone")); rec.parentPhone2 = SL.normPhone(f.get("parentPhone2"));
      if (f.get("school")) rec.school = f.get("school");
      if (!rec.name) return A.toast("الاسم مطلوب", "err");
      await A.save(rec); sh.close(); A.toast("تم الحفظ"); A.route();
    };
    var del = $("#fs-del", sh.body);
    if (del) del.onclick = async function () {
      if (A.S.incidents.some(function (x) { return x.stu === s.id; }) && !(await A.confirm("للطالب سجلات مخالفات. حذف الطالب لا يحذف سجلاته. متابعة؟"))) return;
      await A.remove(s); sh.close(); A.go("students");
    };
  }
  function fld(n, l, v, req, type) { return "<label>" + e(l) + '<input name="' + n + '" type="' + (type || "text") + '" value="' + e(v || "") + '"' + (req ? " required" : "") + (type === "tel" ? ' dir="ltr"' : "") + "></label>"; }
  A.fld = fld;

  /* ————— ملف الطالب ————— */
  V.student = function (p) {
    var s = A.byId[p[0]]; if (!s || s.t !== "stu") return A.go("students");
    setTitle(s.name);
    var sc = A.score(s), incs = A.S.incidents.filter(function (x) { return x.stu === s.id && x.status !== "void"; }).sort(function (a, b) { return new Date(b.date) - new Date(a.date); });
    var mers = A.S.merits.filter(function (m) { return m.stu === s.id; }).sort(function (a, b) { return new Date(b.date) - new Date(a.date); });
    var ab = A.S.absences.find(function (x) { return x.stu === s.id; });
    var f1 = A.sigFor(s.id, "F1", "parent");
    var html = '<section class="card stu-head"><div class="stu-top"><div><h2>' + e(s.name) + '</h2><p class="mut">' + e(A.classKey(s)) + " · المرحلة " + e(A.stageLabel(s)) + " · " + e(A.school(s.school).name || "") + (s.sid ? " · السجل المدني: " + e(s.sid) : "") + "</p></div>" + A.scoreChip(s) + "</div>" +
      (sc.qualitative ? '<p class="mut">' + e(R.GENERAL.qualitative) + "</p>" :
        '<div class="meter"><div class="m-pos" style="width:' + sc.positive + '%"></div><div class="m-exc" style="width:' + sc.excellent + '%"></div></div>' +
        '<p class="mut">السلوك الإيجابي ' + sc.positive + "/80 · المتميز " + sc.excellent + "/20 · المحسوم " + sc.deducted + " · المكتسب " + sc.merits + "</p>") +
      '<div class="parent"><span>ولي الأمر: <b>' + e(s.parentName || "—") + "</b> " + (SL.validPhone(s.parentPhone) ? '<a dir="ltr" href="tel:+' + e(s.parentPhone) + '">' + e(SL.showPhone(s.parentPhone)) + "</a>" : '<span class="chip warnc">لا يوجد جوال صحيح</span>') + "</span>" +
      (SL.validPhone(s.parentPhone) ? '<button class="btn wa sm" id="sp-wa" type="button">واتساب</button>' : "") + "</div>" +
      '<div class="actions wrap"><a class="btn pri" href="#new?s=' + s.id + '">＋ رصد مخالفة</a><a class="btn" href="#merit?s=' + s.id + '">★ سلوك متميز</a><button class="btn" id="sp-edit" type="button">تعديل البيانات</button></div></section>';
    html += '<section class="card"><h3>النماذج</h3><ul class="list forms">' +
      formRow("stu", s.id, "F1", f1 ? '<span class="chip ok">وقّع ولي الأمر ' + e(SL.hijri(f1.at)) + "</span>" : '<span class="chip">لم يوقّع بعد</span>') +
      formRow("stu", s.id, "F5", "سجل المشكلات السلوكية") + formRow("stu", s.id, "F2", "") + formRow("stu", s.id, "F6", "") + "</ul></section>";
    html += '<section class="card"><h3>المخالفات (' + incs.length + ")</h3>" + (incs.length ? incList(incs) : '<p class="mut">لا توجد مخالفات.</p>') + "</section>";
    html += '<section class="card"><h3>السلوك المتميز (' + mers.length + ')</h3>' + (mers.length ? '<ul class="list">' + mers.map(function (m) {
      var pr = R.MERITS.find(function (x) { return x.id === m.practice; }) || { t: "" };
      return '<li><div class="row1"><span class="chip ok">+' + m.pts + "</span> " + e(pr.t) + '</div><div class="row3">' + fmtDate(m.date) + (m.topic ? " · " + e(m.topic) : "") + ' <button class="link" data-del-mer="' + m.id + '" type="button">حذف</button></div></li>';
    }).join("") + "</ul>" : '<p class="mut">لا يوجد.</p>') + "</section>";
    if (ab) html += '<section class="card"><h3>الغياب (من وهج)</h3><p>بدون عذر: <b class="red">' + ab.un + "</b> · بعذر: <b>" + ab.ex + "</b>" + (ab.late ? " · تأخير: " + ab.late : "") + ' <a href="#absence?s=' + s.id + '">الإجراءات</a></p></section>';
    main().innerHTML = html;
    $("#sp-edit").onclick = function () { editStudent(s); };
    var wa = $("#sp-wa"); if (wa) wa.onclick = function () { SL.openWa(s.parentPhone, A.fill(A.S.settings.tpl.notify, vars(s))); };
    $$("[data-del-mer]").forEach(function (b) { b.onclick = async function () { if (await A.confirm("حذف هذه الممارسة؟")) { await A.remove(A.byId[b.dataset.delMer]); A.route(); } }; });
    bindFormRows();
  };
  function vars(s, extra) {
    return Object.assign({ "الطالب": s.name, "الصف": A.classKey(s), "المدرسة": A.school(s.school).name || "", "المدة": A.S.settings.linkHours }, extra || {});
  }
  A.vars = vars;

  /* صف نموذج: عرض/طباعة + توقيع هنا + إرسال للتوقيع */
  function formRow(kind, ref, fid, note) {
    var base = fid.split(":")[0], meta = R.FORMS[base];
    var chips = "";
    try {
      var doc = A.doc(kind, ref, fid);
      chips = (doc.signers || []).map(function (sg) {
        var g = A.sigFor(ref, fid, sg.role), pd = A.pendingFor(ref, fid, sg.role);
        return '<span class="chip ' + (g ? (g.status === "refused" ? "warnc" : "ok") : pd ? "pend" : "") + '">' + e(R.SIGNER[sg.role] || sg.label) + (g ? (g.status === "refused" ? " ✕" : " ✓") : pd ? " ⏳" : "") + "</span>";
      }).join(" ");
    } catch (err) { console.error(err); }
    return '<li class="frow"><div class="row1"><b>' + e(meta.t) + "</b>" + (meta.secret ? ' <span class="chip sec">سري</span>' : "") + "</div>" +
      (note ? '<div class="row2">' + note + "</div>" : "") + '<div class="row3">' + chips + "</div>" +
      '<div class="actions wrap"><a class="btn sm" href="#doc/' + kind + "/" + ref + "/" + encodeURIComponent(fid) + '">عرض وطباعة</a>' +
      '<button class="btn sm" type="button" data-sign-here="' + kind + "|" + ref + "|" + fid + '">توقيع على الجهاز</button>' +
      (!meta.noWa ? '<button class="btn sm wa" type="button" data-sign-send="' + kind + "|" + ref + "|" + fid + '">إرسال للتوقيع</button>' : "") + "</div></li>";
  }
  A.formRow = formRow;
  function bindFormRows() {
    $$("[data-sign-here]").forEach(function (b) { b.onclick = function () { var z = b.dataset.signHere.split("|"); A.signHere(z[0], z[1], z[2]); }; });
    $$("[data-sign-send]").forEach(function (b) { b.onclick = function () { var z = b.dataset.signSend.split("|"); A.sendSign(z[0], z[1], z[2]); }; });
  }
  A.bindFormRows = bindFormRows;

  /* ————— اختيار طالب ————— */
  function pickStudent(onPick) {
    var sh = A.sheet("اختر الطالب", '<input id="pk-q" type="search" placeholder="اكتب جزءاً من الاسم أو السجل المدني" autofocus><ul class="list" id="pk-l"></ul>');
    function draw() {
      var q = A.norm($("#pk-q", sh.body).value);
      var l = A.S.students.filter(function (s) { return !q || A.norm(s.name).indexOf(q) >= 0 || String(s.sid || "").indexOf(q) >= 0; }).slice(0, 60);
      $("#pk-l", sh.body).innerHTML = l.map(function (s) { return '<li><button type="button" class="pick" data-id="' + s.id + '">' + stuLine(s) + "</button></li>"; }).join("") || '<li class="mut">لا نتائج</li>';
      $$(".pick", sh.body).forEach(function (b) { b.onclick = function () { sh.close(); onPick(A.byId[b.dataset.id]); }; });
    }
    $("#pk-q", sh.body).addEventListener("input", draw); draw();
    setTimeout(function () { $("#pk-q", sh.body).focus(); }, 200);
  }
  A.pickStudent = pickStudent;

  /* ————— رصد مخالفة ————— */
  V["new"] = function (p, q) {
    setTitle("رصد مخالفة");
    if (!A.S.students.length) { main().innerHTML = empty("استورد الطلاب أولاً.", '<a class="btn pri" href="#import">استيراد</a>'); return; }
    var stu = q.s ? A.byId[q.s] : null;
    var st = { art: null, item: null };
    var now = new Date(), local = new Date(now.getTime() - now.getTimezoneOffset() * 6e4).toISOString().slice(0, 16);
    var staffOpts = A.S.staff.slice().sort(function (a, b) { return a.name.localeCompare(b.name, "ar"); }).map(function (x) { return '<option value="' + e(x.id) + '">' + e(x.name) + " — " + e(ROLE[x.role] || "") + "</option>"; }).join("");
    main().innerHTML = '<form class="form card" id="fn">' +
      '<div class="picked" id="fn-stu"></div>' +
      '<label>ابحث عن المخالفة<input id="fn-q" type="search" placeholder="مثال: التأخر، الهروب، الجوال، التصوير…"></label>' +
      '<div class="degtabs" id="fn-deg"></div><div id="fn-items" class="items"></div>' +
      '<div id="fn-plan"></div>' +
      '<div class="grid2"><label>التاريخ والوقت<input name="date" type="datetime-local" value="' + local + '" required></label><label>الحصة<input name="period" placeholder="مثال: الثالثة"></label></div>' +
      '<label>مكان الواقعة<input name="place" placeholder="الفصل، الساحة، الحافلة…"></label>' +
      '<label>وصف مختصر للواقعة<textarea name="desc" rows="3"></textarea></label>' +
      '<label>الراصد<select name="by"><option value="">— وكيل شؤون الطلبة —</option>' + staffOpts + "</select></label>" +
      '<div class="actions"><button class="btn pri big" type="submit">حفظ واعتماد الإجراء</button></div></form>';
    var degSel = 0;
    function drawStu() {
      $("#fn-stu").innerHTML = stu ? '<div class="stu-mini">' + A.scoreChip(stu) + " <b>" + e(stu.name) + '</b> <small class="mut">' + e(A.classKey(stu)) + '</small> <button class="link" type="button" id="fn-chg">تغيير</button></div>'
        : '<button class="btn pri big" type="button" id="fn-pick">اختر الطالب</button>';
      var b = $("#fn-pick") || $("#fn-chg"); b.onclick = function () { pickStudent(function (s) { stu = s; drawStu(); drawItems(); drawPlan(); }); };
    }
    function drawItems() {
      var arts = R.articlesFor(stu ? A.stageOf(stu) : R.stageOf(A.school().stage));
      var degs = []; arts.forEach(function (a) { if (degs.indexOf(a.degree) < 0) degs.push(a.degree); }); degs.sort();
      $("#fn-deg").innerHTML = '<button type="button" data-d="0" class="' + (degSel === 0 ? "on" : "") + '">الكل</button>' + degs.map(function (d) { return '<button type="button" data-d="' + d + '" class="d' + d + (degSel === d ? " on" : "") + '">' + R.DEGREE_NAME[d] + "</button>"; }).join("");
      $$("#fn-deg button").forEach(function (b) { b.onclick = function () { degSel = +b.dataset.d; drawItems(); }; });
      var q = A.norm($("#fn-q").value), html = "";
      arts.forEach(function (a) {
        if (degSel && a.degree !== degSel) return;
        var its = a.items.map(function (t, i) { return [t, i]; }).filter(function (x) { return !q || A.norm(x[0]).indexOf(q) >= 0; });
        if (!its.length) return;
        html += '<div class="art"><div class="art-h">' + A.degChip(a.degree) + " المادة (" + a.id + ")" + (a.stage === "all" ? " — تجاه الهيئة التعليمية والإدارية" : "") + "</div>" +
          its.map(function (x) { var on = st.art === a.id && st.item === x[1]; return '<label class="item' + (on ? " on" : "") + '"><input type="radio" name="it" value="' + a.id + ":" + x[1] + '"' + (on ? " checked" : "") + "> " + e(x[0]) + "</label>"; }).join("") + "</div>";
      });
      $("#fn-items").innerHTML = html || '<p class="mut">لا توجد مخالفة مطابقة.</p>';
      $$("#fn-items input").forEach(function (r) { r.onchange = function () { var z = r.value.split(":"); st.art = +z[0]; st.item = +z[1]; $$("#fn-items .item").forEach(function (l) { l.classList.toggle("on", l.contains(r)); }); drawPlan(); }; });
    }
    function drawPlan() {
      var box = $("#fn-plan");
      if (!stu || st.art == null) { box.innerHTML = ""; return; }
      box.innerHTML = planCard(A.plan(stu, st.art, st.item, $("[name=date]").value));
    }
    $("#fn-q").addEventListener("input", drawItems);
    $("[name=date]").addEventListener("change", drawPlan);
    drawStu(); drawItems();
    $("#fn").onsubmit = async function (ev) {
      ev.preventDefault();
      if (!stu) return A.toast("اختر الطالب", "err");
      if (st.art == null) return A.toast("اختر المخالفة", "err");
      var f = new FormData(this), pl = A.plan(stu, st.art, st.item, f.get("date"));
      var by = A.byId[f.get("by")];
      var inc = { id: "I" + SL.rid(10), t: "inc", stu: stu.id, art: st.art, item: st.item, itemText: pl.art.items[st.item], degree: pl.art.degree,
        stepIdx: pl.stepIdx, prior: pl.prior, deduct: pl.deduct, date: new Date(f.get("date")).toISOString(), period: f.get("period"), place: f.get("place"), desc: f.get("desc"),
        by: by ? by.id : "", byName: by ? by.name : A.staffName("deputy", stu.school), status: "open", done: {}, createdAt: Date.now(), approvedAt: Date.now(), src: "app" };
      await A.save(inc); A.log("رصد مخالفة: " + stu.name + " — " + inc.itemText, inc.id);
      A.toast("تم الحفظ — " + pl.step.title); A.go("inc/" + inc.id);
    };
  };

  function planCard(pl) {
    if (!pl) return "";
    var st = pl.step;
    return '<div class="plan"><div class="plan-h">' + A.degChip(pl.art.degree) + " <b>" + e(st.title) + "</b>" + (pl.total > 1 ? ' <small class="mut">(' + (pl.stepIdx + 1) + " من " + pl.total + " — التكرار رقم " + (pl.prior + 1) + ")</small>" : "") +
      ' <span class="chip ' + (pl.deduct ? "red" : "") + '">' + (pl.qualitative ? "تقدير كيفي" : pl.deduct ? "حسم " + pl.deduct + " درجة" : "بلا حسم") + "</span></div>" +
      '<ol class="acts">' + st.actions.map(function (a) { return "<li>" + e(a) + "</li>"; }).join("") + "</ol>" +
      (pl.forms.length ? '<p class="mut">النماذج: ' + pl.forms.map(function (f) { return e(R.FORMS[f].t); }).join("، ") + "</p>" : "") +
      pl.warnings.map(function (w) { return '<p class="alert warn sm">' + e(w) + "</p>"; }).join("") +
      (pl.art.notes || []).map(function (n) { return '<p class="note">• ' + e(n) + "</p>"; }).join("") + "</div>";
  }
  A.planCard = planCard;

  /* ————— المخالفات ————— */
  V.incidents = function (p, q) {
    setTitle("المخالفات");
    var f = q.f || "";
    main().innerHTML = '<div class="toolbar"><input id="il-q" type="search" placeholder="بحث باسم الطالب أو المخالفة"><select id="il-f"><option value="">الكل</option><option value="reported">بلاغات المعلمين</option><option value="open">قيد المتابعة</option><option value="closed">مغلقة</option><option value="void">ملغاة</option></select>' +
      '<select id="il-d"><option value="">كل الدرجات</option>' + [1, 2, 3, 4, 5].map(function (d) { return '<option value="' + d + '">' + R.DEGREE_NAME[d] + "</option>"; }).join("") + '</select></div><div id="il"></div>';
    $("#il-f").value = f;
    function draw() {
      var qq = A.norm($("#il-q").value), ff = $("#il-f").value, dd = +$("#il-d").value;
      var l = A.S.incidents.filter(function (x) {
        if (ff ? x.status !== ff : x.status === "void") return false; if (dd && x.degree !== dd) return false;
        var s = A.byId[x.stu] || {}; return !qq || A.norm(s.name || x.stuName).indexOf(qq) >= 0 || A.norm(x.itemText).indexOf(qq) >= 0;
      }).sort(function (a, b) { return new Date(b.date) - new Date(a.date); });
      $("#il").innerHTML = l.length ? '<p class="mut">' + l.length + " سجل</p>" + incList(l.slice(0, 300)) : empty("لا توجد سجلات.");
    }
    ["#il-q", "#il-f", "#il-d"].forEach(function (s) { $(s).addEventListener("input", draw); });
    draw();
  };

  /* ————— تفاصيل مخالفة ————— */
  V.inc = function (p) {
    var x = A.byId[p[0]]; if (!x || x.t !== "inc") return A.go("incidents");
    var s = A.byId[x.stu];
    if (!s) {
      main().innerHTML = '<section class="card"><p>بلاغ من المعلم <b>' + e(x.byName || "") + "</b> عن الطالب «" + e(x.stuName || "") + "» (" + e(x.cls || "") + ") — لم يُطابق اسمه مع بيانات الطلاب.</p><p>" + e(x.itemText) + '</p><div class="actions"><button class="btn pri" id="ic-link" type="button">ربطه بطالب</button><button class="btn danger" id="ic-no2" type="button">رفض البلاغ</button></div></section>';
      $("#ic-link").onclick = function () { pickStudent(async function (st2) { x.stu = st2.id; await A.save(x); A.route(); }); };
      $("#ic-no2").onclick = async function () { x.status = "void"; await A.save(x); A.go("incidents"); };
      return;
    }
    setTitle("مخالفة — " + s.name);
    var art = R.articleById(x.art);
    var html = '<section class="card"><div class="row1">' + A.degChip(x.degree) + " المادة (" + art.id + ") " + statusChip(x) + "</div>" +
      '<h2 class="inc-t">' + e(x.itemText) + "</h2>" +
      '<p><a href="#student/' + s.id + '"><b>' + e(s.name) + '</b></a> <small class="mut">' + e(A.classKey(s)) + "</small> " + A.scoreChip(s) + "</p>" +
      '<p class="mut">' + fmtDate(x.date) + " " + e(SL.time(x.date)) + (x.period ? " · الحصة: " + e(x.period) : "") + (x.place ? " · " + e(x.place) : "") + " · الراصد: " + e(x.byName || "—") + (x.src === "teacher" ? " (عبر رابط المعلم)" : x.src === "counselor" ? " (عبر رابط الموجه الطلابي)" : "") + "</p>" +
      (x.desc ? '<p class="desc">' + e(x.desc) + "</p>" : "") + "</section>";

    if (x.status === "reported") {
      var pl = A.plan(s, x.art, x.item, x.date, x.id);
      html += '<section class="card"><h3>الإجراء المقترح عند الاعتماد</h3>' + planCard(pl) +
        '<div class="actions"><button class="btn pri" id="ic-ok" type="button">اعتماد وتطبيق الإجراء</button><button class="btn danger" id="ic-no" type="button">رفض البلاغ</button></div></section>';
      main().innerHTML = html;
      $("#ic-ok").onclick = async function () {
        Object.assign(x, { status: "open", stepIdx: pl.stepIdx, prior: pl.prior, deduct: pl.deduct, approvedAt: Date.now(), done: x.done || {} });
        await A.save(x); A.log("اعتماد بلاغ معلم: " + s.name, x.id); A.toast("تم الاعتماد — " + pl.step.title); A.route();
      };
      $("#ic-no").onclick = async function () { if (!(await A.confirm("رفض البلاغ وإلغاؤه؟"))) return; x.status = "void"; await A.save(x); A.go("incidents"); };
      return;
    }

    var st = art.steps[x.stepIdx] || art.steps[0];
    var dn = x.done || {};
    html += '<section class="card"><h3>' + e(st.title) + (art.steps.length > 1 ? ' <small class="mut">(' + (x.stepIdx + 1) + " من " + art.steps.length + ")</small>" : "") +
      ' <span class="chip ' + (x.deduct ? "red" : "") + '">' + (A.qualitative(s) ? "تقدير كيفي" : x.deduct ? "حسم " + x.deduct + " درجة" : "بلا حسم") + "</span></h3>" +
      '<ul class="checks">' + st.actions.map(function (a, i) {
        var hdr = /^(تحويل الطالب|إحالة الطالب من قبل)/.test(a) && /ما يلي:$/.test(a);
        return hdr ? '<li class="hdr">' + e(a) + "</li>" : '<li><label><input type="checkbox" data-act="' + i + '"' + (dn[i] ? " checked" : "") + "> " + e(a) + (dn[i] ? ' <small class="mut">(' + SL.hijri(dn[i]) + ")</small>" : "") + "</label></li>";
      }).join("") + "</ul>";
    if (st.invite) {
      var m = x.meeting || {};
      html += '<details class="sub"' + (m.date ? "" : " open") + '><summary>موعد حضور ولي الأمر (لخطاب الدعوة)</summary><div class="grid2"><label>التاريخ<input type="date" id="mt-d" value="' + e(m.date || "") + '"></label><label>الوقت<input type="time" id="mt-t" value="' + e(m.time || "") + '"></label></div>' +
        '<label>الهدف<input id="mt-p" value="' + e(m.purpose || "") + '" placeholder="مناقشة وضع الطالب السلوكي والإجراءات المتخذة"></label>' +
        (m.reply != null ? '<p class="alert ' + (m.reply === 0 ? "ok" : "warn") + ' sm">رد ولي الأمر: ' + (m.reply === 0 ? "سيحضر في الموعد المحدد" : "يرغب بتغيير الموعد" + (m.altDate ? " إلى " + e(m.altDate) : "")) + "</p>" : "") +
        '<button class="btn sm" type="button" id="mt-save">حفظ الموعد</button></details>';
    }
    if (st.report) {
      var ev = x.evidence || {};
      html += '<details class="sub"><summary>بيانات محضر ضبط الواقعة</summary><div class="checks-inline">' +
        [["photo", "صور"], ["video", "مقاطع فيديو"], ["chat", "محادثات"]].map(function (k) { return '<label><input type="checkbox" data-ev="' + k[0] + '"' + (ev[k[0]] ? " checked" : "") + "> " + k[1] + "</label>"; }).join("") +
        '</div><label>أخرى<input id="ev-o" value="' + e(ev.other || "") + '"></label><label>الشهود (سطر لكل شاهد: الاسم - الوظيفة)<textarea id="ev-w" rows="3">' + e((x.witnesses || []).map(function (w) { return w.name + (w.job ? " - " + w.job : ""); }).join("\n")) + "</textarea></label>" +
        '<button class="btn sm" type="button" id="ev-save">حفظ</button></details>';
    }
    if (st.committee) {
      html += '<details class="sub"><summary>قرارات لجنة التوجيه الطلابي</summary><textarea id="cm-d" rows="3">' + e((x.committee || {}).decisions || "") + '</textarea><button class="btn sm" type="button" id="cm-save">حفظ</button></details>';
    }
    html += "</section>";

    var forms = st.forms.slice(); if (st.plan && forms.indexOf("F3") < 0) forms.push("F3");
    html += '<section class="card"><h3>النماذج والتوقيعات</h3>' + (forms.length ? '<ul class="list forms">' + forms.map(function (f) { return formRow("inc", x.id, f, ""); }).join("") + "</ul>" : '<p class="mut">لا نماذج لهذا الإجراء (تنبيه شفهي).</p>') + "</section>";

    var cns = A.staffBy("counselor", s.school)[0], rep = A.byId[x.by];
    html += '<section class="card"><h3>المراسلات</h3><div class="actions wrap">' +
      (SL.validPhone(s.parentPhone) ? '<button class="btn wa" id="ms-p" type="button">إشعار ولي الأمر (رسالة عامة)</button>' : '<span class="chip warnc">لا يوجد جوال لولي الأمر</span>') +
      (st.refer || st.committee ? (cns && SL.validPhone(cns.phone) ? '<button class="btn wa" id="ms-c" type="button">إشعار الموجه الطلابي بالإحالة</button>' : '<span class="chip">أضف جوال الموجه الطلابي في «المعلمون والإدارة»</span>') : "") +
      (rep && SL.validPhone(rep.phone) && rep.role !== "deputy" ? '<button class="btn wa" id="ms-t" type="button">إبلاغ المعلم الراصد بالاعتماد</button>' : "") + "</div>" +
      '<p class="note">' + e(R.GENERAL.secret) + "</p></section>";

    if (x.degree >= 4) html += '<section class="card"><h3>أرقام الطوارئ</h3><div class="actions wrap">' + R.EMERGENCY.map(function (n) { return '<a class="btn" href="tel:' + n.n + '"><b dir="ltr">' + n.n + "</b> " + e(n.t) + "</a>"; }).join("") + '</div><p class="note">' + e(R.GENERAL.abuse) + "</p>" +
      '<div class="actions wrap"><a class="btn sm" href="#doc/inc/' + x.id + '/F13">نموذج إبلاغ عن حالة إيذاء</a><a class="btn sm" href="#doc/inc/' + x.id + '/F14">نموذج حالة عالية الخطورة</a></div></section>';

    html += '<section class="card"><div class="actions wrap">' +
      (x.status === "open" ? '<button class="btn" id="ic-close" type="button">إغلاق الحالة</button>' : '<button class="btn" id="ic-reopen" type="button">إعادة فتح</button>') +
      '<button class="btn danger" id="ic-void" type="button">إلغاء المخالفة</button></div><p class="note">' + e(R.GENERAL.noor) + "</p></section>";
    main().innerHTML = html;

    $$("[data-act]").forEach(function (c) { c.onchange = async function () { x.done = x.done || {}; if (c.checked) x.done[c.dataset.act] = new Date().toISOString(); else delete x.done[c.dataset.act]; await A.save(x); }; });
    var ms = $("#mt-save"); if (ms) ms.onclick = async function () { x.meeting = Object.assign(x.meeting || {}, { date: $("#mt-d").value, time: $("#mt-t").value, purpose: $("#mt-p").value }); await A.save(x); A.toast("تم حفظ الموعد"); A.route(); };
    var es = $("#ev-save"); if (es) es.onclick = async function () {
      x.evidence = { photo: $("[data-ev=photo]").checked, video: $("[data-ev=video]").checked, chat: $("[data-ev=chat]").checked, other: $("#ev-o").value };
      x.witnesses = $("#ev-w").value.split("\n").map(function (l) { l = l.trim(); if (!l) return null; var z = l.split(/\s+-\s+/); return { name: z[0], job: z[1] || "" }; }).filter(Boolean);
      await A.save(x); A.toast("تم الحفظ");
    };
    var cs = $("#cm-save"); if (cs) cs.onclick = async function () { x.committee = { decisions: $("#cm-d").value }; await A.save(x); A.toast("تم الحفظ"); };
    var mp = $("#ms-p"); if (mp) mp.onclick = function () { SL.openWa(s.parentPhone, A.fill(A.S.settings.tpl.notify, vars(s))); A.log("إشعار ولي أمر (واتساب): " + s.name, x.id); };
    var mc = $("#ms-c"); if (mc) mc.onclick = function () { SL.openWa(cns.phone, A.fill(A.S.settings.tpl.referral, vars(s, { "الموجه": cns.name }))); };
    var mt = $("#ms-t"); if (mt) mt.onclick = function () { SL.openWa(rep.phone, A.fill(A.S.settings.tpl.teacherDone, vars(s, { "المعلم": rep.name, "المشكلة": x.itemText, "الإجراء": st.title }))); };
    var cl = $("#ic-close"); if (cl) cl.onclick = async function () { x.status = "closed"; x.closedAt = Date.now(); await A.save(x); A.route(); };
    var ro = $("#ic-reopen"); if (ro) ro.onclick = async function () { x.status = "open"; await A.save(x); A.route(); };
    $("#ic-void").onclick = async function () { if (!(await A.confirm("إلغاء المخالفة؟ لن تُحتسب في التكرار ولا في الحسم."))) return; x.status = "void"; await A.save(x); A.go("incidents"); };
    bindFormRows();
  };

  /* ————— عرض نموذج وطباعته ————— */
  V.doc = function (p) {
    var kind = p[0], ref = p[1], fid = decodeURIComponent(p[2] || "");
    if (!A.byId[ref]) return A.go("home");
    var doc = A.doc(kind, ref, fid);
    setTitle(doc.title);
    var meta = R.FORMS[fid.split(":")[0]];
    var hdr = A.schoolCtx(kind === "inc" ? A.byId[A.byId[ref].stu] : kind === "abs" ? A.byId[A.byId[ref].stu] : A.byId[ref]);
    main().innerHTML = '<div class="toolbar noprint"><button class="btn" type="button" onclick="history.back()">رجوع</button><button class="btn pri" type="button" id="dc-print">طباعة / حفظ PDF</button>' +
      '<button class="btn" type="button" data-sign-here="' + kind + "|" + ref + "|" + fid + '">توقيع على الجهاز</button>' +
      (!meta.noWa ? '<button class="btn wa" type="button" data-sign-send="' + kind + "|" + ref + "|" + fid + '">إرسال للتوقيع</button>' : "") + '</div><div id="dc-warn"></div>' +
      '<div class="paper">' + SL.renderDoc(doc, { header: { region: hdr.region, school: hdr.name, admin: hdr.admin }, logo: A.S.settings.useLogo ? "moe-logo.png" : "", sigs: A.docSigs(ref, fid, doc) }) + "</div>";
    $("#dc-print").onclick = function () { window.print(); };
    bindFormRows();
    A.docHash(doc).then(function (h) {
      var changed = A.S.sigs.filter(function (g) { return g.ref === ref && g.form === fid && g.status === "signed" && g.hash && g.hash !== h; });
      if (changed.length) $("#dc-warn").innerHTML = '<p class="alert warn noprint">تنبيه: عُدّلت بيانات النموذج بعد توقيع: ' + changed.map(function (g) { return e(R.SIGNER[g.role]); }).join("، ") + ". قد تحتاج لتوقيع جديد.</p>";
    });
  };

  /* ————— التوقيع على الجهاز ————— */
  A.signHere = function (kind, ref, fid) {
    var doc = A.doc(kind, ref, fid);
    var roles = (doc.signers || []).map(function (s) { return s; });
    var first = roles.find(function (r) { return !A.sigFor(ref, fid, r.role); }) || roles[0];
    var isInvite = fid === "F10";
    var sh = A.sheet("توقيع — " + doc.title,
      '<label>الموقّع<select id="sg-role">' + roles.map(function (r) { return '<option value="' + r.role + '"' + (r === first ? " selected" : "") + ">" + e(r.label) + (A.sigFor(ref, fid, r.role) ? " (موقّع سابقاً)" : "") + "</option>"; }).join("") + "</select></label>" +
      '<label>الاسم<input id="sg-name"></label>' +
      (isInvite ? '<div id="sg-reply" class="checks-inline"><label><input type="radio" name="rp" value="0" checked> سأحضر في الموعد المحدد</label><label><input type="radio" name="rp" value="1"> أرغب بتغيير الموعد</label><input id="sg-alt" placeholder="الموعد المقترح"></div>' : "") +
      '<div class="pad-wrap"><canvas id="sg-pad" class="pad"></canvas><button class="link" type="button" id="sg-clr">مسح</button></div>' +
      '<div class="actions"><button class="btn pri" type="button" id="sg-ok">اعتماد التوقيع</button><button class="btn danger" type="button" id="sg-ref">رفض التوقيع</button></div>' +
      '<p class="note">' + e(R.GENERAL.refuse) + "</p>");
    var pad = new SL.SigPad($("#sg-pad", sh.body));
    function setName() { var r = roles.find(function (x) { return x.role === $("#sg-role", sh.body).value; }); $("#sg-name", sh.body).value = (r && r.name) || ""; var rp = $("#sg-reply", sh.body); if (rp) rp.style.display = r && r.role === "parent" ? "" : "none"; }
    $("#sg-role", sh.body).onchange = setName; setName();
    $("#sg-clr", sh.body).onclick = function () { pad.clear(); };
    async function store(status, enc, note) {
      var role = $("#sg-role", sh.body).value;
      var g = { id: "G" + SL.rid(10), t: "sig", ref: ref, kind: kind, form: fid, role: role, status: status, enc: enc || "", note: note || "", name: $("#sg-name", sh.body).value, at: Date.now(), via: "device", hash: await A.docHash(doc) };
      await A.save(g);
      if (isInvite && role === "parent" && status === "signed") {
        var rv = +((sh.body.querySelector("[name=rp]:checked") || {}).value || 0), inc = A.byId[ref];
        inc.meeting = Object.assign(inc.meeting || {}, { reply: rv, altDate: rv ? $("#sg-alt", sh.body).value : "" }); await A.save(inc);
      }
      A.log((status === "signed" ? "توقيع " : "رفض توقيع ") + R.SIGNER[role] + " على " + doc.title, ref);
      sh.close(); A.toast(status === "signed" ? "تم حفظ التوقيع" : "تم توثيق رفض التوقيع"); A.route();
    }
    $("#sg-ok", sh.body).onclick = function () { if (pad.isEmpty()) return A.toast("وقّع داخل المربع", "err"); store("signed", pad.encode()); };
    $("#sg-ref", sh.body).onclick = function () { var n = prompt("سبب الرفض أو ملاحظة (اختياري):", "") || ""; store("refused", "", n); };
  };

  /* ————— إرسال رابط توقيع عبر واتساب ————— */
  A.sendSign = async function (kind, ref, fid) {
    var cfg = A.S.settings, base = SL.base(cfg.publicBase);
    if (!cfg.relayUrl || !base) { A.toast("أكمل إعداد الروابط أولاً", "err"); return A.go("settings?tab=links"); }
    var stu = kind === "inc" || kind === "abs" ? A.byId[A.byId[ref].stu] : A.byId[ref];
    if (!SL.validPhone(stu.parentPhone)) return A.toast("لا يوجد جوال صحيح لولي الأمر", "err");
    var doc = A.doc(kind, ref, fid), meta = R.FORMS[fid.split(":")[0]];
    if (meta.noWa) return A.toast("هذا النموذج لا يُرسل بالواتساب", "err");
    var hasParent = (doc.signers || []).some(function (s) { return s.role === "parent"; });
    if (!hasParent) { if (!(await A.confirm("هذا النموذج لا يتضمن توقيع ولي الأمر. إرسال رابط اطلاع وإقرار بالعلم؟"))) return; doc.signers = (doc.signers || []).concat([{ role: "parent", label: "ولي الأمر (إقرار بالعلم)", name: stu.parentName || "" }]); }
    var old = A.pendingFor(ref, fid, "parent");
    if (old) { old.status = "replaced"; await A.save(old); if (old.lk) SL.short.del(cfg.relayUrl, old.lk); }
    var tok = SL.rid(14), key = SL.newKey(), last4 = String(stu.sid || "").replace(/\D/g, "").slice(-4);
    var hash = await A.docHash(A.doc(kind, ref, fid)), exp = Date.now() + (+cfg.linkHours || 72) * 3600e3;
    var g = { id: tok, t: "sig", ref: ref, kind: kind, form: fid, role: "parent", status: "pending", key: key, hash: hash, exp: exp, createdAt: Date.now(), via: "link", stu: stu.id };
    await A.save(g);
    var payload = { v: 1, tok: tok, box: cfg.box, relay: cfg.relayUrl, k: key, exp: exp, school: A.school(stu.school).name, wa: SL.normPhone(cfg.schoolWa),
      h4: last4 ? (await SL.sha256(tok + last4)).slice(0, 12) : "", doc: doc, reply: fid === "F10" };
    var lk = await SL.makeLink(base, "sign.html", cfg.relayUrl, payload), link = lk.url;
    if (lk.code) { g.lk = lk.code; await A.save(g); }
    SL.openWa(stu.parentPhone, A.fill(cfg.tpl.sign, vars(stu, { "النموذج": doc.title, "الرابط": link })));
    A.log("إرسال رابط توقيع «" + doc.title + "» لولي أمر " + stu.name, ref);
    A.toast("فُتح واتساب — سيظهر التوقيع تلقائياً فور توقيع ولي الأمر");
    setTimeout(A.route, 400);
  };

  /* ————— قائمة التوقيعات ————— */
  V.sigs = function () {
    setTitle("التوقيعات عن بُعد");
    var l = A.S.sigs.filter(function (g) { return g.via === "link" && g.status !== "replaced"; }).sort(function (a, b) { return (b.createdAt || 0) - (a.createdAt || 0); });
    main().innerHTML = '<div class="toolbar"><button class="btn" id="sg-poll" type="button">تحقق الآن</button><span class="mut" id="sg-last"></span></div>' + (l.length ? '<ul class="list">' + l.map(function (g) {
      var stu = A.byId[g.stu] || {}, meta = R.FORMS[g.form.split(":")[0]] || { t: g.form };
      var st = g.status === "signed" ? '<span class="chip ok">وقّع ' + e(SL.hijri(g.at)) + " " + e(SL.time(g.at)) + "</span>" : g.status === "refused" ? '<span class="chip warnc">رفض</span>' : g.exp < Date.now() ? '<span class="chip">انتهت صلاحية الرابط</span>' : '<span class="chip pend">بانتظار التوقيع</span>';
      return '<li><a href="#doc/' + g.kind + "/" + g.ref + "/" + encodeURIComponent(g.form) + '"><div class="row1"><b>' + e(stu.name || "") + "</b> — " + e(meta.t) + '</div><div class="row3">' + st + ' <small class="mut">أُرسل ' + e(SL.hijri(g.createdAt)) + "</small></div></a></li>";
    }).join("") + "</ul>" : empty("لم تُرسل روابط توقيع بعد."));
    main().insertAdjacentHTML("beforeend", '<details class="sub"><summary>استلام رد وصل عبر واتساب (عند تعذّر الإرسال التلقائي)</summary><textarea id="sg-paste" rows="3" dir="ltr" placeholder="الصق نص الرسالة كاملاً"></textarea><button class="btn sm" id="sg-pgo" type="button">استلام</button></details>');
    $("#sg-pgo").onclick = async function () {
      var m = $("#sg-paste").value.match(/SAMT:([A-Za-z0-9-]+):([A-Za-z0-9_\-.]+)/);
      if (!m) return A.toast("لم يُعثر على رمز الرد في النص", "err");
      var cfg = A.S.settings, relay = cfg.relayUrl; cfg.relayUrl = cfg.relayUrl || "about:blank";
      var ok = await A.handleRelay(m[1], m[2]).catch(function () { return false; }); cfg.relayUrl = relay;
      A.toast(ok ? "تم الاستلام" : "الرد غير صالح أو مستلم سابقاً", ok ? "" : "err"); if (ok) A.route();
    };
    $("#sg-poll").onclick = function () { A.poll(true); };
    $("#sg-last").textContent = A.lastPoll ? "آخر تحقق: " + SL.time(A.lastPoll) : "";
  };

  /* ————— السلوك المتميز ————— */
  V.merit = function (p, q) {
    setTitle("السلوك المتميز");
    var stu = q.s ? A.byId[q.s] : null;
    var now = SL.isoDay();
    main().innerHTML = '<form class="form card" id="fm"><div class="picked" id="fm-stu"></div>' +
      '<label>الممارسة<select name="practice">' + R.MERITS.map(function (m) { return '<option value="' + m.id + '">' + e(m.t) + " — " + m.pts + " درجات</option>"; }).join("") + "</select></label>" +
      '<div class="grid2"><label>الدرجة<input name="pts" type="number" min="1" max="6" value="6"></label><label>تاريخ التنفيذ<input name="date" type="date" value="' + now + '"></label></div>' +
      '<label>الموضوع<select name="topic"><option value="">—</option>' + R.MERIT_TOPICS.map(function (t) { return "<option>" + e(t) + "</option>"; }).join("") + "</select></label>" +
      '<label>الشواهد<input name="evidence" placeholder="ما يثبت المشاركة"></label><label>ملاحظة<input name="note"></label>' +
      '<label>راصد السلوك<select name="by"><option value="">—</option>' + A.S.staff.map(function (x) { return '<option value="' + e(x.id) + '">' + e(x.name) + "</option>"; }).join("") + "</select></label>" +
      '<p class="note">المرجع: المادة (5) — يُخصص للسلوك المتميز 20% من درجة السلوك، ولا تتجاوز درجة السلوك 100. ممارسة «الانضباط وعدم الغياب بدون عذر» تُحتسب مرة واحدة في الفصل.</p>' +
      '<div class="actions"><button class="btn pri" type="submit">حفظ</button></div></form>';
    function drawStu() {
      $("#fm-stu").innerHTML = stu ? '<div class="stu-mini">' + A.scoreChip(stu) + " <b>" + e(stu.name) + '</b> <button class="link" type="button" id="fm-chg">تغيير</button></div>' : '<button class="btn pri big" type="button" id="fm-pick">اختر الطالب</button>';
      ($("#fm-pick") || $("#fm-chg")).onclick = function () { pickStudent(function (s) { stu = s; drawStu(); }); };
    }
    drawStu();
    var sel = $("[name=practice]"), pts = $("[name=pts]");
    sel.onchange = function () { var m = R.MERITS.find(function (x) { return x.id === sel.value; }); pts.value = m.pts; pts.readOnly = !m.custom; };
    sel.onchange();
    $("#fm").onsubmit = async function (ev) {
      ev.preventDefault(); if (!stu) return A.toast("اختر الطالب", "err");
      var f = new FormData(this), m = R.MERITS.find(function (x) { return x.id === f.get("practice"); });
      if (m.once && A.S.merits.some(function (x) { return x.stu === stu.id && x.practice === m.id; }) && !(await A.confirm("سبق احتساب هذه الممارسة للطالب. احتسابها مرة أخرى؟"))) return;
      var by = A.byId[f.get("by")];
      await A.save({ id: "M" + SL.rid(10), t: "mer", stu: stu.id, practice: m.id, pts: Math.min(6, Math.max(1, +f.get("pts") || m.pts)), date: f.get("date"), topic: f.get("topic"), evidence: f.get("evidence"), note: f.get("note"), by: by ? by.id : "", byName: by ? by.name : "" });
      A.toast("تمت إضافة " + f.get("pts") + " درجات"); A.go("student/" + stu.id);
    };
  };

  /* ————— المزيد ————— */
  V.more = function () {
    setTitle("المزيد");
    main().innerHTML = '<div class="tiles">' +
      [["#staff", "المعلمون والإدارة", "teacher"], ["#import", "استيراد من Excel", "upload"], ["#merit", "السلوك المتميز", "star"], ["#absence", "الغياب — ربط وهج", "calendar"], ["#sigs", "التوقيعات عن بُعد", "pen"], ["#commit", "الالتزام المدرسي", "doc"], ["#settings", "الإعدادات والاشتراك", "gear"], ["#log", "سجل العمليات", "clock"]]
        .map(function (x) { return '<a class="tile" href="' + x[0] + '"><span class="tile-i">' + SLI(x[2]) + "</span><b>" + e(x[1]) + "</b></a>"; }).join("") +
      (A.installed() ? "" : '<button class="tile" type="button" id="mo-inst"><span class="tile-i">' + SLI("download") + "</span><b>تثبيت التطبيق على هذا الجهاز</b></button>") + "</div>" +
      '<p class="mut center">سَمْت — الإصدار ' + e(C.version || C.BUILTIN) + " · " + e(C.licLabel(C.lic)) + "</p>";
    var ib = $("#mo-inst"); if (ib) ib.onclick = A.install;
  };
  A.installed = function () { return window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true; };
  A.install = async function () {
    if (window.__bip) { var p = window.__bip; p.prompt(); var r = await p.userChoice; window.__bip = null; if (r && r.outcome === "accepted") A.toast("تم تثبيت «سَمْت» — ستجده على سطح المكتب وفي قائمة التطبيقات"); return; }
    var ua = navigator.userAgent, ios = /iPhone|iPad|iPod/.test(ua), mac = /Macintosh/.test(ua) && !/Chrome|Edg/.test(ua), android = /Android/.test(ua);
    var steps = ios ? "<ol><li>افتح الرابط في <b>Safari</b>.</li><li>اضغط زر المشاركة ⬆️ أسفل الشاشة.</li><li>اختر <b>إضافة إلى الشاشة الرئيسية</b> ثم <b>إضافة</b>.</li></ol>"
      : mac ? "<ol><li>في Safari: من قائمة <b>ملف</b> اختر <b>إضافة إلى Dock</b>.</li><li>أو افتح الرابط في <b>Chrome</b> لتثبيته.</li></ol>"
      : android ? "<ol><li>افتح القائمة ⋮ أعلى Chrome.</li><li>اختر <b>تثبيت التطبيق</b> أو <b>إضافة إلى الشاشة الرئيسية</b>.</li></ol>"
      : "<ol><li>افتح القائمة ⋮ أعلى يمين Chrome.</li><li>اختر <b>الإرسال والحفظ والمشاركة</b> ← <b>تثبيت الصفحة كتطبيق</b> (أو <b>تثبيت سَمْت</b>).</li><li>في Edge: القائمة … ← <b>التطبيقات</b> ← <b>تثبيت هذا الموقع كتطبيق</b>.</li></ol>";
    A.sheet("تثبيت التطبيق", '<p>المتصفح لم يعرض نافذة التثبيت تلقائياً. ثبّته يدوياً:</p>' + steps + '<p class="note">إن كان التطبيق مثبتاً مسبقاً على هذا الجهاز فافتحه من سطح المكتب أو قائمة التطبيقات.</p>');
  };

  V.log = function () {
    setTitle("سجل العمليات");
    var l = A.S.log.slice().sort(function (a, b) { return b.at - a.at; }).slice(0, 300);
    main().innerHTML = l.length ? '<ul class="list">' + l.map(function (x) { return '<li><div class="row2">' + e(x.text) + '</div><div class="row3 mut">' + e(SL.hijri(x.at)) + " " + e(SL.time(x.at)) + "</div></li>"; }).join("") + "</ul>" : empty("لا يوجد.");
  };

  /* ————— الالتزام المدرسي بالجملة ————— */
  V.commit = function () {
    setTitle("الالتزام المدرسي");
    var l = A.S.students.slice().sort(function (a, b) { return A.classKey(a).localeCompare(A.classKey(b), "ar") || a.name.localeCompare(b.name, "ar"); });
    var signed = l.filter(function (s) { return A.sigFor(s.id, "F1", "parent"); }).length;
    main().innerHTML = '<section class="card"><p>يؤخذ توقيع الطالب وولي الأمر على نموذج الالتزام المدرسي في بداية العام الدراسي. اضغط «إرسال» لكل ولي أمر، أو استخدم «التالي» للتنقل السريع.</p>' +
      '<p><b>' + signed + "</b> من " + l.length + ' وقّعوا.</p><div class="actions"><button class="btn wa" id="cm-next" type="button">إرسال للتالي غير الموقّع</button></div></section><ul class="list" id="cm-l">' +
      l.map(function (s) { var g = A.sigFor(s.id, "F1", "parent"), pd = A.pendingFor(s.id, "F1", "parent");
        return '<li class="frow"><div class="row1">' + stuLine(s) + '</div><div class="row3">' + (g ? '<span class="chip ok">وقّع</span>' : pd ? '<span class="chip pend">أُرسل</span>' : SL.validPhone(s.parentPhone) ? '<button class="btn sm wa" type="button" data-sign-send="stu|' + s.id + '|F1">إرسال</button>' : '<span class="chip warnc">بلا جوال</span>') + "</div></li>"; }).join("") + "</ul>";
    bindFormRows();
    $("#cm-next").onclick = function () {
      var n = l.find(function (s) { return SL.validPhone(s.parentPhone) && !A.sigFor(s.id, "F1", "parent") && !A.pendingFor(s.id, "F1", "parent"); });
      if (!n) return A.toast("أُرسل للجميع"); A.sendSign("stu", n.id, "F1");
    };
  };
})();

/* سَمْت — المعلمون والإدارة، الاستيراد، الإعدادات */
(function () {
  "use strict";
  var R = window.RULES, SL = window.SL, C = window.SLCore, A = window.APP, e = SL.esc;
  var $ = A.$, $$ = A.$$, V = A.views, ROLE = A.ROLE;
  function main() { return document.getElementById("main"); }
  function setTitle(t) { $("#top-title").textContent = t; document.title = t + " — سَمْت"; }

  /* ————— المعلمون والإدارة ————— */
  V.staff = function () {
    setTitle("المعلمون والإدارة");
    var order = ["principal", "deputy", "deputyEdu", "counselor", "activity", "admin", "teacher"];
    var l = A.S.staff.slice().sort(function (a, b) { return order.indexOf(a.role) - order.indexOf(b.role) || a.name.localeCompare(b.name, "ar"); });
    var missing = ["principal", "deputy", "counselor"].filter(function (r) { return !A.S.staff.some(function (x) { return x.role === r; }); });
    main().innerHTML = (missing.length ? '<div class="alert warn">لم يُحدد بعد: ' + missing.map(function (r) { return ROLE[r]; }).join("، ") + " — تظهر أسماؤهم في النماذج.</div>" : "") +
      '<div class="toolbar"><button class="btn pri" id="sf-add" type="button">إضافة</button><a class="btn" href="#import">استيراد من Excel</a>' +
      '<button class="btn wa" id="sf-links" type="button">إرسال روابط الرصد للمعلمين</button></div>' +
      (l.length ? '<ul class="list">' + l.map(function (x) {
        return '<li class="frow"><div class="row1"><b>' + e(x.name) + '</b> <span class="chip">' + e(ROLE[x.role] || x.role) + "</span>" + (x.subject ? ' <small class="mut">' + e(x.subject) + "</small>" : "") + "</div>" +
          '<div class="row3">' + (SL.validPhone(x.phone) ? '<span dir="ltr">' + e(SL.showPhone(x.phone)) + "</span>" : '<span class="chip warnc">بلا جوال</span>') + (x.classes ? ' <small class="mut">الفصول: ' + e(x.classes) + "</small>" : "") + "</div>" +
          '<div class="actions wrap"><button class="btn sm" type="button" data-ed="' + x.id + '">تعديل</button>' +
          (SL.validPhone(x.phone) ? '<button class="btn sm wa" type="button" data-link="' + x.id + '">' + (x.role === "counselor" ? "رابط الموجه" : "رابط الرصد") + '</button><button class="btn sm" type="button" data-msg="' + x.id + '">رسالة</button>' : "") + "</div></li>";
      }).join("") + "</ul>" : '<div class="empty"><p>لا توجد بيانات.</p></div>');
    $("#sf-add").onclick = function () { editStaff(null); };
    $$("[data-ed]").forEach(function (b) { b.onclick = function () { editStaff(A.byId[b.dataset.ed]); }; });
    $$("[data-link]").forEach(function (b) { b.onclick = function () { A.sendTeacherLink(A.byId[b.dataset.link]); }; });
    $$("[data-msg]").forEach(function (b) { b.onclick = function () { var x = A.byId[b.dataset.msg]; SL.openWa(x.phone, "الأستاذ " + x.name + "\n"); }; });
    $("#sf-links").onclick = function () {
      var ts = A.S.staff.filter(function (x) { return SL.validPhone(x.phone) && x.role !== "principal"; });
      if (!ts.length) return A.toast("لا يوجد منسوبون بأرقام جوال", "err");
      var i = 0;
      var sh = A.sheet("إرسال روابط الرصد", '<p>سيُفتح واتساب لكل منسوب على حدة. بعد الإرسال ارجع هنا واضغط «التالي».</p><p id="tl-n"></p><div class="actions"><button class="btn wa" id="tl-go" type="button">إرسال</button></div>');
      function upd() { $("#tl-n", sh.body).textContent = i < ts.length ? (i + 1) + " من " + ts.length + ": " + ts[i].name : "تم الإرسال للجميع."; $("#tl-go", sh.body).textContent = i < ts.length ? (i ? "التالي" : "إرسال") : "إغلاق"; }
      $("#tl-go", sh.body).onclick = function () { if (i >= ts.length) return sh.close(); A.sendTeacherLink(ts[i]); i++; upd(); };
      upd();
    };
  };
  function editStaff(x) {
    var s = x || { role: "teacher", school: (A.S.settings.schools[0] || {}).id };
    var sh = A.sheet(x ? "تعديل" : "إضافة منسوب", '<form class="form" id="fsf">' + A.fld("name", "الاسم", s.name, 1) + A.fld("sid", "رقم السجل المدني", s.sid) +
      '<label>الوظيفة<select name="role">' + Object.keys(ROLE).map(function (r) { return '<option value="' + r + '"' + (r === s.role ? " selected" : "") + ">" + ROLE[r] + "</option>"; }).join("") + "</select></label>" +
      (A.S.settings.schools.length > 1 ? '<label>المدرسة<select name="school"><option value="">كل المدارس</option>' + A.S.settings.schools.map(function (z) { return '<option value="' + e(z.id) + '"' + (z.id === s.school ? " selected" : "") + ">" + e(z.name) + "</option>"; }).join("") + "</select></label>" : "") +
      A.fld("phone", "الجوال", SL.showPhone(s.phone), 0, "tel") + A.fld("subject", "المادة / التخصص", s.subject) +
      A.fld("classes", "الفصول (اختياري — مثال: الأول/1، الثاني/2)", s.classes) +
      '<div class="actions"><button class="btn pri" type="submit">حفظ</button>' + (x ? '<button class="btn danger" type="button" id="fsf-del">حذف</button>' : "") + "</div></form>");
    $("#fsf", sh.body).onsubmit = async function (ev) {
      ev.preventDefault(); var f = new FormData(this);
      var rec = Object.assign({}, s, { t: "stf", id: s.id || "T" + SL.rid(10), name: String(f.get("name")).trim(), sid: String(f.get("sid") || "").trim(), role: f.get("role"), phone: SL.normPhone(f.get("phone")), subject: f.get("subject"), classes: f.get("classes") });
      if (f.has("school")) rec.school = f.get("school");
      await A.save(rec); sh.close(); A.route();
    };
    var d = $("#fsf-del", sh.body); if (d) d.onclick = async function () { if (await A.confirm("حذف " + s.name + "؟")) { await A.remove(s); sh.close(); A.route(); } };
  }

  /* رابط رصد المعلم: قائمة فصوله داخل الرابط + مفتاح تشفير خاص به */
  A.sendTeacherLink = async function (x) {
    var cfg = A.S.settings, base = SL.base(cfg.publicBase);
    if (!cfg.relayUrl || !base) { A.toast("أكمل إعداد الروابط أولاً", "err"); return A.go("settings?tab=links"); }
    if (!x.key) { x.key = SL.newKey(); await A.save(x); }
    var isC = x.role === "counselor";
    var want = isC ? [] : String(x.classes || "").split(/[،,;]+/).map(function (c) { return A.norm(c).replace(/\s*\/\s*/g, "/"); }).filter(Boolean);
    var cls = {}, cst = {};
    A.S.students.forEach(function (s) {
      if (x.school && s.school !== x.school) return;
      var k = A.classKey(s), kn = A.norm((s.grade || "") + "/" + (s.section || "")).replace(/\s*\/\s*/g, "/");
      if (want.length && !want.some(function (w) { return kn === w || kn.indexOf(w) >= 0; })) return;
      (cls[k] = cls[k] || []).push(s.name); cst[k] = A.stageOf(s);
    });
    Object.keys(cls).forEach(function (k) { cls[k].sort(function (a, b) { return a.localeCompare(b, "ar"); }); });
    var stages = {}; A.S.settings.schools.forEach(function (z) { if (!x.school || z.id === x.school) stages[R.stageOf(z.stage)] = 1; });
    var payload = { v: 1, kind: "teacher", tid: x.id, name: x.name, subject: x.subject || "", school: x.school ? A.school(x.school).name : A.S.settings.schools.map(function (z) { return z.name; }).join(" و"),
      stage: Object.keys(stages).length === 1 ? Object.keys(stages)[0] : "ms", box: cfg.box, relay: cfg.relayUrl, k: x.key, wa: SL.normPhone(cfg.schoolWa), cls: cls, cst: cst, role: isC ? "counselor" : "teacher" };
    if (x.lk) SL.short.del(cfg.relayUrl, x.lk);
    var lk = await SL.makeLink(base, "teacher.html", cfg.relayUrl, payload), link = lk.url;
    x.lk = lk.code; await A.save(x);
    SL.openWa(x.phone, A.fill(isC ? cfg.tpl.counselorLink : cfg.tpl.teacherLink, { "المعلم": x.name, "الرابط": link, "المدرسة": payload.school }));
    A.log("إرسال رابط الرصد " + (isC ? "للموجه الطلابي " : "للمعلم ") + x.name);
  };

  /* ————— الاستيراد من Excel ————— */
  var MAP = {
    stu: { name: ["اسم الطالب", "الاسم", "اسم", "الطالب", "اسم الطالبة"], sid: ["السجل المدني", "رقم السجل", "رقم الهوية", "الهوية", "الإقامة", "السجل"],
      school: ["المدرسة"], stage: ["المرحلة"], grade: ["الصف"], section: ["الفصل", "الشعبة"], parentName: ["اسم ولي الأمر", "ولي الأمر"],
      parentPhone: ["جوال ولي الأمر", "جوال ولي الامر", "رقم الجوال", "الجوال", "جوال", "رقم ولي الأمر", "هاتف"], parentPhone2: ["جوال آخر", "جوال اخر", "جوال 2", "رقم آخر"] },
    stf: { name: ["الاسم", "اسم المعلم", "اسم الموظف", "اسم المنسوب", "اسم"], sid: ["السجل المدني", "رقم الهوية", "الهوية", "السجل"], role: ["الوظيفة", "العمل الحالي", "المسمى", "العمل", "المهمة"],
      phone: ["الجوال", "جوال", "رقم الجوال", "هاتف"], subject: ["المادة", "التخصص"], classes: ["الفصول", "الفصل"], school: ["المدرسة"] }
  };
  var LBL = { stage: "المرحلة", name: "الاسم", sid: "السجل المدني", school: "المدرسة", grade: "الصف", section: "الفصل", parentName: "اسم ولي الأمر", parentPhone: "جوال ولي الأمر", parentPhone2: "جوال آخر", role: "الوظيفة", phone: "الجوال", subject: "المادة", classes: "الفصول" };
  function guessRole(t) {
    t = A.norm(t);
    if (/وكيل.*(طلا|طلب)/.test(t)) return "deputy";
    if (/وكيل.*(تعليم|شؤون تعليم)/.test(t)) return "deputyEdu";
    if (/وكيل/.test(t)) return "deputy";
    if (/مدير|قائد/.test(t)) return "principal";
    if (/موجه|مرشد/.test(t)) return "counselor";
    if (/رائد/.test(t)) return "activity";
    if (/معلم|مدرس/.test(t) || !t) return "teacher";
    return "admin";
  }
  function detect(headers) {
    var hn = headers.map(function (h) { return A.norm(h); });
    function col(list) { for (var i = 0; i < list.length; i++) { var j = hn.indexOf(A.norm(list[i])); if (j >= 0) return j; } for (i = 0; i < list.length; i++) { j = hn.findIndex(function (h) { return h && h.indexOf(A.norm(list[i])) >= 0; }); if (j >= 0) return j; } return -1; }
    var type = (col(MAP.stu.grade) >= 0 || col(["اسم الطالب"]) >= 0) && col(["الوظيفة", "العمل الحالي"]) < 0 ? "stu" : col(MAP.stf.role) >= 0 || col(["اسم المعلم"]) >= 0 ? "stf" : "";
    var m = {}; if (type) Object.keys(MAP[type]).forEach(function (k) { m[k] = col(MAP[type][k]); });
    return { type: type, map: m };
  }
  function findHeaderRow(rows) {
    for (var i = 0; i < Math.min(rows.length, 15); i++) {
      var r = rows[i] || [], txt = A.norm(r.join(" "));
      if (/(الاسم|اسم الطالب|اسم المعلم)/.test(txt) && r.filter(function (c) { return String(c).trim(); }).length >= 2) return i;
    }
    return 0;
  }
  V["import"] = function () {
    setTitle("الاستيراد من Excel");
    main().innerHTML = '<section class="card"><p>ارفع ملف Excel يحتوي ورقة للطلاب وورقة للمعلمين والإدارة (أو ملفاً لكل منهما). يتعرف النظام على الأعمدة تلقائياً ويمكنك تعديلها قبل الحفظ. يُحدَّث الطالب الموجود عند تطابق السجل المدني.</p>' +
      '<div class="actions wrap"><label class="btn pri">اختيار ملف<input id="im-f" type="file" accept=".xlsx,.xls,.csv" hidden></label><a class="btn" href="template.xlsx" download>تنزيل القالب</a></div></section><div id="im-out"></div>';
    $("#im-f").onchange = async function () {
      var f = this.files[0]; if (!f) return;
      $("#im-out").innerHTML = '<p class="mut">جارٍ القراءة…</p>';
      try { await A.loadScript("xlsx.full.min.js"); } catch (err) { $("#im-out").innerHTML = '<p class="alert err">تعذّر تحميل قارئ Excel.</p>'; return; }
      var wb = XLSX.read(await f.arrayBuffer(), { type: "array" });
      var sheets = wb.SheetNames.map(function (n) {
        var rows = XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: false, defval: "" });
        var hi = findHeaderRow(rows), headers = (rows[hi] || []).map(function (h) { return String(h).trim(); });
        var d = detect(headers);
        return { name: n, headers: headers, rows: rows.slice(hi + 1).filter(function (r) { return r.some(function (c) { return String(c).trim(); }); }), type: d.type, map: d.map };
      }).filter(function (s) { return s.headers.length; });
      drawSheets(sheets);
    };
  };
  function drawSheets(sheets) {
    var schools = A.S.settings.schools;
    var html = sheets.map(function (s, si) {
      return '<section class="card imp" data-si="' + si + '"><h3>الورقة: ' + e(s.name) + ' <small class="mut">(' + s.rows.length + " صف)</small></h3>" +
        '<label>نوع البيانات<select class="im-type"><option value="">تجاهل</option><option value="stu"' + (s.type === "stu" ? " selected" : "") + '>الطلاب</option><option value="stf"' + (s.type === "stf" ? " selected" : "") + ">المعلمون والإدارة</option></select></label>" +
        '<div class="im-map"></div>' +
        (schools.length ? '<label>المدرسة الافتراضية (عند غياب عمود المدرسة)<select class="im-sc">' + schools.map(function (z) { return '<option value="' + e(z.id) + '">' + e(z.name) + "</option>"; }).join("") + "</select></label>" : '<p class="alert warn sm">لم تُضف مدرسة في الإعدادات — ستُنشأ تلقائياً من عمود المدرسة أو باسم «مدرستي».</p>') +
        '<label>المرحلة (لمن لا تظهر مرحلته في الصف أو عمود المرحلة)<select class="im-stg"><option value="">تلقائي حسب المدرسة</option><option>ابتدائي</option><option>متوسط</option><option>ثانوي</option></select></label>' +
        '<div class="im-prev"></div></section>';
    }).join("") + '<div class="actions"><button class="btn pri big" id="im-go" type="button">حفظ البيانات</button></div>';
    $("#im-out").innerHTML = html;
    $$(".imp").forEach(function (sec) {
      var s = sheets[+sec.dataset.si];
      function drawMap() {
        var t = $(".im-type", sec).value; s.type = t;
        if (!t) { $(".im-map", sec).innerHTML = ""; $(".im-prev", sec).innerHTML = ""; return; }
        if (!s.map || !Object.keys(s.map).length || !(("name" in s.map) && Object.keys(MAP[t]).every(function (k) { return k in s.map; }))) s.map = detect(s.headers).type === t ? detect(s.headers).map : {};
        $(".im-map", sec).innerHTML = '<div class="grid3">' + Object.keys(MAP[t]).map(function (k) {
          var v = s.map[k] == null ? -1 : s.map[k];
          return "<label>" + LBL[k] + '<select data-k="' + k + '"><option value="-1">—</option>' + s.headers.map(function (h, i) { return '<option value="' + i + '"' + (i === v ? " selected" : "") + ">" + e(h || "عمود " + (i + 1)) + "</option>"; }).join("") + "</select></label>";
        }).join("") + "</div>";
        $$(".im-map select", sec).forEach(function (sl) { sl.onchange = function () { s.map[sl.dataset.k] = +sl.value; prev(); }; });
        prev();
      }
      function prev() {
        var t = s.type, keys = Object.keys(MAP[t]).filter(function (k) { return s.map[k] >= 0; });
        $(".im-prev", sec).innerHTML = '<div class="tbl-wrap"><table class="tbl"><thead><tr>' + keys.map(function (k) { return "<th>" + LBL[k] + "</th>"; }).join("") + "</tr></thead><tbody>" +
          s.rows.slice(0, 5).map(function (r) { return "<tr>" + keys.map(function (k) { return "<td>" + e(r[s.map[k]]) + "</td>"; }).join("") + "</tr>"; }).join("") + "</tbody></table></div>";
      }
      $(".im-type", sec).onchange = drawMap; drawMap();
    });
    $("#im-go").onclick = async function () {
      var S = A.S, schools = S.settings.schools, nS = 0, uS = 0, nT = 0, uT = 0, bad = 0, recs = [];
      function schoolId(name, def) {
        name = String(name || "").trim();
        if (!name) return def || (schools[0] && schools[0].id) || ensureSchool("مدرستي");
        var z = schools.find(function (x) { return A.norm(x.name) === A.norm(name); });
        return z ? z.id : ensureSchool(name);
      }
      function ensureSchool(name) { var z = { id: "C" + SL.rid(6), name: name, stage: /ابتدائ/.test(name) ? "ابتدائي" : /ثانو/.test(name) ? "ثانوي" : "متوسط", region: "", admin: "" }; schools.push(z); return z.id; }
      var bySid = {}, byKey = {};
      S.students.forEach(function (x) { if (x.sid) bySid[x.sid] = x; byKey[A.norm(x.name) + "|" + A.norm(x.grade) + "|" + A.norm(x.section)] = x; });
      var stfBy = {}; S.staff.forEach(function (x) { stfBy[x.sid || A.norm(x.name)] = x; });
      $$(".imp").forEach(function (sec) {
        var s = sheets[+sec.dataset.si]; if (!s.type) return;
        var def = $(".im-sc", sec) ? $(".im-sc", sec).value : "", defStg = $(".im-stg", sec) ? $(".im-stg", sec).value : "";
        function g(r, k) { return s.map[k] >= 0 ? String(r[s.map[k]] == null ? "" : r[s.map[k]]).trim() : ""; }
        s.rows.forEach(function (r) {
          var name = g(r, "name"); if (!name || name.length < 3) { bad++; return; }
          var sid = g(r, "sid").replace(/[٠-٩]/g, function (d) { return "٠١٢٣٤٥٦٧٨٩".indexOf(d); }).replace(/\D/g, "");
          if (s.type === "stu") {
            var stg = g(r, "stage"), rec = { t: "stu", name: name, sid: sid, school: schoolId(g(r, "school"), def), grade: g(r, "grade"), stageHint: /ابتدائ/.test(stg) ? "ابتدائي" : /متوسط/.test(stg) ? "متوسط" : /ثانو/.test(stg) ? "ثانوي" : (/ابتدائ|متوسط|ثانو/.test(g(r, "grade")) ? "" : defStg), section: g(r, "section"), parentName: g(r, "parentName"), parentPhone: SL.normPhone(g(r, "parentPhone")), parentPhone2: SL.normPhone(g(r, "parentPhone2")) };
            var old = (sid && bySid[sid]) || byKey[A.norm(name) + "|" + A.norm(rec.grade) + "|" + A.norm(rec.section)];
            if (old) { Object.keys(rec).forEach(function (k) { if (rec[k]) old[k] = rec[k]; }); recs.push(old); uS++; }
            else { rec.id = "S" + SL.rid(10); recs.push(rec); if (sid) bySid[sid] = rec; nS++; }
          } else {
            var t = { t: "stf", name: name, sid: sid, role: guessRole(g(r, "role")), roleText: g(r, "role"), phone: SL.normPhone(g(r, "phone")), subject: g(r, "subject"), classes: g(r, "classes"), school: g(r, "school") ? schoolId(g(r, "school"), def) : "" };
            var o2 = stfBy[sid || A.norm(name)];
            if (o2) { Object.keys(t).forEach(function (k) { if (t[k]) o2[k] = t[k]; }); recs.push(o2); uT++; }
            else { t.id = "T" + SL.rid(10); recs.push(t); stfBy[sid || A.norm(name)] = t; nT++; }
          }
        });
      });
      await A.saveMany(recs); await A.saveSettings();
      A.log("استيراد: " + nS + " طالب جديد، " + uS + " محدّث، " + nT + " منسوب جديد، " + uT + " محدّث");
      $("#im-out").innerHTML = '<section class="card"><h3>تم الاستيراد</h3><ul><li>طلاب جدد: <b>' + nS + "</b> · محدّثون: " + uS + "</li><li>منسوبون جدد: <b>" + nT + "</b> · محدّثون: " + uT + "</li>" + (bad ? "<li>صفوف تم تجاهلها (بلا اسم): " + bad + "</li>" : "") +
        '</ul><div class="actions wrap"><a class="btn pri" href="#students">الطلاب</a><a class="btn" href="#staff">المعلمون والإدارة</a><a class="btn" href="#students">تحديد مراحل الطلاب</a></div></section>';
      var noPhone = A.S.students.filter(function (x) { return !SL.validPhone(x.parentPhone); }).length;
      if (noPhone) $("#im-out").insertAdjacentHTML("beforeend", '<p class="alert warn">' + noPhone + " طالب بلا رقم جوال صحيح لولي الأمر (يجب أن يبدأ بـ 05 ويتكون من 10 أرقام).</p>");
    };
  }

  /* ————— الإعدادات ————— */
  V.settings = function (p, q) {
    setTitle("الإعدادات");
    var cfg = A.S.settings, tab = q.tab || "school";
    var tabs = [["school", "المدرسة"], ["links", "الروابط والتوقيع"], ["msgs", "الرسائل"], ["backup", "النسخ الاحتياطي"], ["lic", "الاشتراك والتحديث"], ["sec", "القفل"]];
    var html = '<div class="tabs">' + tabs.map(function (t) { return '<a href="#settings?tab=' + t[0] + '" class="' + (t[0] === tab ? "on" : "") + '">' + t[1] + "</a>"; }).join("") + "</div>";
    if (tab === "school") {
      html += '<section class="card"><h3>المدارس</h3><p class="mut">تحدد المرحلة المواد المطبقة: الابتدائية (6–9) أو المتوسطة والثانوية (10–14)، والمادتان (15–16) لجميع المراحل. في المدرسة المدمجة (ابتدائي + متوسط، أو متوسط + ثانوي) تُحدد مرحلة كل طالب من نص الصف (مثل «الأول المتوسط» أو «الثاني الثانوي»)، أو من عمود «المرحلة» في ملف Excel.</p><div id="sc-l">' +
        cfg.schools.map(function (z, i) { return schoolForm(z, i); }).join("") + '</div><button class="btn" id="sc-add" type="button">＋ إضافة مدرسة</button></section>' +
        '<section class="card"><label class="row-check"><input type="checkbox" id="sc-logo"' + (cfg.useLogo ? " checked" : "") + "> إظهار شعار وزارة التعليم في ترويسة النماذج</label></section>" +
        '<div class="actions"><button class="btn pri big" id="sc-save" type="button">حفظ</button></div>';
    } else if (tab === "links") {
      var base = SL.base(cfg.publicBase);
      html += '<section class="card"><h3>التوقيع عن بُعد وبلاغات المعلمين</h3>' +
        '<p>يوقّع ولي الأمر عبر رابط يصله بالواتساب، فيعود التوقيع <b>مشفراً</b> عبر صندوق بريد مؤقت ويظهر هنا تلقائياً، ثم يُحذف من الصندوق. بيانات الطلاب لا تُرفع لأي خادم.</p>' +
        '<label>عنوان صفحة التوقيع العامة<input id="ln-base" dir="ltr" value="' + e(cfg.publicBase || "") + '" placeholder="' + e(base || "https://example.github.io/samt/") + '"></label>' +
        '<label>عنوان صندوق البريد (Firebase Realtime Database)<input id="ln-relay" dir="ltr" value="' + e(cfg.relayUrl || "") + '" placeholder="https://xxxx-default-rtdb.europe-west1.firebasedatabase.app"></label>' +
        '<label>رقم واتساب المدرسة (احتياطي عند تعذّر الوصول)<input id="ln-wa" dir="ltr" type="tel" value="' + e(SL.showPhone(cfg.schoolWa)) + '"></label>' +
        '<label>صلاحية رابط التوقيع (ساعة)<input id="ln-h" type="number" min="1" max="720" value="' + e(cfg.linkHours) + '"></label>' +
        '<p class="mut">رمز صندوق هذا الجهاز: <code dir="ltr">' + e(cfg.box) + "</code></p>" +
        '<div class="actions wrap"><button class="btn pri" id="ln-save" type="button">حفظ</button><button class="btn" id="ln-test" type="button">اختبار الاتصال</button></div><p id="ln-msg"></p></section>';
    } else if (tab === "msgs") {
      var names = { sign: "رابط التوقيع لولي الأمر", notify: "إشعار عام لولي الأمر", absence: "إشعار غياب", teacherLink: "رابط الرصد للمعلم", counselorLink: "رابط الرصد للموجه الطلابي", teacherDone: "إبلاغ المعلم بالاعتماد", referral: "إحالة للموجه الطلابي" };
      html += '<section class="card"><p class="mut">المتغيرات: {الطالب} {الصف} {المدرسة} {النموذج} {الرابط} {المدة} {المعلم} {المشكلة} {الإجراء} {الموجه} {النوع} {العدد}. لا تُذكر تفاصيل المخالفة في رسائل ولي الأمر حفاظاً على السرية.</p>' +
        Object.keys(names).map(function (k) { return "<label>" + names[k] + '<textarea data-tpl="' + k + '" rows="5">' + e(cfg.tpl[k]) + "</textarea></label>"; }).join("") +
        '<div class="actions"><button class="btn pri" id="tp-save" type="button">حفظ</button><button class="btn" id="tp-reset" type="button">استعادة الافتراضي</button></div></section>';
    } else if (tab === "backup") {
      var FS = C.FS || {};
      html += '<section class="card"><h3>مجلد البيانات sammt</h3>' + (!FS.supported ? '<p class="alert warn sm">هذا المتصفح لا يدعم الحفظ في مجلد على القرص (يعمل على Chrome وEdge في الكمبيوتر). استخدم النسخ الاحتياطي اليدوي أدناه.</p>' :
        '<p>تُحفظ كل البيانات تلقائياً في مجلد <b>sammt</b> على قرص الجهاز بعد كل تعديل، مع نسخة يومية في <code>sammt/backups</code> (آخر 30 يوماً). مسح المتصفح أو حذفه لا يؤثر عليها: أعد ربط المجلد فتُستعاد البيانات والاشتراك.</p>' +
        '<p>الحالة: ' + (FS.ok ? '<span class="chip ok">مربوط' + (FS.handle ? ' — ' + e(FS.handle.name) : '') + '</span>' + (FS.savedAt ? ' <span class="mut">آخر حفظ: ' + e(SL.hijri(FS.savedAt)) + ' ' + e(SL.time(FS.savedAt)) + '</span>' : '') : '<span class="chip warnc">غير مربوط</span>') + '</p>' +
        '<div class="actions wrap"><button class="btn pri" id="fs-pick" type="button">' + (FS.ok ? 'تغيير المجلد' : 'ربط مجلد sammt') + '</button>' + (FS.ok ? '<button class="btn" id="fs-now" type="button">حفظ الآن</button>' : '') + '</div><p id="fs-m"></p>') + '</section>';
      html += '<section class="card"><h3>النسخ الاحتياطي اليدوي</h3><p>كل البيانات محفوظة على هذا الجهاز فقط. احفظ نسخة أسبوعياً على الأقل في مكان آمن (ذاكرة خارجية أو بريدك).</p>' +
        '<p class="mut">آخر نسخة: ' + (cfg.lastBackup ? e(SL.hijri(cfg.lastBackup)) + " " + e(SL.time(cfg.lastBackup)) : "لا يوجد") + "</p>" +
        '<label>كلمة مرور لتشفير النسخة (اختياري لكن يُنصح به)<input id="bk-pw" type="password" autocomplete="new-password"></label>' +
        '<div class="actions wrap"><button class="btn pri" id="bk-dl" type="button">تنزيل نسخة احتياطية</button><label class="btn">استعادة من نسخة<input id="bk-up" type="file" accept=".json,.samt" hidden></label></div></section>' +
        '<section class="card"><h3>نقل البيانات لجهاز آخر</h3><p class="mut">نزّل نسخة من هذا الجهاز ثم استعدها في الجهاز الجديد. الاشتراك مرتبط بالجهاز، فيحتاج الجهاز الجديد كوداً خاصاً به.</p></section>' +
        '<section class="card danger-zone"><h3>حذف جميع البيانات</h3><button class="btn danger" id="bk-wipe" type="button">حذف كل بيانات الطلاب والمخالفات</button></section>';
    } else if (tab === "lic") {
      var L = C.lic || {};
      html += '<section class="card"><h3>الاشتراك</h3><p>الحالة: <b>' + e(C.licLabel(L)) + '</b></p><div class="lock-dev"><span>رقم الجهاز</span><b dir="ltr">' + e(L.dev || "") + '</b><button class="btn sm" type="button" id="lc-copy">نسخ</button></div>' +
        '<label>كود الاشتراك<textarea id="lc-code" rows="3" dir="ltr" placeholder="SL1.…"></textarea></label><div class="actions"><button class="btn pri" id="lc-act" type="button">تفعيل / تجديد</button></div><p id="lc-msg"></p></section>' +
        '<section class="card"><h3>التحديث</h3><p>الإصدار الحالي: <b>' + e(C.version || C.BUILTIN) + '</b></p><p class="mut">عند وصول ملف تحديث (.slu) اختره هنا؛ يتحقق التطبيق من توقيعه ثم يثبته ويعيد التشغيل. بياناتك لا تتأثر.</p>' +
        '<div class="actions wrap"><label class="btn pri">اختيار ملف التحديث<input id="up-f" type="file" accept=".slu,application/json" hidden></label><button class="btn" id="up-rb" type="button">الرجوع للإصدار المدمج</button></div><p id="up-msg"></p></section>';
    } else if (tab === "sec") {
      html += '<section class="card"><h3>قفل التطبيق</h3><p>رمز يُطلب عند فتح التطبيق لحماية بيانات الطلاب إن استُخدم الجهاز من آخرين.</p>' +
        '<label>الرمز (4–8 أرقام، اتركه فارغاً للإلغاء)<input id="pn" type="password" inputmode="numeric" autocomplete="new-password"></label><div class="actions"><button class="btn pri" id="pn-save" type="button">حفظ</button></div>' +
        '<p class="mut">الحالة: ' + (cfg.pin ? "مفعّل" : "غير مفعّل") + "</p></section>";
    }
    main().innerHTML = html;
    bindSettings(tab);
  };
  /* الرقم الوزاري: رقم واحد، أو رقمان للمدرسة المدمجة (ابتدائي + متوسط) — كل رقم يُربط بوهج */
  function moeFields(z) {
    var pair = A.combinedStages(z), L = { "ابتدائي": "الابتدائية", "متوسط": "المتوسطة", "ثانوي": "الثانوية" };
    if (!pair) return '<label>الرقم الوزاري (لربط وهج)<input data-k="moeCode" dir="ltr" inputmode="numeric" value="' + e(z.moeCode || "") + '"></label>';
    var two = z.moeMode === "two";
    return '<label>الأرقام الوزارية<select data-k="moeMode" data-rerender="1"><option value="one"' + (two ? "" : " selected") + '>رقم وزاري واحد للمرحلتين</option><option value="two"' + (two ? " selected" : "") + ">رقمان: رقم لـ" + L[pair[0]] + " ورقم لـ" + L[pair[1]] + "</option></select></label>" +
      (two ? '<label>الرقم الوزاري — ' + L[pair[0]] + '<input data-k="moeCode" dir="ltr" inputmode="numeric" value="' + e(z.moeCode || "") + '"></label>' +
             '<label>الرقم الوزاري — ' + L[pair[1]] + '<input data-k="moeCode2" dir="ltr" inputmode="numeric" value="' + e(z.moeCode2 || "") + '"></label>'
           : '<label>الرقم الوزاري (لربط وهج)<input data-k="moeCode" dir="ltr" inputmode="numeric" value="' + e(z.moeCode || "") + '"></label>');
  }
  A.moeFields = moeFields;
  function schoolForm(z, i) {
    return '<div class="school" data-i="' + i + '"><div class="grid2">' +
      '<label>اسم المدرسة<input data-k="name" value="' + e(z.name) + '"></label>' +
      '<label>المرحلة<select data-k="stage">' + [["ابتدائي", "ابتدائي"], ["متوسط", "متوسط"], ["ثانوي", "ثانوي"], ["مدمجة", "مدمجة (ابتدائي + متوسط)"], ["مدمجة-ث", "مدمجة (متوسط + ثانوي)"]].map(function (s) { return "<option value=\"" + s[0] + "\"" + (s[0] === z.stage ? " selected" : "") + ">" + s[1] + "</option>"; }).join("") + "</select></label>" +
      '<label>المنطقة/المحافظة<input data-k="region" value="' + e(z.region || "") + '"></label>' +
      '<label>إدارة التعليم<input data-k="admin" value="' + e(z.admin || "") + '" placeholder="الإدارة العامة للتعليم بمنطقة …"></label>' +
      moeFields(z) + '</div>' +
      '<button class="link danger" type="button" data-rm="' + i + '">حذف هذه المدرسة</button></div>';
  }
  function bindSettings(tab) {
    var cfg = A.S.settings;
    if (tab === "school") {
      if (!cfg.schools.length) cfg.schools.push({ id: "C" + SL.rid(6), name: "", stage: "متوسط", region: "", admin: "" }), $("#sc-l").innerHTML = schoolForm(cfg.schools[0], 0);
      $("#sc-add").onclick = function () { collect(); cfg.schools.push({ id: "C" + SL.rid(6), name: "", stage: "ابتدائي", region: "", admin: "" }); $("#sc-l").innerHTML = cfg.schools.map(schoolForm).join(""); rm(); };
      function collect() { $$(".school").forEach(function (d) { var z = cfg.schools[+d.dataset.i]; $$("[data-k]", d).forEach(function (el) { z[el.dataset.k] = el.value.trim(); }); }); }
      $("#sc-l").addEventListener("change", function (ev) { var k = ev.target.dataset && ev.target.dataset.k; if (k === "stage" || k === "moeMode") { collect(); $("#sc-l").innerHTML = cfg.schools.map(schoolForm).join(""); rm(); } });
      function rm() { $$("[data-rm]").forEach(function (b) { b.onclick = async function () { var i = +b.dataset.rm; if (A.S.students.some(function (s) { return s.school === cfg.schools[i].id; })) return A.toast("المدرسة مرتبطة بطلاب", "err"); collect(); cfg.schools.splice(i, 1); $("#sc-l").innerHTML = cfg.schools.map(schoolForm).join(""); rm(); }; }); }
      rm();
      $("#sc-save").onclick = async function () { collect(); cfg.schools = cfg.schools.filter(function (z) { return z.name; }); cfg.useLogo = $("#sc-logo").checked; await A.saveSettings(); A.toast("تم الحفظ"); A.route(); };
    } else if (tab === "links") {
      $("#ln-save").onclick = async function () {
        cfg.publicBase = $("#ln-base").value.trim(); cfg.relayUrl = $("#ln-relay").value.trim().replace(/\/+$/, ""); cfg.schoolWa = SL.normPhone($("#ln-wa").value); cfg.linkHours = Math.max(1, +$("#ln-h").value || 72);
        await A.saveSettings(); A.toast("تم الحفظ"); A.startPolling();
      };
      $("#ln-test").onclick = async function () {
        var m = $("#ln-msg"), url = $("#ln-relay").value.trim().replace(/\/+$/, "");
        m.className = "mut"; m.textContent = "جارٍ الاختبار…";
        try { var t = "T" + SL.rid(8); await SL.relay.put(url, cfg.box, t, "ping"); var l = await SL.relay.list(url, cfg.box); await SL.relay.del(url, cfg.box, t); if (!(t in l)) throw new Error("no-read"); m.className = "alert ok sm"; m.textContent = "الاتصال يعمل: كتابة وقراءة وحذف ✓"; }
        catch (err) { m.className = "alert err sm"; m.textContent = "تعذّر الاتصال بالصندوق (" + err.message + "). تحقق من العنوان وقواعد قاعدة البيانات."; }
      };
    } else if (tab === "msgs") {
      $("#tp-save").onclick = async function () { $$("[data-tpl]").forEach(function (t) { cfg.tpl[t.dataset.tpl] = t.value; }); await A.saveSettings(); A.toast("تم الحفظ"); };
      $("#tp-reset").onclick = async function () { if (!(await A.confirm("استعادة نصوص الرسائل الافتراضية؟"))) return; cfg.tpl = A.defaults().tpl; await A.saveSettings(); A.route(); };
    } else if (tab === "backup") {
      var fp = $("#fs-pick"); if (fp) fp.onclick = async function () {
        try { await C.fsPick(); var r = await C.fsRestore(); await C.fsWriteCore(); if (r.data) { A.toast("استُعيدت " + r.data + " سجلاً من المجلد"); setTimeout(function () { location.reload(); }, 800); return; } await C.fsSaveData(); A.toast("تم ربط المجلد وحفظ البيانات فيه"); A.route(); }
        catch (err) { if (err && err.name !== "AbortError") A.toast("تعذّر: " + err.message, "err"); }
      };
      var fn = $("#fs-now"); if (fn) fn.onclick = async function () { try { await C.fsSaveData(); A.toast("تم الحفظ في مجلد sammt"); A.route(); } catch (err) { A.toast("تعذّر الحفظ: " + err.message, "err"); } };
      $("#bk-dl").onclick = async function () {
        var obj = await C.backupObject(), pw = $("#bk-pw").value, out = JSON.stringify(obj), name = "samt-backup-" + SL.isoDay() + ".json";
        if (pw) { out = JSON.stringify({ format: "samt-backup-enc", v: 1, data: await encPw(pw, out) }); name = "samt-backup-" + SL.isoDay() + ".samt"; }
        C.download(name, out); cfg.lastBackup = Date.now(); await A.saveSettings(); A.toast("تم تنزيل النسخة");
      };
      $("#bk-up").onchange = async function () {
        var f = this.files[0]; if (!f) return;
        try {
          var obj = JSON.parse(await f.text());
          if (obj.format === "samt-backup-enc") { var pw = prompt("كلمة مرور النسخة:"); if (!pw) return; obj = JSON.parse(await decPw(pw, obj.data)); }
          if (obj.format !== "sulook-backup") throw new Error("ليست نسخة احتياطية لهذا التطبيق");
          if (!(await A.confirm("سيتم استبدال كل البيانات الحالية بمحتوى النسخة (" + (obj.recs || []).length + " سجل). متابعة؟"))) return;
          for (var t of ["stu", "stf", "inc", "mer", "sig", "abs", "log"]) await C.DB.clearType(t);
          await C.DB.putMany(obj.recs || []);
          var keepBox = cfg.box; for (var k in obj.kv) await C.DB.set(k, obj.kv[k]);
          if (!obj.kv.settings) await C.DB.set("settings", cfg); else { var ns = obj.kv.settings; ns.box = ns.box || keepBox; await C.DB.set("settings", ns); }
          A.toast("تمت الاستعادة"); setTimeout(function () { location.hash = "home"; location.reload(); }, 700);
        } catch (err) { A.toast("تعذّرت الاستعادة: " + err.message, "err"); }
      };
      $("#bk-wipe").onclick = async function () {
        if (!(await A.confirm("سيُحذف كل شيء نهائياً (الطلاب، المعلمون، المخالفات، التوقيعات). هل نزّلت نسخة احتياطية؟"))) return;
        if (prompt("اكتب كلمة: حذف") !== "حذف") return;
        for (var t of ["stu", "stf", "inc", "mer", "sig", "abs", "log"]) await C.DB.clearType(t);
        location.hash = "home"; location.reload();
      };
    } else if (tab === "lic") {
      $("#lc-copy").onclick = function () { try { navigator.clipboard.writeText(C.lic.dev); A.toast("نُسخ رقم الجهاز"); } catch (err) {} };
      $("#lc-act").onclick = async function () { var r = await C.activate($("#lc-code").value), m = $("#lc-msg"); m.className = "alert sm " + (r.ok ? "ok" : "err"); m.textContent = r.ok ? "تم التفعيل حتى " + SL.greg(r.end) : r.why; if (r.ok) { C.lic = await C.license(); A.drawTop(); } };
      $("#up-f").onchange = async function () {
        var f = this.files[0]; if (!f) return; var m = $("#up-msg");
        var r = await C.installUpdate(f); m.className = "alert sm " + (r.ok ? "ok" : "err");
        m.textContent = r.ok ? "تم تثبيت الإصدار " + r.version + (r.notes ? " — " + r.notes : "") + ". جارٍ إعادة التشغيل…" : r.why;
        if (r.ok) setTimeout(function () { location.reload(); }, 1500);
      };
      $("#up-rb").onclick = async function () { if (!(await A.confirm("الرجوع إلى الإصدار المدمج " + C.BUILTIN + "؟"))) return; await C.rollback(); location.reload(); };
    } else if (tab === "sec") {
      $("#pn-save").onclick = async function () {
        var v = $("#pn").value.trim();
        if (v && !/^\d{4,8}$/.test(v)) return A.toast("الرمز 4–8 أرقام", "err");
        cfg.pin = v ? await SL.sha256("samt|" + v) : ""; await A.saveSettings(); A.toast(v ? "تم تفعيل القفل" : "تم إلغاء القفل"); A.route();
      };
    }
  }

  /* تشفير النسخة الاحتياطية بكلمة مرور (PBKDF2 + AES-GCM) */
  async function pwKey(pw, salt) {
    var base = await crypto.subtle.importKey("raw", new TextEncoder().encode(pw), "PBKDF2", false, ["deriveKey"]);
    return crypto.subtle.deriveKey({ name: "PBKDF2", salt: salt, iterations: 150000, hash: "SHA-256" }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  }
  async function encPw(pw, text) {
    var salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
    var ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv }, await pwKey(pw, salt), new TextEncoder().encode(text)));
    return SL.b64u(salt) + "." + SL.b64u(iv) + "." + SL.b64u(ct);
  }
  async function decPw(pw, s) {
    var p = s.split(".");
    try { return new TextDecoder().decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: SL.unb64u(p[1]) }, await pwKey(pw, SL.unb64u(p[0])), SL.unb64u(p[2]))); }
    catch (err) { throw new Error("كلمة المرور غير صحيحة"); }
  }
})();

/* سَمْت — ربط «وهج» (ميزة اختيارية لمشتركي وهج): استيراد تقرير الغياب وتطبيق المادتين 33 و34 */
(function () {
  "use strict";
  var R = window.RULES, SL = window.SL, A = window.APP, e = SL.esc, $ = A.$, $$ = A.$$, V = A.views;
  var WJ_SECRET = "WAHAJ-2026-NOOR-LICENSE-V1";
  function main() { return document.getElementById("main"); }

  function keyNorm(k) {
    return String(k || "").toUpperCase().replace(/[\sـ_\-–]/g, "").replace(/[أإآٱ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه")
      .replace(/[٠-٩]/g, function (d) { return "٠١٢٣٤٥٦٧٨٩".indexOf(d); });
  }
  async function hmac12(msg) {
    var enc = new TextEncoder(), k = await crypto.subtle.importKey("raw", enc.encode(WJ_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    var s = await crypto.subtle.sign("HMAC", k, enc.encode(msg));
    return Array.prototype.map.call(new Uint8Array(s), function (b) { return b.toString(16).padStart(2, "0"); }).join("").slice(0, 12);
  }
  /* وحدات الربط: رقم وزاري لكل مدرسة، أو رقمان للمدرسة المدمجة */
  A.wahajUnits = function () {
    var out = [];
    A.S.settings.schools.forEach(function (z) {
      var pair = A.combinedStages(z), two = pair && z.moeMode === "two", L = { "ابتدائي": "الابتدائية", "متوسط": "المتوسطة", "ثانوي": "الثانوية" };
      if (two) {
        out.push({ id: z.id + ":1", school: z.id, stage: pair[0], label: z.name + " — " + L[pair[0]], moe: z.moeCode || "", key: keyNorm(z.moeCode || "—"), nameKey: keyNorm(z.name) });
        out.push({ id: z.id + ":2", school: z.id, stage: pair[1], label: z.name + " — " + L[pair[1]], moe: z.moeCode2 || "", key: keyNorm(z.moeCode2 || "—"), nameKey: keyNorm(z.name) });
      } else out.push({ id: z.id, school: z.id, stage: "", label: z.name, moe: z.moeCode || "", key: keyNorm(z.moeCode || "—"), nameKey: keyNorm(z.name) });
    });
    return out;
  };
  /* حالة الربط لكل وحدة */
  A.wahajStatus = async function () {
    var cfg = A.S.settings, codes = cfg.wahajCodes || {};
    if (cfg.wahajCode && !Object.keys(codes).length) codes = { _: cfg.wahajCode };
    var list = Object.keys(codes).map(function (k) { return codes[k]; }), units = A.wahajUnits(), res = [], any = null;
    for (var u of units) {
      var best = null;
      for (var c of list) {
        var r = await A.wahajCheck(c); if (!r.ok) continue;
        var ck = keyNorm(String(c).split(".")[1]);
        if (ck === "ALL" || ck === u.key || ck === u.nameKey) { if (!best || r.end > best.end) best = r; }
      }
      res.push(Object.assign({}, u, { ok: !!best, end: best && best.end }));
      if (best && (!any || best.end > any)) any = best.end;
    }
    return { ok: res.some(function (x) { return x.ok; }), units: res, end: any };
  };
  A.wahajCheck = async function (code) {
    var p = String(code || "").trim().replace(/\s+/g, "").split(".");
    if (p.length !== 4 || p[0].toUpperCase() !== "WJ" || !/^\d{8}$/.test(p[2])) return { ok: false, why: "صيغة كود وهج غير صحيحة." };
    if (p[3].toLowerCase() !== (await hmac12(keyNorm(p[1]) + "|" + p[2]))) return { ok: false, why: "كود وهج غير صالح." };
    var key = keyNorm(p[1]);
    if (key !== "ALL" && !A.wahajUnits().some(function (u) { return u.key === key || u.nameKey === key; }))
      return { ok: false, why: "كود وهج مخصص لرقم وزاري آخر. تأكد من الرقم الوزاري في الإعدادات ← المدرسة." };
    var end = new Date(+p[2].slice(0, 4), +p[2].slice(4, 6) - 1, +p[2].slice(6, 8), 23, 59, 59);
    if (Date.now() > end) return { ok: false, why: "انتهى اشتراك وهج بتاريخ " + SL.greg(end) + "." };
    return { ok: true, end: end };
  };

  /* ————— قراءة ملف التصدير من وهج (.xls بصيغة جدول HTML) ————— */
  function digits(s) { return String(s || "").replace(/[٠-٩]/g, function (d) { return "٠١٢٣٤٥٦٧٨٩".indexOf(d); }); }
  function parseG(s) { var m = digits(s).match(/(\d{4})\D(\d{1,2})\D(\d{1,2})/); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; }
  async function parseFile(f) {
    var txt = await f.text(), tables = [];
    if (/<table/i.test(txt)) {
      var doc = new DOMParser().parseFromString(txt, "text/html");
      $$("table", doc).forEach(function (t) { tables.push($$("tr", t).map(function (tr) { return $$("th,td", tr).map(function (c) { return c.textContent.trim(); }); })); });
    } else {
      await A.loadScript("xlsx.full.min.js");
      var wb = XLSX.read(await f.arrayBuffer(), { type: "array" });
      wb.SheetNames.forEach(function (n) { tables.push(XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: false, defval: "" })); });
    }
    var sum = null, det = null;
    tables.forEach(function (rows) {
      var h = (rows[0] || []).map(A.norm);
      if (h.indexOf(A.norm("بدون عذر")) >= 0 && h.indexOf(A.norm("بعذر")) >= 0) sum = rows;
      else if (h.indexOf(A.norm("النوع")) >= 0 && (h.indexOf(A.norm("ميلادي")) >= 0 || h.indexOf(A.norm("هجري")) >= 0)) det = rows;
    });
    if (!sum) throw new Error("لم يُعثر على جدول الملخص (بعذر / بدون عذر). صدّر الملف من لوحة وهج بزر «Excel».");
    function idx(rows, names) { var h = rows[0].map(A.norm); for (var i = 0; i < names.length; i++) { var j = h.indexOf(A.norm(names[i])); if (j >= 0) return j; } return -1; }
    var c = { name: idx(sum, ["الاسم", "اسم الطالب"]), sid: idx(sum, ["رقم السجل المدني", "السجل المدني", "رقم الهوية"]), grade: idx(sum, ["الصف"]), section: idx(sum, ["الفصل"]),
      ex: idx(sum, ["بعذر"]), un: idx(sum, ["بدون عذر"]), late: idx(sum, ["تأخير", "التأخير"]) };
    var out = sum.slice(1).filter(function (r) { return r[c.name]; }).map(function (r) {
      return { name: r[c.name], sid: digits(r[c.sid] || "").replace(/\D/g, ""), grade: r[c.grade] || "", section: r[c.section] || "", ex: +digits(r[c.ex]) || 0, un: +digits(r[c.un]) || 0, late: c.late >= 0 ? +digits(r[c.late]) || 0 : 0, days: [] };
    });
    if (det) {
      var d = { name: idx(det, ["الاسم"]), sid: idx(det, ["رقم السجل المدني", "السجل المدني"]), g: idx(det, ["ميلادي"]), h: idx(det, ["هجري"]), type: idx(det, ["النوع"]) };
      det.slice(1).forEach(function (r) {
        var sid = digits(r[d.sid] || "").replace(/\D/g, ""), o = out.find(function (x) { return (sid && x.sid === sid) || A.norm(x.name) === A.norm(r[d.name]); });
        if (!o) return; var g = parseG(r[d.g]);
        o.days.push({ g: g ? SL.isoDay(g) : "", h: r[d.h] || "", type: /بدون/.test(r[d.type]) ? "un" : "ex" });
      });
    }
    out.forEach(function (o) { o.run = longestRun(o.days.filter(function (x) { return x.type === "un" && x.g; }).map(function (x) { return x.g; })); });
    return out;
  }
  /* أطول غياب متصل بدون عذر بأيام الدراسة (يتجاوز الجمعة والسبت) */
  function longestRun(isos) {
    var ds = isos.slice().sort(), best = 0, cur = 0, prev = null;
    ds.forEach(function (s) {
      var d = new Date(s + "T00:00:00");
      if (prev) { var n = new Date(prev); do { n.setDate(n.getDate() + 1); } while (n.getDay() === 5 || n.getDay() === 6); cur = SL.isoDay(n) === s ? cur + 1 : 1; } else cur = 1;
      prev = d; best = Math.max(best, cur);
    });
    return best;
  }

  function levelOf(n) { return n >= 10 ? 10 : n >= 5 ? 5 : n >= 3 ? 3 : 0; }

  V.absence = function (p, q) {
    document.getElementById("top-title").textContent = "الغياب — ربط وهج";
    var cfg = A.S.settings;
    A.wahajStatus().then(function (lic) {
      if (!lic.ok) {
        main().innerHTML = '<section class="card"><h2>ربط «وهج» — ميزة لمشتركي وهج</h2><p>«وهج» إضافة لمتصفح Chrome تجمع غياب الطلاب من نظام نور بتواريخه. عند ربطها بـ«سَمْت» تستورد تقرير الغياب، فتظهر لكل طالب إجراءات المادة (33) بعذر والمادة (34) بدون عذر عند 3 و5 و10 أيام، مع النماذج 15 و16 و17 والتوقيع ورسائل أولياء الأمور.</p>' +
          codesForm(lic) + "</section>";
        bindCodes();
        return;
      }
      draw(lic, q);
    });
  };

  /* نموذج أكواد وهج: حقل لكل رقم وزاري */
  function codesForm(lic) {
    var cfg = A.S.settings, codes = cfg.wahajCodes || {};
    if (!lic.units.length) return '<p class="alert warn sm">أضف المدرسة أولاً من <a href="#settings">الإعدادات ← المدرسة</a>.</p>';
    return '<h3>أكواد اشتراك وهج</h3>' + (lic.units.length > 1 ? '<p class="mut">لكل رقم وزاري كود خاص من وهج، أو كود واحد يشمل الجميع (ALL).</p>' : "") +
      lic.units.map(function (u) {
        return '<label>' + e(u.label) + (u.moe ? ' <small class="mut" dir="ltr">(' + e(u.moe) + ")</small>" : ' <small class="mut">(لم يُحدد الرقم الوزاري)</small>') +
          (u.ok ? ' <span class="chip ok">مفعّل حتى ' + e(SL.greg(u.end)) + "</span>" : "") +
          '<input data-wj="' + e(u.id) + '" dir="ltr" placeholder="WJ.…" value="' + e(codes[u.id] || "") + '"></label>';
      }).join("") + '<div class="actions"><button class="btn pri" id="wj-s" type="button">حفظ وتفعيل</button><a class="btn" href="#settings">الأرقام الوزارية</a></div>';
  }
  function bindCodes() {
    var b = $("#wj-s"); if (!b) return;
    b.onclick = async function () {
      var cfg = A.S.settings, codes = {}, msgs = [];
      for (var el of $$("[data-wj]")) {
        var c = el.value.trim(); if (!c) continue;
        var r = await A.wahajCheck(c); if (!r.ok) { msgs.push(el.closest("label").firstChild.textContent.trim() + ": " + r.why); continue; }
        codes[el.dataset.wj] = c;
      }
      cfg.wahajCodes = codes; cfg.wahajCode = ""; await A.saveSettings();
      var st = await A.wahajStatus();
      if (msgs.length) A.sheet("أكواد لم تُقبل", "<ul>" + msgs.map(function (m) { return "<li>" + e(m) + "</li>"; }).join("") + "</ul>");
      else A.toast(st.ok ? "تم تفعيل ربط وهج" : "لم يُفعّل أي رقم", st.ok ? "" : "err");
      A.route();
    };
  }
  function allowed(lic, stu) {
    return lic.units.some(function (u) { return u.ok && u.school === stu.school && (!u.stage || u.stage === A.stageText(stu)); });
  }

  function draw(lic, q) {
    var S = A.S, list = S.absences.slice().filter(function (a) { return A.byId[a.stu]; });
    list.sort(function (a, b) { return b.un - a.un || b.ex - a.ex; });
    var flagged = list.filter(function (a) { return a.un >= 3 || a.ex >= 3; });
    var last = list.reduce(function (m, a) { return Math.max(m, a.importedAt || 0); }, 0);
    main().innerHTML = '<section class="card"><div class="row1">' + lic.units.map(function (u) { return '<span class="chip ' + (u.ok ? "ok" : "warnc") + '">' + e(u.label) + (u.ok ? " — مفعّل حتى " + e(SL.greg(u.end)) : " — غير مفعّل") + "</span>"; }).join(" ") + ' <button class="link" id="wj-edit" type="button">الأكواد</button></div>' +
      "<p>من لوحة «وهج» في نور اضغط زر <b>Excel</b> ثم ارفع الملف هنا. تُطابق الأسماء بالسجل المدني.</p>" +
      '<div class="actions wrap"><label class="btn pri">رفع تقرير وهج<input id="wj-f" type="file" accept=".xls,.xlsx,.html,.htm" hidden></label>' +
      '<input id="wj-range" placeholder="الفترة (مثال: 1448/03/01 – 1448/03/20)" value="' + e((list[0] || {}).range || "") + '"></div>' +
      (last ? '<p class="mut">آخر استيراد: ' + e(SL.hijri(last)) + " " + e(SL.time(last)) + " — " + list.length + " طالب</p>" : "") +
      '<p class="note">' + R.ABSENCE.notes.map(e).join("<br>") + "</p></section>" +
      (flagged.length ? '<section class="card"><h3>طلاب بلغوا حد الإجراء (' + flagged.length + ')</h3><ul class="list">' + flagged.map(function (a) {
        var s = A.byId[a.stu], lu = levelOf(a.un), le = levelOf(a.ex);
        return '<li><button class="pick" type="button" data-ab="' + a.id + '"><div class="row1"><b>' + e(s.name) + '</b> <small class="mut">' + e(A.classKey(s)) + "</small></div>" +
          '<div class="row3">' + (a.un ? '<span class="chip red">بدون عذر ' + a.un + "</span> " : "") + (a.ex ? '<span class="chip">بعذر ' + a.ex + "</span> " : "") + (a.run >= 3 ? '<span class="chip warnc">متصل ' + a.run + " أيام</span> " : "") +
          (lu ? '<span class="lvl l' + lu + '">م34: ' + lu + "</span> " : "") + (le ? '<span class="lvl l' + le + '">م33: ' + le + "</span>" : "") + "</div></button></li>";
      }).join("") + "</ul></section>" : list.length ? '<p class="alert ok">لا يوجد طالب بلغ 3 أيام غياب.</p>' : "");
    $("#wj-edit").onclick = function () { var sh = A.sheet("أكواد وهج", codesForm(lic)); bindCodes(); };
    $("#wj-range").onchange = async function () { var v = this.value; for (var a of S.absences) { a.range = v; } await A.saveMany(S.absences.slice()); };
    $("#wj-f").onchange = async function () {
      var f = this.files[0]; if (!f) return;
      try {
        var rows = await parseFile(f), recs = [], miss = [], skip = [];
        rows.forEach(function (r) {
          var s = (r.sid && S.students.find(function (x) { return x.sid === r.sid; })) || S.students.find(function (x) { return A.norm(x.name) === A.norm(r.name); });
          if (!s) { miss.push(r.name); return; }
          if (!allowed(lic, s)) { skip.push(r.name); return; }
          var id = "A" + s.id, old = A.byId[id] || { id: id, t: "abs", stu: s.id, done: {} };
          Object.assign(old, { ex: r.ex, un: r.un, late: r.late, days: r.days, run: r.run, importedAt: Date.now(), range: $("#wj-range").value || old.range || "" });
          recs.push(old);
        });
        await A.saveMany(recs); A.log("استيراد تقرير وهج: " + recs.length + " طالب");
        A.toast("تم استيراد " + recs.length + " طالب" + (miss.length ? " — لم يُطابق " + miss.length : "") + (skip.length ? " — " + skip.length + " من مرحلة رقمها الوزاري غير مفعّل" : ""));
        if (miss.length) A.sheet("أسماء لم تُطابق", "<p>هؤلاء غير موجودين في بيانات الطلاب (استوردهم أولاً أو صحّح السجل المدني):</p><ul>" + miss.map(function (m) { return "<li>" + e(m) + "</li>"; }).join("") + "</ul>");
        A.route();
      } catch (err) { A.toast(err.message, "err"); }
    };
    $$("[data-ab]").forEach(function (b) { b.onclick = function () { openAbs(A.byId[b.dataset.ab]); }; });
    if (q && q.s) { var mine = S.absences.find(function (a) { return a.stu === q.s; }); if (mine) openAbs(mine); }
  }

  function openAbs(a) {
    var s = A.byId[a.stu], done = a.done || {};
    function block(kind) {
      var cfg = R.ABSENCE[kind], n = kind === "un" ? a.un : a.ex; if (n < 3 && !(kind === "un" && a.run >= 3)) return "";
      var html = '<h3>المادة (' + cfg.article + ") — " + e(cfg.title) + "</h3>";
      var lv = cfg.levels.slice(); if (kind === "un") lv.splice(1, 0, { days: "3c", actions: [cfg.consecutive], authorities: true });
      lv.forEach(function (L) {
        var reached = L.days === "3c" ? a.run >= 3 : n >= L.days; if (!reached) return;
        var k = kind + L.days, d = done[k];
        html += '<div class="lvlbox' + (d ? " done" : "") + '"><div class="row1"><span class="lvl l' + (L.days === "3c" ? 3 : L.days) + '">' + (L.days === "3c" ? "3 أيام متصلة" : L.days + " أيام") + "</span> " + (d ? '<span class="chip ok">نُفّذ ' + e(SL.hijri(d.date)) + "</span>" : "") + "</div>" +
          '<ol class="acts">' + L.actions.map(function (x) { return "<li>" + e(x) + "</li>"; }).join("") + "</ol>" +
          '<div class="actions wrap">' + (d ? '<button class="btn sm" type="button" data-undo="' + k + '">إلغاء التنفيذ</button>' : '<button class="btn sm pri" type="button" data-do="' + k + '">تسجيل التنفيذ</button>') + "</div>" +
          (d ? '<ul class="list forms">' + A.formRow("abs", a.id, (kind === "un" ? "F16:" : "F15:") + k, "توقيع الطالب وولي الأمر على هذا الإجراء") + "</ul>" : "") + "</div>";
      });
      return html;
    }
    var body = '<p><b>' + e(s.name) + "</b> — " + e(A.classKey(s)) + '</p><p>بدون عذر: <b class="red">' + a.un + "</b> · بعذر: <b>" + a.ex + "</b>" + (a.run ? " · أطول غياب متصل: " + a.run : "") + (a.range ? ' · <span class="mut">' + e(a.range) + "</span>" : "") + "</p>" +
      (a.days && a.days.length ? '<details><summary>أيام الغياب (' + a.days.length + ")</summary><ul class=\"days\">" + a.days.map(function (d) { return '<li class="' + d.type + '">' + e(d.h || d.g) + " — " + (d.type === "un" ? "بدون عذر" : "بعذر") + "</li>"; }).join("") + "</ul></details>" : "") +
      block("un") + block("ex") +
      '<h3>النماذج</h3><ul class="list forms">' + (a.un >= 3 ? A.formRow("abs", a.id, "F16", "") + A.formRow("abs", a.id, "F17", "") : "") + (a.ex >= 3 ? A.formRow("abs", a.id, "F15", "") : "") + "</ul>" +
      '<div class="actions wrap">' + (SL.validPhone(s.parentPhone) ? '<button class="btn wa" type="button" id="ab-wa">إشعار ولي الأمر بالغياب</button>' : "") + "</div>" +
      '<p class="note">' + e(R.ABSENCE.notes[0]) + "</p>";
    var sh = A.sheet("إجراءات الغياب", body, { wide: true });
    $$("[data-do]", sh.body).forEach(function (b) {
      b.onclick = async function () {
        var k = b.dataset.do, kind = k.slice(0, 2), lvd = k.slice(2), cfg = R.ABSENCE[kind];
        var L = lvd === "3c" ? { actions: [cfg.consecutive], short: "مخاطبة الجهات المختصة (غياب متصل 3 أيام)" } : cfg.levels.find(function (x) { return String(x.days) === lvd; });
        a.done = a.done || {}; a.done[k] = { date: new Date().toISOString(), text: L.short, deducted: kind === "un" ? a.un : null };
        await A.save(a); A.log("تنفيذ إجراء غياب (" + k + "): " + s.name, a.id); sh.close(); openAbs(a);
      };
    });
    $$("[data-undo]", sh.body).forEach(function (b) { b.onclick = async function () { delete a.done[b.dataset.undo]; await A.save(a); sh.close(); openAbs(a); }; });
    A.bindFormRows();
    var w = $("#ab-wa", sh.body);
    if (w) w.onclick = function () { var un = a.un >= a.ex; SL.openWa(s.parentPhone, A.fill(A.S.settings.tpl.absence, A.vars(s, { "النوع": un ? "بدون عذر" : "بعذر", "العدد": un ? a.un : a.ex }))); };
  }
})();

/* سَمْت — التشغيل: الإطار، القفل، الاستلام التلقائي للتوقيعات وبلاغات المعلمين */
(function () {
  "use strict";
  var R = window.RULES, SL = window.SL, C = window.SLCore, A = window.APP, e = SL.esc, $ = A.$;

  function shell() {
    var items = [["home", "home", "الرئيسية"], ["students", "users", "الطلاب"], ["incidents", "alert", "المخالفات", "nav-badge"], ["merit", "star", "السلوك المتميز"], ["absence", "calendar", "الغياب"],
      ["sigs", "pen", "التوقيعات عن بُعد", "sig-badge"], ["staff", "teacher", "المعلمون والإدارة"], ["commit", "doc", "الالتزام المدرسي"], ["import", "upload", "الاستيراد"], ["settings", "gear", "الإعدادات"]];
    document.getElementById("boot").innerHTML =
      '<aside class="side"><a class="logo" href="#home"><span class="lg">س</span><span class="logo-t"><b>سَمْت</b><small>ضبط السلوك والمواظبة</small></span></a>' +
      '<a class="new" href="#new">' + SLI("plus") + '<span>رصد مخالفة</span><kbd>N</kbd></a><nav class="snav">' +
      items.map(function (x) { return '<a href="#' + x[0] + '">' + SLI(x[1]) + "<span>" + x[2] + "</span>" + (x[3] ? '<em id="' + x[3] + '" hidden></em>' : "") + "</a>"; }).join("") +
      '</nav><a class="subc" href="#settings?tab=lic" id="side-plan"></a><div class="side-foot">وفق قواعد السلوك والمواظبة — الإصدار الخامس 1447هـ</div></aside>' +
      '<div class="shell"><header class="top"><a class="m-logo" href="#home">س</a><div class="crumb"><small id="top-school"></small><h1 id="top-title"></h1></div>' +
      '<div class="search" id="q-box">' + SLI("search") + '<input id="q-all" type="search" autocomplete="off" placeholder="ابحث عن طالب بالاسم أو السجل المدني…"><kbd>/</kbd><div class="q-res" id="q-res" hidden></div></div>' +
      '<a id="top-lic" class="lic" href="#settings?tab=lic"></a><span id="top-sync" class="sync" title="الاستلام التلقائي"><i></i><b></b></span>' +
      '<img class="moe" src="moe-logo.png" alt="وزارة التعليم" onerror="this.remove()"></header><main id="main"></main></div>' +
      '<nav class="nav"><a href="#home">' + SLI("home") + '<span>الرئيسية</span></a><a href="#students">' + SLI("users") + '<span>الطلاب</span></a><a href="#new" class="plus"><i>' + SLI("plus") + '</i><span>رصد</span></a><a href="#incidents">' + SLI("alert") + '<span>المخالفات</span><b id="nav-badge-m" hidden></b></a><a href="#more">' + SLI("more") + "<span>المزيد</span></a></nav>";
    bindSearch();
    document.addEventListener("keydown", function (ev) {
      var t = ev.target, typing = /INPUT|TEXTAREA|SELECT/.test(t.tagName) || t.isContentEditable;
      if (typing || ev.metaKey || ev.ctrlKey || ev.altKey || document.querySelector(".sheet-wrap")) return;
      if (ev.key === "/") { ev.preventDefault(); $("#q-all").focus(); }
      else if (ev.key === "n" || ev.key === "N" || ev.key === "ى") { ev.preventDefault(); A.go("new"); }
    });
    A.drawTop();
  }
  /* بحث فوري عن الطالب من الشريط العلوي */
  function bindSearch() {
    var inp = $("#q-all"), box = $("#q-res"), sel = 0, list = [];
    function draw() {
      var q = A.norm(inp.value);
      if (!q) { box.hidden = true; return; }
      list = A.S.students.filter(function (s) { return A.norm(s.name).indexOf(q) >= 0 || String(s.sid || "").indexOf(q) >= 0; }).slice(0, 7);
      sel = Math.min(sel, Math.max(0, list.length - 1));
      box.innerHTML = list.length ? list.map(function (s, i) {
        return '<a href="#student/' + s.id + '" class="' + (i === sel ? "on" : "") + '"><span class="av">' + e((s.name || "؟").trim().charAt(0)) + "</span><span><b>" + e(s.name) + "</b><small>" + e(A.classKey(s)) + "</small></span>" + A.scoreChip(s) + "</a>";
      }).join("") + '<a class="all" href="#students?q=' + encodeURIComponent(inp.value) + '">عرض كل النتائج في صفحة الطلاب</a>' : '<p class="q-none">لا يوجد طالب بهذا الاسم أو السجل.</p>';
      box.hidden = false;
    }
    inp.addEventListener("input", function () { sel = 0; draw(); });
    inp.addEventListener("focus", draw);
    inp.addEventListener("keydown", function (ev) {
      if (ev.key === "ArrowDown") { sel = Math.min(sel + 1, list.length - 1); draw(); ev.preventDefault(); }
      else if (ev.key === "ArrowUp") { sel = Math.max(sel - 1, 0); draw(); ev.preventDefault(); }
      else if (ev.key === "Enter") { var s = list[sel]; if (s) A.go("student/" + s.id); else A.go("students?q=" + encodeURIComponent(inp.value)); close(); }
      else if (ev.key === "Escape") { close(); inp.blur(); }
    });
    function close() { box.hidden = true; inp.value = ""; }
    document.addEventListener("click", function (ev) { if (!$("#q-box").contains(ev.target)) box.hidden = true; else if (ev.target.closest && ev.target.closest(".q-res a")) close(); });
  }
  A.drawTop = function () {
    var L = C.lic || {}, el = $("#top-lic"); if (!el) return;
    var sn = $("#top-school"); if (sn) sn.textContent = A.S.settings.schools.map(function (z) { return z.name; }).filter(Boolean).join(" · ") || "ضبط السلوك والمواظبة";
    el.textContent = L.trial ? "تجريبي: " + L.hours + " ساعة" : L.ok && L.days <= 14 ? "ينتهي بعد " + L.days + " يوماً" : "";
    el.hidden = !el.textContent;
    var n = A.S.incidents.filter(function (x) { return x.status === "reported"; }).length;
    [$("#nav-badge"), $("#nav-badge-m")].forEach(function (b) { if (b) { b.hidden = !n; b.textContent = n; } });
    var pn = A.S.sigs.filter(function (g) { return g.status === "pending" && g.exp > Date.now(); }).length, sb = $("#sig-badge");
    if (sb) { sb.hidden = !pn; sb.textContent = pn; }
    var pl = $("#side-plan");
    if (pl) {
      var pct = L.trial ? Math.max(4, Math.min(100, (L.hours || 0) / 48 * 100)) : L.ok ? Math.max(4, Math.min(100, (L.days || 0) / 365 * 100)) : 0;
      pl.className = "subc" + (L.trial ? " trial" : L.ok && L.days > 14 ? "" : " warn");
      pl.innerHTML = '<span class="subc-t"><b>الاشتراك</b><span>' + (L.trial ? "تجريبي" : L.ok ? "فعّال" : "منتهٍ") + '</span></span><span class="subc-bar"><i style="width:' + pct + '%"></i></span><small>' +
        e(L.trial ? "متبقٍ " + L.hours + " ساعة من التجربة" : L.ok ? "متبقٍ " + L.days + " يوماً" : C.licLabel(L)) + "</small>";
    }
  };

  /* ————— قفل بالرمز ————— */
  function pinGate() {
    return new Promise(function (res) {
      if (!A.S.settings.pin) return res();
      var w = document.createElement("div"); w.className = "lock";
      w.innerHTML = '<div class="lock-card"><div class="lock-logo">س</div><h1>سَمْت</h1><label class="lock-l">الرمز<input id="pg" type="password" inputmode="numeric" autocomplete="off"></label><button class="btn pri" id="pg-ok" type="button">دخول</button><p id="pg-m" class="lock-msg err"></p></div>';
      document.body.appendChild(w);
      var inp = w.querySelector("#pg"); setTimeout(function () { inp.focus(); }, 50);
      async function go() { if ((await SL.sha256("samt|" + inp.value)) === A.S.settings.pin) { w.remove(); res(); } else { w.querySelector("#pg-m").textContent = "الرمز غير صحيح"; inp.value = ""; } }
      w.querySelector("#pg-ok").onclick = go; inp.onkeydown = function (ev) { if (ev.key === "Enter") go(); };
    });
  }

  /* ————— الاستلام التلقائي من صندوق البريد ————— */
  var busy = false, timer = null;
  A.poll = async function (manual) {
    var cfg = A.S.settings; if (!cfg.relayUrl || busy) return;
    busy = true; var dot = $("#top-sync");
    try {
      var box = await SL.relay.list(cfg.relayUrl, cfg.box), n = 0;
      for (var key of Object.keys(box)) { if (await handle(key, box[key])) n++; }
      A.lastPoll = Date.now(); if (dot) { dot.className = "sync ok"; dot.title = "متصل — آخر تحقق " + SL.time(A.lastPoll); }
      if (n) { A.drawTop(); A.route(); }
      else if (manual) A.toast("لا جديد");
    } catch (err) { if (dot) { dot.className = "sync err"; dot.title = "تعذّر الوصول لصندوق البريد"; } if (manual) A.toast("تعذّر الاتصال بصندوق البريد", "err"); }
    busy = false;
  };
  async function handle(key, val) {
    var cfg = A.S.settings;
    if (key.charAt(0) === "R") {
      var tid = key.slice(1).split("-")[0], t = A.byId[tid];
      if (!t || !t.key) return false;
      var o; try { o = await SL.open(t.key, val); } catch (err) { await SL.relay.del(cfg.relayUrl, cfg.box, key); return false; }
      await SL.relay.del(cfg.relayUrl, cfg.box, key);
      if (A.byId["I" + key]) return false;
      var art = R.articleById(o.art); if (!art || !art.items[o.item]) return false;
      var stu = A.S.students.find(function (s) { return A.classKey(s) === o.cls && A.norm(s.name) === A.norm(o.name) && (!t.school || s.school === t.school); });
      var inc = { id: "I" + key, t: "inc", stu: stu ? stu.id : "", stuName: o.name, cls: o.cls, art: art.id, item: o.item, itemText: art.items[o.item], degree: art.degree,
        date: o.date || new Date().toISOString(), period: o.period || "", place: o.place || "", desc: o.desc || "", by: t.id, byName: t.name, status: "reported", done: {}, createdAt: Date.now(), src: t.role === "counselor" ? "counselor" : "teacher" };
      var who = t.role === "counselor" ? "الموجه الطلابي " : "المعلم ";
      await A.save(inc); A.log("بلاغ من " + who + t.name + " عن " + o.name, inc.id);
      A.toast("بلاغ جديد من " + who + t.name + ": " + o.name);
      return true;
    }
    var g = A.byId[key];
    if (!g || g.t !== "sig") return false;
    if (g.status !== "pending") { await SL.relay.del(cfg.relayUrl, cfg.box, key); return false; }
    var r; try { r = await SL.open(g.key, val); } catch (err) { return false; }
    if (r.tok !== key) return false;
    g.status = r.refused ? "refused" : "signed"; g.enc = r.sig || ""; g.name = r.name || ""; g.at = r.at || Date.now(); g.recvAt = Date.now(); g.ua = r.ua || ""; g.note = r.note || "";
    await A.save(g);
    if (g.form === "F10" && g.kind === "inc" && r.reply != null) { var inc2 = A.byId[g.ref]; inc2.meeting = Object.assign(inc2.meeting || {}, { reply: +r.reply, altDate: r.alt || "" }); await A.save(inc2); }
    await SL.relay.del(cfg.relayUrl, cfg.box, key);
    if (g.lk) SL.short.del(cfg.relayUrl, g.lk); /* حذف النموذج المشفر من الوسيط بعد التوقيع */
    var stu2 = A.byId[g.stu] || {};
    A.log((g.status === "signed" ? "وقّع" : "رفض التوقيع") + " ولي أمر " + (stu2.name || "") + " على " + (R.FORMS[g.form.split(":")[0]] || {}).t, g.ref);
    A.toast((g.status === "signed" ? "✓ وقّع ولي أمر " : "رفض ولي أمر ") + (stu2.name || "") + " — " + (R.FORMS[g.form.split(":")[0]] || {}).t);
    return true;
  }
  A.handleRelay = handle;
  A.startPolling = function () {
    if (timer) clearInterval(timer);
    if (!A.S.settings.relayUrl) return;
    A.poll();
    timer = setInterval(function () { if (document.visibilityState === "visible") A.poll(); }, 15000);
  };

  (async function init() {
    await A.load();
    shell();
    await pinGate();
    window.addEventListener("hashchange", function () { Array.prototype.forEach.call(document.querySelectorAll(".sheet-wrap"), function (w) { w.remove(); }); A.route(); A.drawTop(); });
    document.addEventListener("visibilitychange", function () { if (document.visibilityState === "visible") A.poll(); });
    A.route();
    A.startPolling();
  })();
})();
