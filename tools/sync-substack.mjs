#!/usr/bin/env node
/*
 * Pulls the luckbug Substack feed into content/substack.json.
 *
 * Run by .github/workflows/substack.yml every hour, and by hand with
 *   node tools/sync-substack.mjs [feed-url-or-file]
 *
 * Substack's RSS only carries the latest ~20 posts, so the file is MERGED,
 * never replaced: a post that drops off the feed stays here. A post that is
 * edited on Substack is updated in place. The file is only rewritten when a
 * post actually changed, so the hourly run makes no commit on a quiet day.
 *
 * Which posts show on the site, and whether one is reposted in full or
 * linked out to Substack, is decided in the studio (/studio/) and stored in
 * content/site.json — never here, so this script can never undo a choice.
 *
 * Substack refuses GitHub's servers (a Cloudflare "Just a moment..." page,
 * 403), so on GitHub the feed and the API both fail and the posts come via
 * rss2json.com. From an ordinary connection the feed itself works.
 *
 * No dependencies: Substack's feed is regular enough that a few patterns read
 * it reliably, and this keeps the workflow to a bare `node` call.
 */
import { readFile, writeFile } from 'node:fs/promises';

const FEED = process.argv[2] || 'https://luckbug.substack.com/feed';
const OUT = new URL('../content/substack.json', import.meta.url);

const cdata = (s) => (s || '').replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/, '$1').trim();
const tag = (xml, name) => {
  const m = xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`));
  return m ? cdata(m[1]) : '';
};
const entities = (s) => s
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

// Both sources, to the second, so switching between them is not a change.
const isoSeconds = (d) => new Date(d).toISOString().replace(/\.\d{3}Z$/, '.000Z');

function parse(xml) {
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(([, item]) => {
    const url = entities(tag(item, 'link'));
    const enclosure = item.match(/<enclosure[^>]*url="([^"]+)"/);
    const html = tag(item, 'content:encoded');
    const text = entities(html.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
    return {
      id: entities(tag(item, 'guid')) || url,
      title: entities(tag(item, 'title')).trim(),
      subtitle: entities(tag(item, 'description')).trim(),
      url,
      date: isoSeconds(tag(item, 'pubDate')),
      image: enclosure ? entities(enclosure[1]) : '',
      excerpt: text.slice(0, 280).replace(/\s\S*$/, '') + (text.length > 280 ? '…' : ''),
      html,
      via: 'rss',
    };
  });
}

// Substack sometimes answers requests from cloud servers (like GitHub's)
// with a challenge page instead of the feed. So: look like a browser, say
// exactly what came back when it fails, and fall back to Substack's own JSON
// API before giving up.
const HEADERS = {
  'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36',
  accept: 'application/rss+xml, application/xml, application/json;q=0.9, */*;q=0.8',
};

async function get(url) {
  const res = await fetch(url, { headers: HEADERS });
  const body = await res.text();
  if (!res.ok) throw new Error(`${url} answered ${res.status} (${res.headers.get('content-type')}): ${body.slice(0, 160).replace(/\s+/g, ' ')}`);
  return body;
}

async function fromRss(url) {
  const xml = /^https?:/.test(url) ? await get(url) : await readFile(url, 'utf8');
  const posts = parse(xml);
  if (!posts.length) throw new Error(`${url} returned no posts: ${xml.slice(0, 160).replace(/\s+/g, ' ')}`);
  return posts;
}

async function fromApi(base) {
  const list = JSON.parse(await get(`${base}/api/v1/archive?sort=new&limit=30`));
  const posts = [];
  for (const a of list) {
    if (a.audience && a.audience !== 'everyone') continue;   // paid posts stay on Substack
    let html = '';
    try { html = JSON.parse(await get(`${base}/api/v1/posts/${a.slug}`)).body_html || ''; } catch { /* keep the card without text */ }
    const text = entities(html.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
    const url = a.canonical_url || `${base}/p/${a.slug}`;
    posts.push({
      id: url,
      title: (a.title || '').trim(),
      subtitle: (a.subtitle || '').trim(),
      url,
      date: isoSeconds(a.post_date),
      image: a.cover_image || '',
      excerpt: text.slice(0, 280).replace(/\s\S*$/, '') + (text.length > 280 ? '…' : ''),
      html,
      via: 'api',
    });
  }
  if (!posts.length) throw new Error(`${base} API returned no public posts`);
  return posts;
}

// Third route: rss2json.com reads the feed from its own servers, which
// Substack does not challenge, and hands it back as JSON. Free, no key, and
// refreshed about hourly — the same rhythm as this script.
async function fromService(feed) {
  const data = JSON.parse(await get(`https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(feed)}`));
  if (data.status !== 'ok' || !data.items || !data.items.length) throw new Error(`rss2json: ${data.message || 'no posts'}`);
  return data.items.map((i) => {
    const html = i.content || '';
    const text = entities(html.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
    return {
      id: i.guid || i.link,
      title: entities(i.title || '').trim(),
      subtitle: entities(i.description || '').trim(),
      url: i.link,
      date: isoSeconds(`${i.pubDate.replace(' ', 'T')}Z`),
      image: (i.enclosure && i.enclosure.link) || i.thumbnail || '',
      excerpt: text.slice(0, 280).replace(/\s\S*$/, '') + (text.length > 280 ? '…' : ''),
      html,
      via: 'rss2json',
    };
  });
}

async function main() {
  let fresh;
  const tries = /^https?:/.test(FEED)
    ? [() => fromRss(FEED), () => fromApi(new URL(FEED).origin), () => fromService(FEED)]
    : [() => fromRss(FEED)];
  for (const attempt of tries) {
    try { fresh = await attempt(); break; } catch (err) { console.log(`Could not read: ${err.message}`); }
  }
  if (!fresh) {
    // Not a reason to email anyone every hour: the posts already on the
    // site stay as they are, and the next run tries again.
    console.log('::warning::Substack could not be read this time; content/substack.json left as it was.');
    return;
  }

  let previous = { items: [] };
  try { previous = JSON.parse(await readFile(OUT, 'utf8')); } catch { /* first run */ }

  const byId = new Map(previous.items.map((p) => [p.id, p]));
  const SHOWN = ['title', 'subtitle', 'url', 'date', 'image'];
  for (const post of fresh) {
    const old = byId.get(post.id);
    // The three routes write the same post slightly differently (curly
    // quotes, &amp;, %2F in image links); none of that is a change.
    const norm = (x) => { let v = entities(String(x)); try { v = decodeURIComponent(v); } catch { /* keep */ } return v.replace(/[“”"‘’']/g, '').trim(); };
    const same = (x, y) => norm(x) === norm(y);
    const changed = !old || SHOWN.some((k) => !same(old[k], post[k])) || (old.via === post.via && old.html !== post.html) || !old.html;
    if (changed) byId.set(post.id, post);
  }
  const items = [...byId.values()].sort((a, b) => b.date.localeCompare(a.date));

  if (JSON.stringify(items) === JSON.stringify(previous.items)) {
    console.log(`No change (${items.length} posts).`);
    return;
  }
  const out = { source: FEED, synced: new Date().toISOString(), items };
  await writeFile(OUT, JSON.stringify(out, null, 2) + '\n');
  console.log(`Wrote ${items.length} posts.`);
}

main().catch((err) => { console.error(err); process.exit(1); });
