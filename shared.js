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
  /* واتساب يفتح في التبويب نفسه — لا تُفتح تبويبات جديدة داخل المنصة */
  SL.openWa = function (phone, text) { var u = SL.wa(phone, text); if (!window.open(u, "_self")) location.href = u; };

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
  SL.LOGO = '<svg class="mark" viewBox="64 64 384 384" aria-hidden="true"><polygon points="256,78 302,145 382,130 367,210 434,256 367,302 382,382 302,367 256,434 210,367 130,382 145,302 78,256 145,210 130,130 210,145" fill="none" stroke="#d6b465" stroke-width="18" stroke-linejoin="round"/><circle cx="256" cy="256" r="92" fill="none" stroke="#d6b465" stroke-width="9" opacity=".5"/><path d="M256 112 290 256 256 400 222 256Z" fill="#d6b465"/><path d="M256 112 290 256H256Z" fill="#fff" opacity=".45"/><circle cx="256" cy="256" r="17" fill="#0c2233" stroke="#d6b465" stroke-width="8"/></svg>';
  SL.DEFAULT_RELAY = "https://samt-app-4132d-default-rtdb.europe-west1.firebasedatabase.app";
  var B56 = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  function code(n) { var s = ""; while (s.length < n) { var a = new Uint8Array(n * 2); crypto.getRandomValues(a); for (var i = 0; i < a.length && s.length < n; i++) if (a[i] < 224) s += B56[a[i] % 56]; } return s; }
  async function codeKey(c) { var b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("samt-link|" + c)); return b64u(new Uint8Array(b)); }
  async function codeId(c) { return (await SL.sha256("samt-lid|" + c)).slice(0, 24); }
  SL.linkRelay = function (base) { var h = ""; try { h = new URL(base).hostname; } catch (e) {} return /^(localhost|127\.)/.test(h) ? new URL(base).origin : SL.DEFAULT_RELAY; };
  /* صيانة المنصة: إن أعلنها المزوّد تظهر رسالة الاعتذار بدل الصفحة */
  SL.maintGate = async function (el) {
    var base = typeof window.SAMT_REG === "string" ? window.SAMT_REG : SL.DEFAULT_RELAY; if (!base) return false;
    try {
      var c = new AbortController(), t = setTimeout(function () { c.abort(); }, 3000);
      var r = await fetch(base + "/sys/maint.json", { cache: "no-store", signal: c.signal }); clearTimeout(t);
      var m = r.ok ? await r.json() : null;
      if (!(m && m.on && (!m.from || Date.now() >= +m.from))) return false;
      var w = m.until ? new Date(+m.until).toLocaleString("ar-SA-u-nu-latn", { weekday: "long", day: "numeric", month: "long", hour: "numeric", minute: "2-digit" }) : "";
      (el || document.body).innerHTML = '<div class="pub-h"><div class="logo">' + SL.LOGO + '</div><div><b>سَمْت</b><small>منصة ضبط السلوك والمواظبة</small></div></div><div class="card done"><h2>المنصة متوقفة مؤقتاً للصيانة</h2><p style="white-space:pre-line">' + SL.esc(m.msg || "") + "</p>" + (w ? '<p class="mut">العودة المتوقعة: ' + SL.esc(w) + "</p>" : "") + '<p class="mut">الرابط يبقى صالحاً — أعد فتحه بعد انتهاء الصيانة.</p></div>';
      return true;
    } catch (e) { return false; }
  };
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

  /* ————— صيغة المؤنث لمدارس البنات: تحويل النماذج والرسائل (ولي الأمر يبقى بصيغة المذكر) ————— */
  var FEM_KEEP = [["مدير التعليم", "\u0001A"], ["مديري التعليم", "\u0001B"], ["التوجيه الطلابي", "\u0001C"], ["ولي الأمر", "\u0001D"], ["أولياء الأمور", "\u0001E"], ["ولي أمر", "\u0001F"], ["إدارة التعليم", "\u0001G"]];
  var FEM_PHR = [
    ["موجه الطلابي", "موجهة الطلابية"], ["وكيل شؤون الطلبة", "وكيلة شؤون الطالبات"], ["وكيل شؤون الطلاب", "وكيلة شؤون الطالبات"], ["شؤون الطلبة", "شؤون الطالبات"], ["شؤون الطلاب", "شؤون الطالبات"],
    ["وكيل المدرسة", "وكيلة المدرسة"], ["رائد النشاط", "رائدة النشاط"], ["المرشد الطلابي", "المرشدة الطلابية"],
    ["الطالب المخالف", "الطالبة المخالفة"], ["الطالب المصاب", "الطالبة المصابة"], ["الطالب المتغيب", "الطالبة المتغيبة"], ["الطلبة المتغيبين", "الطالبات المتغيبات"], ["الطلاب المتغيبين", "الطالبات المتغيبات"],
    ["كان الطالب متواجداً", "كانت الطالبة متواجدة"], ["المنقول إليها الطالب", "المنقولة إليها الطالبة"], ["سينتقل إليها الطالب", "ستنتقل إليها الطالبة"],
    ["ينقل الطالب", "تُنقل الطالبة"], ["يُحال الطالب", "تُحال الطالبة"], ["يحال الطالب", "تحال الطالبة"], ["يُمنح الطالب", "تُمنح الطالبة"], ["يُحرم الطالب", "تُحرم الطالبة"],
    ["ما أتلفه الطالب", "ما أتلفته الطالبة"], ["الذي يحققه الطالب", "الذي تحققه الطالبة"], ["الطالب الموضح اسمه", "الطالبة الموضح اسمها"],
    ["قام الطالب", "قامت الطالبة"], ["يلتزم الطالب", "تلتزم الطالبة"], ["تغيب الطالب", "تغيب الطالبة"], ["يتعهد الطالب", "تتعهد الطالبة"], ["التزام الطالب", "التزام الطالبة"],
    ["الطالب قام", "الطالبة قامت"], ["معلم متميز", "معلمة متميزة"], ["مصلحة ابني", "مصلحة ابنتي"], ["ليكون ملتزماً", "لتكون ملتزمة"], ["اسمه وبياناته", "اسمها وبياناتها"], ["يباشر المعلم", "تباشر المعلمة"], ["يرصدها المعلم ويسلّمها", "ترصدها المعلمة وتسلّمها"], ["يرصد المعلم", "ترصد المعلمة"], ["بلّغ المعلم", "بلّغت المعلمة"]
  ];
  var FEM_W = {
    "الطالب": "الطالبة", "طالب": "طالبة", "الطلاب": "الطالبات", "طلاب": "طالبات", "الطلبة": "الطالبات", "طلبة": "طالبات", "الطالبين": "الطالبتين",
    "المعلم": "المعلمة", "معلم": "معلمة", "المعلمين": "المعلمات", "معلمين": "معلمات", "المعلمون": "المعلمات", "معلمون": "معلمات",
    "المدير": "المديرة", "مدير": "مديرة", "الوكيل": "الوكيلة", "وكيل": "وكيلة", "الموجه": "الموجهة", "موجه": "موجهة", "الإداريين": "الإداريات", "الإداريون": "الإداريات",
    "الأستاذ": "الأستاذة", "أستاذ": "أستاذة", "ابنكم": "ابنتكم", "ابنك": "ابنتك", "لابنكم": "لابنتكم", "حالته": "حالتها", "مشكلته": "مشكلتها", "غيابه": "غيابها", "سلوكه": "سلوكها",
    "طالبنا": "طالبتنا", "المتغيبين": "المتغيبات", "ابنه": "ابنته", "تمكينه": "تمكينها", "مخالفته": "مخالفتها", "حقه": "حقها", "استمراره": "استمرارها", "منحه": "منحها",
    "له": "لها", "تهديدهم": "تهديدهن", "حضوره": "حضورها", "انضباطه": "انضباطها", "درجاته": "درجاتها", "ملفه": "ملفها", "اسمه": "اسمها", "بياناته": "بياناتها"
  };
  var FEM_POST = [["المعلمة المباشر", "المعلمة المباشرة"], ["ارتكب المشكلة", "ارتكبت المشكلة"], ["يقوم بها الموجهة", "تقوم بها الموجهة"], 
    ["إصلاح ما أتلفته الطالبة أو إحضار بديل عنه", "إصلاح ما أتلفته الطالبة أو إحضار بديل عنه"]];
  function femWord(w) {
    if (FEM_W[w]) return FEM_W[w];
    var m = w.match(/^([وف]?)(.*)$/), a = m[1], r = m[2];
    if (a && FEM_W[r]) return a + FEM_W[r];
    var m2 = r.match(/^([بكل])(.+)$/);
    if (m2) {
      if (FEM_W[m2[2]]) return a + m2[1] + FEM_W[m2[2]];
      if (m2[1] === "ل" && /^ل/.test(m2[2]) && FEM_W["ا" + m2[2]]) return a + "ل" + FEM_W["ا" + m2[2]].slice(1);   /* للطالب ← للطالبة */
    }
    return w;
  }
  SL.fem = function (s) {
    if (s == null) return s; s = String(s);
    s = s.split("ولي أمره").join("ولي أمرها").split("أولياء أمورهم").join("أولياء أمورهن");
    FEM_KEEP.forEach(function (k) { s = s.split(k[0]).join(k[1]); });
    FEM_PHR.forEach(function (k) { s = s.split(k[0]).join(k[1]); });
    s = s.replace(/[ء-يـً-ْ]+/g, femWord);
    FEM_POST.forEach(function (k) { s = s.split(k[0]).join(k[1]); });
    FEM_KEEP.forEach(function (k) { s = s.split(k[1]).join(k[0]); });
    return s;
  };
  /* تحويل كل النصوص داخل كائن (نموذج) مع الإبقاء على الأسماء والأرقام كما هي */
  SL.femDeep = function (o, skip) {
    skip = skip || { name: 1, parentName: 1, school: 1, sid: 1, phone: 1, parentPhone: 1, cls: 1, region: 1, admin: 1, by: 1, byName: 1, stuName: 1 };
    if (typeof o === "string") return SL.fem(o);
    if (Array.isArray(o)) return o.map(function (x) { return SL.femDeep(x, skip); });
    if (o && typeof o === "object") { var r = {}; Object.keys(o).forEach(function (k) { r[k] = skip[k] ? o[k] : SL.femDeep(o[k], skip); }); return r; }
    return o;
  };
  /* تحويل نصوص صفحة (صفحة التوقيع وصفحة المعلم) كلما تغيّرت */
  SL.femWatch = function (root) {
    function walk(n) {
      if (n.nodeType === 3) { var t = SL.fem(n.nodeValue); if (t !== n.nodeValue) n.nodeValue = t; return; }
      if (n.nodeType !== 1 || /^(SCRIPT|STYLE|TEXTAREA)$/.test(n.nodeName) || n.hasAttribute("data-nofem")) return;
      if (n.placeholder) n.placeholder = SL.fem(n.placeholder);
      for (var c = n.firstChild; c; c = c.nextSibling) walk(c);
    }
    walk(root);
    new MutationObserver(function (ms) { ms.forEach(function (m) { m.addedNodes.forEach(walk); if (m.type === "characterData") walk(m.target); }); }).observe(root, { childList: true, subtree: true });
  };
})();
