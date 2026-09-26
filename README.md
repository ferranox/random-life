# Random Life

Generate a statistically plausible fictional person from anywhere on Earth.

Live site: https://random-life.ferranox.xyz/

## What it is

Press **Generate Random Life** to create an entirely fictional person - country, age, sex, urban/rural habitat, occupation, income estimate, life expectancy, access to electricity / water / sanitation / internet, and number of children - with probabilities that match real global distributions.

No backend. Static HTML/CSS/JS - works offline once loaded.

## How it works

- **Country** - picked at random, weighted by population, so bigger countries turn up more often.
- **Age** - drawn from age bands fitted to the country's own share of children (0-14) and older people (65+), with the gaps filled in from its income-group pattern.
- **Urban vs. rural** - decided by the country's urbanisation rate.
- **Occupation** - sampled from a list weighted by income group and habitat, limited to plausible working ages, with student and retirement shares that differ by income group.
- **Income** - estimated from GDP per capita, an occupation multiplier, an age adjustment, plus some random variation. A rough figure in nominal USD, not PPP.
- **Life expectancy** - the national average for the person's sex.
- **Electricity, drinking water, sanitation, and internet** - the person either has it or not, drawn from the national rate (a country with 63% electricity access gives each person a 63% chance). The national rate is shown alongside.
- **Children** - drawn from the national fertility rate and adjusted for age: under-18s have none, and completed family size is approached by the mid-40s. The national average is shown alongside.

## Data sources

- **World Bank Open Data** - population, life expectancy (male and female), urbanisation, GDP per capita, electricity, drinking water, sanitation, internet use, fertility rate, and age structure (share aged 0-14 and 65+).
- **UN Population Division** - the age-structure figures rest on its World Population Prospects, and it informs the within-income-group age splits.
- **International Labour Organization (ILO)** - reference for the employment categories and occupation mix.

When online, the app uses the latest available World Bank values for the above indicators and caches them for the session, falling back to built-in data when offline.

## Limitations

- Income figures are rough estimates in nominal USD - not adjusted for local purchasing power (PPP).
- Within working-age bands, the age mix follows income-group patterns rather than the country's exact 5-year pyramid.
- Names are illustrative, grouped by broad cultural region, and are not exhaustive or country-specific.
- "Current" data reflects the most recently available World Bank figures, which typically lag by 1-2 years.
- All generated people are entirely fictional.
