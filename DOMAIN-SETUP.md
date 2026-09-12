# Connecting ecem.world to this repository

Two halves: tell GitHub to publish the site, and tell GoDaddy to point the
domain at GitHub. Both can be done entirely from an iPad in a browser.

Do them in this order. Total hands-on time is about ten minutes; the waiting
afterwards is the long part.

---

## Part 0 — Get the site onto `main`

GitHub Pages publishes one branch. These files are currently on the branch
`claude/portfolio-coming-soon-page-hr00ig`, so merge that into `main` first
(open the branch on github.com, "Compare & pull request", then "Merge").

Nothing below will work until `index.html` is sitting in the root of `main`.

---

## Part 1 — Turn on GitHub Pages

1. Go to the repository on github.com → **Settings** → **Pages**
   (left sidebar, under "Code and automation").
2. Under **Build and deployment → Source**, choose **Deploy from a branch**.
3. Set **Branch** to `main` and the folder to **`/ (root)`**. Press **Save**.
4. Wait 1–2 minutes, then reload the page. It will show a live URL like
   `https://ceceming.github.io/ecem.world/`. Open it — the drifting glyph and
   "coming soon" should be there. **Check this works before touching DNS.**

There is already a `CNAME` file in the repository containing `ecem.world`, so
GitHub will automatically fill in the **Custom domain** box as `ecem.world`.
If it is empty, type `ecem.world` in and press Save.

---

## Part 2 — Point GoDaddy at GitHub

In GoDaddy: **My Products** → find `ecem.world` → **DNS** (or "Manage DNS").
You are looking at a list of DNS records.

### Delete first

GoDaddy parks new domains on its own page. Delete these if they exist:

- any **A** record with name `@` pointing at a GoDaddy IP (often `Parked`)
- any **CNAME** record with name `www` pointing at something like
  `ecem.world.` or a GoDaddy host

Also check **Domain Settings → Forwarding** and remove any forwarding rule.
Forwarding silently overrides DNS and is the single most common reason a
GitHub Pages custom domain "doesn't work".

### Then add

Four **A** records, all with the name `@`:

| Type | Name | Value             | TTL    |
|------|------|-------------------|--------|
| A    | @    | `185.199.108.153` | 1 hour |
| A    | @    | `185.199.109.153` | 1 hour |
| A    | @    | `185.199.110.153` | 1 hour |
| A    | @    | `185.199.111.153` | 1 hour |

One **CNAME** so `www.ecem.world` works too:

| Type  | Name | Value                | TTL    |
|-------|------|----------------------|--------|
| CNAME | www  | `ceceming.github.io` | 1 hour |

> The CNAME value is your **GitHub username**, not the repository name, and it
> ends in a dot in some GoDaddy views — that is normal.

Optionally, also add four **AAAA** records on `@` for IPv6 visitors:
`2606:50c0:8000::153`, `2606:50c0:8001::153`, `2606:50c0:8002::153`,
`2606:50c0:8003::153`.

---

## Part 3 — Wait, then turn on HTTPS

DNS changes take anywhere from a few minutes to a few hours to spread.

1. After ~15 minutes, try `https://ecem.world`. If it does not load yet, that
   is expected — wait longer before changing anything.
2. Back in **Settings → Pages**, GitHub will show "DNS check in progress",
   then a green tick once it can see the records.
3. Once the tick appears, tick **Enforce HTTPS**. The certificate can take up
   to 24 hours to be issued; the checkbox stays greyed out until it is ready.

When Enforce HTTPS is on, `http://`, `www.`, and the `github.io` URL all
redirect to `https://ecem.world`.

---

## If something is wrong

**"Domain does not resolve to the GitHub Pages server"** — the A records are
missing, mistyped, or GoDaddy forwarding is still switched on. Re-check Part 2.

**The GoDaddy parked page still shows** — an old A record survived, or the
change simply has not propagated to you yet. Try it on mobile data with Wi-Fi
off, which uses a different DNS resolver.

**404 at `ecem.world`** — Pages is publishing a branch that has no
`index.html` at its root. Check Part 0 and Part 1 step 3.

**The page loads but the object is missing** — that is a WebGL problem, not a
DNS one; the words still show by design. See `README.md`.

**Changed the custom domain and it broke** — GitHub rewrites the `CNAME` file
in the repository when you edit that box. It should contain exactly one line:
`ecem.world`.
