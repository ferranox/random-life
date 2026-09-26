# Random Life

Generate a statistically plausible fictional person from anywhere on Earth.

Live site: https://random-life.ferranox.xyz/

## What it is

Press **Generate Random Life** to create an entirely fictional person - country, age, sex, urban/rural habitat, occupation, income estimate, life expectancy, access to electricity / water / sanitation / internet, and number of children - with probabilities that match real global distributions.

No backend. Static HTML/CSS/JS - works offline once loaded.

## How it works

- **Country** is picked at random, weighted by population.
- **Age** is drawn from age-band weights for the country's World Bank income group (low, lower-middle, upper-middle, high).
- **Urban vs. rural** follows the country's urbanisation rate.
- **Occupation** is sampled from an income-group- and habitat-weighted list, constrained by working age, with student/retirement shares varying by income group.
- **Income** is modelled from GDP per capita × occupation multiplier × age adjustment + log-normal noise. Order-of-magnitude estimate in nominal USD, not PPP.
- **Life expectancy** is the national average for the person's sex.
- **Electricity, water, sanitation, internet** are individualised from the national access rate (e.g. 63% access → 63% chance each).
- **Children** is drawn from the national fertility rate and adjusted for age — none under 18, completed family size approached by the mid-40s.

## Data sources

- **World Bank Open Data**- population, male/female life expectancy, urbanisation, GDP per capita, electricity, drinking water, sanitation, internet use, fertility rate.
- **UN Population Division** - informs the per-income-group age model.
- **ILO** - reference for employment categories and occupation mix.

When online, the app uses the latest available World Bank values for the above indicators and caches them for the session, falling back to built-in data when offline.

## Limitations

- Income is a modelled estimate, not PPP-adjusted.
- Age bands approximate broad income-group patterns, not each country's exact pyramid.
- Names are illustrative, grouped by broad cultural region.
- "Current" World Bank figures typically lag by 1–2 years.
- All generated people are entirely fictional.
