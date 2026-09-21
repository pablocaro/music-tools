# Fonts

## Sharphy Bold — licensed, and only for the wordmark

`Sharphy-Bold.woff2` is a commercial face from [atipo](https://atipofoundry.com)
(`info@atipo.es`), bought under their **webfont** licence. The terms, in full:

- Embeddable into **one (1) website**, unlimited pageviews, any browser.
- No renewal. Supplied as woff, woff2 and ttf; only the woff2 ships here.
- **No desktop installation.** Working with the fonts on a computer — opening
  them in a design tool, installing them as a system font — needs a separate
  desktop licence. Nobody has one.
- Broadcasting, app, game, enterprise and educational use are separate licences
  again.

What that means for this repo:

- **One website is Prima Vista.** `music-tools` may grow other tools; they do
  not inherit this licence. A second site using Sharphy needs a second licence.
- **A packaged app is not a website.** The `apple-mobile-web-app-capable` meta
  makes Prima Vista installable to a home screen, which is still a browser
  rendering a site. Wrapping it as a real app (Capacitor, a store listing)
  crosses into the app licence.
- **The repo is public**, so the binary is clonable as a file rather than only
  fetchable as a webfont. That is how every static-site deploy works and is
  normally tolerated, but it is the one part of this that the licence text does
  not explicitly describe. Unresolved by choice, not by oversight.

Used by exactly one rule in `style.css` — the "Prima Vista" wordmark, in the
header and on the onboarding card. It is deliberately not the body font: see
the comment above the `@font-face`.

## Rubik

`rubik.woff2` is the body face, under the SIL Open Font Licence — free to use,
modify and redistribute, including bundled like this.
