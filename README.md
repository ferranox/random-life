# Random Life

Generate a statistically plausible fictional person from anywhere on Earth.

Live site: https://randomlife.fyi/

## What it is

Press **Generate** to create an entirely fictional person - country, age, sex, urban/rural habitat, occupation, income estimate, life expectancy, access to electricity / water / sanitation / internet, and number of children - with probabilities that match real global distributions.

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

## Limitations

- Income figures are rough estimates in nominal USD - not adjusted for local purchasing power (PPP).
- Within working-age bands, the age mix follows income-group patterns rather than the country's exact 5-year pyramid.
- Names are illustrative, grouped by broad cultural region, and are not exhaustive or country-specific.
- "Current" data reflects the most recently available World Bank figures, which typically lag by 1-2 years.
- All generated people are entirely fictional.
