/* Board list + in-site detail router for the three public pages.
   Shared by ai-news.html, github-weekly.html, and github-skills.html.

   Keep this file, and on each board page keep:
   - section.board id (ai-news | github-weekly | github-skills) and data-feed
   - #q search, section.board .more ("查看其余 N 条"), sidebar links, top pills
   - #detail-root and #board-fallback (baked copy of the feed)
   - <script src="board.js"></script>
   Hash route (GitHub Pages): ai-news.html#/<id>  e.g. ai-news.html#/aws-fable-5-2
   Legacy #/<board>/<id> on the matching page is accepted and canonicalized.
   JSON fields: timeLabel (not "time"), windowLabel, summary/intro, detail, links, url.
   Do not render item HTML unsanitized. Do not drop 查看介绍 when re-rendering. */
(function (root) {
  var FEEDS = {
    'ai-news': 'data/news-latest.json',
    'github-weekly': 'data/stars-latest.json',
    'github-skills': 'data/skills-latest.json'
  };
  var FEED_KEY = { 'ai-news': 'news', 'github-weekly': 'stars', 'github-skills': 'skills' };
  var BOARD_NAME = { 'ai-news': 'AI讯息', 'github-weekly': 'GitHub周榜', 'github-skills': 'GitHub Skill榜单' };
  var PAGE = {
    'ai-news': 'ai-news.html',
    'github-weekly': 'github-weekly.html',
    'github-skills': 'github-skills.html'
  };
  var DEALS_SECS = ['urgent', 'direct', 'overseas', 'expiring', 'pending'];
  var BOARDS = {};
  var detailFromClick = false;
  var titleBackup = '';

  var DETAIL_CSS = [
    '.board .card.teaser { cursor: pointer; }',
    '.board .card.teaser:hover { border-color: #0969da; }',
    '.board .card .c { display: block; -webkit-line-clamp: unset; line-clamp: unset; overflow: visible; }',
    '.when { display: inline-block; margin-top: 8px; font-size: 12px; font-weight: 700; color: #0969da; background: #e8f1fd; border-radius: 999px; padding: 3px 8px; }',
    'a.detail-cta, .detail-cta { display: inline-block; margin-top: 10px; font-size: 13px; font-weight: 700; color: #0969da; }',
    '.board .card .agents { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }',
    '.chead h3 a { color: inherit; }',
    '.chead h3 a:hover { color: #0969da; }',
    '.card .m a.ext { font-weight: 600; }',
    '#detail-root { margin: 6px 0 28px; }',
    '.detail { background: #fff; border: 1px solid #e3e5e8; border-radius: 12px; padding: 22px 26px 28px; }',
    '.detail .back { display: inline-block; font-size: 13px; font-weight: 700; background: #fff; border: 1px solid #d8dbdf; border-radius: 999px; padding: 6px 12px; color: #24292f; }',
    '.detail .kicker { margin-top: 14px; font-size: 13px; color: #0969da; font-weight: 700; }',
    '.detail h1 { font-size: 28px; line-height: 1.35; margin: 8px 0 6px; }',
    '.detail .timenote { font-size: 13px; color: #57606a; line-height: 1.65; margin: 0 0 8px; }',
    '.detail-body h2 { font-size: 18px; margin: 22px 0 8px; padding: 0; border: 0; }',
    '.detail-body h3 { font-size: 16px; margin: 14px 0 6px; }',
    '.detail-body p { font-size: 15.5px; line-height: 1.8; color: #24292f; margin: 8px 0; overflow-wrap: break-word; }',
    '.detail-body ul { margin: 8px 0 8px 1.2em; }',
    '.detail-body li { font-size: 15px; line-height: 1.7; margin: 4px 0; }',
    '.detail-body code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 0.92em; background: #f0f2f4; padding: 1px 5px; border-radius: 5px; }',
    '.detail-links { margin-top: 22px; padding-top: 14px; border-top: 1px solid #eceef0; }',
    '.detail-links h2 { font-size: 16px; margin: 0 0 10px; border: 0; padding: 0; }',
    '.detail-links .go { display: inline-block; margin: 0 8px 8px 0; font-size: 13px; font-weight: 600; background: #0969da; color: #fff; padding: 7px 15px; border-radius: 8px; }',
    '.meta-row { display: flex; flex-wrap: wrap; gap: 8px 18px; margin: 10px 0 4px; font-size: 13px; color: #57606a; }',
    '.meta-row b { color: #1f2328; }',
    'body.detail-open section.board { display: none !important; }',
    '@media (max-width: 720px) {',
    '  .detail { padding: 16px 14px 22px; }',
    '  .detail h1 { font-size: 22px; }',
    '}'
  ].join('\n');

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function fmt(n) {
    return (typeof n === 'number' && isFinite(n)) ? n.toLocaleString('en-US') : esc(n);
  }

  function safeUrl(url) {
    var s = String(url == null ? '' : url).trim();
    if (/^https?:\/\//i.test(s)) return s;
    return '';
  }

  function extLink(url, label) {
    var href = safeUrl(url);
    var text = label || href || '';
    if (!href) return esc(text);
    return '<a class="ext" href="' + esc(href) + '" target="_blank" rel="noopener">' + esc(text) + ' ↗</a>';
  }

  function itemId(item, index) {
    if (item && item.id) return String(item.id);
    var repo = item && item.repo ? String(item.repo) : '';
    if (repo) return repo.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || ('item-' + (index + 1));
    return 'item-' + (index + 1);
  }

  function detailHref(id) {
    return '#/' + encodeURIComponent(id);
  }

  function sortNews(items) {
    return items.slice().sort(function (a, b) {
      var ta = Date.parse(a.sortAt || a.publishedAt || '') || 0;
      var tb = Date.parse(b.sortAt || b.publishedAt || '') || 0;
      if (ta !== tb) return tb - ta;
      return 0;
    });
  }

  function sortRepos(items) {
    return items.slice().sort(function (a, b) {
      var d = (Number(b.weeklyStars) || 0) - (Number(a.weeklyStars) || 0);
      if (d) return d;
      var ra = Number(a.rank) || 0;
      var rb = Number(b.rank) || 0;
      if (ra && rb && ra !== rb) return ra - rb;
      return 0;
    });
  }

  function boardItems(section, data) {
    var items = Array.isArray(data.items) ? data.items : [];
    if (!section || section.id === 'ai-news') return sortNews(items);
    return sortRepos(items);
  }

  function newsCard(item, index, preview, expanded) {
    var extra = (!expanded && (index + 1) > preview) ? ' extra' : '';
    var title = item.title || '';
    var summary = item.summary || item.intro || '';
    var when = item.timeLabel || item.time || '';
    var id = itemId(item, index);
    var href = detailHref(id);
    var bits = [title, summary, when, item.source || '', item.confidence || ''].join(' ');
    var rows = '';
    if (when) rows += '<p class="when">' + esc(when) + '</p>';
    if (item.timeNote && item.timePrecision === 'date') {
      rows += '<p class="m"><span>时间</span>原文未标钟点，只显示日期</p>';
    }
    if (item.source || item.confidence || safeUrl(item.url)) {
      var sourceHtml = safeUrl(item.url) ? extLink(item.url, item.source || '原文') : esc(item.source || '');
      rows += '<p class="m"><span>来源</span>' + sourceHtml + (item.confidence ? (' · 置信度 ' + esc(item.confidence)) : '') + '</p>';
    }
    return '<article class="card teaser' + extra + '" data-sec="ai-news" data-id="' + esc(id) + '" data-title="' + esc(bits) + '">'
      + '<div class="chead"><span class="badge">' + esc(item.badge || '讯') + '</span>'
      + '<h3><a class="detail-link" href="' + href + '">' + esc(title) + '</a></h3></div>'
      + '<p class="c">' + esc(summary) + '</p>' + rows
      + '<a class="detail-cta detail-link" href="' + href + '">查看介绍</a></article>';
  }

  function repoCard(item, index, sec, preview, expanded) {
    var rank = item.rank || (index + 1);
    var extra = (!expanded && rank > preview) ? ' extra' : '';
    var repo = item.repo || '';
    var owner = repo.split('/')[0] || '';
    var summary = item.summary || item.intro || '';
    var id = itemId(item, index);
    var win = item.windowLabel || item.week || '';
    var href = detailHref(id);
    var titleBits = [repo, summary, win, item.agents || '', item.language || ''].join(' ');
    var badgeStyle = String(rank).length > 1 ? ' style="font-size:12px"' : '';
    var rows = '';
    if (win) rows += '<p class="when">' + esc(win) + '</p>';
    rows += '<p class="m"><span>本周新增星</span>' + fmt(item.weeklyStars) + '</p>'
      + '<p class="m"><span>总星</span>' + fmt(item.totalStars) + '</p>';
    if (item.language) rows += '<p class="m"><span>语言</span>' + esc(item.language) + '</p>';
    if (item.agents) rows += '<p class="m agents"><span>适用</span>' + esc(item.agents) + '</p>';
    var repoUrl = safeUrl(item.url) || safeUrl('https://github.com/' + repo);
    if (repoUrl) rows += '<p class="m"><span>原文</span>' + extLink(repoUrl, 'GitHub') + '</p>';
    var avatar = owner
      ? '<img class="vlogo" alt="" src="https://github.com/' + encodeURIComponent(owner) + '.png" onerror="this.remove()">'
      : '';
    return '<article class="card teaser' + extra + '" data-sec="' + esc(sec) + '" data-id="' + esc(id) + '" data-title="' + esc(titleBits) + '">'
      + '<div class="chead"><span class="badge"' + badgeStyle + '>' + esc(rank) + '</span>'
      + avatar
      + '<h3><a class="detail-link" href="' + href + '">' + esc(repo) + '</a></h3></div>'
      + '<p class="c">' + esc(summary) + '</p>' + rows
      + '<a class="detail-cta detail-link" href="' + href + '">查看介绍</a></article>';
  }

  function renderMd(md) {
    var lines = String(md || '').replace(/\r\n/g, '\n').split('\n');
    var html = '';
    var list = false;
    function closeList() {
      if (list) { html += '</ul>'; list = false; }
    }
    function inline(s) {
      s = esc(s);
      s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
      s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
      s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, function (_, label, href) {
        return '<a href="' + href + '" target="_blank" rel="noopener">' + label + '</a>';
      });
      return s;
    }
    lines.forEach(function (raw) {
      var line = raw.trim();
      if (!line) { closeList(); return; }
      if (line.indexOf('### ') === 0) { closeList(); html += '<h3>' + inline(line.slice(4)) + '</h3>'; return; }
      if (line.indexOf('## ') === 0) { closeList(); html += '<h2>' + inline(line.slice(3)) + '</h2>'; return; }
      if (line.indexOf('# ') === 0) { closeList(); html += '<h2>' + inline(line.slice(2)) + '</h2>'; return; }
      if (line.indexOf('- ') === 0 || line.indexOf('* ') === 0) {
        if (!list) { html += '<ul>'; list = true; }
        html += '<li>' + inline(line.slice(2)) + '</li>';
        return;
      }
      closeList();
      html += '<p>' + inline(line) + '</p>';
    });
    closeList();
    return html;
  }

  function linkList(item, kind) {
    var links = [];
    var seen = {};
    function add(label, url) {
      var href = safeUrl(url);
      if (!href || seen[href]) return;
      seen[href] = true;
      links.push({ label: label || href, url: href });
    }
    if (item && Array.isArray(item.links)) {
      item.links.forEach(function (link) {
        if (!link) return;
        add(link.label || link.url, link.url);
      });
    }
    if (item && item.url) add(kind === 'news' ? (item.source || '原文') : 'GitHub', item.url);
    return links;
  }

  function currentBoardId() {
    var section = document.querySelector('section.board');
    return section ? section.id : '';
  }

  function boardFilter() {
    var q = document.getElementById('q');
    return {
      top: currentBoardId(),
      sub: '',
      q: (q && q.value ? q.value : '').trim()
    };
  }

  function filterCards(q, top, sub) {
    var query = (q || '').trim();
    var ql = query.toLowerCase();
    var allowed = sub ? [sub] : (top === 'deals' ? DEALS_SECS : (top ? [top] : null));
    document.querySelectorAll('.card').forEach(function (c) {
      var okSec = !allowed || allowed.indexOf(c.dataset.sec) !== -1;
      var okQ = !query || (c.dataset.title || '').toLowerCase().indexOf(ql) !== -1 || c.textContent.toLowerCase().indexOf(ql) !== -1;
      var board = c.closest('section.board');
      var collapsed = !query && c.classList.contains('extra') && board && board.dataset.expanded !== '1';
      c.style.display = (okSec && okQ && !collapsed) ? 'block' : 'none';
    });
    document.querySelectorAll('section').forEach(function (s) {
      var cards = s.querySelectorAll('.card');
      var anyVisible = false;
      for (var i = 0; i < cards.length; i++) if (cards[i].style.display !== 'none') anyVisible = true;
      var noCards = cards.length === 0;
      s.style.display = (anyVisible || (noCards && (top === '' || top === 'deals'))) ? 'block' : 'none';
    });
    document.querySelectorAll('section.board .more').forEach(function (btn) {
      var s = btn.closest('section');
      btn.style.display = (s.dataset.expanded !== '1' && s.style.display !== 'none' && !query) ? '' : 'none';
    });
  }

  function renderBoard(section, data) {
    var kind = section.id === 'ai-news' ? 'news' : (section.id === 'github-skills' ? 'skills' : 'stars');
    var items = boardItems(section, data);
    var empty = !!data.empty || (kind === 'news' && items.length === 0);
    var n = empty ? 0 : items.length;
    var preview = typeof data.preview === 'number' ? data.preview : 10;
    var expanded = section.dataset.expanded === '1';
    var em = section.querySelector('h2 em');
    if (em) em.textContent = empty ? '暂无' : (data.week ? (data.week + ' · ' + n + ' 条') : (n + ' 条'));
    var nav = document.querySelector('.nav a[href="' + section.id + '.html"] em, .nav a[href="#' + section.id + '"] em');
    if (nav) nav.textContent = empty ? '0' : String(n);
    var note = section.querySelector('.board-note');
    if (note && data.note) note.textContent = data.note;
    var box = section.querySelector('.board-cards');
    if (!box) {
      box = document.createElement('div');
      box.className = 'board-cards';
      section.appendChild(box);
    }
    if (empty) {
      var msg = data.emptyMessage || '今日暂无重要资讯，晚间 19:30 起每日更新';
      box.innerHTML = '<article class="card" data-sec="ai-news" data-title="' + esc(msg) + '"><p class="m">' + esc(msg) + '</p></article>';
    } else if (kind === 'news') {
      box.innerHTML = items.map(function (item, i) { return newsCard(item, i, preview, expanded); }).join('');
    } else {
      box.innerHTML = items.map(function (item, i) { return repoCard(item, i, section.id, preview, expanded); }).join('');
    }
    var hidden = (empty || expanded) ? 0 : Math.max(0, items.length - preview);
    var more = section.querySelector('.more');
    if (hidden > 0) {
      if (!more) {
        more = document.createElement('button');
        more.type = 'button';
        more.className = 'more';
        section.appendChild(more);
      }
      more.textContent = '查看其余 ' + hidden + ' 条';
      more.style.display = '';
    } else if (more) more.remove();
  }

  function decodeHash() {
    var h = location.hash || '';
    try { h = decodeURIComponent(h); } catch (err) { /* keep raw */ }
    return h;
  }

  function parseDetail() {
    var board = currentBoardId();
    if (!board) return null;
    var h = decodeHash();
    var one = /^#\/([a-z0-9-]+)$/.exec(h);
    if (one && one[1] !== 'ai-news' && one[1] !== 'github-weekly' && one[1] !== 'github-skills') {
      return { board: board, id: one[1] };
    }
    var two = /^#\/(ai-news|github-weekly|github-skills)\/([a-z0-9-]+)$/.exec(h);
    if (two && two[1] === board) return { board: board, id: two[2] };
    return null;
  }

  function findItem(board, id) {
    var data = BOARDS[board];
    if (!data) return null;
    var section = document.getElementById(board);
    var items = section ? boardItems(section, data) : (Array.isArray(data.items) ? data.items : []);
    for (var i = 0; i < items.length; i++) {
      if (String(items[i].id) === String(id)) return items[i];
    }
    return null;
  }

  function openDetail(board, id) {
    var el = document.getElementById('detail-root');
    if (!el) return;
    var item = findItem(board, id);
    var already = document.body.classList.contains('detail-open') && document.body.dataset.detailId === String(id);
    document.body.classList.add('detail-open');
    document.body.dataset.detailBoard = board;
    document.body.dataset.detailId = id;
    if (!titleBackup) titleBackup = document.title;
    el.hidden = false;
    var backHref = PAGE[board] || (board + '.html');
    var back = '<a class="back" href="' + esc(backHref) + '" data-back="' + esc(board) + '">返回列表</a>';
    if (!item) {
      document.title = '未找到这条介绍 · AI 厂商活动日报';
      el.innerHTML = '<article class="detail">' + back + '<h1>没有找到这条介绍</h1><p class="timenote">链接里的条目不在当前榜单数据中。可以返回列表，或打开仓库里的 JSON 核对 id。</p></article>';
      if (!already) window.scrollTo(0, 0);
      return;
    }
    var kind = board === 'ai-news' ? 'news' : 'repo';
    var heading = kind === 'news' ? (item.title || '') : (item.repo || '');
    document.title = heading + ' · ' + (BOARD_NAME[board] || '') + ' · AI 厂商活动日报';
    var when = kind === 'news'
      ? (item.timeLabel || item.time || '')
      : (item.windowLabel || (BOARDS[board].window && (BOARDS[board].window.display || BOARDS[board].window.label)) || item.week || '');
    var meta = '';
    if (kind === 'repo') {
      meta = '<div class="meta-row"><span>名次 <b>#' + esc(item.rank || '') + '</b></span>'
        + '<span>本周新增星 <b>' + fmt(item.weeklyStars) + '</b></span>'
        + '<span>总星 <b>' + fmt(item.totalStars) + '</b></span>'
        + (item.language ? '<span>语言 <b>' + esc(item.language) + '</b></span>' : '')
        + '</div>';
    }
    var links = linkList(item, kind);
    var linkHtml = links.map(function (l) {
      return '<a class="go ext" href="' + esc(l.url) + '" target="_blank" rel="noopener">' + esc(l.label || l.url) + ' ↗</a>';
    }).join('');
    var note = item.timeNote ? '<p class="timenote">' + esc(item.timeNote) + '</p>' : '';
    el.innerHTML = '<article class="detail">'
      + back
      + '<p class="kicker">' + esc(BOARD_NAME[board] || '') + (when ? ' · ' + esc(when) : '') + '</p>'
      + '<h1>' + esc(heading) + '</h1>'
      + note + meta
      + '<div class="detail-body">' + renderMd(item.detail || item.summary || item.intro || '') + '</div>'
      + (linkHtml ? '<div class="detail-links"><h2>原文与官方链接</h2>' + linkHtml + '</div>' : '')
      + '</article>';
    if (!already) window.scrollTo(0, 0);
    var canonical = '#/' + id;
    if (decodeHash() !== canonical) {
      history.replaceState(null, '', location.pathname + location.search + canonical);
    }
  }

  function closeDetail() {
    document.body.classList.remove('detail-open');
    document.body.removeAttribute('data-detail-board');
    document.body.removeAttribute('data-detail-id');
    var el = document.getElementById('detail-root');
    if (el) { el.hidden = true; el.innerHTML = ''; }
    if (titleBackup) document.title = titleBackup;
    detailFromClick = false;
    var f = boardFilter();
    filterCards(f.q, f.top, f.sub);
  }

  function backToList() {
    if (detailFromClick) {
      detailFromClick = false;
      history.back();
      return;
    }
    if ((location.hash || '').indexOf('#/') === 0) location.hash = '';
    else closeDetail();
  }

  function onRoute() {
    var route = parseDetail();
    if (route) {
      openDetail(route.board, route.id);
      return;
    }
    if (document.body.classList.contains('detail-open')) closeDetail();
  }

  function onClick(e) {
    var more = e.target.closest && e.target.closest('section.board .more');
    if (more) {
      var section = more.closest('section');
      section.dataset.expanded = '1';
      section.querySelectorAll('.card.extra').forEach(function (c) {
        c.classList.remove('extra');
        if (c.style.display === 'none') c.style.display = '';
      });
      more.remove();
      var f = boardFilter();
      if (f.top || f.sub || f.q) filterCards(f.q, f.top, f.sub);
      return;
    }
    var back = e.target.closest && e.target.closest('[data-back]');
    if (back) {
      e.preventDefault();
      backToList();
      return;
    }
    var a = e.target.closest && e.target.closest('a');
    if (a) {
      if (a.classList.contains('detail-link')) detailFromClick = true;
      return;
    }
    var card = e.target.closest && e.target.closest('section.board article.card[data-id]');
    if (!card) return;
    var sel = window.getSelection && String(window.getSelection());
    if (sel && sel.trim()) return;
    detailFromClick = true;
    location.hash = '#/' + card.dataset.id;
  }

  function readFallback(id) {
    var el = document.getElementById('board-fallback');
    if (!el) return null;
    var data;
    try { data = JSON.parse(el.textContent); } catch (err) { return null; }
    if (!data || typeof data !== 'object') return null;
    if (Array.isArray(data.items)) return data;
    var key = FEED_KEY[id];
    if (key && data[key] && Array.isArray(data[key].items)) return data[key];
    return null;
  }

  function ensureCss() {
    if (document.getElementById('board-detail-css')) return;
    var style = document.createElement('style');
    style.id = 'board-detail-css';
    style.textContent = DETAIL_CSS;
    document.head.appendChild(style);
  }

  function ensureDetailRoot() {
    if (document.getElementById('detail-root')) return;
    var wrap = document.querySelector('.wrap');
    var section = document.querySelector('section.board');
    if (!wrap || !section) return;
    var el = document.createElement('div');
    el.id = 'detail-root';
    el.hidden = true;
    section.parentNode.insertBefore(el, section);
  }

  function loadBoards() {
    ensureCss();
    ensureDetailRoot();
    Object.keys(FEEDS).forEach(function (id) {
      var section = document.getElementById(id);
      if (!section) return;
      var seeded = readFallback(id);
      if (seeded) {
        BOARDS[id] = seeded;
        renderBoard(section, seeded);
        section.dataset.source = 'fallback';
      }
    });
    onRoute();
    Object.keys(FEEDS).forEach(function (id) {
      var section = document.getElementById(id);
      if (!section) return;
      var url = section.getAttribute('data-feed') || FEEDS[id];
      fetch(url, { cache: 'no-cache' }).then(function (r) {
        if (!r.ok) throw new Error(String(r.status));
        return r.json();
      }).then(function (data) {
        BOARDS[id] = data;
        renderBoard(section, data);
        section.dataset.source = 'json';
        var route = parseDetail();
        if (route && route.board === id) openDetail(route.board, route.id);
        else if (!document.body.classList.contains('detail-open')) {
          var f = boardFilter();
          if (f.top || f.sub || f.q) filterCards(f.q, f.top, f.sub);
        }
      }).catch(function () {
        section.dataset.source = section.dataset.source || 'fallback';
      });
    });
  }

  function bindUi() {
    var q = document.getElementById('q');
    if (q && !q.dataset.boardBound) {
      q.dataset.boardBound = '1';
      q.addEventListener('input', function () {
        if (document.body.classList.contains('detail-open') || parseDetail()) {
          detailFromClick = false;
          if ((location.hash || '').indexOf('#/') === 0) {
            history.pushState(null, '', location.pathname + location.search);
          }
          closeDetail();
        }
        var f = boardFilter();
        filterCards(f.q, f.top, f.sub);
      });
    }
    if (!document.documentElement.dataset.boardClicks) {
      document.documentElement.dataset.boardClicks = '1';
      document.addEventListener('click', onClick);
      window.addEventListener('hashchange', onRoute);
      window.addEventListener('popstate', onRoute);
    }
  }

  function boot() {
    if (boot.started) return;
    if (!document.querySelector('section.board')) return;
    boot.started = true;
    bindUi();
    loadBoards();
  }

  root.esc = esc;
  root.newsCard = newsCard;
  root.repoCard = repoCard;
  root.renderMd = renderMd;
  root.linkList = linkList;
  root.sortNews = sortNews;
  root.sortRepos = sortRepos;
  root.loadBoards = loadBoards;
  root.BOARD_DETAIL_CSS = DETAIL_CSS;

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
