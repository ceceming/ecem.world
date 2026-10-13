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

function parse(xml) {
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(([, item]) => {
    const url = entities(tag(item, 'link'));
    const enclosure = item.match(/<enclosure[^>]*url="([^"]+)"/);
    const html = tag(item, 'content:encoded');
    const text = entities(html.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
    return {
      id: entities(tag(item, 'guid')) || url,
      title: entities(tag(item, 'title')),
      subtitle: entities(tag(item, 'description')),
      url,
      date: new Date(tag(item, 'pubDate')).toISOString(),
      image: enclosure ? entities(enclosure[1]) : '',
      excerpt: text.slice(0, 280).replace(/\s\S*$/, '') + (text.length > 280 ? '…' : ''),
      html,
    };
  });
}

async function main() {
  const xml = /^https?:/.test(FEED)
    ? await (await fetch(FEED, { headers: { 'user-agent': 'ecem.world substack sync' } })).text()
    : await readFile(FEED, 'utf8');
  const fresh = parse(xml);
  if (!fresh.length) throw new Error('Feed had no posts — refusing to touch the file.');

  let previous = { items: [] };
  try { previous = JSON.parse(await readFile(OUT, 'utf8')); } catch { /* first run */ }

  const byId = new Map(previous.items.map((p) => [p.id, p]));
  for (const post of fresh) byId.set(post.id, post);
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
