/*
 * ecem.world — renders the portfolio from three files:
 *
 *   content/site.json      name, bio, Substack settings      (edited in /studio/)
 *   content/posts.json     every project, image and writing  (edited in /studio/)
 *   content/substack.json  the Substack feed                 (written hourly by
 *                                                             .github/workflows/substack.yml)
 *
 * The order of posts.json IS the order of the site. Only posts whose status
 * is "published" are shown; "draft" and "archived" stay in the file but never
 * reach the page — except in the studio's preview, which shows them badged.
 *
 * Plain script, no build step, no framework — same as the rest of the site.
 */
(function () {
  'use strict';

  const $ = (sel, root = document) => root.querySelector(sel);
  const slot = (name) => $(`[data-slot="${name}"]`);

  const PREVIEW = new URLSearchParams(location.search).has('preview');

  let site = {};
  let posts = [];        // published (or all, in preview), in order, resolved
  let writingIndex = []; // every visible Substack post, newest first
  let mediaBase = '';    // preview only: where not-yet-deployed media lives
  let filter = 'all';

  /* ── Helpers ──────────────────────────────────────────────────────── */

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const src = (path) => (/^(https?:|blob:|data:)/.test(path) ? path : mediaBase + path);

  // 18.09.26 — short enough to sit in the index column without truncating.
  const fmtDate = (iso) => {
    const d = new Date(iso);
    const two = (n) => String(n).padStart(2, '0');
    return `${two(d.getDate())}.${two(d.getMonth() + 1)}.${two(d.getFullYear() % 100)}`;
  };

  const slugFromUrl = (url) => (url.match(/\/p\/([^/?#]+)/) || [, url])[1];

  // Plain text with blank lines between paragraphs; bare links become links.
  const prose = (text) => String(text || '').trim().split(/\n\s*\n/).filter(Boolean)
    .map((p) => `<p>${esc(p).replace(/\n/g, '<br>')
      .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>')}</p>`).join('');

  // "Label: Name" per line → a definition list.
  const credits = (text) => {
    const rows = String(text || '').split('\n').map((l) => l.trim()).filter(Boolean);
    if (!rows.length) return '';
    return `<dl>${rows.map((r) => {
      const i = r.indexOf(':');
      return i > 0 ? `<dt>${esc(r.slice(0, i))}</dt><dd>${esc(r.slice(i + 1).trim())}</dd>` : `<dd>${esc(r)}</dd>`;
    }).join('')}</dl>`;
  };

  function embedUrl(url) {
    let m = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
    if (m) return `https://player.vimeo.com/video/${m[1]}?background=1&autoplay=1&loop=1&muted=1`;
    m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([\w-]{11})/);
    if (m) return `https://www.youtube-nocookie.com/embed/${m[1]}?autoplay=1&mute=1&loop=1&playlist=${m[1]}&controls=0&playsinline=1`;
    return url;
  }

  // One piece of media, sized by its own ratio. Video is muted, looping,
  // autoplaying and control-free, as on every reference site.
  function frame(m, eager) {
    const r = (m.w && m.h) ? m.w / m.h : (m.type === 'embed' ? 16 / 9 : 1);
    let inner;
    if (m.type === 'video') {
      inner = `<video src="${esc(src(m.src))}" ${m.poster ? `poster="${esc(src(m.poster))}"` : ''}
        autoplay muted loop playsinline preload="metadata" aria-label="${esc(m.alt)}"></video>`;
    } else if (m.type === 'embed') {
      inner = `<iframe src="${esc(embedUrl(m.src))}" loading="lazy" allow="autoplay; fullscreen; picture-in-picture"
        title="${esc(m.alt || 'Video')}"></iframe>`;
    } else {
      inner = `<img src="${esc(src(m.src))}" alt="${esc(m.alt)}" ${eager ? '' : 'loading="lazy"'} decoding="async"
        width="${m.w || ''}" height="${m.h || ''}" onload="this.classList.add('loaded')">`;
    }
    return `<div class="frame" style="--r:${r.toFixed(4)}">${inner}</div>`;
  }

  const badge = (p) => (PREVIEW && p.status !== 'published' ? `<span class="badge">${esc(p.status)}</span>` : '');

  /* ── Resolving content ────────────────────────────────────────────── */

  function resolve(data) {
    site = data.site || {};
    const feed = (data.substack && data.substack.items) || [];
    const sub = site.substack || {};
    const hidden = new Set(sub.hidden || []);
    const reposted = new Set(sub.reposted || []);
    const visible = (s) => !hidden.has(s.id);

    const asWriting = (s, extra) => ({
      type: 'writing', status: 'published', ...extra,
      title: s.title, summary: s.subtitle, date: s.date, url: s.url, image: s.image, html: s.html,
      slug: slugFromUrl(s.url), repost: sub.mode === 'repost' || reposted.has(s.id), fromSubstack: true,
    });

    const byUrl = new Map(feed.map((s) => [s.url, s]));
    posts = (data.posts || [])
      .filter((p) => PREVIEW || p.status === 'published')
      .map((p) => {
        if (p.type === 'writing' && p.substack) {
          const s = byUrl.get(p.substack);
          return s ? asWriting(s, { id: p.id, status: p.status }) : null;  // not synced yet
        }
        return { ...p, media: p.media || [], tags: p.tags || [] };
      })
      .filter(Boolean);

    writingIndex = sub.show === false ? [] : feed.filter(visible).map((s) => asWriting(s, {}));
    // Writing written here rather than on Substack joins the index too.
    posts.filter((p) => p.type === 'writing' && !p.fromSubstack).forEach((p) => writingIndex.push(p));
    writingIndex.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
  }

  /* ── The panel ────────────────────────────────────────────────────── */

  function renderPanel() {
    if (site.name) slot('name').textContent = site.name;
    slot('bio').textContent = site.bio || '';
    const cur = slot('currently');
    cur.hidden = !site.currently;
    cur.textContent = site.currently || '';
    if (site.email) { const a = slot('email'); a.textContent = site.email; a.href = `mailto:${site.email}`; }

    const count = (t) => (t === 'writing' ? writingIndex.length : posts.filter((p) => p.type === t).length);
    document.querySelectorAll('[data-filter]').forEach((b) => {
      const t = b.dataset.filter;
      b.innerHTML = `${esc(b.textContent.replace(/\d+$/, ''))}${t === 'all' ? '' : `<sup>${count(t)}</sup>`}`;
      b.hidden = t !== 'all' && count(t) === 0;
      b.setAttribute('aria-pressed', String(t === filter));
    });

    const work = posts.filter((p) => p.type !== 'writing' && p.type !== 'tool' && (filter === 'all' || filter === p.type));
    const tools = posts.filter((p) => p.type === 'tool' && (filter === 'all' || filter === 'tool'));
    const row = (p) => `
        <a href="#/${esc(p.slug)}" data-goto="${esc(p.slug)}">
          <span>${esc(p.title)}${badge(p)}</span><span>${esc((p.tags || [])[0] || '')}</span><span>${esc(p.year)}</span>
        </a>`;
    const words = filter === 'all' || filter === 'writing' ? writingIndex : [];
    slot('index').innerHTML =
      (work.length ? `<p class="group">Work</p>` + work.map(row).join('') : '') +
      (tools.length ? `<p class="group">Tools <span class="more">— built with AI</span></p>` + tools.map(row).join('') : '') +
      (words.length ? `<p class="group">Writing</p>` + words.map((p) => `
        <a class="is-writing" ${linkFor(p)}>
          <span>${esc(p.title)}</span><span>${p.date ? esc(fmtDate(p.date)) : ''}</span>
        </a>`).join('') : '');
  }

  // Projects open over the page. Writing opens here when reposted, otherwise
  // on Substack. Standalone images just scroll into view.
  function linkFor(p) {
    if (p.type === 'writing' && !p.repost && p.url) return `href="${esc(p.url)}" target="_blank" rel="noopener"`;
    if (p.type === 'writing') return `href="#/w/${esc(p.slug)}"`;
    return `href="#/${esc(p.slug)}"`;
  }

  /* ── The feed ─────────────────────────────────────────────────────── */

  function renderFeed() {
    const shown = filter === 'writing'
      ? writingIndex
      : posts.filter((p) => filter === 'all' || p.type === filter);

    if (!shown.length) {
      slot('feed').innerHTML = `<p class="empty">Nothing here yet.</p>`;
      return;
    }

    slot('feed').innerHTML = shown.map((p, i) => {
      const eager = i < 2;
      if (p.type === 'writing') {
        return `<article class="item writing" id="w-${esc(p.slug)}">
          <a class="card" ${linkFor(p)}>
            <div class="w-meta"><span>${p.fromSubstack ? 'Substack' : 'Writing'}${badge(p)}</span><span>${p.date ? esc(fmtDate(p.date)) : ''}</span></div>
            <h2>${esc(p.title)}</h2>
            ${p.summary ? `<p>${esc(p.summary)}</p>` : ''}
            ${p.image ? `<div class="w-cover"><img src="${esc(p.image)}" alt="" loading="lazy"></div>` : ''}
            <span class="go">${p.repost || !p.url ? 'Read' : 'Read on Substack ↗'}</span>
          </a></article>`;
      }

      // A tool is shown like a project, with a way to try it in its caption.
      const isProject = p.type === 'project' || p.type === 'tool';
      const media = isProject ? p.media.slice(0, 3) : p.media.slice(0, 1);
      const extra = isProject && p.media.length > 3 ? `<span class="more"> +${p.media.length - 3}</span>` : '';
      const mid = p.tags.join(', ');
      const small = p.type === 'image' && p.size !== 'large' ? ' is-small' : '';
      // The row's combined ratio caps its height at ~78% of the window, so a
      // single wide image does not fill the screen edge to edge.
      const r = media.reduce((sum, m) => sum + (m.w && m.h ? m.w / m.h : 16 / 9), 0) || 1;
      const frames = `<div class="frames" style="--r:${r.toFixed(4)}">${media.map((m) => frame(m, eager)).join('')}</div>`;

      return `<article class="item ${p.type}${small}" id="p-${esc(p.slug)}">
        ${isProject ? `<a href="#/${esc(p.slug)}" aria-label="${esc(p.title)}">${frames}</a>` : frames}
        <div class="caption">
          <span>${esc(p.title)}${extra}${badge(p)}</span>
          <span class="c-mid">${esc(isProject ? p.tags.join(', ') : '')}</span>
          <span>${esc(p.year)}${!isProject && mid ? ` <span class="more">· ${esc(mid)}</span>` : ''}</span>
        </div>
        ${p.type === 'tool' ? tryLinks(p, 'try-line') : ''}
      </article>`;
    }).join('');
  }

  // "Try it ↗" and "Source ↗" for a tool, as a caption line or as buttons.
  function tryLinks(p, cls) {
    const links = [
      p.live ? `<a href="${esc(p.live)}" target="_blank" rel="noopener">Try it ↗</a>` : '',
      p.repo ? `<a href="${esc(p.repo)}" target="_blank" rel="noopener">Source ↗</a>` : '',
    ].filter(Boolean);
    return links.length ? `<p class="${cls}">${links.join('')}</p>` : '';
  }

  /* ── A project, opened ───────────────────────────────────────────── */

  const sheet = $('#sheet');

  // Substack's HTML is her own writing, but it arrives with subscribe
  // buttons, scripts and inline styles meant for Substack's page. Keep the
  // words and pictures; drop the rest.
  function cleanSubstack(html) {
    const doc = new DOMParser().parseFromString(html || '', 'text/html');
    doc.querySelectorAll('script, style, form, button, iframe, .subscription-widget-wrap, .button-wrapper, .subscribe-widget')
      .forEach((n) => n.remove());
    doc.querySelectorAll('*').forEach((n) => {
      [...n.attributes].forEach((a) => { if (/^on|^style$|^class$/.test(a.name)) n.removeAttribute(a.name); });
    });
    doc.querySelectorAll('a').forEach((a) => { a.target = '_blank'; a.rel = 'noopener'; });
    doc.querySelectorAll('img').forEach((img) => { img.loading = 'lazy'; img.removeAttribute('width'); img.removeAttribute('height'); });
    return doc.body.innerHTML;
  }

  function openSheet(p) {
    sheet.classList.toggle('is-writing', p.type === 'writing');
    document.querySelector('.about-link').removeAttribute('aria-current');
    let title, body;

    if (p.type === 'writing') {
      title = `<b>${esc(p.title)}</b>${p.date ? ` · ${esc(fmtDate(p.date))}` : ''}`;
      body = `<div class="sheet-text"><div>
        <h2>${esc(p.title)}</h2>
        <div class="prose">${p.fromSubstack ? cleanSubstack(p.html) : prose(p.body)}</div>
        ${p.url ? `<p><a href="${esc(p.url)}" target="_blank" rel="noopener" class="more">Originally on Substack ↗</a></p>` : ''}
      </div></div>`;
    } else {
      title = [`<b>${esc(p.title)}</b>`, esc(p.year || '')].filter(Boolean).join(' · ');
      const list = posts.filter((q) => q.type === p.type);
      const isTool = p.type === 'tool';
      const i = list.indexOf(p);
      const next = list[(i + 1) % list.length];
      body = `${isTool ? `<div class="tool-head">${p.summary ? `<p class="tool-summary">${esc(p.summary)}</p>` : ''}${tryLinks(p, 'try-buttons')}</div>` : ''}
        ${isTool && p.embed ? `<div class="tool-live" data-embed="${esc(p.embed)}">
          <button type="button" class="tool-open">Try it here <span class="more">— opens the tool on this page</span></button></div>` : ''}
        <div class="sheet-media">${p.media.map((m, k) => frame(m, k < 2)).join('')}</div>
        <div class="sheet-text">
          <div>
            <h2>${esc(p.title)}</h2>
            ${p.summary && !isTool ? `<div class="prose"><p>${esc(p.summary)}</p></div>` : ''}
            <div class="prose">${prose(p.body)}</div>
            ${isTool && p.process ? `<h2 class="sub">How it was made</h2><div class="prose">${prose(p.process)}</div>` : ''}
          </div>
          <div>
            ${p.role ? `<dl><dt>Role</dt><dd>${esc(p.role)}</dd></dl>` : ''}
            ${p.tags.length ? `<dl><dt>${isTool ? 'What it does' : 'Disciplines'}</dt><dd>${esc(p.tags.join(', '))}</dd></dl>` : ''}
            ${credits(p.credits)}
          </div>
        </div>
        ${i > -1 && list.length > 1 ? `<nav class="sheet-next"><a href="#/">Index</a><a href="#/${esc(next.slug)}">Next: ${esc(next.title)} →</a></nav>` : ''}`;
    }

    slot('sheet-title').innerHTML = title;
    slot('sheet-body').innerHTML = body;

    // The tool itself is only loaded when asked for, so opening the page
    // costs nothing until someone wants to play.
    const live = slot('sheet-body').querySelector('.tool-live');
    if (live) {
      live.querySelector('.tool-open').addEventListener('click', () => {
        live.innerHTML = `<iframe src="${esc(live.dataset.embed)}" title="${esc(p.title)}" loading="lazy"
          allow="fullscreen; clipboard-write; web-share" allowfullscreen></iframe>`;
        live.classList.add('is-open');
      });
    }
    document.title = `${p.title} — Ecem Öztürk`;
    if (!sheet.open) sheet.showModal();
    sheet.scrollTop = 0;
  }

  function openAbout() {
    const pic = site.portrait;
    sheet.classList.remove('is-writing');
    slot('sheet-title').innerHTML = `<b>About</b>`;
    slot('sheet-body').innerHTML = `<div class="about">
      ${pic ? `<figure class="portrait" style="aspect-ratio:${pic.w}/${pic.h}" title="">
        <img class="bw" src="${esc(src(pic.bw))}" alt="${esc(pic.alt || site.name || '')}" width="${pic.w}" height="${pic.h}">
        <img class="color" src="${esc(src(pic.color))}" alt="" aria-hidden="true" loading="lazy">
      </figure>` : ''}
      <div class="about-text">
        <p class="lead">${esc(site.bio || '')}</p>
        <div class="prose">${prose(site.about)}</div>
        <dl>
          ${site.email ? `<dt>Contact</dt><dd><a href="mailto:${esc(site.email)}">${esc(site.email)}</a></dd>` : ''}
          <dt>Newsletter</dt><dd><a href="${esc((site.substack && site.substack.url) || 'https://luckbug.substack.com')}" target="_blank" rel="noopener">luck bug, on Substack ↗</a></dd>
          <dt>CV</dt><dd><a href="cv/">View or download</a></dd>
        </dl>
      </div>
    </div>`;
    const fig = slot('sheet-body').querySelector('.portrait');
    if (fig) fig.addEventListener('click', () => fig.classList.toggle('is-color'));
    document.title = `About — ${site.name || 'Ecem Öztürk'}`;
    document.querySelector('.about-link').setAttribute('aria-current', 'page');
    if (!sheet.open) sheet.showModal();
    sheet.scrollTop = 0;
  }

  function closeSheet() {
    const about = document.querySelector('.about-link');
    if (about) about.removeAttribute('aria-current');
    if (sheet.open) sheet.close();
    document.title = 'Ecem Öztürk — ecem.world';
  }

  sheet.addEventListener('close', () => {
    if (location.hash.length > 2) history.pushState(null, '', location.pathname + location.search);
  });
  $('[data-close]', sheet).addEventListener('click', closeSheet);

  /* ── Routing: #/slug and #/w/slug ─────────────────────────────────── */

  function route() {
    const h = decodeURIComponent(location.hash.replace(/^#\/?/, ''));
    if (!h) return closeSheet();
    if (h === 'about') return openAbout();
    if (h.startsWith('w/')) {
      const p = writingIndex.find((q) => q.slug === h.slice(2)) || posts.find((q) => q.type === 'writing' && q.slug === h.slice(2));
      return p ? openSheet(p) : closeSheet();
    }
    const p = posts.find((q) => q.slug === h);
    if (!p) return closeSheet();
    if (p.type === 'project' || p.type === 'tool') return openSheet(p);
    // A standalone image has nothing more to open: bring it into view.
    closeSheet();
    const el = document.getElementById(`p-${p.slug}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash');
    }
  }

  window.addEventListener('hashchange', route);

  document.querySelectorAll('[data-filter]').forEach((b) => b.addEventListener('click', () => {
    filter = b.dataset.filter;
    render();
    window.scrollTo({ top: 0 });
  }));

  function render() {
    renderPanel();
    renderFeed();
  }

  /* ── Loading ──────────────────────────────────────────────────────── */

  const load = (name) => fetch(`content/${name}.json`, { cache: 'no-cache' })
    .then((r) => (r.ok ? r.json() : {}))
    .catch(() => ({}));

  function start(data) {
    resolve(data);
    render();
    route();
  }

  if (PREVIEW) {
    // The studio sends its unsaved copy in. Nothing is fetched until it
    // does, so a stale published version never flashes up first.
    window.addEventListener('message', (e) => {
      if (e.origin !== location.origin || !e.data || e.data.type !== 'ecem:preview') return;
      mediaBase = e.data.mediaBase || '';
      start(e.data);
    });
    (window.opener || window.parent).postMessage({ type: 'ecem:preview-ready' }, location.origin);
  } else {
    Promise.all([load('site'), load('posts'), load('substack')]).then(([s, p, sub]) => {
      start({ site: s, posts: p.posts || [], substack: sub });
    });
  }

  /* ── The newsletter popup, as on the coming-soon page ─────────────── */

  (function () {
    const OPENS_AFTER = 6000;
    const KEY = 'ecem.world:newsletter-dismissed';
    const dialog = $('#newsletter');
    const link = $('#newsletter-link');
    if (!dialog || typeof dialog.showModal !== 'function') return;

    const dismissed = () => { try { return localStorage.getItem(KEY) === '1'; } catch (err) { return false; } };
    const remember = () => { try { localStorage.setItem(KEY, '1'); } catch (err) { /* nothing to do */ } };
    const open = () => { if (!dialog.open && !sheet.open) dialog.showModal(); };

    dialog.addEventListener('close', remember);
    $('[data-close]', dialog).addEventListener('click', () => dialog.close());
    dialog.addEventListener('click', (event) => {
      const box = $('.panel-pop', dialog).getBoundingClientRect();
      if (event.clientX < box.left || event.clientX > box.right ||
          event.clientY < box.top || event.clientY > box.bottom) dialog.close();
    });
    if (link) link.addEventListener('click', (event) => { event.preventDefault(); open(); });
    if (!dismissed() && !PREVIEW) window.setTimeout(open, OPENS_AFTER);
  })();
})();
