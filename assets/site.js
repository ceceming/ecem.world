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

  // 18.09.26 — short and even.
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

  // Short texts set in the studio (the bio, the About page): every Enter
  // starts a new paragraph.
  const paras = (text) => String(text || '').split(/\n+/).map((l) => l.trim()).filter(Boolean)
    .map((l) => `<p>${esc(l)}</p>`).join('');
  // A size typed in the studio, in px, kept within reason.
  const px = (n, lo, hi) => (Number(n) >= lo && Number(n) <= hi ? `${Number(n)}px` : '');

  // "Label: Name" per line → a definition list.
  const credits = (text) => {
    const rows = String(text || '').split('\n').map((l) => l.trim()).filter(Boolean);
    if (!rows.length) return '';
    return `<dl>${rows.map((r) => {
      const i = r.indexOf(':');
      // "Label: Name" only when the label is short; a sentence that happens
      // to contain a colon stays one line.
      return i > 0 && i <= 32 && !/·/.test(r.slice(0, i)) ? `<dt>${esc(r.slice(0, i))}</dt><dd>${esc(r.slice(i + 1).trim())}</dd>` : `<dd>${esc(r)}</dd>`;
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
  // Each image's size, chosen in the studio: a share of the largest an
  // image may show (--max-w × --max-h in site.css). Unset = large.
  const SIZE = { s: 0.5, m: 0.75, l: 1 };

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
    return `<div class="frame" style="--r:${r.toFixed(4)};--sz:${SIZE[m.size] || 1}">${inner}</div>`;
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
    // Writing written here rather than on Substack counts too.
    posts.filter((p) => p.type === 'writing' && !p.fromSubstack).forEach((p) => writingIndex.push(p));
    writingIndex.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
  }

  /* ── The panel ────────────────────────────────────────────────────── */

  function renderPanel() {
    if (site.name) slot('name').textContent = site.name;
    slot('bio').innerHTML = paras(site.bio);
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
    let shown = filter === 'writing'
      ? writingIndex
      // Tools are left out of "All": they show only under Tools.
      : posts.filter((p) => (filter === 'all' && p.type !== 'tool') || p.type === filter);

    // Substack posts join "All" after the ordered work, newest first — new
    // ones included as they sync — unless turned off in the studio. A post
    // already placed in the feed by hand keeps its place and is not repeated.
    if (filter === 'all' && (site.substack || {}).feed !== false) {
      const placed = new Set(posts.filter((p) => p.fromSubstack).map((p) => p.url));
      shown = shown.concat(writingIndex.filter((w) => w.fromSubstack && !placed.has(w.url)));
    }

    if (!shown.length) {
      slot('feed').innerHTML = `<p class="empty">Nothing here yet.</p>`;
      return;
    }

    slot('feed').innerHTML = shown.map((p, i) => {
      const eager = i < 2;
      if (p.type === 'writing') {
        return `<article class="item writing" id="w-${esc(p.slug)}">
          <a class="card${p.image ? '' : ' no-cover'}" ${linkFor(p)}>
            <div class="w-meta"><span>${p.fromSubstack ? 'Substack' : 'Writing'}${badge(p)}</span><span>${p.date ? esc(fmtDate(p.date)) : ''}</span></div>
            <h2>${esc(p.title)}</h2>
            ${p.summary ? `<p>${esc(p.summary)}</p>` : ''}
            ${p.image ? `<div class="w-cover"><img src="${esc(p.image)}" alt="" loading="lazy"></div>` : ''}
            <span class="go">${p.repost || !p.url ? 'Read' : 'Read on Substack ↗'}</span>
          </a></article>`;
      }

      // Projects and tools open in place: a click unfolds the rest of the
      // project below its caption, another click folds it away again.
      const isProject = p.type === 'project' || p.type === 'tool';
      const media = isProject ? feedMedia(p) : p.media.slice(0, 1);
      const mid = p.tags.join(', ');
      const small = p.type === 'image' && p.size !== 'large' ? ' is-small' : '';
      // The pieces not chosen for the feed wait inside the project and only
      // load once it is opened (see detailsHtml).
      const frames = `<div class="frames">${media.map((m) => frame(m, eager)).join('')}</div>`;

      if (!isProject) {
        // A single image's note: beside the image when "noteBeside" is ticked
        // in the studio; otherwise laid over the image itself, behind a small
        // + in its corner (− folds it again), like a note on a moodboard.
        const note = (p.body || '').trim();
        const beside = note && p.noteBeside;
        return `<article class="item ${p.type}${beside ? ' has-note' : small}" id="p-${esc(p.slug)}">
          ${beside ? `<div class="with-note">${frames}<div class="note prose">${prose(note)}</div></div>`
            : note ? frames.replace(/<\/div><\/div>$/, `<div class="note-over" id="n-${esc(p.slug)}"><div class="prose">${prose(note)}</div></div>
                <button type="button" class="note-pm" aria-expanded="false" aria-controls="n-${esc(p.slug)}" aria-label="Show the note"></button></div></div>`)
            : frames}
          <div class="caption">
            <span>${esc(p.title)}${badge(p)}</span>
            <span class="c-mid"></span>
            <span>${esc(p.year)}${mid ? ` <span class="more">· ${esc(mid)}</span>` : ''}</span>
          </div>

        </article>`;
      }

      // Images are for looking at (a tap shows one full size); the project
      // opens only from its "Read more" bar, so the two can't be confused.
      return `<article class="item ${p.type}" id="p-${esc(p.slug)}">
        ${frames}
        <div class="caption">
          <span>${esc(p.title)}${badge(p)}${p.live || p.repo ? tryLinks(p, 'try-line', 'span') : ''}</span>
          <span class="c-mid">${esc(p.tags.join(', '))}</span>
          <span>${esc(p.year)}</span>
        </div>
        ${moreBar('', `d-${esc(p.slug)}`, esc(p.slug))}
        <div class="details" id="d-${esc(p.slug)}"><div class="details-inner"></div></div>
      </article>`;
    }).join('');
  }

  // The pieces shown before a project is opened. Chosen per image in the
  // studio ("In feed"); until any is chosen, the first three.
  function feedMedia(p) {
    if (!p.media.some((m) => typeof m.feed === 'boolean')) return p.media.slice(0, 3);
    const chosen = p.media.filter((m) => m.feed);
    return chosen.length ? chosen : p.media.slice(0, 1);
  }

  // Everything a project shows once opened: the pieces not already in the
  // feed, its text and credits, and for a tool a way to try it.
  function detailsHtml(p) {
    const isTool = p.type === 'tool';
    const shown = new Set(feedMedia(p));
    const extra = p.media.filter((m) => !shown.has(m));
    return `
      ${extra.length ? `<div class="carousel">
        <div class="frames more-frames">${extra.map((m, i) => frame(m, false).replace('style="', `style="--i:${i};`)).join('')}</div>
        <button type="button" class="car-prev" aria-label="Previous images">←</button>
        <button type="button" class="car-next" aria-label="More images">→</button>
      </div>` : ''}
      <div class="sheet-text">
        <div>
          ${p.summary ? `<p class="lead">${esc(p.summary)}</p>` : ''}
          <div class="prose">${prose(p.body)}</div>
          ${isTool && p.process ? `<h2 class="sub">How it was made</h2><div class="prose">${prose(p.process)}</div>` : ''}
        </div>
        <div>
          ${p.role ? `<dl><dt>Role</dt><dd>${esc(p.role)}</dd></dl>` : ''}
          ${p.tags.length ? `<dl><dt>${isTool ? 'What it does' : 'Disciplines'}</dt><dd>${esc(p.tags.join(', '))}</dd></dl>` : ''}
          ${credits(p.credits)}
        </div>
      </div>
      <button type="button" class="fold" data-toggle="${esc(p.slug)}">Close <span aria-hidden="true">↑</span></button>`;
  }

  // The opened project's extra images: one row that slides, image by image.
  function slide(car, dir) {
    const strip = car.querySelector('.more-frames');
    const x = strip.scrollLeft;
    const lefts = [...strip.children].map((f) => f.offsetLeft - strip.firstElementChild.offsetLeft);
    const to = dir > 0 ? lefts.find((l) => l > x + 4) : [...lefts].reverse().find((l) => l < x - 4);
    strip.scrollTo({ left: to === undefined ? (dir > 0 ? strip.scrollWidth : 0) : to, behavior: 'smooth' });
  }

  function setOpen(slug, open, { scroll = false } = {}) {
    const p = posts.find((q) => q.slug === slug);
    if (!p) return;
    // A tool is not in the "All" feed; opening one (from a
    // link) switches to Tools first so there is something to unfold.
    if (!document.getElementById(`p-${slug}`) && p.type === 'tool') { filter = 'tool'; render(); }
    const item = document.getElementById(`p-${slug}`);
    if (!item) return;
    const inner = item.querySelector('.details-inner');
    if (open && !inner.childElementCount) {
      inner.innerHTML = detailsHtml(p);
      const car = inner.querySelector('.carousel');
      if (car) {
        const strip = car.querySelector('.more-frames');
        const sync = () => {
          const end = strip.scrollWidth - strip.clientWidth;
          car.classList.toggle('at-start', strip.scrollLeft <= 4);
          car.classList.toggle('at-end', strip.scrollLeft >= end - 4);
        };
        strip.addEventListener('scroll', sync, { passive: true });
        window.addEventListener('resize', sync);
        strip.querySelectorAll('img').forEach((im) => im.addEventListener('load', sync));
        sync();
      }
    }
    item.classList.toggle('is-open', open);
    item.querySelectorAll('[aria-expanded]').forEach((a) => a.setAttribute('aria-expanded', String(open)));
    // The address follows what is open, so it can be copied and shared,
    // without adding a step to the back button for every click.
    const want = open ? `#/${slug}` : '';
    if (location.hash !== want) history.replaceState(null, '', location.pathname + location.search + want);
    // Folding a long project away from below: bring its top back into view.
    if (scroll || (!open && item.getBoundingClientRect().top < 0)) {
      item.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else if (open) {
      // Opened from low on the screen: glide up with it, so the unfolding is
      // seen rather than happening below the fold.
      const cap = item.querySelector('.caption').getBoundingClientRect();
      const aim = innerHeight * 0.3;
      if (cap.top > aim) window.scrollBy({ top: cap.top - aim, behavior: 'smooth' });
    }
  }

  /* ── Full size ─────────────────────────────────────────────────────── */

  const lightbox = $('#lightbox');

  // A gallery of every image and video in the piece (the feed's and, once
  // opened, the rest), stepped through with the arrows, the arrow keys or a
  // swipe. A click or tap outside the image (or Escape) puts the page back.
  let gallery = [];
  let at = 0;

  function showFull(frameEl) {
    const isMedia = (f) => f.querySelector('img, video');
    if (!isMedia(frameEl)) return false;       // embeds play where they are
    const item = frameEl.closest('.item');
    gallery = [...(item || frameEl).querySelectorAll('.frame')].filter(isMedia);
    at = Math.max(0, gallery.indexOf(frameEl));
    lightbox.innerHTML = `<div class="lb-stage"></div>${gallery.length > 1 ? `
      <button type="button" class="lb-prev" aria-label="Previous">←</button>
      <button type="button" class="lb-next" aria-label="Next">→</button>
      <p class="lb-count"></p>` : ''}`;
    showAt(at);
    lightbox.showModal();
    lightbox.focus();   // not the ← button, so no ring shows on it
    return true;
  }

  function showAt(i) {
    at = (i + gallery.length) % gallery.length;
    const f = gallery[at];
    const img = f.querySelector('img');
    const vid = f.querySelector('video');
    const stage = lightbox.querySelector('.lb-stage');
    stage.innerHTML = img
      ? `<img src="${esc(img.getAttribute('src'))}" alt="${esc(img.alt)}">`
      : `<video src="${esc(vid.getAttribute('src'))}" autoplay loop playsinline controls></video>`;
    if (vid) stage.querySelector('video').muted = vid.muted;
    const count = lightbox.querySelector('.lb-count');
    if (count) count.textContent = `${at + 1} / ${gallery.length}`;
  }

  lightbox.addEventListener('click', (e) => {
    if (swiped) { swiped = false; return; }
    if (e.target.closest('.lb-prev')) return showAt(at - 1);
    if (e.target.closest('.lb-next')) return showAt(at + 1);
    if (!e.target.closest('img, video')) lightbox.close();
  });
  lightbox.addEventListener('keydown', (e) => {
    if (gallery.length < 2) return;
    if (e.key === 'ArrowLeft') { e.preventDefault(); showAt(at - 1); }
    if (e.key === 'ArrowRight') { e.preventDefault(); showAt(at + 1); }
  });
  let touchX = null;
  let swiped = false;   // a swipe is not also a tap that closes
  lightbox.addEventListener('touchstart', (e) => { touchX = e.touches[0].clientX; }, { passive: true });
  lightbox.addEventListener('touchend', (e) => {
    if (touchX === null || gallery.length < 2) return;
    const dx = e.changedTouches[0].clientX - touchX;
    touchX = null;
    if (Math.abs(dx) > 40) { swiped = true; showAt(at + (dx < 0 ? 1 : -1)); }
  });
  lightbox.addEventListener('close', () => { lightbox.innerHTML = ''; gallery = []; });

  slot('feed').addEventListener('click', (e) => {
    // A tap on an image shows it full size (and does not open or close its
    // project — the caption does that).
    const pm = e.target.closest('.note-pm');
    if (pm) {
      const on = pm.closest('.frame').classList.toggle('note-open');
      pm.setAttribute('aria-expanded', String(on));
      pm.setAttribute('aria-label', on ? 'Hide the note' : 'Show the note');
      return;
    }
    if (e.target.closest('.note-over')) return;   // reading the note, not opening the image
    const step = e.target.closest('.car-prev, .car-next');
    if (step) { slide(step.closest('.carousel'), step.classList.contains('car-next') ? 1 : -1); return; }
    const f = e.target.closest('.frame');
    if (f && showFull(f)) { e.preventDefault(); return; }
    const n = e.target.closest('.note-toggle');
    if (n) {
      const item = n.closest('.item');
      n.setAttribute('aria-expanded', String(item.classList.toggle('is-open')));
      return;
    }
    const t = e.target.closest('[data-toggle]');
    if (!t) return;
    e.preventDefault();
    const item = document.getElementById(`p-${t.dataset.toggle}`);
    setOpen(t.dataset.toggle, !item.classList.contains('is-open'));
  });

  // The one control that opens and closes a project or a folded note: a
  // full-width bar, "Read more" in italics over a solid line.
  function moreBar(cls, controls, slug) {
    return `<button type="button" class="more-bar ${cls}" ${slug ? `data-toggle="${slug}"` : ''} aria-expanded="false" aria-controls="${controls}">
      <span class="when-closed">Read more</span><span class="when-open">Close</span><span class="arrow" aria-hidden="true">↓</span>
    </button>`;
  }

  // "Try it ↗" and "Source ↗" for a tool, as a caption line or as buttons.
  function tryLinks(p, cls, tag = 'p') {
    const links = [
      p.live ? `<a href="${esc(p.live)}" target="_blank" rel="noopener">Try it ↗</a>` : '',
      p.repo ? `<a href="${esc(p.repo)}" target="_blank" rel="noopener">Source ↗</a>` : '',
    ].filter(Boolean);
    return links.length ? `<${tag} class="${cls}">${links.join('')}</${tag}>` : '';
  }

  /* ── Writing and About, opened over the page ──────────────────────── */

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
    }

    slot('sheet-title').innerHTML = title;
    slot('sheet-body').innerHTML = body;

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
        <div class="lead" style="${px(site.aboutHeroSize, 10, 120) ? `--hero:${px(site.aboutHeroSize, 10, 120)}` : ''}">${paras(site.aboutHero || site.bio)}</div>
        ${site.about ? `<div class="prose" style="${px(site.aboutSize, 10, 60) ? `--body:${px(site.aboutSize, 10, 60)}` : ''}">${paras(site.about)}</div>` : ''}
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
    if (p.type === 'project' || p.type === 'tool') { closeSheet(); return setOpen(p.slug, true, { scroll: true }); }
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
