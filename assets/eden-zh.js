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

  var SKIP = { SCRIPT: 1, STYLE: 1, NOSCRIPT: 1, CODE: 1, PRE: 1, TEXTAREA: 1, CANVAS: 1, SVG: 1, MATH: 1, KBD: 1, IMG: 1, PICTURE: 1, VIDEO: 1, AUDIO: 1, IFRAME: 1, OBJECT: 1, EMBED: 1, TEMPLATE: 1, LINK: 1, META: 1 };
  var ATTRS = ['placeholder', 'title', 'aria-label', 'aria-description', 'alt', 'data-tooltip', 'data-placeholder'];

  if (pats.sort) pats.sort(function (a, b) { return (b.lit || 0) - (a.lit || 0); });

  var KEEP_WORD = /^(Eden|Eve|Claude|ChatGPT|GPT|Cursor|LinkedIn|Threads|Instagram|TikTok|YouTube|Substack|Kindle|Readwise|Ghost|Slack|Notion|Shopify|Stripe|PayPal|Google|Drive|Play|Store|X|MCP|API|AI|URL|PDF|GIF|PNG|JPG|WebP|MP4|CSV|JSON|HTML|CSS|SDK|CLI|ID|OK|VS|DM|CTA|ROI|SEO|UGC|US|UK|EU|GST|VAT|GB|MB|KB|TB|Hz|px|em|rem|max|min|auto|Eve|Pro|Max|Team|Starter|Personal|Plus|Free|Beta)$/i;
  // 技能/工具 slug 形态：kebab-case 或点分，属于标识符，不算未翻译
  function isSlugWord(s) { return /^[a-z0-9]+([-._][a-z0-9]+)+$/.test(s); }

  function residue(z) {
    if (/(^|[^A-Za-z])[A-Za-z][A-Za-z'-]{3,}/.test(z) === false) return false;  // 没有英文单词就算合格
    if (/[\u4e00-\u9fff]/.test(z) === false) return true;   // 有英文却完全没中文
    var w = z.match(/[A-Za-z][A-Za-z0-9'-]{2,}/g);
    if (!w) return false;
    for (var i = 0; i < w.length; i++) {
      var lw = w[i].toLowerCase();
      if (KEEP_WORD.test(w[i]) || isSlugWord(w[i]) || WORDY[lw]) continue;
      // 单字母与常见英文词尾不算残留（"导出 humanizer" 里的 humanizer 已进 WORDY）
      if (w[i].length < 3) continue;
      return true;
    }
    return false;
  }
  /* ============ 文本形态判定：这些内容永远不进翻译 ============ */
  var reEmail = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
  var reEmailAny = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/;
  // 注意：/月 /年 这类以斜杠开头但其实是译文的短标签要放过，只有明确的路径/协议才挡
  var reProtocol = /^(https?:|tauri:|data:|mailto:|tel:|file:|blob:|chrome:|about:|ftp:|ws:|wss:|javascript:|#\/|\/\/|\/(api|assets|static|uploads|files|images|vnd|src|dist|resources|Applications|Users|Volumes|tmp|var|etc|private|rss|feed|sitemap|robots)(\/|$))/i;
  var reDomain = /^[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.(com|so|io|app|dev|net|org|ai|co|me|xyz|sh|tv|cc|cn|ink|page|site|store|shop|link|gd|to|fm|ai|gg|email)(\/.*)?$/i;
  var reUrlInText = /(https?:\/\/|www\.|tauri:\/\/|mailto:)/i;
  // 纯标识符：只由 [a-z0-9._-] 组成、无空格、且不是普通英文单词
  var reIdent = /^[A-Za-z0-9._-]+$/;
  var reHex = /^#[0-9a-fA-F]{3,8}$/;
  var reCssUnit = /^-?\d+(\.\d+)?(px|em|rem|vh|vw|%|s|ms|fr|deg)$/i;
  var reNumber = /^[\d\s.,:%$+\-/×x()]+$/;

  // 普通英文单词表：短全小写标识符里，这些是真单词，应当翻译
  var WORDY = { of: 1, to: 1, in: 1, on: 1, at: 1, by: 1, or: 1, as: 1, is: 1, if: 1, no: 1, ok: 1, new: 1, all: 1, any: 1, add: 1, get: 1, set: 1, use: 1, day: 1, may: 1, can: 1, see: 1, fit: 1, low: 1, top: 1, buy: 1, pay: 1, run: 1, yes: 1, not: 1, and: 1, the: 1, for: 1, you: 1, out: 1, our: 1, its: 1, his: 1, her: 1, way: 1, try: 1, let: 1, own: 1, ask: 1, why: 1, who: 1, how: 1, was: 1, we: 1, us: 1, my: 1, me: 1, go: 1, up: 1, do: 1, be: 1, an: 1, a: 1, i: 1, skill: 1, skills: 1, export: 1, exporting: 1, import: 1, importing: 1, disable: 1, disabling: 1, enable: 1, enabling: 1, view: 1, humanizer: 1, planner: 1, connector: 1, connectors: 1, offer: 1, offers: 1, upsell: 1, upsells: 1, template: 1, templates: 1};

  /* 人名词库：创作者引言/买家姓名这类用户生成内容，不该进翻译也不该上报。
     判定靠形态而非枚举：@handle、或「首字母大写 / 全大写缩写」组成的 1~4 个词、
     且不在常见 UI 词汇表里。 */
  var PERSON_STOP = /(save|edit|delete|cancel|copy|share|retry|loading|search|settings|setting|profile|account|billing|upgrade|download|upload|close|open|back|next|previous|continue|submit|confirm|remove|create|update|refresh|select|clear|apply|reset|preview|publish|draft|inbox|outbox|archive|trash|spam|star|reply|send|compose|attach|signature|template|schedule|contact|company|product|order|invoice|payment|receipt|refund|address|shipping|delivery|tracking|status|summary|overview|dashboard|analytics|reports|audit|export|import|disable|enable|view|humanizer|planner|connector|workspace|routine|offer|upsell|onboarding|welcome|thanks|hello|hi|yes|no|ok|done|error|success|warning|notice|info|help|support|feedback|learn|more|less|show|hide|expand|collapse|filter|sort|group|visibility|display|theme|language|privacy|security|terms|policy|content|media|docs|files|folder|home|start|stop|pause|play|record|listen|watch|read|write|think|generate|analyze|optimize|boost|scale|grow|launch|build|ship|test|debug|fix|plan|strategy|growth|marketing|sales|revenue|profit|pricing|discount|coupon|trial|seat|team|member|invite|role|permission|admin|owner|guest|viewer|editor|new|add|music|soul|art|design|video|image|audio|text|voice|chat|message|note|task|project|board|list|card|item|user|customer|buyer|seller|lead|client|deal|checkout|cart|store|shop|site|page|post|blog|link|form|survey|quiz|course|lesson|book|event|ticket|review|rating|comment|follow|like|subscribe|newsletter|feed|campaign|email|notification|alert|reminder|calendar|clock|timer|date|time|week|month|year|today|yesterday|tomorrow|morning|evening|night|week|day|hour|minute)(s)?$/i;

  /* 人名 / 组织名判定：创作者引言、买家姓名这类用户生成内容。
     保守原则——宁可漏判也不误伤 UI 词，因此只认三种形态：
       1. @handle
       2. 两个及以上单词、每个词都以大写字母开头（Hussain Ibarra / Acme Studio GmbH）
       3. 单个单词且命中 PERSON_KNOWN（已知人名，由 report 侧补充）
     单个人名（Patrick）走 PERSON_KNOWN 白名单，不做“首字母大写即人名”的猜测。 */
  var PERSON_KNOWN = { 'patrick': 1, 'jane': 1, 'smith': 1, 'grant': 1, 'hussain': 1, 'ibarra': 1, 'ons': 1, 'henia': 1, 'theriault': 1, 'acme': 1, 'gmbh': 1, 'sarah': 1, 'mike': 1, 'david': 1, 'emma': 1, 'daniel': 1, 'sophie': 1, 'james': 1, 'kate': 1, 'lucas': 1, 'nina': 1, 'omar': 1, 'ryan': 1, 'zoe': 1, 'leo': 1, 'ava': 1, 'liam': 1, 'noah': 1, 'mia': 1 };

  function isPersonLike(t) {
    if (/^@[A-Za-z0-9_.]{2,}$/.test(t)) return true;                 // @handle

    // 已知人名 / 机构名：逐个词查名单，全部词都在名单里才算（Jane Smith / Acme Studio GmbH）
    var w = t.split(/\s+/);
    if (w.length <= 4 && w.length >= 1) {
      var allKnown = true;
      var knownCount = 0;
      for (var i = 0; i < w.length; i++) {
        var lw = w[i].toLowerCase().replace(/[.,'-]+$/, '');
        if (PERSON_KNOWN[lw]) { knownCount++; continue; }
        // 机构连接词（Studio / Group / Ltd / Inc / Co / LLC）可出现在公司名里
        if (/^(studio|group|ltd|inc|co|llc|corp|company)$/.test(lw) && w.length >= 2) continue;
        allKnown = false; break;
      }
      if (allKnown && knownCount >= 1) return true;
    }
    // 其余形态一律不做“首字母大写即人名”的猜测 —— 会吞掉 Canvas Arrange / Connect Eden 这类 UI 标签
    return false;
  }

  function isIdentifier(t) {
    // 人名 / @handle 带空格或 @，必须先判，否则会被 reIdent 的「无空格」前提挡掉
    if (isPersonLike(t)) return true;
    if (!reIdent.test(t)) return false;
    // 纯字母单词一律交给翻译流程（About / Academy / Access 这类 UI 词不能当标识符）
    if (/^[A-Za-z]+$/.test(t)) return false;
    // 纯字母且是常见英文单词 → 不是标识符，让它走翻译
    if (/^[A-Za-z]+$/.test(t) && WORDY[t.toLowerCase()]) return false;
    // 数量词（20k / 1.5m / 100k / 3b）是正常文案，交给翻译
    if (/^\d+(\.\d+)?[kmb]$/i.test(t)) return false;
    // 连字符词（Auto-DM / Built-in / Read-only / Self-improvement）是 UI 文案，交给翻译
    // 只有全大写缩写混合（ABC-DEF）或带数字/下划线的才算标识符
    if (/^[A-Za-z]+(-[A-Za-z]+)+$/.test(t) && !/[0-9_]/.test(t)) return false;
    // 含分隔符（. _ -）或数字、或超长单词 → 标识符
    return /[._\-]/.test(t) || /[0-9]/.test(t) || t.length >= 14;
  }

  /* 返回 true 表示「这段文本不该被翻译」 */
  function ignoreText(s) {
    if (!s) return false;
    var t = s.replace(/[\u00a0\u2007\u202f]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!t) return false;
    // 句末标点（Free. / Loading... / Saved.）不影响判定，剥掉再看
    var core = t.replace(/[.,;:!?\u2026]+$/, '').trim();
    if (core && core !== t && ignoreText(core) === false && /[A-Za-z]/.test(core)) {
      // core 是有意义的文案（Free/installed），标点只是装饰 → 不拦
      if (!reEmail.test(core) && !reProtocol.test(core) && !reDomain.test(core) && !reUrlInText.test(core)) return false;
    }
    // 已经是中文的不要动（中文占比 >= 30% 视为已翻译，含中英混排）
    var cj = (t.match(/[\u4e00-\u9fff]/g) || []).length;
    if (cj > 0 && cj >= t.replace(/\s/g, '').length * 0.3) return true;
    // 邮箱（含夹在文本里的邮箱）
    if (reEmail.test(t) || (t.indexOf('@') > 0 && reEmailAny.test(t) && !/\s/.test(t))) return true;
    // 协议 / 绝对路径 / 根路径 / 锚点
    if (reProtocol.test(t)) return true;
    // 域名 + 可选路径
    if (reDomain.test(t)) return true;
    // 文本里直接夹带 URL
    if (reUrlInText.test(t)) return true;
    // 十六进制色值 / CSS 单位 / 纯数字
    if (reHex.test(t) || reCssUnit.test(t) || reNumber.test(t)) return true;
    // 纯标识符
    if (isIdentifier(t)) return true;
    return false;
  }

  function tr(s) {
    if (!s) return null;
    // 前置判定：邮箱 / URL / 域名 / 纯标识符 / 已是中文 —— 一律原样返回，不进词表
    if (ignoreText(s)) return null;
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
    var isLabel = (words.length <= 3 && !FUNC.test(t)) || /[?:—…]$/.test(t) || /^[A-Z][a-z]+(-[a-z]+)?\s/.test(t);
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
    try {
      if (!el || !el.closest) return false;
      if (el.closest('[contenteditable=""],[contenteditable="true"],[contenteditable="plaintext-only"],textarea')) return true;
      return inIgnored(el);
    } catch (e) { return false; }
  }

  /* ============ 容器级忽略：用户自己录入的内容永远不翻 ============ */
  // Eden 把用户内容渲染在带这些标记的容器里（看板卡片标题、商品名、买家邮箱、
  // 文档正文、评论）。这些容器内的文字全部跳过，避免把店铺名/邮箱/商品名
  // 翻译成中文。reIgnoreClass 只匹配明确表示「用户内容」的 class，
  // 不碰普通 UI class，避免把界面文案一起挡掉。
  var IGNORE_TAGS = 'pre,code,kbd,samp,var,[contenteditable="true"],[contenteditable="plaintext-only"],[translate="no"],[data-no-translate],[data-user-content],[data-raw],[itemprop="name"],[itemprop="email"]';
  var reIgnoreClass = /(\buser-content\b|\braw-text\b|\bmarkdown-body\b|\bprose-editor\b|\btoken-value\b|\bmono-\b|\bemail\b|\bbuyer-email\b|\bproduct-name\b|\bpost-title-input\b)/i;
  var reIgnoreId = /^(math|monaco|pdf-?viewer|code-view)$/i;

  function inIgnored(el) {
    try {
      if (!el || !el.closest) return false;
      if (el.closest(IGNORE_TAGS)) return true;
      var cur = el, guard = 0;
      while (cur && cur.nodeType === 1 && guard++ < 256) {
        var cls = cur.getAttribute && cur.getAttribute('class');
        if (cls && reIgnoreClass.test(cls)) return true;
        var id = cur.getAttribute && cur.getAttribute('id');
        if (id && reIgnoreId.test(id)) return true;
        cur = cur.parentElement;
      }
    } catch (e) {}
    return false;
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
      // 纯中文跳过；但含英文整词的混排要上报（例如「获取 your first product…」）
      if (cj === t.length) continue;
      if (!/[A-Za-z]{2}/.test(t)) continue;
      if (cj > 0 && !/[A-Za-z][A-Za-z'-]{3,}/.test(t)) continue;
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
        if (seen[v] || !/[A-Za-z]{2}/.test(v)) continue;
        if (/[\u4e00-\u9fff]/.test(v) && !/[A-Za-z][A-Za-z'-]{3,}/.test(v)) continue;
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
