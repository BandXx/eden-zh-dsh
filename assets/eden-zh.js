/* Eden 汉化补丁 — 页面端翻译引擎
   依赖注入的 window.__EDEN_ZH_JSON__（英文 -> 简体中文）
   可选：window.__EDEN_ZH_ROUTES__（采集用路由清单，正常使用时不注入） */
(function () {
  if (window.__edenZhInstalled) return;
  window.__edenZhInstalled = 1;

  var RAW = window.__EDEN_ZH_JSON__ || '{}';
  var D = {};
  try { D = JSON.parse(RAW); } catch (e) { console.log('[edenZh] bad dict', e); return; }

  var exact = {};
  var pats = [];
  var LONG = [];

  function esc(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

  function compile(k, v) {
    if (typeof v !== 'string') return;
    if (k.indexOf('${') < 0) { exact[k] = v; return; }
    var out = '', i = 0;
    while (i < k.length) {
      var j = k.indexOf('${', i);
      if (j < 0) { out += esc(k.slice(i)); break; }
      out += esc(k.slice(i, j));
      var d = 1, p = j + 2;
      while (p < k.length && d > 0) {
        var c = k.charAt(p);
        if (c === '{') d++;
        else if (c === '}') d--;
        if (d > 0) p++;
      }
      out += '(.+?)';
      i = p + 1;
    }
    // 占位符过多、字面量过少的模式会误伤任意文本，直接丢弃
    var literal = k.replace(/\$\{[^}]*\}/g, '');
    var slots = (out.match(/\(\.\+\?\)/g) || []).length;
    if (literal.replace(/\s/g, '').length < 3 || slots > 4) return;
    try { pats.push({ re: new RegExp('^' + out + '$'), zh: v, lit: k.replace(/\$\{[^}]*\}/g, '').replace(/\s/g, '').length }); } catch (e) {}
  }

  for (var k in D) {
    compile(k, D[k]);
    if (k.indexOf('${') < 0 && k.length >= 20) LONG.push([k, D[k]]);
  }
  LONG.sort(function (a, b) { return b[0].length - a[0].length; });

  var SKIP = { SCRIPT: 1, STYLE: 1, NOSCRIPT: 1, CODE: 1, PRE: 1, TEXTAREA: 1, CANVAS: 1, SVG: 1, MATH: 1 };
  var ATTRS = ['placeholder', 'title', 'aria-label', 'aria-description', 'alt', 'data-tooltip', 'data-placeholder'];

  if (pats.sort) pats.sort(function (a, b) { return (b.lit || 0) - (a.lit || 0); });

  // 英文残留检测：译文里若仍含整词英文（≥4 字母，且不是专名），说明句子只翻了一半
  var KEEP_WORD = /^(Eden|Eve|Claude|ChatGPT|GPT|Cursor|LinkedIn|Threads|Instagram|TikTok|YouTube|Substack|Kindle|Readwise|Ghost|Slack|Notion|Shopify|Stripe|PayPal|Google|Drive|Play|Store|X|MCP|API|AI|URL|PDF|GIF|PNG|JPG|WebP|MP4|CSV|JSON|HTML|CSS|SDK|CLI|ID|OK|VS|DM|CTA|ROI|SEO|UGC|US|UK|EU|GST|VAT|GB|MB|KB|TB|Hz|px|em|rem|max|min|auto|Eve|Pro|Max|Team|Starter|Personal|Plus|Free|Beta)$/i;
  function residue(z) {
    if (/(^|[^A-Za-z])[A-Za-z][A-Za-z'-]{3,}/.test(z) === false) return false;  // 没有英文单词就算合格
    if (/[\u4e00-\u9fff]/.test(z) === false) return true;   // 有英文却完全没中文
    var w = z.match(/[A-Za-z][A-Za-z'-]{3,}/g);
    if (!w) return false;
    for (var i = 0; i < w.length; i++) if (!KEEP_WORD.test(w[i])) return true;
    return false;
  }

  function tr(s) {
    if (!s) return null;
    if (Object.prototype.hasOwnProperty.call(exact, s)) return exact[s];
    var t = s.replace(/[\u00a0\u2007\u202f]/g, ' ').replace(/\s+/g, ' ').trim();
    if (t !== s && Object.prototype.hasOwnProperty.call(exact, t)) return exact[t];
    if (!Object.prototype.hasOwnProperty.call(exact, t)) {
      var alt = t.replace(/[\u2026:.!]+$/, '').trim();
      if (alt !== t && Object.prototype.hasOwnProperty.call(exact, alt)) return exact[alt] + t.slice(alt.length);
    }
    // 短标签（≤3 词）走模式匹配；句子只允许“整串被吸收”的模式，避免出现「获取 your first…」这种半截译文
    var words = t.split(' ');
    // 标签判定：<=3 词且不含功能词；像 "Search any topic"/"Open settings" 这种祈使句+宾语不当标签
    var FUNC = /(^|\s)(any|the|a|an|to|of|in|on|at|for|from|with|your|our|their|this|that|these|those|some|every|each|all|and|or|but|is|are|was|were|be|will|can|should|would|could)(\s|$)/i;
    var isLabel = words.length <= 3 && !FUNC.test(t);
    for (var i = 0; i < pats.length; i++) {
      var m = t.match(pats[i].re);
      if (!m) continue;
      var z = pats[i].zh;
      for (var g = 1; g < m.length; g++) z = z.split('{' + (g - 1) + '}').join(m[g]);
      // 任何译文都不许留英文词（专名除外）——半截译文直接丢弃，宁可保留原文
      if (residue(z)) continue;
      return z;
    }
    // 长句兜底：只接受“整词子串替换后不残留英文”的结果
    if (t.length >= 20) {
      for (var j = 0; j < LONG.length; j++) {
        var pair = LONG[j];
        if (t.length <= pair[0].length) continue;
        if (t.indexOf(pair[0]) === -1) continue;
        var cand = t.split(pair[0]).join(pair[1]);
        if (residue(cand)) continue;
        return cand;
      }
    }
    if (!isLabel) return null;   // 句子没命中整句条目：宁可保留原文，也不输出中英混排
    return null;
  }

  function inEditable(el) {
    try { return !!(el && el.closest && el.closest('[contenteditable=""],[contenteditable="true"],textarea')); }
    catch (e) { return false; }
  }

  var INLINE = {SPAN:1, B:1, STRONG:1, EM:1, I:1, MARK:1, BR:1, U:1, SMALL:1, S:1};

  function joinInline(el) {
    if (!el || el.nodeType !== 1) return false;
    if (SKIP[el.tagName] || inEditable(el)) return false;
    if (el.querySelector && el.querySelector('a,button,input,select,textarea,img,svg')) return false;
    var kids = el.children;
    for (var i = 0; i < kids.length; i++) if (!INLINE[kids[i].tagName]) return false;
    var full = (el.textContent || '').replace(/[\u00a0]/g, ' ').replace(/\s+/g, ' ').trim();
    if (full.length < 12 || full.length > 220) return false;
    if (/[\u4e00-\u9fff]/.test(full)) return false;
    var z = tr(full);
    if (z === null || z === full) return false;
    el.textContent = z;
    return true;
  }

  function doText(node) {
    if (inEditable(node.parentElement)) return;
    var raw = node.nodeValue;
    if (!raw) return;
    var z = tr(raw);
    if (z === null) { joinInline(node.parentElement); return; }
    var lead = (raw.match(/^\s*/) || [''])[0];
    var tail = (raw.match(/\s*$/) || [''])[0];
    var next = lead + z + tail;
    if (node.nodeValue !== next) node.nodeValue = next;
  }

  function doEl(el) {
    if (!el || el.nodeType !== 1) return;
    if (SKIP[el.tagName]) return;
    for (var a = 0; a < ATTRS.length; a++) {
      var n = ATTRS[a];
      var v = el.getAttribute && el.getAttribute(n);
      if (v) { var z = tr(v); if (z !== null && z !== v) el.setAttribute(n, z); }
    }
    if (el.tagName === 'INPUT' && el.value) {
      var zv = tr(el.value);
      if (zv !== null && zv !== el.value) el.value = zv;
    }
  }

  function walk(root, depth) {
    if (!root) return;
    if (root.nodeType === 3) { doText(root); return; }
    if (root.nodeType === 11) {                       // ShadowRoot / DocumentFragment
      if (!depth || depth > 24) return;
      var kids = root.children ? root.children : [];
      for (var s0 = 0; s0 < kids.length; s0++) walk(kids[s0], depth + 1);
      var t0 = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
      while (t0.nextNode()) doText(t0.currentNode);
      return;
    }
    if (root.nodeType !== 1) return;
    if (SKIP[root.tagName]) return;
    if (inEditable(root)) return;
    doEl(root);
    // 先把「被拆成多个 span / 内联标签的整句」合并翻译（设置页大量使用这种写法）
    if (!joinInline(root) && root.querySelectorAll) {
      var merged = root.querySelectorAll('p,div,span,label,li,td,th,h1,h2,h3,h4,h5,h6,strong,em,small,figcaption,blockquote');
      for (var mi = 0; mi < merged.length; mi++) joinInline(merged[mi]);
    }
    var w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    while (w.nextNode()) doText(w.currentNode);
    if (root.querySelectorAll) {
      var nodes = root.querySelectorAll('*');
      for (var i = 0; i < nodes.length; i++) {
        doEl(nodes[i]);
        if (nodes[i].shadowRoot) walk(nodes[i].shadowRoot, (depth || 0) + 1);   // 穿透 Shadow DOM
      }
    }
    if (root.shadowRoot) walk(root.shadowRoot, (depth || 0) + 1);
  }

  function title() {
    var z = tr(document.title);
    if (z !== null && z !== document.title) document.title = z;
  }

  function all() { walk(document.body || document.documentElement, 0); title(); }

  var mo = new MutationObserver(function (muts) {
    for (var i = 0; i < muts.length; i++) {
      var m = muts[i];
      if (m.type === 'characterData') doText(m.target);
      else for (var j = 0; j < m.addedNodes.length; j++) walk(m.addedNodes[j]);
    }
    title();
  });

  // —— 未翻译内容回收 ——
  var seen = {};
  var seenRoutes = {};

  function post(tag, payload) {
    try { window.webkit.messageHandlers.edenZhI18n.postMessage(tag + ' ' + JSON.stringify(payload)); } catch (e) {}
  }

  function report() {
    var out = [];
    var body = document.body || document.documentElement;
    var roots = [body];
    try {
      var allEls = body.querySelectorAll('*');
      for (var q = 0; q < allEls.length; q++) if (allEls[q].shadowRoot) roots.push(allEls[q].shadowRoot);
    } catch (e) {}
    var w;
    for (var r = 0; r < roots.length; r++) {
    w = document.createTreeWalker(roots[r], NodeFilter.SHOW_TEXT, null);
    while (w.nextNode()) {
      var node = w.currentNode;
      if (inEditable(node.parentElement)) continue;
      var t = (node.nodeValue || '').replace(/\s+/g, ' ').trim();
      if (t.length < 2 || t.length > 260) continue;
      var cj = (t.match(/[\u4e00-\u9fff]/g) || []).length;
      if (cj > t.length * 0.4) continue;          // 纯中文跳过；中英混排仍上报
      if (!/[A-Za-z]{2}/.test(t)) continue;
      if (/^(https?:|tauri:|data:|\/|@keyframes)/.test(t)) continue;
      if (seen[t]) continue;
      seen[t] = 1; out.push(t);
    }
    }
    var fields = document.querySelectorAll('input,textarea,[placeholder],[aria-label],[title],[alt],[data-tooltip]');
    for (var i = 0; i < fields.length; i++) {
      for (var a = 0; a < ATTRS.length; a++) {
        var v = fields[i].getAttribute && fields[i].getAttribute(ATTRS[a]);
        if (!v || v.length < 2 || v.length > 200) continue;
        if (seen[v] || /[\u4e00-\u9fff]/.test(v) || !/[A-Za-z]{2}/.test(v)) continue;
        seen[v] = 1; out.push(v);
      }
    }
    if (out.length) post('MISSING', out);
  }

  function dumpRoutes() {
    var found = [];
    var as = document.querySelectorAll('a[href]');
    for (var i = 0; i < as.length; i++) {
      var h = as[i].getAttribute('href') || '';
      var idx = h.indexOf('#/');
      if (idx >= 0) found.push(h.slice(idx));
    }
    var fresh = [];
    for (var j = 0; j < found.length; j++) if (!seenRoutes[found[j]]) { seenRoutes[found[j]] = 1; fresh.push(found[j]); }
    if (fresh.length) post('ROUTES', fresh);
  }

  // —— 自动遍历（仅采集模式：保留 routes.txt 时启用）——
  function crawl() {
    var routes = window.__EDEN_ZH_ROUTES__;
    if (!routes || !routes.length) return;
    var i = 0;
    function step() {
      if (i >= routes.length) { post('CRAWL', ['done', String(routes.length)]); return; }
      var r = routes[i++];
      try { location.hash = r; } catch (e) {}
      setTimeout(function () { all(); report(); dumpRoutes(); step(); }, 2600);
    }
    setTimeout(step, 4000);
  }

  function start() {
    all();
    try { mo.observe(document.documentElement, { subtree: true, childList: true, characterData: true }); } catch (e) {}
    var n = 0;
    var iv = setInterval(function () { n++; all(); if (n > 25) clearInterval(iv); }, 900);
    setInterval(function () { all(); report(); dumpRoutes(); }, 4000);
    post('ACTIVE', [String(Object.keys(exact).length), String(pats.length), String(LONG.length)]);
    crawl();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();

/* ===== 采集模式 v3：先进入设置，再逐栏点击，让 report() 写入 missing.log ===== */
(function () {
  if (!window.__EDEN_ZH_CRAWL__) return;
  var SET = ['个人资料','偏好设置','画中画','快捷键','推荐奖励','通话时长','工作空间','成员','标签','模板',
             '导入','同步来源','用量','存储','账单','个性化','例程','Eve','技能','MCP','连接器','API'];
  function byText(list, txt) {
    for (var i = 0; i < list.length; i++) {
      var el = list[i], t = (el.textContent || '').trim();
      if (t === txt && el.getBoundingClientRect().width > 0) return el;
    }
    return null;
  }
  function inSettings() {
    var els = document.querySelectorAll('*');
    for (var i = 0; i < els.length; i++) {
      var t = (els[i].textContent || '').trim();
      if (t === '搜索设置' || t === 'Search settings') return true;
    }
    return false;
  }
  function openSettings() {
    var btns = document.querySelectorAll('button,[role="button"]');
    var best = null;
    for (var i = 0; i < btns.length; i++) {
      var r = btns[i].getBoundingClientRect();
      if (r.width === 0) continue;
      if (r.top < 90 && r.left > window.innerWidth * 0.55 && !(btns[i].textContent || '').trim()) {
        best = btns[i];
      }
    }
    if (best) { best.click(); return true; }
    return false;
  }
  var step = 0, idle = 0;
  var timer = setInterval(function () {
    if (step === 0) {
      if (!inSettings()) { openSettings(); idle++; if (idle > 8) { clearInterval(timer); } return; }
      step = 1; idle = 0;
    }
    var els = document.querySelectorAll('button,a,[role="button"],li,div,span');
    var target = byText(els, SET[step - 1]);
    var k = 0;
    while (!target && k < SET.length) { step++; if (step - 1 >= SET.length) { clearInterval(timer); return; } target = byText(els, SET[step - 1]); k++; }
    if (!target) { if (++idle > 6) clearInterval(timer); return; }
    idle = 0;
    try { target.click(); } catch (e) {}
    step++;
    if (step - 1 >= SET.length) clearInterval(timer);
  }, 2600);
})();
