/*
 * ecem.world studio — the private side of the site.
 *
 * How it works, in one paragraph: the site is three JSON files in content/
 * plus a media/ folder. This page reads them from GitHub with your token,
 * lets you change them here, and on "Publish" writes everything you changed
 * — text and every new image or video — back as ONE commit. GitHub Pages
 * rebuilds from that commit, so the site updates about a minute later.
 * Nothing goes live until you press Publish.
 *
 * Unpublished text edits are also kept in this browser, so closing the tab
 * by accident loses nothing but files you had not yet published.
 *
 * Plain script on purpose: no build step, works from GitHub Pages as-is.
 */
(function () {
  'use strict';

  /* ── Settings ─────────────────────────────────────────────────────── */

  const DEFAULTS = { owner: 'ceceming', repo: 'ecem.world', branch: 'main', token: '' };
  const CFG_KEY = 'ecem.world:studio';
  const WORK_KEY = 'ecem.world:studio-work';

  const IMAGE_MAX = 2400;        // longest edge, px — sharp on a retina laptop, light on a phone
  const IMAGE_QUALITY = 0.86;    // WebP
  const VIDEO_WARN = 25e6;       // bytes — fine in the repo, but slower to load
  const VIDEO_MAX = 90e6;        // GitHub refuses files over 100 MB

  const POSTS = 'content/posts.json';
  const SITE = 'content/site.json';
  const SUBSTACK = 'content/substack.json';

  /* ── State ────────────────────────────────────────────────────────── */

  let cfg = { ...DEFAULTS };
  const state = {
    posts: [],          // the working copy, in site order
    site: {},
    substack: { items: [] },
    saved: '',          // JSON of posts+site as last loaded/published
    shas: {},           // blob shas at load, to notice edits made elsewhere
    pending: new Map(), // path -> { blob, url } — new files not yet published
    removed: new Set(), // paths of published media no longer used
    selected: null,     // id
    justPublished: new Map(), // path -> { url } — kept so new thumbnails do not
                              // flicker while GitHub's raw cache catches up
    typeFilter: 'all',
    statusFilter: 'all',
    tab: 'library',
  };

  /* ── Small helpers ────────────────────────────────────────────────── */

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private window */ } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { /* nothing */ } },
  };

  const uid = () => Math.random().toString(36).slice(2, 8);

  const slugify = (s) => String(s || '').toLowerCase()
    .replace(/ı/g, 'i').normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'untitled';

  const uniqueSlug = (base, id) => {
    let s = base, n = 2;
    // "about" is the About page's address, so no post may take it.
    while (s === 'about' || state.posts.some((p) => p.slug === s && p.id !== id)) s = `${base}-${n++}`;
    return s;
  };

  const rawBase = () => `https://raw.githubusercontent.com/${cfg.owner}/${cfg.repo}/${encodeURIComponent(cfg.branch)}/`;

  // Where to show a file from: this session's upload if it has not been
  // published yet, otherwise the repo itself (right for any branch).
  function mediaUrl(path) {
    if (!path) return '';
    if (/^(https?:|blob:|data:)/.test(path)) return path;
    const p = state.pending.get(path) || state.justPublished.get(path);
    return p ? p.url : rawBase() + path;
  }

  let toastTimer;
  function toast(msg, ms = 3200) {
    const t = $('#toast');
    t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, ms);
  }

  const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '');
  const fmtBytes = (n) => (n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.round(n / 1e3)} KB`);

  /* ── GitHub ───────────────────────────────────────────────────────── */

  async function gh(path, opts = {}) {
    const res = await fetch(`https://api.github.com/repos/${cfg.owner}/${cfg.repo}${path}`, {
      ...opts,
      headers: {
        Authorization: `Bearer ${cfg.token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
        ...(opts.headers || {}),
      },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      cache: 'no-store',
    });
    if (!res.ok) {
      let detail = '';
      try { detail = (await res.json()).message; } catch (e) { /* not JSON */ }
      const err = new Error(detail || `GitHub said ${res.status}`);
      err.status = res.status;
      throw err;
    }
    return res.status === 204 ? null : res.json();
  }

  const ref = () => `?ref=${encodeURIComponent(cfg.branch)}`;

  // Small JSON files: read with their sha, so Publish can tell whether
  // someone (you, on another device) changed them in the meantime.
  async function readJson(path) {
    try {
      const f = await gh(`/contents/${path}${ref()}`);
      const bytes = Uint8Array.from(atob(f.content.replace(/\n/g, '')), (c) => c.charCodeAt(0));
      return { sha: f.sha, data: JSON.parse(new TextDecoder().decode(bytes)) };
    } catch (err) {
      if (err.status === 404) return { sha: null, data: null };
      throw err;
    }
  }

  // The Substack file grows past the 1 MB the JSON API inlines; read it raw.
  async function readRaw(path) {
    try {
      const res = await fetch(`https://api.github.com/repos/${cfg.owner}/${cfg.repo}/contents/${path}${ref()}`, {
        headers: { Authorization: `Bearer ${cfg.token}`, Accept: 'application/vnd.github.raw+json' },
        cache: 'no-store',
      });
      return res.ok ? res.json() : null;
    } catch (e) { return null; }
  }

  const toBase64 = (blob) => new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1]);
    r.onerror = reject;
    r.readAsDataURL(blob);
  });

  /* ── Loading ──────────────────────────────────────────────────────── */

  async function load() {
    status('Loading…');
    const [posts, site, sub] = await Promise.all([readJson(POSTS), readJson(SITE), readRaw(SUBSTACK)]);
    state.posts = (posts.data && posts.data.posts) || [];
    state.site = site.data || {};
    state.site.substack = { show: true, mode: 'link', hidden: [], reposted: [], ...(state.site.substack || {}) };
    state.substack = sub || { items: [] };
    state.shas = { [POSTS]: posts.sha, [SITE]: site.sha };
    state.saved = snapshot();
    state.pending.clear();
    state.removed.clear();
    offerRestore();
    if (!state.selected && state.posts[0]) state.selected = state.posts[0].id;
    status('');
    renderAll();
  }

  const snapshot = () => JSON.stringify({ posts: state.posts, site: state.site });
  const dirty = () => snapshot() !== state.saved || state.pending.size > 0 || state.removed.size > 0;

  // Keep the unpublished text in this browser. Files cannot be kept (they
  // live only in this tab's memory), so a restored copy drops any media
  // that was never published.
  function saveWork() {
    if (snapshot() === state.saved) return store.del(WORK_KEY);
    store.set(WORK_KEY, {
      at: Date.now(), branch: cfg.branch, base: state.saved,
      posts: state.posts, site: state.site, pendingPaths: [...state.pending.keys()],
    });
  }

  // Puts "mine" (edits made on top of "base") onto "theirs" (what has been
  // published since). Only what was actually changed here is carried over:
  // a post or setting left alone here keeps its newer published version, so
  // an old tab can never quietly undo work published from somewhere else.
  // Where both changed the same post, the one being published now wins.
  function mergeWork(base, mine, theirs) {
    const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    const basePosts = new Map((base.posts || []).map((p) => [p.id, p]));
    const minePosts = new Map(mine.posts.map((p) => [p.id, p]));
    let posts = (theirs.posts || []).filter((p) => !(basePosts.has(p.id) && !minePosts.has(p.id)));  // deleted here
    mine.posts.forEach((p, i) => {
      if (basePosts.has(p.id) && same(p, basePosts.get(p.id))) return;   // untouched here
      const at = posts.findIndex((q) => q.id === p.id);
      if (at >= 0) posts[at] = p; else posts.splice(Math.min(i, posts.length), 0, p);
    });
    // Reordered here: that order wins for the posts this tab knew about.
    const order = (list) => list.map((p) => p.id).filter((id) => basePosts.has(id) && minePosts.has(id)).join();
    if (order(mine.posts) !== order(base.posts || [])) {
      const rank = new Map(mine.posts.map((p, i) => [p.id, i]));
      posts = posts.map((p, i) => ({ p, k: rank.has(p.id) ? rank.get(p.id) : i - 0.5 }))
        .sort((a, b) => a.k - b.k).map((x) => x.p);
    }
    const site = { ...(theirs.site || {}) };
    new Set([...Object.keys(base.site || {}), ...Object.keys(mine.site || {})]).forEach((k) => {
      if (!same((mine.site || {})[k], (base.site || {})[k])) site[k] = mine.site[k];
    });
    return { posts, site };
  }

  function offerRestore() {
    const w = store.get(WORK_KEY);
    if (!w || w.branch !== cfg.branch) return;
    const when = new Date(w.at).toLocaleString();
    const newer = w.base !== state.saved;
    const note = newer ? '\n\nThe site has been published since then. Only what you changed is put back; everything newer is kept.' : '';
    if (!confirm(`You have unpublished changes from ${when}. Restore them?${note}`)) return store.del(WORK_KEY);
    const lost = new Set(w.pendingPaths || []);
    const mine = { posts: w.posts.map((p) => ({ ...p, media: (p.media || []).filter((m) => !lost.has(m.src)) })), site: w.site };
    const m = newer ? mergeWork(JSON.parse(w.base), mine, { posts: state.posts, site: state.site }) : mine;
    state.posts = m.posts;
    state.site = m.site;
    if (lost.size) toast(`${lost.size} unpublished file(s) could not be kept — add them again.`, 6000);
  }

  /* ── Publishing ───────────────────────────────────────────────────── */

  async function publish() {
    const btn = $('#publish');
    btn.disabled = true;
    try {
      status('Checking…');
      const head = (await gh(`/git/ref/heads/${encodeURIComponent(cfg.branch)}`)).object.sha;

      // Published from somewhere else (another tab, another device) since this
      // page loaded? Then add these changes on top of that, never replace it.
      const [rp, rs] = await Promise.all([readJson(POSTS), readJson(SITE)]);
      if ((rp.sha && rp.sha !== state.shas[POSTS]) || (rs.sha && rs.sha !== state.shas[SITE])) {
        const m = mergeWork(JSON.parse(state.saved), { posts: state.posts, site: state.site },
          { posts: (rp.data && rp.data.posts) || [], site: rs.data || {} });
        state.posts = m.posts;
        state.site = m.site;
        toast('The site was published from somewhere else meanwhile — those changes are kept, and yours are added to them.', 7000);
      }

      const baseTree = (await gh(`/git/commits/${head}`)).tree.sha;
      const tree = [];
      let i = 0;
      for (const [path, file] of state.pending) {
        if (!usedPaths().has(path)) continue;   // uploaded, then removed again
        status(`Uploading ${++i} of ${state.pending.size}…`);
        const blob = await gh('/git/blobs', { method: 'POST', body: { content: await toBase64(file.blob), encoding: 'base64' } });
        tree.push({ path, mode: '100644', type: 'blob', sha: blob.sha });
      }
      const used = usedPaths();
      for (const path of state.removed) {
        if (!used.has(path) && !state.pending.has(path)) tree.push({ path, mode: '100644', type: 'blob', sha: null });
      }
      tree.push({ path: POSTS, mode: '100644', type: 'blob', content: JSON.stringify({ posts: state.posts }, null, 2) + '\n' });
      tree.push({ path: SITE, mode: '100644', type: 'blob', content: JSON.stringify(state.site, null, 2) + '\n' });

      status('Saving…');
      const newTree = await gh('/git/trees', { method: 'POST', body: { base_tree: baseTree, tree } });
      const commit = await gh('/git/commits', { method: 'POST', body: { message: commitMessage(), tree: newTree.sha, parents: [head] } });
      await gh(`/git/refs/heads/${encodeURIComponent(cfg.branch)}`, { method: 'PATCH', body: { sha: commit.sha } });

      state.pending.forEach((v, k) => state.justPublished.set(k, v));
      store.del(WORK_KEY);
      await load();
      status('Published — live in about a minute.');
      toast('Published. The site updates in about a minute.');
    } catch (err) {
      console.error(err);
      status('');
      alert(`Could not publish: ${err.message}${err.status === 403 || err.status === 404 ? '\n\nCheck the token has Contents: Read and write on this repository.' : ''}`);
    } finally {
      updateBar();
    }
  }

  function usedPaths() {
    const s = new Set();
    state.posts.forEach((p) => (p.media || []).forEach((m) => { s.add(m.src); if (m.poster) s.add(m.poster); }));
    return s;
  }

  function commitMessage() {
    const before = JSON.parse(state.saved);
    const was = new Map(before.posts.map((p) => [p.id, p]));
    const now = new Map(state.posts.map((p) => [p.id, p]));
    const name = (p) => `"${titleOf(p)}"`;
    const parts = [];
    state.posts.forEach((p) => {
      const o = was.get(p.id);
      if (!o) parts.push(`add ${name(p)}`);
      else if (JSON.stringify(o) !== JSON.stringify(p)) {
        parts.push(o.status !== p.status ? `${p.status === 'published' ? 'publish' : p.status === 'archived' ? 'archive' : 'unpublish'} ${name(p)}` : `edit ${name(p)}`);
      }
    });
    before.posts.forEach((p) => { if (!now.has(p.id)) parts.push(`remove ${name(p)}`); });
    if (JSON.stringify(before.posts.map((p) => p.id)) !== JSON.stringify(state.posts.filter((p) => was.has(p.id)).map((p) => p.id))) parts.push('reorder');
    if (JSON.stringify(before.site) !== JSON.stringify(state.site)) parts.push('site settings');
    const msg = parts.length ? parts.join(', ') : 'update';
    return `Studio: ${msg.charAt(0).toUpperCase()}${msg.slice(1)}`.slice(0, 200);
  }

  function discard() {
    if (!confirm('Throw away everything not yet published?')) return;
    const saved = JSON.parse(state.saved);
    state.posts = saved.posts;
    state.site = saved.site;
    state.pending.forEach((f) => URL.revokeObjectURL(f.url));
    state.pending.clear();
    state.removed.clear();
    store.del(WORK_KEY);
    if (!state.posts.some((p) => p.id === state.selected)) state.selected = state.posts[0] && state.posts[0].id;
    renderAll();
  }

  /* ── Changes ──────────────────────────────────────────────────────── */

  let saveTimer;
  function changed({ list = true, editor = false } = {}) {
    if (list) renderList();
    if (editor) renderEditor();
    updateBar();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => { saveWork(); sendPreview(); }, 250);
  }

  function status(msg) { $('#status').textContent = msg; }

  function updateBar() {
    const d = dirty();
    const n = changeCount();
    $('#publish').disabled = !d;
    $('#publish').textContent = d ? `Publish${n ? ` (${n})` : ''}` : 'Published';
    $('#discard').hidden = !d;
    if (d && !/…$/.test($('#status').textContent)) status('Unpublished changes');
    if (!d && $('#status').textContent === 'Unpublished changes') status('');
  }

  function changeCount() {
    const before = new Map(JSON.parse(state.saved).posts.map((p) => [p.id, JSON.stringify(p)]));
    let n = 0;
    state.posts.forEach((p) => { if (before.get(p.id) !== JSON.stringify(p)) n++; });
    before.forEach((_, id) => { if (!state.posts.some((p) => p.id === id)) n++; });
    return n;
  }

  window.addEventListener('beforeunload', (e) => {
    if (state.pending.size) { e.preventDefault(); e.returnValue = ''; }
  });

  /* ── Posts ────────────────────────────────────────────────────────── */

  const current = () => state.posts.find((p) => p.id === state.selected);
  const subFor = (p) => (p && p.substack ? (state.substack.items || []).find((s) => s.url === p.substack) : null);
  const titleOf = (p) => (p.substack ? (subFor(p) || {}).title || p.substack : p.title) || 'Untitled';
  const TYPE_LABEL = { project: 'Project', image: 'Image', tool: 'Tool', writing: 'Writing' };
  const STATUS_LABEL = { published: 'Live', draft: 'Draft', archived: 'Archived' };

  function newPost(type) {
    const id = uid();
    const base = { id, type, status: 'draft', slug: '', title: '', year: String(new Date().getFullYear()) };
    const extra = {
      project: { client: '', role: '', tags: [], summary: '', body: '', credits: '', media: [] },
      image: { tags: [], body: '', size: 'small', media: [] },
      tool: { tags: [], summary: '', body: '', process: '', live: '', repo: '', embed: '',
        credits: 'Designed and directed by: Ecem Öztürk\nBuilt with: Claude Code', media: [] },
      writing: { date: new Date().toISOString().slice(0, 10), summary: '', body: '', url: '', media: [] },
    }[type];
    const p = { ...base, ...extra };
    p.slug = uniqueSlug(`untitled-${type}`, id);
    state.posts.unshift(p);
    state.selected = id;
    state.typeFilter = 'all';
    state.statusFilter = 'all';
    changed({ editor: true });
    setTimeout(() => { const t = $('#editor [name="title"]'); if (t) t.focus(); }, 0);
  }

  function removePost(p) {
    if (!confirm(`Delete "${titleOf(p)}" for good?\n\nTo take it off the site but keep it, set it to Archived instead.`)) return;
    (p.media || []).forEach((m) => forgetFile(m));
    const i = state.posts.indexOf(p);
    state.posts.splice(i, 1);
    const next = state.posts[Math.min(i, state.posts.length - 1)];
    state.selected = next ? next.id : null;
    changed({ editor: true });
  }

  function duplicatePost(p) {
    const copy = JSON.parse(JSON.stringify(p));
    copy.id = uid();
    copy.status = 'draft';
    copy.title = p.title ? `${p.title} (copy)` : '';
    copy.slug = uniqueSlug(`${p.slug}-copy`, copy.id);
    state.posts.splice(state.posts.indexOf(p) + 1, 0, copy);
    state.selected = copy.id;
    changed({ editor: true });
  }

  function move(id, beforeId) {
    const from = state.posts.findIndex((p) => p.id === id);
    const [item] = state.posts.splice(from, 1);
    const to = beforeId ? state.posts.findIndex((p) => p.id === beforeId) : state.posts.length;
    state.posts.splice(to, 0, item);
    changed();
  }

  // Alt+↑/↓ moves past the neighbour that is visible under the current filter.
  function nudge(id, dir) {
    const vis = visiblePosts();
    const i = vis.findIndex((p) => p.id === id);
    const j = i + dir;
    if (j < 0 || j >= vis.length) return;
    const other = vis[j];
    const a = state.posts.findIndex((p) => p.id === id);
    const b = state.posts.findIndex((p) => p.id === other.id);
    [state.posts[a], state.posts[b]] = [state.posts[b], state.posts[a]];
    changed();
    const li = $(`#list [data-id="${id}"]`);
    if (li) li.focus();
  }

  const visiblePosts = () => state.posts.filter((p) =>
    (state.typeFilter === 'all' || p.type === state.typeFilter) &&
    (state.statusFilter === 'all' || p.status === state.statusFilter));

  /* ── Files ────────────────────────────────────────────────────────── */

  function forgetFile(m) {
    [m.src, m.poster].filter(Boolean).forEach((path) => {
      if (state.pending.has(path)) { URL.revokeObjectURL(state.pending.get(path).url); state.pending.delete(path); }
      else if (!/^https?:/.test(path)) state.removed.add(path);
    });
  }

  const loadImage = (url) => new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not read that image.'));
    img.src = url;
  });

  const canvasBlob = (canvas, type, q) => new Promise((resolve) => canvas.toBlob(resolve, type, q));

  // Photos and renders are resized to IMAGE_MAX on their long edge and saved
  // as WebP: a 12 MB camera file becomes ~400 KB that looks the same on screen.
  async function processImage(file) {
    const url = URL.createObjectURL(file);
    try {
      const img = await loadImage(url);
      const scale = Math.min(1, IMAGE_MAX / Math.max(img.naturalWidth, img.naturalHeight));
      const w = Math.round(img.naturalWidth * scale);
      const h = Math.round(img.naturalHeight * scale);
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      c.getContext('2d').drawImage(img, 0, 0, w, h);
      const blob = await canvasBlob(c, 'image/webp', IMAGE_QUALITY);
      if (!blob || blob.type !== 'image/webp') throw new Error('This browser cannot save WebP.');
      // Already small and already WebP/JPEG? Keep whichever is lighter.
      if (scale === 1 && file.size < blob.size && /jpeg|webp/.test(file.type)) {
        return { blob: file, w, h, ext: file.type === 'image/jpeg' ? 'jpg' : 'webp' };
      }
      return { blob, w, h, ext: 'webp' };
    } finally { URL.revokeObjectURL(url); }
  }

  function videoInfo(file) {
    return new Promise((resolve) => {
      const url = URL.createObjectURL(file);
      const v = document.createElement('video');
      v.muted = true; v.playsInline = true; v.preload = 'auto';
      let done = false;
      const finish = (poster) => {
        if (done) return; done = true;
        resolve({ w: v.videoWidth || 16, h: v.videoHeight || 9, poster });
        URL.revokeObjectURL(url);
      };
      v.onloadeddata = () => { v.currentTime = Math.min(0.1, (v.duration || 1) / 2); };
      v.onseeked = async () => {
        // A still of the first frame, shown while the video loads (and on
        // phones in low-power mode, which refuse to autoplay).
        try {
          const c = document.createElement('canvas');
          const s = Math.min(1, 1600 / Math.max(v.videoWidth, v.videoHeight));
          c.width = Math.round(v.videoWidth * s); c.height = Math.round(v.videoHeight * s);
          c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
          finish(await canvasBlob(c, 'image/webp', 0.8));
        } catch (e) { finish(null); }
      };
      v.onerror = () => finish(null);
      setTimeout(() => finish(null), 8000);
      v.src = url;
    });
  }

  function addPending(path, blob) {
    const url = URL.createObjectURL(blob);
    state.pending.set(path, { blob, url });
    state.removed.delete(path);
  }

  async function ingest(file, post) {
    const stem = slugify(file.name.replace(/\.[^.]+$/, '')).slice(0, 40) || 'file';
    const dir = `media/${post.id}/`;
    const name = `${stem}-${uid().slice(0, 4)}`;

    if (/^image\/(jpeg|png|webp|avif|heic|heif)$/.test(file.type) || /\.(jpe?g|png|webp|heic)$/i.test(file.name)) {
      const { blob, w, h, ext } = await processImage(file);
      const src = `${dir}${name}.${ext}`;
      addPending(src, blob);
      return { type: 'image', src, w, h, alt: '' };
    }
    if (file.type === 'image/gif') {
      if (file.size > 15e6) toast(`${file.name} is ${fmtBytes(file.size)}. GIFs that size load slowly — an MP4 of it would be a tenth of the weight.`, 8000);
      const url = URL.createObjectURL(file);
      const img = await loadImage(url).finally(() => URL.revokeObjectURL(url));
      const src = `${dir}${name}.gif`;
      addPending(src, file);
      return { type: 'gif', src, w: img.naturalWidth, h: img.naturalHeight, alt: '' };
    }
    if (/^video\//.test(file.type)) {
      if (file.size > VIDEO_MAX) {
        throw new Error(`${file.name} is ${fmtBytes(file.size)} — over what GitHub accepts. Export it smaller (1080p, H.264), or upload it to Vimeo and use "Add video link".`);
      }
      if (file.size > VIDEO_WARN) toast(`${file.name} is ${fmtBytes(file.size)}. It will work, but under 25 MB loads much faster.`, 8000);
      const { w, h, poster } = await videoInfo(file);
      const ext = (file.name.match(/\.(mp4|webm|mov|m4v)$/i) || [, 'mp4'])[1].toLowerCase();
      const src = `${dir}${name}.${ext}`;
      addPending(src, file);
      const m = { type: 'video', src, w, h, alt: '' };
      if (poster) { m.poster = `${dir}${name}-poster.webp`; addPending(m.poster, poster); }
      return m;
    }
    throw new Error(`${file.name}: not an image, GIF or video this site can show.`);
  }

  async function addFiles(files, post) {
    const list = [...files];
    if (!list.length) return;
    status(`Preparing ${list.length} file(s)…`);
    for (const f of list) {
      try {
        const m = await ingest(f, post);
        post.media.push(m);
        changed({ editor: true });
      } catch (err) {
        alert(err.message);
      }
    }
    status('');
    updateBar();
  }

  function embedInfo(url) {
    if (/vimeo\.com\/(?:video\/)?\d+/.test(url) || /youtu\.?be/.test(url)) return { type: 'embed', src: url.trim(), w: 16, h: 9, alt: '' };
    return null;
  }

  /* ── Rendering: list ──────────────────────────────────────────────── */

  function thumb(p) {
    const m = (p.media || [])[0];
    if (p.substack) {
      const s = subFor(p);
      return s && s.image ? `<img src="${esc(s.image)}" alt="" loading="lazy">` : '<span class="t-txt">S</span>';
    }
    if (!m) return `<span class="t-txt">${p.type === 'writing' ? 'Aa' : '—'}</span>`;
    if (m.type === 'video') return m.poster ? `<img src="${esc(mediaUrl(m.poster))}" alt="" loading="lazy">` : '<span class="t-txt">▶</span>';
    if (m.type === 'embed') return '<span class="t-txt">▶</span>';
    return `<img src="${esc(mediaUrl(m.src))}" alt="" loading="lazy">`;
  }

  function renderList() {
    const vis = visiblePosts();
    $$('#type-filter button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.type === state.typeFilter)));
    $$('#status-filter button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.status === state.statusFilter)));
    const before = new Map(JSON.parse(state.saved || '{"posts":[]}').posts.map((p) => [p.id, JSON.stringify(p)]));

    $('#list').innerHTML = vis.length ? vis.map((p) => {
      const meta = [TYPE_LABEL[p.type], p.substack ? 'from Substack' : '', p.client, p.year].filter(Boolean).join(' · ');
      const edited = before.get(p.id) !== JSON.stringify(p);
      return `<li draggable="true" tabindex="0" data-id="${esc(p.id)}" class="${p.id === state.selected ? 'is-selected' : ''} s-${p.status}">
        <span class="grip" aria-hidden="true">⋮⋮</span>
        <span class="thumb">${thumb(p)}</span>
        <span class="label"><b>${esc(titleOf(p))}</b><small>${esc(meta)}</small></span>
        <span class="pill">${edited ? '<i class="dot" title="Not yet published"></i>' : ''}${STATUS_LABEL[p.status]}</span>
      </li>`;
    }).join('') : `<li class="none">Nothing here. ${state.posts.length ? 'Try another filter.' : 'Add your first project above.'}</li>`;
  }

  /* ── Rendering: editor ────────────────────────────────────────────── */

  const field = (name, label, value, attrs = '', hint = '') =>
    `<label>${label}${hint ? ` <span class="muted">— ${hint}</span>` : ''}<input name="${name}" value="${esc(value)}" ${attrs}></label>`;
  const area = (name, label, value, rows, hint = '') =>
    `<label>${label}${hint ? ` <span class="muted">— ${hint}</span>` : ''}<textarea name="${name}" rows="${rows}">${esc(value)}</textarea></label>`;

  function statusSwitch(p) {
    return `<div class="segmented" role="radiogroup" aria-label="Status">${['draft', 'published', 'archived'].map((s) =>
      `<button type="button" role="radio" data-status-set="${s}" aria-checked="${p.status === s}">${STATUS_LABEL[s]}</button>`).join('')}</div>`;
  }

  // Which pieces show in the feed before a project is opened. Mirrors
  // feedMedia() in assets/site.js: explicit choices, else the first three.
  function inFeed(p, i) {
    if (!p.media.some((m) => typeof m.feed === 'boolean')) return i < 3;
    const any = p.media.some((m) => m.feed);
    return any ? !!p.media[i].feed : i === 0;
  }

  function mediaTile(m, i, n, p) {
    let inner;
    if (m.type === 'video') inner = `<video src="${esc(mediaUrl(m.src))}" ${m.poster ? `poster="${esc(mediaUrl(m.poster))}"` : ''} muted loop playsinline autoplay></video>`;
    else if (m.type === 'embed') inner = `<span class="t-txt">▶ ${esc(m.src.replace(/^https?:\/\/(www\.)?/, '').slice(0, 28))}</span>`;
    else inner = `<img src="${esc(mediaUrl(m.src))}" alt="">`;
    const tag = { image: '', gif: 'GIF', video: 'Video', embed: 'Link' }[m.type];
    const isNew = state.pending.has(m.src) ? '<i class="dot" title="Uploads when you publish"></i>' : '';
    return `<li class="tile" draggable="true" data-i="${i}">
      <div class="tile-media" style="aspect-ratio:${m.w || 16}/${m.h || 9}">${inner}</div>
      <div class="tile-bar">
        <span>${isNew}${tag ? `${tag} · ` : ''}${m.w && m.type !== 'embed' ? `${m.w}×${m.h}` : ''}</span>
        <span>
          <button type="button" data-m="left" ${i === 0 ? 'disabled' : ''} aria-label="Move earlier">←</button>
          <button type="button" data-m="right" ${i === n - 1 ? 'disabled' : ''} aria-label="Move later">→</button>
          <button type="button" data-m="remove" aria-label="Remove">×</button>
        </span>
      </div>
      <div class="sizes" role="radiogroup" aria-label="Size">${[['s', 'S', 'Small'], ['m', 'M', 'Medium'], ['l', 'L', 'Large']].map(([v, t, name]) =>
        `<button type="button" role="radio" data-m="size" data-size="${v}" title="${name}" aria-checked="${(m.size || 'l') === v}">${t}</button>`).join('')}</div>
      ${p && p.type !== 'image' ? `<label class="infeed"><input type="checkbox" data-m="feed" ${inFeed(p, i) ? 'checked' : ''}> In the feed</label>` : ''}
      <input class="alt" data-m="alt" value="${esc(m.alt)}" placeholder="Describe it (for screen readers)">
    </li>`;
  }

  function mediaManager(p) {
    const one = p.type === 'image';
    return `<div class="media-block">
      <div class="block-head"><span>${one ? 'Images' : 'Images, GIFs and video'}</span>
        <span class="muted">${one ? 'One image, or several: several show together as a sliding row, in this order (drag to reorder). With several, the note folds under the caption behind a “Note” bar.' : 'Drag to reorder. Tick “In the feed” for the pieces shown before the project is opened (until you choose, the first three); the rest appear when it is opened.'}</span></div>
      <ol class="tiles" id="tiles">${p.media.map((m, i) => mediaTile(m, i, p.media.length, p)).join('')}</ol>
      <div class="drop" id="drop">
        <p>Drop files here, or <label class="linkish">choose files<input type="file" id="file" multiple
          accept="image/*,video/mp4,video/webm,video/quicktime,.heic" hidden></label>.</p>
        <p class="muted">Photos are resized to ${IMAGE_MAX}px and saved as WebP. Video: MP4 under 25 MB is best; for longer films, use a Vimeo or YouTube link.</p>
        ${one ? '' : '<button type="button" id="add-embed">Add video link</button>'}
      </div>
    </div>`;
  }

  function renderEditor() {
    const p = current();
    const ed = $('#editor');
    if (!p) { ed.innerHTML = `<div class="empty-ed"><p>Select something on the left, or add a project.</p></div>`; return; }

    const head = `<div class="ed-head">
      <div><span class="muted">${TYPE_LABEL[p.type]}${p.substack ? ' · from Substack' : ''}</span>
        ${statusSwitch(p)}</div>
      <div class="ed-actions">
        ${p.status === 'published' && JSON.stringify(p) === (new Map(JSON.parse(state.saved).posts.map((q) => [q.id, JSON.stringify(q)])).get(p.id))
          ? `<a href="../#/${p.type === 'writing' ? 'w/' : ''}${esc(p.slug)}" target="_blank" rel="noopener">View on site ↗</a>` : ''}
        ${p.substack ? '' : '<button type="button" data-act="duplicate">Duplicate</button>'}
        <button type="button" data-act="delete" class="danger">Delete</button>
      </div>
    </div>`;

    let body;
    if (p.substack) {
      const s = subFor(p);
      body = `<div class="fields">
        <p class="big">${esc(titleOf(p))}</p>
        <p class="muted">${s ? esc(s.subtitle) : 'Waiting for the next Substack sync to bring this post in.'}</p>
        <p><a href="${esc(p.substack)}" target="_blank" rel="noopener">${esc(p.substack)} ↗</a></p>
        <p class="hint">Its title, text and picture come from Substack and stay in sync. Whether it opens here or on Substack is set on the Substack tab.</p>
      </div>`;
    } else {
      const slugField = field('slug', 'Address', p.slug, 'spellcheck="false"', `ecem.world/#/${p.type === 'writing' ? 'w/' : ''}${esc(p.slug)}`);
      const common = field('title', 'Title', p.title, 'autocomplete="off"');
      if (p.type === 'project') {
        body = `<div class="fields">
          ${common}
          <div class="row">${field('client', 'Client', p.client, '', 'for your records — not shown on the site')}${field('year', 'Year', p.year, 'inputmode="numeric" class="short"')}</div>
          <div class="row">${field('role', 'Role', p.role, '', 'e.g. Art direction, 3D')}${field('tags', 'Disciplines', (p.tags || []).join(', '), '', 'comma between')}</div>
          ${field('summary', 'One line', p.summary, '', 'shown first when the project opens')}
          ${area('body', 'Description', p.body, 7, 'a blank line starts a new paragraph')}
          <div class="row">${field('live', 'Try-it link', p.live, 'placeholder="https://… or virtual-nostalgia/"', 'optional — for a project people can open and use')}</div>
          ${area('credits', 'Credits', p.credits, 3, 'one per line, e.g. Photography: Name')}
          ${slugField}
        </div>${mediaManager(p)}`;
      } else if (p.type === 'tool') {
        body = `<div class="fields">
          ${common}
          <div class="row">${field('tags', 'What it does', (p.tags || []).join(', '), '', 'e.g. 3D rendering, Lighting')}${field('year', 'Year', p.year, 'inputmode="numeric" class="short"')}</div>
          ${field('summary', 'One line', p.summary, '', 'what it is, for someone skimming')}
          <div class="row">${field('live', 'Try-it link', p.live, 'type="url" placeholder="https://…"', 'where the working tool lives')}${field('repo', 'Source link', p.repo, 'type="url" placeholder="https://github.com/…"', 'optional')}</div>
          ${area('body', 'What it is', p.body, 6, 'a blank line starts a new paragraph')}
          ${area('process', 'How it was made', p.process, 6, 'the problem, what you directed, what the AI wrote, what you judged')}
          ${area('credits', 'Credits', p.credits, 3, 'one per line, e.g. Built with: Claude Code')}
          ${slugField}
        </div>${mediaManager(p)}`;
      } else if (p.type === 'image') {
        body = `<div class="fields">
          ${common}
          <div class="row">${field('tags', 'Medium', (p.tags || []).join(', '), '', 'e.g. Rhino, Blender')}${field('year', 'Year', p.year, 'inputmode="numeric" class="short"')}</div>
          <label>Space in the feed <span class="muted">— small sits beside another piece; large spans the width. The image's own S / M / L is set on it below.</span>
            <select name="size"><option value="small" ${p.size !== 'large' ? 'selected' : ''}>Small</option><option value="large" ${p.size === 'large' ? 'selected' : ''}>Large</option></select></label>
          ${area('body', 'Note', p.body, 3, 'optional')}
          <label class="check"><input type="checkbox" name="noteBeside" ${p.noteBeside ? 'checked' : ''}> Show the note right next to the image <span class="muted">— off: it sits on the image itself, behind a small + in the corner</span></label>
          ${slugField}
        </div>${mediaManager(p)}`;
      } else {
        body = `<div class="fields">
          ${common}
          <div class="row">${field('date', 'Date', p.date, 'type="date"')}${field('url', 'Link', p.url, 'type="url" placeholder="https://…"', 'optional — if this lives elsewhere')}</div>
          ${field('summary', 'Subtitle', p.summary)}
          ${area('body', 'Text', p.body, 14, 'a blank line starts a new paragraph')}
          ${slugField}
        </div>`;
      }
    }
    ed.innerHTML = head + body;
  }

  /* ── Rendering: Substack and Site tabs ────────────────────────────── */

  function renderSubstack() {
    const sub = state.site.substack;
    const items = state.substack.items || [];
    const inFeed = new Set(state.posts.filter((p) => p.substack).map((p) => p.substack));
    $('#sub-show').checked = sub.show !== false;
    $('#sub-feed').checked = sub.feed !== false;
    $('#sub-feed').disabled = sub.show === false;
    $('#sub-mode').value = sub.mode || 'link';
    $('#sync-info').textContent = state.substack.synced
      ? `${items.length} posts · last change picked up ${new Date(state.substack.synced).toLocaleString()}`
      : 'Not synced yet — the first hourly run will fill this in.';
    $('#subs').innerHTML = `<thead><tr><th></th><th>Post</th><th>Date</th><th>On the site</th><th>Opens</th><th>Main feed</th></tr></thead><tbody>` +
      items.map((s) => {
        const hidden = sub.hidden.includes(s.id);
        const rep = sub.mode === 'repost' || sub.reposted.includes(s.id);
        return `<tr data-sid="${esc(s.id)}" class="${hidden ? 'is-hidden' : ''}">
          <td class="thumb">${s.image ? `<img src="${esc(s.image)}" alt="" loading="lazy">` : ''}</td>
          <td><b>${esc(s.title)}</b><br><span class="muted">${esc(s.subtitle)}</span></td>
          <td class="nowrap">${esc(fmtDate(s.date))}</td>
          <td><label class="check"><input type="checkbox" data-sub="show" ${hidden ? '' : 'checked'}> Shown</label></td>
          <td><label class="check"><input type="checkbox" data-sub="repost" ${rep ? 'checked' : ''} ${sub.mode === 'repost' ? 'disabled' : ''}> Full text here</label></td>
          <td>${inFeed.has(s.url) ? '<span class="muted">In feed</span>' : '<button type="button" data-sub="add">Add to feed</button>'}</td>
        </tr>`;
      }).join('') + '</tbody>';
  }

  function renderSite() {
    const f = $('#site-form');
    ['name', 'bio', 'aboutHero', 'aboutHeroSize', 'about', 'aboutSize', 'currently', 'email', 'instagram'].forEach((k) => { if (document.activeElement !== f[k]) f[k].value = state.site[k] ?? ''; });
  }

  function renderAll() {
    renderList();
    renderEditor();
    renderSubstack();
    renderSite();
    updateBar();
  }

  /* ── Events: library ──────────────────────────────────────────────── */

  $('#type-filter').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    state.typeFilter = b.dataset.type; renderList();
  });
  $('#status-filter').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    state.statusFilter = b.dataset.status; renderList();
  });
  $$('[data-new]').forEach((b) => b.addEventListener('click', () => newPost(b.dataset.new)));

  const list = $('#list');
  list.addEventListener('click', (e) => {
    const li = e.target.closest('li[data-id]'); if (!li) return;
    state.selected = li.dataset.id;
    renderList(); renderEditor();
  });
  list.addEventListener('keydown', (e) => {
    const li = e.target.closest('li[data-id]'); if (!li) return;
    if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault(); nudge(li.dataset.id, e.key === 'ArrowUp' ? -1 : 1);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault(); state.selected = li.dataset.id; renderList(); renderEditor();
      $(`#list [data-id="${li.dataset.id}"]`).focus();
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      const sib = e.key === 'ArrowUp' ? li.previousElementSibling : li.nextElementSibling;
      if (sib) sib.focus();
    }
  });

  // Drag to reorder the library.
  let dragId = null;
  list.addEventListener('dragstart', (e) => {
    const li = e.target.closest('li[data-id]'); if (!li) return;
    dragId = li.dataset.id; li.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', dragId);
  });
  list.addEventListener('dragover', (e) => {
    if (!dragId) return;
    e.preventDefault();
    const li = e.target.closest('li[data-id]');
    $$('#list .drop-before, #list .drop-after').forEach((n) => n.classList.remove('drop-before', 'drop-after'));
    if (!li || li.dataset.id === dragId) return;
    const after = e.clientY > li.getBoundingClientRect().top + li.offsetHeight / 2;
    li.classList.add(after ? 'drop-after' : 'drop-before');
  });
  list.addEventListener('drop', (e) => {
    if (!dragId) return;
    e.preventDefault();
    const li = $('#list .drop-before, #list .drop-after');
    if (li) {
      const after = li.classList.contains('drop-after');
      let beforeId = li.dataset.id;
      if (after) {
        const idx = state.posts.findIndex((p) => p.id === li.dataset.id);
        const next = state.posts[idx + 1];
        beforeId = next ? (next.id === dragId ? (state.posts[idx + 2] || {}).id : next.id) : null;
      }
      move(dragId, beforeId);
    }
  });
  list.addEventListener('dragend', () => {
    dragId = null;
    $$('#list .dragging, #list .drop-before, #list .drop-after').forEach((n) => n.classList.remove('dragging', 'drop-before', 'drop-after'));
  });

  /* ── Events: editor ───────────────────────────────────────────────── */

  const editor = $('#editor');

  editor.addEventListener('input', (e) => {
    const p = current(); if (!p) return;
    const t = e.target;
    if (t.dataset.m === 'alt') {
      p.media[+t.closest('.tile').dataset.i].alt = t.value;
      return changed({ list: false });
    }
    if (!t.name || t.type === 'checkbox') return;   // tick boxes are handled on change
    if (t.name === 'tags') p.tags = t.value.split(',').map((s) => s.trim()).filter(Boolean);
    else p[t.name] = t.value;

    // The address follows the title until it is set by hand.
    if (t.name === 'title' && (!p.slugTouched)) {
      p.slug = uniqueSlug(slugify(t.value || `untitled-${p.type}`), p.id);
      const s = editor.querySelector('[name="slug"]');
      if (s) s.value = p.slug;
    }
    if (t.name === 'slug') p.slugTouched = true;
    changed();
  });

  editor.addEventListener('change', (e) => {
    const p = current(); if (!p) return;
    const t = e.target;
    if (t.name === 'slug') {
      p.slug = uniqueSlug(slugify(t.value), p.id);
      t.value = p.slug;
      changed({ editor: true });
    }
    if (t.name === 'size') { p.size = t.value; changed(); }
    if (t.name === 'noteBeside') { p.noteBeside = t.checked; changed(); }
    if (t.dataset.m === 'feed') {
      // Turn the default (first three) into explicit choices, then apply this one.
      const i = +t.closest('.tile').dataset.i;
      const now = p.media.map((m, k) => inFeed(p, k));   // read all before writing any
      p.media.forEach((m, k) => { m.feed = now[k]; });
      p.media[i].feed = t.checked;
      changed({ editor: true });
    }
    if (t.id === 'file') addFiles(t.files, p);
  });

  editor.addEventListener('click', (e) => {
    const p = current(); if (!p) return;
    const b = e.target.closest('button'); if (!b) return;

    if (b.dataset.statusSet) {
      if (b.dataset.statusSet === 'published' && p.type !== 'writing' && !p.media.length) {
        if (!confirm('This has no images yet. Put it live anyway?')) return;
      }
      p.status = b.dataset.statusSet;
      return changed({ editor: true });
    }
    if (b.dataset.act === 'delete') return removePost(p);
    if (b.dataset.act === 'duplicate') return duplicatePost(p);
    if (b.id === 'add-embed') {
      const url = prompt('Paste a Vimeo or YouTube link:');
      if (!url) return;
      const m = embedInfo(url);
      if (!m) return alert('That does not look like a Vimeo or YouTube link.');
      p.media.push(m);
      return changed({ editor: true });
    }
    const tile = b.closest('.tile');
    if (tile && b.dataset.m === 'size') {
      const m = p.media[+tile.dataset.i];
      if (b.dataset.size === 'l') delete m.size; else m.size = b.dataset.size;   // large is the default
      return changed({ editor: true });
    }
    if (tile && b.dataset.m) {
      const i = +tile.dataset.i;
      if (b.dataset.m === 'remove') { forgetFile(p.media[i]); p.media.splice(i, 1); }
      if (b.dataset.m === 'left' && i > 0) [p.media[i - 1], p.media[i]] = [p.media[i], p.media[i - 1]];
      if (b.dataset.m === 'right' && i < p.media.length - 1) [p.media[i + 1], p.media[i]] = [p.media[i], p.media[i + 1]];
      changed({ editor: true });
    }
  });

  // Files dropped onto the drop zone; tiles dragged among themselves.
  let tileFrom = null;
  editor.addEventListener('dragstart', (e) => {
    const tile = e.target.closest('.tile'); if (!tile) return;
    tileFrom = +tile.dataset.i;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', 'tile');
  });
  editor.addEventListener('dragover', (e) => {
    const zone = e.target.closest('#drop, .tiles, .tile');
    if (!zone) return;
    e.preventDefault();
    if (tileFrom === null) $('#drop') && $('#drop').classList.add('over');
  });
  editor.addEventListener('dragleave', (e) => {
    if (e.target.id === 'drop') e.target.classList.remove('over');
  });
  editor.addEventListener('drop', (e) => {
    const p = current(); if (!p) return;
    const drop = $('#drop'); if (drop) drop.classList.remove('over');
    if (tileFrom !== null) {
      const tile = e.target.closest('.tile');
      if (tile) {
        e.preventDefault();
        const to = +tile.dataset.i;
        const [m] = p.media.splice(tileFrom, 1);
        p.media.splice(to, 0, m);
        changed({ editor: true });
      }
      tileFrom = null;
      return;
    }
    if (e.dataTransfer.files.length && e.target.closest('#drop, .media-block')) {
      e.preventDefault();
      addFiles(e.dataTransfer.files, p);
    }
  });
  editor.addEventListener('dragend', () => { tileFrom = null; });

  // Dropping a file anywhere else should never navigate away from the studio.
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', (e) => e.preventDefault());

  /* ── Events: Substack and Site ────────────────────────────────────── */

  $('#sub-show').addEventListener('change', (e) => { state.site.substack.show = e.target.checked; changed(); renderSubstack(); });
  $('#sub-feed').addEventListener('change', (e) => { state.site.substack.feed = e.target.checked; changed(); });
  $('#sub-mode').addEventListener('change', (e) => { state.site.substack.mode = e.target.value; changed(); renderSubstack(); });

  $('#subs').addEventListener('change', (e) => {
    const tr = e.target.closest('tr[data-sid]'); if (!tr) return;
    const id = tr.dataset.sid;
    const sub = state.site.substack;
    const toggle = (arr, on) => { const i = sub[arr].indexOf(id); if (on && i < 0) sub[arr].push(id); if (!on && i > -1) sub[arr].splice(i, 1); };
    if (e.target.dataset.sub === 'show') toggle('hidden', !e.target.checked);
    if (e.target.dataset.sub === 'repost') toggle('reposted', e.target.checked);
    changed();
    renderSubstack();
  });

  $('#subs').addEventListener('click', (e) => {
    const b = e.target.closest('[data-sub="add"]'); if (!b) return;
    const s = state.substack.items.find((x) => x.id === b.closest('tr').dataset.sid);
    const id = uid();
    state.posts.unshift({ id, type: 'writing', status: 'published', slug: uniqueSlug(slugify((s.url.match(/\/p\/([^/?#]+)/) || [, s.title])[1]), id), substack: s.url });
    changed();
    renderSubstack();
    toast('Added to the top of the feed. Reorder it in the Library.');
  });

  $('#sync-now').addEventListener('click', async () => {
    try {
      await gh('/actions/workflows/substack.yml/dispatches', { method: 'POST', body: { ref: cfg.branch } });
      toast('Asked GitHub to check Substack. New posts appear here in a minute or two — reload the studio to see them.', 7000);
    } catch (err) {
      alert(err.status === 403 || err.status === 404
        ? 'The token needs "Actions: Read and write" for this button. Without it, Substack is still checked every hour on its own.'
        : `Could not start the check: ${err.message}`);
    }
  });

  $('#site-form').addEventListener('input', (e) => {
    const el = e.target;
    // Sizes are numbers; an empty box means "the usual size".
    state.site[el.name] = el.type === 'number' ? (el.value === '' ? '' : Number(el.value)) : el.value;
    changed({ list: false });
  });

  /* ── Tabs, preview, top bar ───────────────────────────────────────── */

  $$('[data-tab]').forEach((b) => b.addEventListener('click', () => {
    state.tab = b.dataset.tab;
    $$('[data-tab]').forEach((x) => x.setAttribute('aria-selected', String(x === b)));
    $$('[data-view]').forEach((v) => { v.hidden = v.dataset.view !== state.tab; });
  }));

  let previewWin = null;

  // The preview is the real site, fed this unsaved copy instead of the
  // published files — drafts and archived pieces included, badged.
  function previewPayload() {
    const swap = (m) => ({ ...m, src: mediaUrl(m.src), poster: m.poster ? mediaUrl(m.poster) : undefined });
    return {
      type: 'ecem:preview',
      site: state.site,
      posts: state.posts.map((p) => ({ ...p, media: (p.media || []).map(swap) })),
      substack: state.substack,
      mediaBase: rawBase(),
    };
  }

  function sendPreview() {
    if (previewWin && !previewWin.closed) previewWin.postMessage(previewPayload(), location.origin);
  }

  window.addEventListener('message', (e) => {
    if (e.origin === location.origin && e.data && e.data.type === 'ecem:preview-ready') sendPreview();
  });

  $('#preview').addEventListener('click', () => {
    if (location.protocol === 'file:') return alert('Preview works once the studio is opened from the website (ecem.world/studio/).');
    previewWin = window.open('../?preview', 'ecem-preview');
  });

  $('#publish').addEventListener('click', publish);
  $('#discard').addEventListener('click', discard);
  $('#signout').addEventListener('click', () => {
    if (dirty() && !confirm('You have unpublished changes. Sign out anyway? (Text changes stay saved in this browser.)')) return;
    store.set(CFG_KEY, { ...cfg, token: '' });
    location.reload();
  });

  /* ── Sign in ──────────────────────────────────────────────────────── */

  async function signIn() {
    try {
      const repo = await gh('');
      if (repo.permissions && !repo.permissions.push) throw Object.assign(new Error('This token can read but not write.'), { status: 403 });
      store.set(CFG_KEY, cfg);
      $('#signin').hidden = true;
      $('#app').hidden = false;
      await load();
    } catch (err) {
      $('#signin').hidden = false;
      $('#app').hidden = true;
      $('#signin-error').textContent = err.status === 401
        ? 'GitHub did not accept that token. Check it was copied whole, and has not expired.'
        : err.status === 404 || err.status === 403
          ? `The token works but cannot reach ${cfg.owner}/${cfg.repo}. Give it access to that repository, with Contents: Read and write.`
          : `Could not reach GitHub: ${err.message}`;
    }
  }

  const form = $('#signin-form');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    cfg = {
      token: form.token.value.trim(),
      owner: form.owner.value.trim() || DEFAULTS.owner,
      repo: form.repo.value.trim() || DEFAULTS.repo,
      branch: form.branch.value.trim() || DEFAULTS.branch,
    };
    $('#signin-error').textContent = '';
    signIn();
  });

  cfg = { ...DEFAULTS, ...(store.get(CFG_KEY) || {}) };
  // ?branch=name opens the studio on another branch, for trying things out.
  const qb = new URLSearchParams(location.search).get('branch');
  if (qb) cfg.branch = qb;
  form.owner.value = cfg.owner; form.repo.value = cfg.repo; form.branch.value = cfg.branch;
  if (cfg.token) signIn(); else $('#signin').hidden = false;
})();
