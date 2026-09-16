# Guess that Graph ⛳

A golf-style math puzzle. A mystery curve is drawn at the top of the screen and its
equation sits below it with the numbers blanked out. Fill in the coefficients and
exponents, take a shot, and your guess is drawn over the target so you can compare.
Match it exactly to sink the hole. Eighteen holes, par 72, fewest strokes wins.

Live at **[graph.tryonlinux.com](https://graph.tryonlinux.com)**.

No build step, no dependencies, no framework — three static files served by a
Cloudflare Worker.

## Playing

| | |
|---|---|
| **A shot** | 1 stroke. Your curve is drawn in orange over the green target. |
| **Axis marks** | +1 stroke, once per hole. Turns on ticks, labels and the grid. |
| **Window** | +1 stroke, once per hole. Unlocks zoom, pan and scroll. |
| **Pick up** | Reveals the answer and scores par + 5. |
| **Off-list values** | Rejected for free — the hint line lists every legal value. |

Every hole opens with its curve automatically framed, which costs nothing; the window
assist is only charged when *you* change the view.

Scores are kept per browser in `localStorage`. There is no server and no account.

### Courses

- **Daily** — the same 18 holes for everyone on a given date, derived from the date itself.
- **Random** — a fresh course with a shareable code, e.g. `?c=K3F9QZ`.

## Layout

```
public/
  index.html    markup and dialogs
  game.js       holes, generation, scoring, canvas, persistence
  style.css     theming (light/dark), layout, scorecard
wrangler.jsonc  Cloudflare Worker static-asset config
```

## Running it

Any static file server pointed at `public/` works:

```sh
npx wrangler dev          # or: python3 -m http.server -d public 8765
```

## Deploying

```sh
npx wrangler deploy
```

The `routes` entry in `wrangler.jsonc` binds `graph.tryonlinux.com`, which requires
`tryonlinux.com` to be an active zone on the same Cloudflare account. Remove that
block to deploy to a `workers.dev` subdomain instead.

## How the holes work

Each of the 18 holes is a template plus a set of legal values per slot:

```js
{ name: 'The Bowl', par: 3, tpl: 'y = {a:c}x² + {c:k}',
  params: { a: pm(0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3), c: steps(-12, 12, 0.5) },
  f: (p, x) => p.a * x * x + p.c }
```

The template drives three things at once: the input boxes, the hint line, and the
revealed answer. Placeholder roles are `c` coefficient, `k` constant, `s` shift inside
`(x − h)`, `e` exponent.

A few details worth knowing before changing anything:

- **Answers are checked numerically**, by sampling both functions across the window
  rather than comparing parameters. Differently written but identical curves — a
  sign-flipped sine, permuted roots — count as correct.
- **Pools are enumerated, not sampled.** On first use a hole builds every playable
  combination, discards the ones no window can frame, and shuffles the rest with a
  fixed seed. Daily courses then walk that list with a stride coprime to its length,
  so a hole cannot repeat until its whole pool is exhausted. The smallest pool is
  just over 500, i.e. no repeated answer for at least 16 months.
- **Editing a hole's `params` changes past and future daily courses**, because the
  daily is derived from the pool rather than stored. Bump the `PREFIX` storage version
  in `game.js` when you do, so stale saved rounds are dropped instead of pointing at
  answers that no longer exist.
