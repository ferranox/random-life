# Random Life

Generate a statistically plausible fictional person from anywhere on Earth.

Live site: https://randomlife.fyi/

## What it is

Press **Generate Random Life** to create an entirely fictional person - country, age, sex, urban/rural habitat, occupation, income estimate, life expectancy, access to electricity / water / sanitation / internet, and number of children - with probabilities that match real global distributions.

No backend. Static HTML/CSS/JS - works offline once loaded.

## How it works

- **Country** - picked at random from all World Bank members (plus Taiwan), weighted by live population, so bigger countries turn up more often.
- **Sex** - drawn from the country's female share of the population.
- **Age** - drawn from age bands fitted to the country's own share of children (0-14) and older people (65+), with the gaps filled in from its income-group pattern.
- **Urban vs. rural** - decided by the country's urbanisation rate.
- **Occupation** - sampled from a list weighted by income group and habitat, refined per country by its employment mix (agriculture / industry / services) and unemployment rate, limited to plausible working ages, with student and retirement shares that differ by income group.
- **Income** - estimated from GDP per capita, an occupation multiplier, an age adjustment, plus some random variation. A rough figure in nominal USD, not PPP.
- **Life expectancy** - the national average at birth for the person's sex.
- **Electricity, drinking water, sanitation, and internet** - the person either has it or not, drawn from the national rate (a country with 63% electricity access gives each person a 63% chance).
- **Children** - drawn from the national fertility rate and adjusted for age: under-18s have none, and completed family size is approached by the mid-40s.

## Data sources

- **World Bank Open Data** - country list, income group, and region, plus population, life expectancy (male and female), urbanisation, GDP per capita, electricity, drinking water, sanitation, internet use, fertility rate, age structure (share aged 0-14 and 65+), sex split (female share), employment mix (agriculture / industry / services), and unemployment rate.
- **UN Population Division** - the age-structure figures rest on its World Population Prospects, and it informs the within-income-group age splits.
- **International Labour Organization (ILO)** - reference for the employment categories and occupation mix; the per-country sector shares and unemployment rates are its ILO-modelled estimates published via the World Bank.

When online, the app uses the latest available World Bank values for the above indicators and caches them for 12 hours, falling back to built-in data when offline. Flags are derived from country codes and need no data source.

## Shareable lives (seeded generation)

Every generated life has a permanent URL like `https://randomlife.fyi/life/v1/7f3a2c91`.
Opening it later, on any device, reproduces the exact same life. No backend or
database is involved: the 8-hex-char **seed** in the URL fully determines the life.

1. **How it works** - `createSeed()` (crypto-backed) makes a seed; `createSeededRng(seed)`
   (xmur3 + mulberry32 in `js/seed.js`, pure integer math so it is identical in every
   browser) builds a deterministic PRNG; `generateLife(seed)` in `js/generator.js` runs
   the normal generation algorithm using only that PRNG. All weighted picks, ages,
   incomes, names, etc. draw from it - the seeded path never touches `Math.random()`.
2. **The seed** - a 32-bit value rendered as 8 lowercase hex chars (e.g. `7f3a2c91`).
   `getLifeUrl(seed)` builds the canonical path; `parseLifeUrl()` validates URL input
   (invalid seeds are rejected, never executed).
3. **URL format** - `/life/v1/<seed>`. `v1` pins the generation algorithm/data version;
   future incompatible changes ship as `v2` with the v1 code kept, so old links survive.
4. **No backend needed** - generation is 100% client-side; the URL *is* the identifier.
   Nothing is stored anywhere (History/Saved lists are local browser state only).
5. **Local development** - `/life/v1/<seed>` has no physical file, so the dev server
   (`python3 dev-server.py 8000`, standard library only, dev-only, never used in
   production) serves `index.html` for those paths; the app then reads the pathname.
   Production needs the equivalent one-line Caddy fallback:
   `try_files {path} /index.html` (or `handle` + `try_files`) for `/life/*`.
6. **Introducing v2** - freeze the current algorithm/dataset behind the `v1` dispatch,
   add the new algorithm as `v2`, extend `SUPPORTED_VERSIONS`, and generate/share `v2`
   links. Reproducibility caveat: lives derive probabilities from the World Bank live
   dataset when available, so a seed is exactly reproducible given the same dataset;
   dataset revisions may shift probabilities slightly (the RNG sequence itself is stable).

## Static-asset versioning (read before deploying)

All local CSS/JS/manifest/icon URLs carry `?v=<N>` (currently 20), mirrored in the
service-worker's precache list. The HTML page and its scripts must always deploy as a
set: a new `index.html` paired with a stale cached `ui.js` once left the Share button
completely dead with no error. The version query makes that impossible - a new page
always fetches matching assets (browser, Cloudflare edge and service-worker caches all
key on the full URL). Rule: **whenever any static asset changes, bump the version in
`index.html`, `404.html` and `sw.js` (including `CACHE_NAME`) together.** As a backstop,
`App.checkScriptVersions()` warns loudly in `#data-status` (and hides Share) if scripts
ever do mix. After pushing, consider a one-time Cloudflare cache purge so the new
`index.html` (which references the new URLs) converges everywhere immediately.

## Limitations

- Income figures are rough estimates in nominal USD - not adjusted for local purchasing power (PPP).
- Within working-age bands, the age mix follows income-group patterns rather than the country's exact 5-year pyramid.
- Names are illustrative, grouped by broad cultural region, and are not exhaustive or country-specific.
- "Current" data reflects the most recently available World Bank figures, which typically lag by 1-2 years.
- All generated people are entirely fictional.
