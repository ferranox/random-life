# Random Life

Generate a statistically plausible fictional person from anywhere on Earth.

Live site: https://randomlife.fyi/

## What it is

Press **Generate** to create an entirely fictional person - country, age, sex, urban/rural habitat, occupation, income estimate, life expectancy, access to electricity / water / sanitation / internet, and number of children - with probabilities that match real global distributions.

No backend. Static HTML/CSS/JS - works offline once loaded.

## How it works

- **Country** - picked at random from all World Bank members (plus Taiwan), weighted by UN population (WPP 2024, 2023), so bigger countries turn up more often.
- **Sex** - drawn from the country's female share of the population (WPP).
- **Age** - drawn from the country's population at each single year of age, 0 to 100 (WPP; 100 means 100 or older). The distribution used is that of the person's sex, so ages differ by sex as in the real population. A country with no age data would use the older six-band approximation (fitted to its 0-14 and 65+ shares); currently only the Channel Islands do.
- **Urban vs. rural** - decided by the country's urban share under its own national definition (UN WUP 2025).
- **Occupation** - Random Life's own model: a list weighted by income group and habitat, refined per country by its employment mix (agriculture / industry / services) and unemployment rate (ILO), limited to plausible working ages, with student and retirement shares that differ by income group.
- **Income** - Random Life's own construction: GDP per capita (World Bank) multiplied by hand-built ratios and an age adjustment, plus some random variation. A rough figure in nominal USD, not PPP.
- **Life expectancy** - the national average at birth for the person's sex (WPP). A population average, not a prediction for an individual.
- **Electricity, drinking water, sanitation, and internet** - the person either has it or not, drawn from the national rate (a country with 63% electricity access gives each person a 63% chance). A national percentage is a probability, not a claim about any household.
- **Children** - drawn from the national total fertility rate (WPP) and adjusted for age: under-18s have none, and completed family size is approached by the mid-40s.

## Data sources

Official data and official modelled estimates (inputs):

| Used for | Source (dataset, release) | Reference year | Licence | How it reaches the browser |
|---|---|---|---|---|
| Population, female share, single-year age distributions by sex, total fertility rate, life expectancy at birth by sex | [UN DESA Population Division, World Population Prospects 2024](https://population.un.org/wpp/) (medium variant, including the January 2026 Togo interim update) | 2023 (1 July), the last year WPP labels an estimate | CC BY 3.0 IGO | built-in snapshot only |
| Urban share (national definitions) | [UN DESA Population Division, World Urbanization Prospects 2025](https://population.un.org/wup/) | 2023 (mid-year) | CC BY 3.0 IGO | built-in snapshot only |
| Employment by sector, unemployment rate | [ILOSTAT, ILO modelled estimates, November 2025](https://ilostat.ilo.org/) (`DF_EMP_2EMP_SEX_ECO_NB`, `DF_UNE_2EAP_SEX_AGE_RT`; ages 15+) | 2024 | CC BY 4.0 | built-in snapshot only |
| GDP per capita (current US$), electricity access, basic drinking water, basic sanitation, internet use, income group, region | [World Bank Open Data (WDI)](https://data.worldbank.org/) (`NY.GDP.PCAP.CD`, `EG.ELC.ACCS.ZS`, `SH.H2O.BASW.ZS`, `SH.STA.BASS.ZS`, `IT.NET.USER.ZS`) | newest value per country (within ten years) | CC BY 4.0 | live when online (cached 12 h), built-in snapshot as fallback |

The access and internet series are published by the World Bank from their originators: ITU (internet), WHO/UNICEF Joint Monitoring Programme (water, sanitation) and the SDG 7.1.1 electrification dataset (electricity).

Random Life's own modelling (hand-built assumptions, **not** official statistics): occupation probabilities, the income construction, dwelling-type tables, student and retired shares, the probability model for water / sanitation / electricity / internet, and the age rules for children. Official inputs do not make the generated outputs accurate for any real person.

Where a UN or ILO source has no value for a country, the matching World Bank series is used if it has one; otherwise the value is left empty and the generator's existing default behaviour applies. The fallbacks used are listed in `meta.fallbacks` and `meta.unavailable` at the top of `js/dataset.js`. Taiwan is not covered by the World Bank, so its GDP per capita and access figures are earlier hand-typed approximations (`meta.legacy`). Flags are derived from country codes and need no data source.

The UN and ILO data are bulk downloads that are revised every year or two (the UN's next revision is not due until July 2027), so the browser does not request them: they are built into the site as a compact snapshot (`js/dataset.js`, loaded before the app, which is why the first life can be generated with no network). Only the World Bank values are fetched live, and each of the six requests is validated and applied on its own; a request that fails, times out (20 s) or returns malformed data leaves that variable at its snapshot value.

Attribution: United Nations, Department of Economic and Social Affairs, Population Division (2024), World Population Prospects 2024, and (2025), World Urbanization Prospects 2025 (CC BY 3.0 IGO; reformatted and combined with other data, no endorsement by the UN implied). ILOSTAT, ILO modelled estimates, November 2025, (c) International Labour Organization, CC BY 4.0 (sector shares calculated by Random Life from ILO employment counts; not reviewed or endorsed by the ILO). World Bank, World Development Indicators, CC BY 4.0.

## Updating the data

The site works without ever running anything. To refresh the built-in snapshot (only when you want newer data), run the single command below from the project folder. It needs Python 3 and nothing else (standard library only; no packages, no build step):

```
python3 tools/update-data.py
```

It downloads each official source into a temporary directory (about 90 MB, streamed; it checks free disk space first), validates everything (schemas, indicator IDs, ranges, age distributions, country mapping), prints the fallback counts and an old-versus-new comparison, and replaces `js/dataset.js` only if every check passes. The temporary files are always deleted, also on failure; nothing downloaded is kept. `python3 tools/update-data.py --check` does the same without writing anything. `tools/country-map.json` maps each country to every source's codes and fixes the country list. The reference years (`WPP_YEAR`, `WUP_YEAR`, `ILO_YEAR`) are constants at the top of the script. After updating, bump `CACHE_NAME` in `sw.js` so installed copies pick up the new file.

Developer-side tests (not deployed; need Chromium or Chrome): `python3 tools/run-tests.py` (data validation, a 200,000-life statistical check, edge cases and loader tests in a sandbox with a seeded `Math.random`) and `python3 tools/browser-test.py` (offline first Generate, live World Bank data, per-variable fallback, service worker, `file://`).

## Limitations

- Income figures are rough estimates in nominal USD - not adjusted for local purchasing power (PPP).
- Population, age, fertility, life expectancy and urban figures refer to 2023, sector and unemployment figures to 2024, and World Bank values to the newest available year, which typically lags by 1-2 years.
- Some small territories lack values in some sources and show N/A.
- Names are illustrative, grouped by broad cultural region, and are not exhaustive or country-specific.
- All generated people are entirely fictional.
