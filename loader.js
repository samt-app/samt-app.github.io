/* سَمْت — النواة الثابتة (لا تتغير مع التحديثات)
   • قاعدة بيانات الجهاز (IndexedDB) • رقم الجهاز • الفترة التجريبية وكود الاشتراك
   • تثبيت ملفات التحديث (.slu) الموقّعة • تحميل الإصدار المثبّت أو المدمج */
(function () {
  "use strict";
  var BUILTIN = "1.0.0";
  var TRIAL_HOURS = 72;
  var MARK = '<svg class="mark" viewBox="64 64 384 384" aria-hidden="true"><polygon points="256,78 302,145 382,130 367,210 434,256 367,302 382,382 302,367 256,434 210,367 130,382 145,302 78,256 145,210 130,130 210,145" fill="none" stroke="#d6b465" stroke-width="18" stroke-linejoin="round"/><circle cx="256" cy="256" r="92" fill="none" stroke="#d6b465" stroke-width="9" opacity=".5"/><path d="M256 112 290 256 256 400 222 256Z" fill="#d6b465"/><path d="M256 112 290 256H256Z" fill="#fff" opacity=".45"/><circle cx="256" cy="256" r="17" fill="#0c2233" stroke="#d6b465" stroke-width="8"/></svg>';
  var VENDOR = { name: "تقناس", wa: "" };
  /* المفتاح العام للتحقق من أكواد الاشتراك وملفات التحديث (المفتاح الخاص لدى المطوّر فقط) */
  var PUB = { kty: "EC", crv: "P-256", x: "xX3tdXeSIU2uPnqVD4pfGLnHzjJ-L8kMuBqNuOvtSyY", y: "_Muab14jpoehdsDYXZv-gp1TjGOoMkdYN_FcN4h2JT0", ext: true, key_ops: ["verify"] };

  /* ————— IndexedDB ————— */
  var dbp = null;
  function db() {
    if (dbp) return dbp;
    dbp = new Promise(function (res, rej) {
      var r = indexedDB.open("sulook", 1);
      r.onupgradeneeded = function () {
        var d = r.result;
        if (!d.objectStoreNames.contains("kv")) d.createObjectStore("kv");
        if (!d.objectStoreNames.contains("rec")) d.createObjectStore("rec", { keyPath: "id" }).createIndex("t", "t");
      };
      r.onsuccess = function () { res(r.result); };
      r.onerror = function () { rej(r.error); };
    });
    return dbp;
  }
  function tx(store, mode, fn) {
    return db().then(function (d) {
      return new Promise(function (res, rej) {
        var t = d.transaction(store, mode), s = t.objectStore(store), out;
        out = fn(s);
        t.oncomplete = function () { res(out instanceof IDBRequest ? out.result : undefined); };
        t.onerror = function () { rej(t.error); }; t.onabort = function () { rej(t.error); };
      });
    });
  }
  var DB = {
    get: function (k) { return tx("kv", "readonly", function (s) { return s.get(k); }); },
    set: function (k, v) { return tx("kv", "readwrite", function (s) { s.put(v, k); }); },
    all: function (type) { return tx("rec", "readonly", function (s) { return type ? s.index("t").getAll(type) : s.getAll(); }); },
    put: function (rec) { return tx("rec", "readwrite", function (s) { s.put(rec); }); },
    putMany: function (recs) { return tx("rec", "readwrite", function (s) { recs.forEach(function (r) { s.put(r); }); }); },
    del: function (id) { return tx("rec", "readwrite", function (s) { s.delete(id); }); },
    clearType: function (type) {
      return DB.all(type).then(function (rs) { return tx("rec", "readwrite", function (s) { rs.forEach(function (r) { s.delete(r.id); }); }); });
    },
    kvAll: function () {
      return db().then(function (d) {
        return new Promise(function (res) {
          var out = {}, t = d.transaction("kv"), c = t.objectStore("kv").openCursor();
          c.onsuccess = function () { var cur = c.result; if (cur) { out[cur.key] = cur.value; cur.continue(); } else res(out); };
        });
      });
    }
  };

  /* ————— أدوات ————— */
  function b64u(bytes) { var s = ""; for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]); return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }
  function unb64u(s) { s = String(s).replace(/-/g, "+").replace(/_/g, "/"); while (s.length % 4) s += "="; var b = atob(s), a = new Uint8Array(b.length); for (var i = 0; i < b.length; i++) a[i] = b.charCodeAt(i); return a; }
  async function sha(str) { var b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str)); return Array.prototype.map.call(new Uint8Array(b), function (x) { return x.toString(16).padStart(2, "0"); }).join(""); }
  var pubKey = null;
  async function verifySig(msg, sigB64) {
    if (!pubKey) pubKey = await crypto.subtle.importKey("jwk", PUB, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
    try { return await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, pubKey, unb64u(sigB64), new TextEncoder().encode(msg)); } catch (e) { return false; }
  }
  function fmt(d) { return d.getFullYear() + "/" + String(d.getMonth() + 1).padStart(2, "0") + "/" + String(d.getDate()).padStart(2, "0"); }
  function vcmp(a, b) { a = String(a).split(".").map(Number); b = String(b).split(".").map(Number); for (var i = 0; i < 3; i++) { if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) - (b[i] || 0); } return 0; }
  function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }

  /* ————— رقم الجهاز ————— */
  var B32 = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  async function deviceId() {
    var id = await DB.get("deviceId"), ls = null;
    try { ls = localStorage.getItem("sulook_device"); } catch (e) {}
    if (!id && ls) id = ls;
    if (!id) { var a = new Uint8Array(10); crypto.getRandomValues(a); id = ""; for (var i = 0; i < 10; i++) id += B32[a[i] % 32]; id = id.slice(0, 5) + "-" + id.slice(5); }
    await DB.set("deviceId", id);
    try { localStorage.setItem("sulook_device", id); } catch (e) {}
    return id;
  }

  /* ————— الترخيص: SL1.<رقم الجهاز>.<YYYYMMDD>.<توقيع> ————— */
  async function verifyCode(code, dev) {
    var p = String(code || "").trim().replace(/\s+/g, "").split(".");
    if (p.length !== 4 || p[0] !== "SL1") return { ok: false, why: "صيغة كود الاشتراك غير صحيحة." };
    var d = p[1].toUpperCase(), exp = p[2];
    if (!/^\d{8}$/.test(exp)) return { ok: false, why: "صيغة كود الاشتراك غير صحيحة." };
    if (!(await verifySig("SL1|" + d + "|" + exp, p[3]))) return { ok: false, why: "كود الاشتراك غير صالح." };
    if (d !== String(dev).toUpperCase()) return { ok: false, why: "هذا الكود مخصص لجهاز آخر (" + d + ")." };
    var end = new Date(+exp.slice(0, 4), +exp.slice(4, 6) - 1, +exp.slice(6, 8), 23, 59, 59);
    if (Date.now() > end) return { ok: false, expired: true, end: end, why: "انتهى الاشتراك بتاريخ " + fmt(end) + "." };
    return { ok: true, end: end, days: Math.ceil((end - Date.now()) / 864e5) };
  }
  /* ————— أوامر المزوّد: تمديد أو إيقاف الاشتراك عن بُعد (يكتبها المزوّد وحده) ————— */
  var REG = typeof self.SAMT_REG === "string" ? self.SAMT_REG : "https://samt-app-4132d-default-rtdb.europe-west1.firebasedatabase.app";
  async function remoteFetch(dev) {
    if (!REG) return await DB.get("remote");
    try {
      var c = new AbortController(), t = setTimeout(function () { c.abort(); }, 3000);
      var r = await fetch(REG + "/cmd/" + encodeURIComponent(dev) + ".json", { cache: "no-store", signal: c.signal });
      clearTimeout(t);
      if (!r.ok) return await DB.get("remote");
      var v = await r.json();
      if (!v) { await DB.set("remote", null); return null; }
      var o = typeof v === "string" ? JSON.parse(v) : v;
      o.at = Date.now(); await DB.set("remote", o); return o;
    } catch (e) { return await DB.get("remote"); }
  }
  /* ————— الترخيص بالرقم الوزاري: SL2.<الرقم الوزاري>.<YYYYMMDD>.<سر المدرسة>.<توقيع> —————
     • الكود للمدرسة لا للجهاز: يعمل على أي جهاز، لكن على جهاز واحد فقط في كل لحظة (جلسة نشطة lic/<moe>/sess).
     • «سر المدرسة» ثابت عبر التجديدات؛ منه يُشتق مفتاح تشفير بيانات اعتماد المدرسة على الخادم.
     • يُتحقق من الخادم عند كل تشغيل، ويلزم الاتصال بالإنترنت لفتح المنصة. */
  var SLOTS = 1;
  var TT = self.SAMT_SESS || {};   /* أزمنة قصيرة للاختبارات فقط */
  var SESS_TTL = TT.ttl || 3 * 60e3, SESS_BEAT = TT.beat || 60e3, IDLE_MS = TT.idle || 20 * 60e3;
  var DEV_ROLES = [["deputy", "جهاز وكيل شؤون الطلبة"], ["counselor", "جهاز الموجه الطلابي"], ["principal", "جهاز مدير المدرسة"], ["other", "جهاز آخر"]];
  function parseCode(code) {
    var p = String(code || "").trim().replace(/\s+/g, "").split(".");
    if (p[0] === "SL2" && p.length === 5 && /^\d{3,12}$/.test(p[1]) && /^\d{8}$/.test(p[2]) && /^[A-Za-z0-9_-]{16}$/.test(p[3])) return { v: 2, moe: p[1], exp: p[2], s: p[3], sig: p[4], code: p.join(".") };
    if (p[0] === "SL1" && p.length === 4) return { v: 1 };
    return null;
  }
  function expDate(x) { return new Date(+x.slice(0, 4), +x.slice(4, 6) - 1, +x.slice(6, 8), 23, 59, 59); }
  async function verifySchool(code) {
    var c = parseCode(code);
    if (!c || c.v !== 2) return { ok: false, why: "صيغة كود الاشتراك غير صحيحة." };
    if (!(await verifySig("SL2|" + c.moe + "|" + c.exp + "|" + c.s, c.sig))) return { ok: false, why: "كود الاشتراك غير صالح." };
    var end = expDate(c.exp), exp = Date.now() > end;
    return { ok: !exp, c: c, moe: c.moe, end: end, expired: exp, why: exp ? "انتهى اشتراك المدرسة (" + c.moe + ") بتاريخ " + fmt(end) + "." : "" };
  }
  async function idKey(moe, s) { var raw = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("samt-id|" + moe + "|" + s)); return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]); }
  async function sealId(moe, s, obj) {
    var iv = crypto.getRandomValues(new Uint8Array(12));
    var ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv }, await idKey(moe, s), new TextEncoder().encode(JSON.stringify(obj))));
    return b64u(iv) + "." + b64u(ct);
  }
  async function openId(moe, s, str) {
    try { var p = String(str).split("."); return JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64u(p[0]) }, await idKey(moe, s), unb64u(p[1])))); }
    catch (e) { return null; }
  }
  function parseJ(v) { if (typeof v === "string") { try { return JSON.parse(v); } catch (e) { return null; } } return v || null; }
  async function licFetch(moe) {
    if (!REG) return null;
    var c = new AbortController(), t = setTimeout(function () { c.abort(); }, 3500);
    try { var r = await fetch(REG + "/lic/" + moe + ".json", { cache: "no-store", signal: c.signal }); clearTimeout(t); return r.ok ? ((await r.json()) || {}) : null; }
    catch (e) { clearTimeout(t); return null; }
  }
  async function getLics() { return (await DB.get("lics")) || {}; }
  async function saveLic(moe, rec) { var l = await getLics(); if (rec) l[moe] = rec; else delete l[moe]; await DB.set("lics", l); }
  function unlockOn(u) { return !!(u && +u.until > Date.now()); }
  async function checkSchool(moe, rec, dev, now) {
    var v = await verifySchool(rec.code), out = { moe: moe, slot: rec.slot || 0, role: rec.role || "" };
    if (!v.c) return Object.assign(out, { ok: false, why: v.why });
    var srv = await licFetch(moe), end = +v.end;
    if (!srv) return Object.assign(out, { ok: false, offline: true, id: rec.id || null, why: "يلزم الاتصال بالإنترنت لتشغيل المنصة والتحقق من اشتراك المدرسة (" + moe + "). تحقق من الاتصال ثم أعد المحاولة." });
    rec.slot = 0; rec.okAt = now; rec.cmd = parseJ(srv.cmd); rec.unlock = srv.unlock || null;
    rec.id = srv.id ? ((await openId(moe, v.c.s, srv.id)) || rec.id || null) : null;
    var kid = await latestKeyId(moe, v.c.s, srv.ids);   /* اعتماد لاحق بكود جديد يتقدّم على الأقدم */
    if (kid && (!rec.id || (+kid.at || 0) > (+rec.id.at || 0))) rec.id = kid;
    await saveLic(moe, rec);
    var cmd = rec.cmd || {};
    Object.assign(out, { slot: 0, sess: parseJ(srv.sess), id: rec.id || null, unlock: unlockOn(rec.unlock) ? rec.unlock : null, okAt: rec.okAt });
    if (cmd.stop) return Object.assign(out, { ok: false, stopped: true, why: cmd.why || "أُوقف اشتراك المدرسة (" + moe + ") من المزوّد. تواصل مع متجر تقناس لتفعيله." });
    if (cmd.end) { var ce = new Date(cmd.end + "T23:59:59").getTime(); if (ce > end) end = ce; }
    if (now > end) return Object.assign(out, { ok: false, expired: true, end: new Date(end), why: "انتهى اشتراك المدرسة (" + moe + ") بتاريخ " + fmt(new Date(end)) + "." });
    return Object.assign(out, { ok: true, end: new Date(end), days: Math.ceil((end - now) / 864e5), wahaj: !!cmd.wahaj });
  }
  async function license() {
    var dev = await deviceId(), now = Date.now();
    var last = (await DB.get("lastSeen")) || 0;
    if (last && now < last - 3 * 3600e3) return { ok: false, dev: dev, why: "تاريخ الجهاز أقدم من آخر استخدام. صحّح تاريخ ووقت الجهاز ثم أعد فتح التطبيق.", clock: true };
    await DB.set("lastSeen", Math.max(now, last));
    var lics = await getLics(), moes = Object.keys(lics);
    if (moes.length) {
      var schools = await Promise.all(moes.map(function (m) { return checkSchool(m, lics[m], dev, now); }));
      var good = schools.filter(function (x) { return x.ok; }).sort(function (a, b) { return b.end - a.end; });
      if (good.length) return { ok: true, v: 2, dev: dev, schools: schools, end: good[0].end, days: good[0].days, wahaj: good.some(function (x) { return x.wahaj; }) };
      return { ok: false, v: 2, dev: dev, schools: schools, stopped: schools.some(function (x) { return x.stopped; }), why: schools.map(function (x) { return x.why; }).join(" ") };
    }
    /* النظام السابق: كود مرتبط بالجهاز (SL1) + أوامر المزوّد للجهاز */
    var rem = await remoteFetch(dev);
    if (rem && rem.stop) return { ok: false, dev: dev, stopped: true, why: rem.why || "أُوقف الاشتراك من المزوّد. تواصل مع متجر تقناس لتفعيله." };
    var remEnd = rem && rem.end ? new Date(rem.end + "T23:59:59").getTime() : 0;
    var wj = !!(rem && rem.wahaj), r0 = await legacyLic(rem, remEnd, dev, now);
    if (r0) r0.wahaj = wj;
    return r0;
  }
  async function legacyLic(rem, remEnd, dev, now) {
    var code = await DB.get("license");
    if (code) {
      var r = await verifyCode(code, dev); r.dev = dev; r.code = code;
      if (remEnd > now && (!r.ok || remEnd > +new Date(r.end || 0))) return { ok: true, dev: dev, end: new Date(remEnd), days: Math.ceil((remEnd - now) / 864e5), remote: true };
      return r;
    }
    if (remEnd > now) return { ok: true, dev: dev, end: new Date(remEnd), days: Math.ceil((remEnd - now) / 864e5), remote: true };
    /* الفترة التجريبية مربوطة بالخادم وبالرقم الوزاري: lic/<moe>/trial = وقت البداية (يُكتب مرة واحدة ولا يُعدَّل)
       فمسح المتصفح أو تغيير الجهاز لا يعيدها. يلزم الإنترنت. */
    if (!(await DB.get("trialMoe")) && typeof self.SAMT_TRIAL_MOE === "string") await DB.set("trialMoe", self.SAMT_TRIAL_MOE);   /* للاختبارات */
    var tmoe = await DB.get("trialMoe");
    if (!tmoe) return { ok: false, trial: true, needMoe: true, dev: dev, why: "" };
    var local = (await DB.get("trialStart")) || 0, srv = await trialStart(tmoe, local || now);
    if (srv === undefined) return { ok: false, trial: true, offline: true, dev: dev, why: "يلزم الاتصال بالإنترنت لتشغيل الفترة التجريبية. تحقق من الاتصال ثم أعد المحاولة." };
    var start = Math.min(srv || now, local || Infinity);
    if (start !== local) await DB.set("trialStart", start);
    var end = new Date(start + TRIAL_HOURS * 3600e3), left = end - now;
    if (left > 0) return { ok: true, trial: true, dev: dev, end: end, hours: Math.ceil(left / 3600e3) };
    return { ok: false, trial: true, dev: dev, end: end, why: "انتهت الفترة التجريبية (ثلاثة أيام). أدخل كود اشتراك المدرسة للمتابعة." };
  }
  /* بداية التجربة على الخادم: تُقرأ، وإن لم توجد تُكتب مرة واحدة. undefined = لا اتصال */
  async function trialStart(moe, want) {
    if (!REG) return want;
    try {
      var r = await fetch(REG + "/lic/" + moe + "/trial.json", { cache: "no-store" }); if (!r.ok) return undefined;
      var v = await r.json(); if (typeof v === "number") return v;
      var w = await fetch(REG + "/lic/" + moe + "/trial.json", { method: "PUT", body: JSON.stringify(Math.min(want, Date.now())) });
      if (w.ok) return Math.min(want, Date.now());
      r = await fetch(REG + "/lic/" + moe + "/trial.json", { cache: "no-store" }); v = r.ok ? await r.json() : null;
      if (typeof v === "number") return v;
      return w.status === 401 || w.status === 403 ? want : undefined;   /* قواعد الخادم لم تُحدَّث بعد: نعمل محلياً مؤقتاً بدل إيقاف التجربة */
    } catch (e) { return undefined; }
  }
  /* خيار «لديّ بيانات في مجلد sammt» في شاشات البدء: متصفح جديد لا يعرف المجلد (كل متصفح له بياناته المستقلة) */
  function folderBlock() {
    return FS.supported
      ? '<div class="lock-fold"><button class="btn" id="fx-pick" type="button">📁 لديّ بيانات في مجلد sammt (Google Drive / OneDrive) — ربط المجلد</button><p class="lock-hint">اختر مجلد <b>sammt</b> نفسه، فيُستعاد اشتراك المدرسة وبياناتها على هذا المتصفح.</p><p id="fx-m" class="lock-msg err"></p></div>'
      : '<p class="lock-hint lock-warn">⚠️ هذا المتصفح لا يدعم ربط مجلد البيانات <b>sammt</b>، فلن تظهر فيه بيانات مدرستك المحفوظة في Google Drive. افتح المنصة في <b>Google Chrome</b> أو <b>Microsoft Edge</b> على الكمبيوتر.</p>';
  }
  function folderBind() {
    var b = document.getElementById("fx-pick"); if (!b) return;
    b.onclick = async function () {
      var m = document.getElementById("fx-m");
      try {
        await fsPick(); var r = await fsRestore();
        if (!r.core && !r.data) { m.textContent = "لم أجد بيانات «سَمْت» في هذا المجلد. تأكد أنك اخترت مجلد sammt الصحيح."; return; }
        m.className = "lock-msg ok"; m.textContent = "تمت الاستعادة — جارٍ الفتح…"; setTimeout(function () { location.reload(); }, 600);
      } catch (e) { if (e && e.name !== "AbortError") m.textContent = "تعذّر ربط المجلد: " + e.message; }
    };
  }
  /* شاشة بدء الفترة التجريبية: الرقم الوزاري للمدرسة */
  function trialScreen() {
    var root = document.getElementById("boot");
    root.innerHTML = '<div class="lock">' + card("<h1>سَمْت</h1>" +
      '<p class="lock-why">مرحباً بك. للبدء أدخل <b>الرقم الوزاري للمدرسة</b> لتشغيل الفترة التجريبية (ثلاثة أيام).</p>' +
      '<p class="lock-hint">الفترة التجريبية لكل مدرسة مرة واحدة، وتُحسب من أول تشغيل على أي جهاز.</p>' +
      '<label class="lock-l">الرقم الوزاري للمدرسة<input id="tr-moe" dir="ltr" inputmode="numeric" placeholder="مثال: 123456"></label>' +
      '<button class="btn pri" id="tr-go" type="button">بدء الفترة التجريبية</button><p id="tr-m" class="lock-msg err"></p>' + folderBlock() +
      '<details><summary>لديّ كود اشتراك</summary><label class="lock-l">كود اشتراك المدرسة<textarea id="lk-code" rows="3" dir="ltr" placeholder="SL2.123456789.YYYYMMDD.…"></textarea></label><button class="btn" id="lk-act" type="button">تفعيل</button><p id="lk-msg" class="lock-msg"></p></details>') + "</div>";
    folderBind();
    document.getElementById("tr-go").onclick = async function () {
      var m = String(document.getElementById("tr-moe").value).replace(/[٠-٩]/g, function (d) { return "٠١٢٣٤٥٦٧٨٩".indexOf(d); }).replace(/\D/g, "");
      if (!/^\d{3,12}$/.test(m)) { document.getElementById("tr-m").textContent = "أدخل الرقم الوزاري الصحيح للمدرسة."; return; }
      this.disabled = true; await DB.set("trialMoe", m); await fsWriteCore(); location.reload();
    };
    document.getElementById("lk-act").onclick = async function () {
      var msg = document.getElementById("lk-msg"); msg.className = "lock-msg"; msg.textContent = "جارٍ التحقق…";
      var r = await activate(document.getElementById("lk-code").value, "");
      if (r.ok) { msg.className = "lock-msg ok"; msg.textContent = "تم التفعيل — جارٍ الفتح…"; setTimeout(function () { location.reload(); }, 800); }
      else { msg.className = "lock-msg err"; msg.textContent = r.why; }
    };
  }
  /* تفعيل كود مدرسة على هذا الجهاز ثم جلب بيانات الاعتماد إن وُجدت (لا خانات: جهاز واحد في كل لحظة عبر الجلسة) */
  async function activateSchool(code, role) {
    var v = await verifySchool(code);
    if (!v.c || v.expired) return v;
    var moe = v.moe, srv = await licFetch(moe);
    if (!srv) return { ok: false, why: "التفعيل يحتاج اتصالاً بالإنترنت." };
    var ss = parseJ(srv.sess), me = await seat();
    if (sessBusy(ss, me)) return { ok: false, busy: true, why: "المنصة تعمل الآن لهذه المدرسة على جهاز آخر" + (ss.name ? " (" + ss.name + ")" : "") + ". أغلقها من الجهاز الأول أولاً ثم أعد المحاولة." };
    var old = (await getLics())[moe] || {};
    var rec = { code: v.c.code, slot: 0, okAt: Date.now(), role: role || old.role || (await DB.get("devRole")) || "", cmd: parseJ(srv.cmd), unlock: srv.unlock || null, id: srv.id ? await openId(moe, v.c.s, srv.id) : null };
    await saveLic(moe, rec);
    if (role) await DB.set("devRole", role);
    await fsWriteCore();
    return { ok: true, v: 2, moe: moe, end: v.end, slot: 0, id: rec.id };
  }
  /* ————— إعادة الاعتماد بكود جديد: lic/<moe>/ids/<بصمة الكود> — تُكتب مرة واحدة لكل كود (قواعد الخادم) —————
     تُقبل فقط إن فُكّ تشفيرها بسر المدرسة، وكان الكود بداخلها موقّعاً لهذا الرقم، وبصمته تطابق مكانها. */
  async function idHash(code) { return (await sha("samt-ids|" + String(code).replace(/\s+/g, ""))).slice(0, 40); }
  async function latestKeyId(moe, s, ids) {
    ids = ids || {}; var best = null;
    for (var h in ids) {
      try {
        var o = await openId(moe, s, ids[h]); if (!o || !o.code) continue;
        var c = parseCode(o.code); if (!c || c.v !== 2 || c.moe !== moe) continue;
        if ((await idHash(c.code)) !== h) continue;
        if (!(await verifySig("SL2|" + c.moe + "|" + c.exp + "|" + c.s, c.sig))) continue;
        if (!best || (+o.at || 0) > (+best.at || 0)) best = o;
      } catch (e) {}
    }
    return best;
  }
  async function idUsed(moe, code) {
    try { var r = await fetch(REG + "/lic/" + moe + "/ids/" + (await idHash(code)) + ".json", { cache: "no-store" }); return r.ok && (await r.json()) != null; } catch (e) { return false; }
  }
  async function approveKey(moe, ident, code) {
    var rec = (await getLics())[moe];
    if (!rec) return { ok: false, why: "لا يوجد ترخيص مفعّل لهذا الرقم الوزاري." };
    var c = parseCode(rec.code), obj = Object.assign({ v: 2, moe: moe }, ident, { code: String(code).replace(/\s+/g, ""), at: Date.now() });
    try {
      var r = await fetch(REG + "/lic/" + moe + "/ids/" + (await idHash(code)) + ".json", { method: "PUT", body: JSON.stringify(await sealId(moe, c.s, obj)) });
      if (!r.ok) return { ok: false, why: r.status === 401 || r.status === 403 ? "سبق استخدام هذا الكود لتعديل البيانات. اطلب كوداً جديداً من المزوّد." : "تعذّر الاعتماد (" + r.status + ")." };
    } catch (e) { return { ok: false, why: "الاعتماد يحتاج اتصالاً بالإنترنت." }; }
    rec.id = obj; await saveLic(moe, rec); await fsWriteCore();
    return { ok: true, id: obj };
  }
  /* اعتماد بيانات المدرسة (الاسم، الرقم الوزاري، المرحلة، النوع، المنطقة، الإدارة، المدير، الوكيل، الموجه) — لا تُغيَّر بعده إلا بكود جديد أو بإذن المزوّد */
  async function approve(moe, ident) {
    var rec = (await getLics())[moe];
    if (!rec) return { ok: false, why: "لا يوجد ترخيص مفعّل لهذا الرقم الوزاري." };
    var c = parseCode(rec.code), obj = Object.assign({ v: 1, moe: moe }, ident, { at: Date.now() });
    try {
      var r = await fetch(REG + "/lic/" + moe + "/id.json", { method: "PUT", body: JSON.stringify(await sealId(moe, c.s, obj)) });
      if (!r.ok) return { ok: false, why: r.status === 401 || r.status === 403 ? "بيانات هذه المدرسة معتمدة مسبقاً ولا تُغيَّر إلا بإذن من المزوّد." : "تعذّر الاعتماد (" + r.status + ")." };
    } catch (e) { return { ok: false, why: "الاعتماد يحتاج اتصالاً بالإنترنت." }; }
    rec.id = obj; await saveLic(moe, rec); await fsWriteCore();
    return { ok: true, id: obj };
  }
  async function dropLic(moe) { await saveLic(moe, null); await fsWriteCore(); }
  async function setRole(role) {
    await DB.set("devRole", role || ""); var l = await getLics();
    Object.keys(l).forEach(function (m) { l[m].role = role || ""; }); await DB.set("lics", l);
  }
  async function activate(code, role) {
    var c = parseCode(code);
    if (c && c.v === 2) return activateSchool(c.code, role);
    var dev = await deviceId(), r = await verifyCode(code, dev);
    if (r.ok) { await DB.set("license", String(code).trim().replace(/\s+/g, "")); await fsWriteCore(); }
    return r;
  }
  function licLabel(L) {
    if (!L) return "";
    if (!L.ok) return L.why || "غير مفعّل";
    if (L.trial) return "نسخة تجريبية — متبقٍ " + L.hours + " ساعة";
    return "مشترك حتى " + fmt(L.end) + " (" + L.days + " يوماً)";
  }

  /* ————— الجلسة الواحدة: المدرسة تعمل على جهاز واحد في كل لحظة —————
     lic/<moe>/sess = { dev: رقم المقعد, at: آخر نبضة, name: وصف الجهاز, data: وقت آخر تعديل للبيانات, free: محررة }
     • «المقعد» رقم عشوائي لهذا المتصفح لا يُنقل مع مجلد sammt (بخلاف رقم الجهاز).
     • نبضة كل دقيقة؛ تُعدّ الجلسة محررة بعد 3 دقائق بلا نبض، أو فوراً عند الإغلاق.
     • تُغلق تلقائياً بعد 20 دقيقة بلا استخدام. لا يُرفع أي شيء من بيانات الطلاب. */
  var SESS = { moes: [], me: "", dead: false, prev: null, timers: [] };
  async function seat() {
    if (SESS.me) return SESS.me;
    var id = await DB.get("seat"), ls = null;
    try { ls = localStorage.getItem("samt_seat"); } catch (e) {}
    if (!id && ls) id = ls;
    if (!id) { var a = new Uint8Array(9); crypto.getRandomValues(a); id = "S" + b64u(a); }
    await DB.set("seat", id); try { localStorage.setItem("samt_seat", id); } catch (e) {}
    SESS.me = id; return id;
  }
  async function seatName() {
    var ua = navigator.userAgent || "", os = /Windows/.test(ua) ? "Windows" : /Mac OS X/.test(ua) && !/Mobile/.test(ua) ? "Mac" : /iPad/.test(ua) ? "iPad" : /iPhone/.test(ua) ? "iPhone" : /Android/.test(ua) ? "Android" : /Linux/.test(ua) ? "Linux" : "";
    var br = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : /Firefox\//.test(ua) ? "Firefox" : "";
    return [os, br].filter(Boolean).join(" · ") || "جهاز";
  }
  /* وقت البيانات المُعلن للأجهزة الأخرى: مع المجلد = آخر ما وصل المجلد فعلاً (وإلا انتظر الجهاز الآخر بيانات لن تصل) */
  function sessData() { return FS.ok ? (SESS.fdata || 0) : (SESS.data || 0); }
  function sessBusy(s, me) { return !!(s && s.dev && s.dev !== me && !s.free && Date.now() - (+s.at || 0) < SESS_TTL); }
  async function sessGet(moe) {
    var c = new AbortController(), t = setTimeout(function () { c.abort(); }, 5000);
    try { var r = await fetch(REG + "/lic/" + moe + "/sess.json", { cache: "no-store", signal: c.signal }); clearTimeout(t); if (!r.ok) throw new Error("HTTP " + r.status); return parseJ(await r.json()); }
    finally { clearTimeout(t); }
  }
  async function sessPut(moe, obj, keep) {
    var r = await fetch(REG + "/lic/" + moe + "/sess.json", { method: "PUT", body: JSON.stringify(obj), keepalive: !!keep });
    if (!r.ok) throw new Error("HTTP " + r.status);
  }
  async function sessRec(extra) {
    SESS.name = await seatName(); SESS.data = (await DB.get("dataAt")) || 0;
    return Object.assign({ dev: await seat(), at: Date.now(), name: SESS.name, data: sessData() }, extra || {});
  }
  function ago(t) { var m = Math.max(0, Math.round((Date.now() - t) / 60000)); return m < 1 ? "أقل من دقيقة" : m === 1 ? "دقيقة" : m === 2 ? "دقيقتين" : m <= 10 ? m + " دقائق" : m + " دقيقة"; }
  function card(inner) { return '<div class="lock-card"><div class="lock-logo">' + MARK + "</div>" + inner + "</div>"; }
  function busyScreen(s) {
    var el = document.getElementById("boot");
    el.innerHTML = '<div class="lock">' + card("<h1>المنصة تعمل على جهاز آخر</h1>" +
      '<p class="lock-why">المنصة مفتوحة الآن لهذه المدرسة على جهاز آخر' + (s.name ? ": <b>" + esc(s.name) + "</b>" : "") + ".</p>" +
      '<p class="lock-hint"><b>أغلق المنصة في الجهاز الأول أولاً</b>، ثم اضغط «إعادة المحاولة». الترخيص يعمل على جهاز واحد في كل مرة.</p>' +
      '<p class="lock-hint mut">آخر نشاط هناك قبل ' + esc(ago(+s.at || 0)) + ". إن كان الجهاز الأول مطفأً أو انقطع عنه الإنترنت تُحرَّر الجلسة تلقائياً خلال 3 دقائق.</p>" +
      '<button class="btn pri" id="bs-retry" type="button">إعادة المحاولة</button><p id="bs-m" class="lock-msg"></p>') + "</div>";
    document.getElementById("bs-retry").onclick = function () { location.reload(); };
    var tm = setInterval(async function () {
      try { var ok = true; for (var i = 0; i < SESS.moes.length; i++) if (sessBusy(await sessGet(SESS.moes[i]), await seat())) ok = false; if (ok) { clearInterval(tm); location.reload(); } } catch (e) {}
    }, 20000);
  }
  function msgScreen(title, body, btn) {
    var el = document.getElementById("boot");
    el.innerHTML = '<div class="lock">' + card("<h1>" + title + '</h1><p class="lock-why">' + body + '</p><button class="btn pri" id="ms-ok" type="button">' + (btn || "إعادة المحاولة") + "</button>") + "</div>";
    document.getElementById("ms-ok").onclick = function () { location.reload(); };
  }
  /* حجز الجلسة قبل تحميل التطبيق */
  async function sessionGate(L) {
    var ok = (L.schools || []).filter(function (x) { return x.ok; });
    SESS.moes = ok.map(function (x) { return x.moe; });
    if (!SESS.moes.length || !REG) return true;
    var me = await seat(), prev = null;
    for (var i = 0; i < ok.length; i++) {
      var s = ok[i].sess;
      if (sessBusy(s, me)) { busyScreen(s); return false; }
      if (s && (!prev || (+s.data || 0) > (+prev.data || 0))) prev = s;
    }
    try {
      var rec = await sessRec({ data: prev ? +prev.data || 0 : 0 });   /* نُبقي وقت آخر بيانات معروفة حتى يكتمل التحقق من الحداثة */
      for (i = 0; i < SESS.moes.length; i++) await sessPut(SESS.moes[i], rec);
      await new Promise(function (r) { setTimeout(r, 600); });
      for (i = 0; i < SESS.moes.length; i++) { var chk = await sessGet(SESS.moes[i]); if (chk && chk.dev !== me) { busyScreen(chk); return false; } }
    } catch (e) { msgScreen("تعذّر فتح الجلسة", "تعذّر الاتصال بالخادم لحجز جلسة المدرسة. تحقق من الإنترنت ثم أعد المحاولة. (" + esc(e.message) + ")"); return false; }
    SESS.prev = prev && prev.dev !== me ? prev : null;
    return true;
  }

  /* حداثة البيانات: مجلد sammt (قد يكون على Google Drive أو OneDrive) قد يتأخر في المزامنة */
  var KEEP_KV = ["bundle", "license", "lics", "devRole", "remote", "trialStart", "trialMoe", "lastSeen", "deviceId", "seat", "dirHandle", "folderSkipAt", "folderSavedAt", "folderDaily", "dataAt"];
  function fileAt(f) { return f ? (+f.dataAt || Date.parse(f.at) || 0) : 0; }
  async function replaceData(f) {
    await tx("rec", "readwrite", function (s) { s.clear(); });
    await DB.putMany(f.recs || []);
    for (var k in (f.kv || {})) if (KEEP_KV.indexOf(k) < 0) await DB.set(k, f.kv[k]);
    await DB.set("dataAt", fileAt(f));
  }
  async function freshnessGate() {
    var me = await seat(), P = SESS.prev, D = P ? +P.data || 0 : 0, TOL = 3000;
    if ((await DB.get("dataAt")) == null) await DB.set("dataAt", (await DB.get("folderSavedAt")) || 0);   /* ترقية: أجهزة قديمة بلا وقت تعديل */
    var Lt = (await DB.get("dataAt")) || 0;
    if (FS.ok) {
      var f = await fsRead("samt-data.json");
      if (f && f.format === "sulook-backup" && f.seat !== me && fileAt(f) > Lt + TOL) { await replaceData(f); Lt = fileAt(f); }
      SESS.fdata = f ? fileAt(f) : 0;
    }
    if (!(D > Lt + TOL)) return true;
    return new Promise(function (res) {
      var el = document.getElementById("boot"), when = new Date(D).toLocaleString("ar-SA-u-nu-latn", { weekday: "long", hour: "numeric", minute: "2-digit" });
      el.innerHTML = '<div class="lock">' + card((FS.ok
        ? '<h1>جارٍ انتظار مزامنة المجلد</h1><p class="lock-why">آخر عمل على المنصة كان على جهاز آخر' + (P.name ? " (" + esc(P.name) + ")" : "") + " يوم " + esc(when) + '، ومجلد <b>sammt</b> هنا لم يصله آخر حفظ بعد.</p><p class="lock-hint">إن كان المجلد على Google Drive أو OneDrive فتأكد أن برنامج المزامنة يعمل على هذا الجهاز. تُفتح المنصة تلقائياً عند وصول البيانات.</p><p id="fz-m" class="lock-msg">جارٍ التحقق كل 5 ثوانٍ…</p>'
        : '<h1>بيانات هذا الجهاز أقدم</h1><p class="lock-why">آخر عمل على المنصة كان على جهاز آخر' + (P.name ? " (" + esc(P.name) + ")" : "") + " يوم " + esc(when) + '، وبيانات هذا الجهاز أقدم من ذلك.</p><p class="lock-hint">اربط مجلد <b>sammt</b> المشترك (على Google Drive أو OneDrive) لجلب آخر البيانات.</p>' +
          (FS.supported ? '<button class="btn pri" id="fz-pick" type="button">ربط مجلد sammt</button>' : "") + '<p id="fz-m" class="lock-msg err"></p>') +
        '<details><summary>المتابعة بالبيانات الموجودة على هذا الجهاز</summary><p class="lock-hint">ستُفقد التعديلات التي تمت على الجهاز الآخر ولم تصل هنا، وقد تُكتب فوقها.</p><button class="btn" id="fz-go" type="button">المتابعة على أي حال</button></details>') + "</div>";
      var tm = null;
      async function check() {
        var f = await fsRead("samt-data.json");
        if (f && f.format === "sulook-backup" && fileAt(f) >= D - TOL) { clearInterval(tm); if (fileAt(f) > Lt + TOL || f.seat !== me) await replaceData(f); SESS.fdata = fileAt(f); res(true); }
      }
      if (FS.ok) { tm = setInterval(function () { check().catch(function () {}); }, 5000); check().catch(function () {}); }
      var pk = document.getElementById("fz-pick");
      if (pk) pk.onclick = async function () { try { await fsPick(); await fsRestore(); tm = setInterval(function () { check().catch(function () {}); }, 5000); await check(); if (tm) document.getElementById("fz-m").textContent = "المجلد مربوط، لكن لم يصله آخر حفظ بعد. جارٍ الانتظار…"; } catch (e) { if (e && e.name !== "AbortError") document.getElementById("fz-m").textContent = e.message; } };
      document.getElementById("fz-go").onclick = function () { clearInterval(tm); res(true); };
    });
  }

  /* أثناء العمل: نبضة، خمول، تحرير عند الإغلاق */
  function overlay(title, body) {
    SESS.dead = true; SESS.timers.forEach(clearInterval);
    var w = document.createElement("div"); w.className = "lock"; w.style.zIndex = "99999";
    w.innerHTML = card("<h1>" + title + '</h1><p class="lock-why">' + body + '</p><button class="btn pri" type="button">متابعة العمل</button>');
    w.querySelector("button").onclick = function () { location.reload(); };
    document.body.appendChild(w);
    Array.prototype.forEach.call(document.querySelectorAll(".sheet-wrap"), function (x) { x.remove(); });
  }
  /* تحرير فوري ومتزامن (يعمل أثناء إغلاق الصفحة): القيم محفوظة مسبقاً في SESS */
  function release(keep) {
    if (!SESS.moes.length || !SESS.me) return Promise.resolve();
    var rec = { dev: SESS.me, at: Date.now(), name: SESS.name || "", data: sessData(), free: true };
    return Promise.all(SESS.moes.map(function (m) { return sessPut(m, rec, keep).catch(function () {}); }));
  }
  async function beat() {
    if (SESS.dead) return;
    var me = await seat();
    try {
      for (var i = 0; i < SESS.moes.length; i++) {
        var s = await sessGet(SESS.moes[i]);
        if (s && s.dev !== me && s.kick) return overlay("أنهى المزوّد الجلسة", "أُنهيت جلسة المنصة على هذا الجهاز من المزوّد. يمكنك إعادة فتحها إن لم تكن مفتوحة على جهاز آخر.");
        if (s && s.dev !== me && !s.free && Date.now() - (+s.at || 0) < SESS_TTL) return overlay("انتقلت الجلسة إلى جهاز آخر", "فُتحت المنصة لهذه المدرسة على جهاز آخر" + (s.name ? " (" + esc(s.name) + ")" : "") + "، فأُغلقت هنا حتى لا تتعارض البيانات.");
      }
      var rec = await sessRec(); for (i = 0; i < SESS.moes.length; i++) await sessPut(SESS.moes[i], rec);
      SESS.fail = 0; document.documentElement.classList.remove("net-off");
    } catch (e) { SESS.fail = (SESS.fail || 0) + 1; document.documentElement.classList.add("net-off"); }
  }
  function sessionStart() {
    if (!SESS.moes.length || SESS.started) return; SESS.started = true;
    var last = Date.now(); function act() { last = Date.now(); }
    ["pointerdown", "keydown", "wheel", "touchstart", "input"].forEach(function (ev) { window.addEventListener(ev, act, { passive: true, capture: true }); });
    var mm = 0; window.addEventListener("mousemove", function () { var n = Date.now(); if (n - mm > 5000) { mm = n; act(); } }, { passive: true });
    SESS.timers.push(setInterval(beat, SESS_BEAT));
    SESS.timers.push(setInterval(async function () {
      if (SESS.dead || Date.now() - last < IDLE_MS) return;
      SESS.dead = true;
      try { if (FS.ok) { clearTimeout(fsTimer); await fsSaveData(true); } } catch (e) {}
      await release(false);
      overlay("أُغلقت الجلسة لعدم الاستخدام", "أُغلقت المنصة بعد 20 دقيقة دون استخدام، وحُفظت البيانات، ليتمكن جهاز آخر في المدرسة من فتحها.");
    }, 15000));
    document.addEventListener("visibilitychange", function () { if (document.visibilityState === "hidden" && FS.ok && fsTimer && !SESS.dead) { clearTimeout(fsTimer); fsTimer = null; fsSaveData().catch(function () {}); } });
    window.addEventListener("pagehide", function () { if (SESS.dead) return; if (FS.ok && fsTimer) { clearTimeout(fsTimer); fsSaveData().catch(function () {}); } release(true); });
  }

  /* ————— التحديثات: ملف .slu موقّع ————— */
  async function readUpdate(file) {
    var txt = await file.text(), u;
    try { u = JSON.parse(txt); } catch (e) { return { ok: false, why: "الملف ليس ملف تحديث صالحاً." }; }
    if (!u || u.format !== "sulook-update" || !u.version || !u.files || typeof u.files["app.js"] !== "string" || typeof u.files["app.css"] !== "string")
      return { ok: false, why: "الملف ليس ملف تحديث لهذا التطبيق." };
    var msg = "SLU1|" + u.version + "|" + (await sha(u.files["app.css"])) + "|" + (await sha(u.files["app.js"]));
    if (!(await verifySig(msg, u.sig))) return { ok: false, why: "توقيع ملف التحديث غير صحيح — لم يُثبّت." };
    return { ok: true, u: u };
  }
  async function installUpdate(file) {
    var r = await readUpdate(file); if (!r.ok) return r;
    var cur = await currentVersion();
    if (vcmp(r.u.version, cur) < 0 && !confirm("ملف التحديث (" + r.u.version + ") أقدم من الإصدار الحالي (" + cur + "). هل تريد تثبيته؟")) return { ok: false, why: "أُلغي التثبيت." };
    await DB.set("bundle", { version: r.u.version, date: r.u.date || "", notes: r.u.notes || "", css: r.u.files["app.css"], js: r.u.files["app.js"], installedAt: Date.now() });
    return { ok: true, version: r.u.version, notes: r.u.notes || "" };
  }
  async function currentVersion() { var b = await DB.get("bundle"); return b && vcmp(b.version, BUILTIN) >= 0 ? b.version : BUILTIN; }
  async function rollback() { await DB.set("bundle", null); }

  /* ————— نسخة احتياطية (تعمل حتى والتطبيق مقفل) ————— */
  async function backupObject() {
    var kv = await DB.kvAll(), recs = await DB.all();
    delete kv.bundle; delete kv.license; delete kv.lics; delete kv.devRole; delete kv.remote; delete kv.trialStart; delete kv.lastSeen; delete kv.deviceId; delete kv.trialMoe; delete kv.seat; delete kv.dirHandle;
    return { format: "sulook-backup", v: 1, at: new Date().toISOString(), kv: kv, recs: recs };
  }
  function download(name, text, mime) {
    var a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([text], { type: mime || "application/json" })); a.download = name;
    document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
  }

  /* ————— تحميل التطبيق ————— */
  async function loadApp() {
    var b = await DB.get("bundle");
    if (b && vcmp(b.version, BUILTIN) >= 0 && b.js) {
      var st = document.createElement("style"); st.textContent = b.css; document.head.appendChild(st);
      var sc = document.createElement("script"); sc.textContent = b.js + "\n//# sourceURL=sulook-app-" + b.version + ".js"; document.body.appendChild(sc);
      return b.version;
    }
    await new Promise(function (res) { var l = document.createElement("link"); l.rel = "stylesheet"; l.href = "app.css?v=" + BUILTIN; l.onload = l.onerror = res; document.head.appendChild(l); });
    await new Promise(function (res, rej) { var s = document.createElement("script"); s.src = "app.js?v=" + BUILTIN; s.onload = res; s.onerror = rej; document.body.appendChild(s); });
    return BUILTIN;
  }

  /* ————— صيانة المنصة (يعلنها المزوّد من لوحة التراخيص) ————— */
  async function maintFetch() {
    if (!REG) return null;
    var c = new AbortController(), t = setTimeout(function () { c.abort(); }, 3000);
    try { var r = await fetch(REG + "/sys/maint.json", { cache: "no-store", signal: c.signal }); clearTimeout(t); return r.ok ? await r.json() : null; }
    catch (e) { clearTimeout(t); return null; }
  }
  function maintActive(m) { return !!(m && m.on && (!m.from || Date.now() >= +m.from)); }
  function whenAr(t) {
    try { return new Date(t).toLocaleString("ar-SA-u-nu-latn", { weekday: "long", year: "numeric", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" }); }
    catch (e) { return fmt(new Date(t)); }
  }
  function maintScreen(m) {
    var root = document.getElementById("boot");
    root.innerHTML = '<div class="lock"><div class="lock-card maint"><div class="lock-logo">' + MARK + "</div><h1>المنصة متوقفة مؤقتاً للصيانة</h1>" +
      '<p class="lock-why" style="white-space:pre-line">' + esc(m.msg || "نعتذر عن التوقف المؤقت لإجراء أعمال صيانة وتحسين. بياناتكم محفوظة ولن تتأثر.") + "</p>" +
      (m.until ? '<p class="lock-hint">العودة المتوقعة: <b>' + esc(whenAr(+m.until)) + "</b></p>" : "") +
      '<button class="btn pri" id="mt-retry" type="button">إعادة المحاولة</button>' +
      "</div></div>";
    document.getElementById("mt-retry").onclick = function () { location.reload(); };
    (document.getElementById("lk-bak")||{}).onclick = async function () { download("sulook-backup-" + new Date().toISOString().slice(0, 10) + ".json", JSON.stringify(await backupObject())); };
    setInterval(async function () { var x = await maintFetch(); if (x !== undefined && !maintActive(x)) location.reload(); }, 60000);
  }

  /* ————— شاشة القفل ————— */
  function lockScreen(L) {
    var root = document.getElementById("boot");
    var wa = VENDOR.wa ? "https://wa.me/" + VENDOR.wa + "?text=" + encodeURIComponent("السلام عليكم، أرغب بالاشتراك في منصة «سَمْت».\nالرقم الوزاري للمدرسة: ") : "";
    root.innerHTML =
      '<div class="lock"><div class="lock-card">' +
      '<div class="lock-logo">' + MARK + '</div><h1>سَمْت</h1>' +
      '<p class="lock-why">' + esc(L.why || "") + "</p>" +
      '<p class="lock-hint">الاشتراك للمدرسة لا للجهاز: أرسل <b>الرقم الوزاري للمدرسة</b> إلى ' + esc(VENDOR.name) + " تصلك كود يعمل على أي جهاز في المدرسة، على جهاز واحد في كل مرة. المدرسة ذات المرحلتين برقمين وزاريين تحتاج كودين.</p>" +
      (wa ? '<a class="btn wa" href="' + wa + '" rel="noopener">طلب الاشتراك عبر واتساب</a>' : "") +
      '<label class="lock-l">كود اشتراك المدرسة<textarea id="lk-code" rows="3" dir="ltr" placeholder="SL2.123456789.YYYYMMDD.…"></textarea></label>' +
      '<button class="btn pri" id="lk-act" type="button">تفعيل</button><p id="lk-msg" class="lock-msg"></p>' + folderBlock() +
      "</div></div>";
    folderBind();
    (document.getElementById("lk-copy")||{}).onclick = function () { try { navigator.clipboard.writeText(L.dev); this.textContent = "تم"; } catch (e) {} };
    document.getElementById("lk-act").onclick = async function () {
      var m = document.getElementById("lk-msg"); m.className = "lock-msg"; m.textContent = "جارٍ التحقق…";
      var r = await activate(document.getElementById("lk-code").value, "");
      if (r.ok) { m.className = "lock-msg ok"; m.textContent = "تم التفعيل حتى " + fmt(r.end) + " — جارٍ الفتح…"; setTimeout(function () { location.reload(); }, 900); }
      else { m.className = "lock-msg err"; m.textContent = r.why; }
    };
    (document.getElementById("lk-upd")||{}).onchange = async function () {
      var f = this.files[0]; if (!f) return; var r = await installUpdate(f), m = document.getElementById("lk-msg");
      m.className = "lock-msg " + (r.ok ? "ok" : "err"); m.textContent = r.ok ? "تم تثبيت الإصدار " + r.version : r.why;
    };
    var lkfs = document.getElementById("lk-fs");
    if (lkfs) lkfs.onclick = async function () { try { await fsPick(); await fsRestore(); location.reload(); } catch (e) {} };
    (document.getElementById("lk-bak")||{}).onclick = async function () { download("sulook-backup-" + new Date().toISOString().slice(0, 10) + ".json", JSON.stringify(await backupObject())); };
  }

  /* ————— مجلد البيانات «sammt» على قرص الجهاز (File System Access API — Chrome/Edge على الكمبيوتر) —————
     sammt/samt-core.json : رقم الجهاز والاشتراك وبداية التجربة
     sammt/samt-data.json : كل البيانات (يُحدَّث تلقائياً بعد كل تعديل)
     sammt/backups/samt-YYYY-MM-DD.json : نسخة يومية (آخر 30 يوماً)
     الهدف: مسح بيانات المتصفح أو حذفه لا يمس البيانات؛ يُعاد ربط المجلد فتُستعاد كاملة. */
  var FS = { supported: typeof window.showDirectoryPicker === "function", handle: null, ok: false, savedAt: 0 };
  async function fsPerm(h, ask) {
    var o = { mode: "readwrite" };
    try { if ((await h.queryPermission(o)) === "granted") return true; if (ask) return (await h.requestPermission(o)) === "granted"; } catch (e) {}
    return false;
  }
  async function fsPick() {
    var h = await window.showDirectoryPicker({ id: "sammt", mode: "readwrite", startIn: "documents" });
    if (String(h.name).toLowerCase() !== "sammt") h = await h.getDirectoryHandle("sammt", { create: true });
    FS.handle = h; FS.ok = true; await DB.set("dirHandle", h);
    return h;
  }
  async function fsRead(name) {
    try { var f = await (await FS.handle.getFileHandle(name)).getFile(); return JSON.parse(await f.text()); } catch (e) { return null; }
  }
  async function fsWrite(name, obj, sub) {
    if (!FS.ok) return false;
    var d = FS.handle; if (sub) d = await d.getDirectoryHandle(sub, { create: true });
    var w = await (await d.getFileHandle(name, { create: true })).createWritable();
    await w.write(typeof obj === "string" ? obj : JSON.stringify(obj)); await w.close();
    return true;
  }
  async function fsWriteCore() {
    if (!FS.ok) return;
    try { await fsWrite("samt-core.json", { format: "samt-core", deviceId: await DB.get("deviceId"), license: (await DB.get("license")) || "", lics: await getLics(), devRole: (await DB.get("devRole")) || "", trialStart: (await DB.get("trialStart")) || 0, trialMoe: (await DB.get("trialMoe")) || "", lastSeen: (await DB.get("lastSeen")) || 0, at: Date.now() }); } catch (e) { console.warn(e); }
  }
  /* استعادة من المجلد: الاشتراك دائماً، والبيانات إذا كان المتصفح فارغاً */
  async function fsRestore() {
    var core = await fsRead("samt-core.json"), restored = { core: false, data: 0 };
    if (core && core.deviceId) {
      await DB.set("deviceId", core.deviceId); try { localStorage.setItem("sulook_device", core.deviceId); } catch (e) {}
      if (core.license) await DB.set("license", core.license);
      if (core.lics && typeof core.lics === "object") { var cur = await getLics(); Object.keys(core.lics).forEach(function (m) { if (!cur[m]) cur[m] = core.lics[m]; }); await DB.set("lics", cur); }
      if (core.devRole && !(await DB.get("devRole"))) await DB.set("devRole", core.devRole);
      var ts = (await DB.get("trialStart")) || 0; if (core.trialStart && (!ts || core.trialStart < ts)) await DB.set("trialStart", core.trialStart);
      if (core.trialMoe && !(await DB.get("trialMoe"))) await DB.set("trialMoe", core.trialMoe);
      var ls = (await DB.get("lastSeen")) || 0; if (core.lastSeen > ls) await DB.set("lastSeen", core.lastSeen);
      restored.core = true;
    }
    var have = (await DB.all()).length;
    if (!have) {
      var data = await fsRead("samt-data.json");
      if (data && data.format === "sulook-backup" && data.recs) {
        await DB.putMany(data.recs);
        for (var k in (data.kv || {})) await DB.set(k, data.kv[k]);
        restored.data = data.recs.length;
      }
    }
    return restored;
  }
  async function fsSaveData(force) {
    if (!FS.ok || (SESS.dead && !force)) return false;
    var obj = await backupObject(); obj.dataAt = (await DB.get("dataAt")) || Date.now(); obj.seat = await seat();
    var txt = JSON.stringify(obj);
    await fsWrite("samt-data.json", txt);
    var day = new Date().toISOString().slice(0, 10), last = await DB.get("folderDaily");
    if (last !== day) {
      await fsWrite("samt-" + day + ".json", txt, "backups"); await DB.set("folderDaily", day);
      try {
        var bd = await FS.handle.getDirectoryHandle("backups"), names = [];
        for await (var ent of bd.values()) if (/^samt-\d{4}-\d{2}-\d{2}\.json$/.test(ent.name)) names.push(ent.name);
        names.sort(); while (names.length > 30) await bd.removeEntry(names.shift());
      } catch (e) {}
    }
    FS.savedAt = Date.now(); SESS.fdata = obj.dataAt; await DB.set("folderSavedAt", FS.savedAt);
    return true;
  }
  var fsTimer = null;
  function fsSchedule() { if (SESS.dead) return; SESS.data = Date.now(); DB.set("dataAt", SESS.data).catch(function () {}); if (!FS.ok) return; clearTimeout(fsTimer); fsTimer = setTimeout(function () { fsSaveData().catch(function (e) { console.warn(e); FS.err = e.message; }); }, 1500); }

  /* شاشة ربط المجلد عند التشغيل */
  function folderGate(mode) {
    return new Promise(function (res) {
      var el = document.getElementById("boot");
      var first = mode === "first";
      el.innerHTML = '<div class="lock"><div class="lock-card"><div class="lock-logo">' + MARK + '</div><h1>سَمْت</h1>' +
        (first ? "<p><b>مجلد البيانات على جهازك</b></p><p class=\"mut\">ستظهر نافذة اختيار مجلد. اختر مجلد <b>المستندات (Documents)</b>، أو — للعمل من أكثر من جهاز — مجلد <b>Google Drive</b> أو <b>OneDrive</b> على هذا الكمبيوتر، ثم اضغط «تحديد» أو «فتح»، فيُنشأ داخله مجلد <b>sammt</b> تلقائياً وتُحفظ فيه كل البيانات، فلا يؤثر مسح المتصفح أو حذفه عليها.</p><p class=\"mut\" style=\"font-size:.85rem\">لا يُسمح باختيار القرص الرئيسي نفسه (C: أو Macintosh HD) لأن المتصفح يحميه. إن كان لديك مجلد sammt سابق فاختره مباشرة لاستعادة بياناتك واشتراكك.</p>" +
          '<button class="btn pri" id="fg-pick" type="button">اختيار مكان مجلد sammt</button><button class="btn" id="fg-skip" type="button">لاحقاً</button>'
        : '<p>اسمح لسَمْت بالوصول إلى مجلد البيانات <b>sammt</b> للمتابعة.</p><button class="btn pri" id="fg-ok" type="button">السماح والمتابعة</button><button class="btn" id="fg-new" type="button">اختيار مجلد آخر</button><button class="btn" id="fg-skip" type="button">المتابعة بدون المجلد</button>') +
        '<p id="fg-m" class="lock-msg err"></p></div></div>';
      function m(t) { document.getElementById("fg-m").textContent = t; }
      async function pick() { try { await fsPick(); var r = await fsRestore(); res(r); } catch (e) { if (e && e.name !== "AbortError") m("تعذّر اختيار المجلد: " + e.message); } }
      var b;
      if ((b = document.getElementById("fg-pick"))) b.onclick = pick;
      if ((b = document.getElementById("fg-new"))) b.onclick = pick;
      if ((b = document.getElementById("fg-ok"))) b.onclick = async function () { if (await fsPerm(FS.handle, true)) { FS.ok = true; res(await fsRestore()); } else m("لم يُمنح الإذن."); };
      document.getElementById("fg-skip").onclick = async function () { if (first) await DB.set("folderSkipAt", Date.now()); res(null); };
    });
  }
  async function folderBoot() {
    if (!FS.supported) return;
    var h = (self.SAMT_FS && self.SAMT_FS()) || await DB.get("dirHandle");   /* SAMT_FS: مجلد وهمي للاختبارات */
    if (h) {
      FS.handle = h;
      if (await fsPerm(h, false)) { FS.ok = true; await fsRestore(); }
      else await folderGate("perm");
    } else {
      var skip = (await DB.get("folderSkipAt")) || 0;
      if (Date.now() - skip > 7 * 864e5) await folderGate("first");
    }
    FS.savedAt = (await DB.get("folderSavedAt")) || 0;
  }

  window.SLCore = {
    DB: DB, BUILTIN: BUILTIN, VENDOR: VENDOR, license: license, activate: activate, licLabel: licLabel, deviceId: deviceId,
    REG: REG, parseCode: parseCode, approve: approve, approveKey: approveKey, idUsed: idUsed, maintFetch: maintFetch, maintActive: maintActive, whenAr: whenAr, getLics: getLics, dropLic: dropLic, setRole: setRole, DEV_ROLES: DEV_ROLES, SLOTS: SLOTS, SESS: SESS, seat: seat, sessGet: sessGet, IDLE_MS: IDLE_MS, unlockOn: unlockOn,
    installUpdate: installUpdate, readUpdate: readUpdate, currentVersion: currentVersion, rollback: rollback,
    backupObject: backupObject, download: download, vcmp: vcmp,
    FS: FS, fsPick: fsPick, fsRestore: fsRestore, fsSaveData: fsSaveData, fsSchedule: fsSchedule, fsWriteCore: fsWriteCore, fsPerm: fsPerm
  };

  (async function boot() {
    var el = document.getElementById("boot");
    if (!window.indexedDB || !window.crypto || !crypto.subtle) { el.innerHTML = '<div class="lock"><div class="lock-card"><h1>المتصفح غير مدعوم</h1><p>استخدم متصفح Chrome أو Safari حديثاً.</p></div></div>'; return; }
    try {
      await folderBoot();
      var both = await Promise.all([maintFetch(), license()]), M = both[0], L = both[1];
      await fsWriteCore();
      window.SLCore.lic = L; window.SLCore.maint = M;
      if (maintActive(M)) { maintScreen(M); return; }
      if (!L.ok && L.v === 2 && L.schools.some(function (x) { return x.offline; }) && !L.schools.some(function (x) { return x.ok || x.stopped || x.expired; })) { msgScreen("لا يوجد اتصال بالإنترنت", esc(L.schools.find(function (x) { return x.offline; }).why)); return; }
      if (!L.ok && L.needMoe) { trialScreen(); return; }
      if (!L.ok && L.trial && L.offline) { msgScreen("لا يوجد اتصال بالإنترنت", esc(L.why)); return; }
      if (!L.ok) { lockScreen(L); return; }
      if (L.v === 2) { if (!(await sessionGate(L))) return; if (!(await freshnessGate())) return; }
      window.SLCore.version = await loadApp();
      if (L.v === 2) sessionStart();
    } catch (e) {
      console.error(e);
      el.innerHTML = '<div class="lock"><div class="lock-card"><h1>تعذّر التشغيل</h1><p>' + esc(e && e.message) + '</p><button class="btn" onclick="SLCore.rollback().then(function(){location.reload()})">الرجوع إلى الإصدار المدمج</button></div></div>';
    }
  })();

  /* تحديث تلقائي: عند وصول إصدار جديد يُعاد التحميل إن كنا في شاشة البدء، وإلا يظهر زر «تحديث» حتى لا يضيع عمل جارٍ */
  if ("serviceWorker" in navigator && /^https?:/.test(location.protocol)) {
    var hadSW = !!navigator.serviceWorker.controller, swDone = false;
    navigator.serviceWorker.register("sw.js").then(function (r) { try { r.update(); } catch (e) {} }).catch(function () {});
    navigator.serviceWorker.addEventListener("controllerchange", function () {
      if (!hadSW || swDone) return; swDone = true;
      if (!window.SLCore || !window.SLCore.version) { location.reload(); return; }
      var b = document.createElement("button"); b.type = "button"; b.className = "upd-bar"; b.textContent = "⟳ يتوفر تحديث جديد للمنصة — اضغط للتحديث";
      b.onclick = function () { location.reload(); }; document.body.appendChild(b);
    });
  }
  /* زر التثبيت داخل التطبيق */
  window.addEventListener("beforeinstallprompt", function (ev) { ev.preventDefault(); window.__bip = ev; document.documentElement.classList.add("can-install"); });
  window.addEventListener("appinstalled", function () { window.__bip = null; document.documentElement.classList.remove("can-install"); });
})();
