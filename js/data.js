/* data.js - fallback dataset, world bank live fetcher, and model constants
 * Data sources (approximate 2023-2024 figures; age structure ~2025):
 *   - Population: World Bank SP.POP.TOTL / UN estimates
 *   - Income group: World Bank classification (L, LM, UM, H)
 *   - Life expectancy: World Bank SP.DYN.LE00.MA.IN / .FE.IN
 *   - Urbanisation: World Bank SP.URB.TOTL.IN.ZS
 *   - GDP per capita (USD): World Bank NY.GDP.PCAP.CD
 *   - Electricity access (%): World Bank EG.ELC.ACCS.ZS
 *   - Drinking water, at least basic (%): World Bank SH.H2O.BASW.ZS
 *   - Sanitation, at least basic (%): World Bank SH.STA.BASS.ZS
 *   - Internet use (%): World Bank IT.NET.USER.ZS
 *   - Fertility rate (births per woman): World Bank SP.DYN.TFRT.IN
 *   - Age structure (% ages 0-14 / 65+ of total): World Bank SP.POP.0014.TO.ZS /
 *     SP.POP.65UP.TO.ZS (UN World Population Prospects based, updated annually).
 *     Per-country young/old shares anchor the 6-band age model; within-band
 *     splits follow the income-group pattern. Taiwan (non-WB-member) keeps a
 *     static estimate and falls back to the income-group model.
 */
(function (global) {
  'use strict';
  var App = global.App = global.App || {};

  // 1. static fallback dataset
  var STATIC_COUNTRIES = [
    { code: 'IN', name: 'India', pop: 1428000000, incomeGroup: 'LM', leM: 70.5, leF: 73.6, urban: 36, gdpPc: 2411, elec: 100, water: 96, sanit: 83, net: 70, fert: 2.0, age014: 24.2, age65: 7.4, region: 'Asia', culture: 'south_asian', flag: '\uD83C\uDDEE\uD83C\uDDF3' },
    { code: 'CN', name: 'China', pop: 1412000000, incomeGroup: 'UM', leM: 75.0, leF: 80.5, urban: 64, gdpPc: 12720, elec: 100, water: 96, sanit: 97, net: 92, fert: 1.0, age014: 15.4, age65: 14.9, region: 'Asia', culture: 'east_asian', flag: '\uD83C\uDDE8\uD83C\uDDF3' },
    { code: 'US', name: 'United States', pop: 334000000, incomeGroup: 'H', leM: 74.8, leF: 80.2, urban: 83, gdpPc: 76399, elec: 100, water: 100, sanit: 100, net: 95, fert: 1.6, age014: 17.1, age65: 18.4, region: 'North America', culture: 'north_american_oceanian', flag: '\uD83C\uDDFA\uD83C\uDDF8' },
    { code: 'ID', name: 'Indonesia', pop: 277000000, incomeGroup: 'UM', leM: 66.2, leF: 70.9, urban: 58, gdpPc: 4788, elec: 100, water: 89, sanit: 88, net: 73, fert: 2.1, age014: 24.2, age65: 7.5, region: 'Asia', culture: 'southeast_asian', flag: '\uD83C\uDDEE\uD83C\uDDE9' },
    { code: 'PK', name: 'Pakistan', pop: 240000000, incomeGroup: 'LM', leM: 65.5, leF: 67.9, urban: 38, gdpPc: 1568, elec: 96, water: 91, sanit: 72, net: 57, fert: 3.5, age014: 36.2, age65: 4.4, region: 'Asia', culture: 'south_asian', flag: '\uD83C\uDDF5\uD83C\uDDF0' },
    { code: 'BR', name: 'Brazil', pop: 216000000, incomeGroup: 'UM', leM: 72.0, leF: 79.0, urban: 88, gdpPc: 8917, elec: 100, water: 100, sanit: 92, net: 85, fert: 1.6, age014: 19.4, age65: 11.5, region: 'South America', culture: 'latin_american', flag: '\uD83C\uDDE7\uD83C\uDDF7' },
    { code: 'NG', name: 'Nigeria', pop: 224000000, incomeGroup: 'LM', leM: 52.7, leF: 54.4, urban: 54, gdpPc: 2184, elec: 63, water: 82, sanit: 48, net: 41, fert: 4.4, age014: 40.5, age65: 3.1, region: 'Africa', culture: 'sub_saharan', flag: '\uD83C\uDDF3\uD83C\uDDEC' },
    { code: 'BD', name: 'Bangladesh', pop: 173000000, incomeGroup: 'LM', leM: 71.2, leF: 75.0, urban: 40, gdpPc: 2688, elec: 100, water: 99, sanit: 68, net: 53, fert: 2.1, age014: 27.6, age65: 6.7, region: 'Asia', culture: 'south_asian', flag: '\uD83C\uDDE7\uD83C\uDDE9' },
    { code: 'RU', name: 'Russia', pop: 144000000, incomeGroup: 'UM', leM: 66.0, leF: 76.4, urban: 75, gdpPc: 15271, elec: 100, water: 97, sanit: 92, net: 94, fert: 1.4, age014: 17.0, age65: 17.8, region: 'Europe', culture: 'slavic', flag: '\uD83C\uDDF7\uD83C\uDDFA' },
    { code: 'ET', name: 'Ethiopia', pop: 126000000, incomeGroup: 'L', leM: 63.0, leF: 67.0, urban: 22, gdpPc: 1028, elec: 57, water: 56, sanit: 10, net: 22, fert: 3.9, age014: 38.8, age65: 3.3, region: 'Africa', culture: 'sub_saharan', flag: '\uD83C\uDDEA\uD83C\uDDF9' },
    { code: 'MX', name: 'Mexico', pop: 128000000, incomeGroup: 'UM', leM: 72.0, leF: 78.0, urban: 81, gdpPc: 11497, elec: 100, water: 100, sanit: 93, net: 83, fert: 1.9, age014: 24.1, age65: 8.5, region: 'North America', culture: 'latin_american', flag: '\uD83C\uDDF2\uD83C\uDDFD' },
    { code: 'JP', name: 'Japan', pop: 124000000, incomeGroup: 'H', leM: 81.5, leF: 87.6, urban: 92, gdpPc: 33815, elec: 100, water: 99, sanit: 100, net: 86, fert: 1.1, age014: 11.2, age65: 30.0, region: 'Asia', culture: 'east_asian', flag: '\uD83C\uDDEF\uD83C\uDDF5' },
    { code: 'PH', name: 'Philippines', pop: 117000000, incomeGroup: 'LM', leM: 67.3, leF: 73.6, urban: 48, gdpPc: 3499, elec: 95, water: 96, sanit: 87, net: 67, fert: 1.9, age014: 27.1, age65: 5.7, region: 'Asia', culture: 'southeast_asian', flag: '\uD83C\uDDF5\uD83C\uDDED' },
    { code: 'CD', name: 'DR Congo', pop: 102000000, incomeGroup: 'L', leM: 58.0, leF: 61.5, urban: 46, gdpPc: 654, elec: 23, water: 36, sanit: 16, net: 20, fert: 6.0, age014: 45.9, age65: 3.1, region: 'Africa', culture: 'sub_saharan', flag: '\uD83C\uDDE8\uD83C\uDDE9' },
    { code: 'EG', name: 'Egypt', pop: 112000000, incomeGroup: 'LM', leM: 69.6, leF: 74.1, urban: 43, gdpPc: 3699, elec: 100, water: 97, sanit: 97, net: 75, fert: 2.7, age014: 31.6, age65: 5.3, region: 'Africa', culture: 'arab_middle_east', flag: '\uD83C\uDDEA\uD83C\uDDEC' },
    { code: 'DE', name: 'Germany', pop: 84000000, incomeGroup: 'H', leM: 78.7, leF: 83.5, urban: 78, gdpPc: 48718, elec: 100, water: 100, sanit: 99, net: 94, fert: 1.4, age014: 13.9, age65: 23.7, region: 'Europe', culture: 'west_european', flag: '\uD83C\uDDE9\uD83C\uDDEA' },
    { code: 'TZ', name: 'Tanzania', pop: 67000000, incomeGroup: 'LM', leM: 64.0, leF: 68.0, urban: 37, gdpPc: 1192, elec: 52, water: 65, sanit: 37, net: 31, fert: 4.5, age014: 42.3, age65: 3.0, region: 'Africa', culture: 'sub_saharan', flag: '\uD83C\uDDF9\uD83C\uDDFF' },
    { code: 'TR', name: 'Turkey', pop: 85000000, incomeGroup: 'UM', leM: 75.3, leF: 80.7, urban: 77, gdpPc: 10616, elec: 100, water: 96, sanit: 99, net: 90, fert: 1.5, age014: 21.0, age65: 10.6, region: 'Asia', culture: 'arab_middle_east', flag: '\uD83C\uDDF9\uD83C\uDDF7' },
    { code: 'TH', name: 'Thailand', pop: 72000000, incomeGroup: 'UM', leM: 73.5, leF: 81.0, urban: 53, gdpPc: 6909, elec: 100, water: 100, sanit: 99, net: 91, fert: 1.2, age014: 14.4, age65: 16.0, region: 'Asia', culture: 'southeast_asian', flag: '\uD83C\uDDF9\uD83C\uDDED' },
    { code: 'GB', name: 'United Kingdom', pop: 67000000, incomeGroup: 'H', leM: 79.0, leF: 82.9, urban: 84, gdpPc: 45850, elec: 100, water: 100, sanit: 99, net: 95, fert: 1.6, age014: 17.0, age65: 19.7, region: 'Europe', culture: 'west_european', flag: '\uD83C\uDDEC\uD83C\uDDE7' },
    { code: 'FR', name: 'France', pop: 68000000, incomeGroup: 'H', leM: 79.7, leF: 85.5, urban: 81, gdpPc: 40886, elec: 100, water: 100, sanit: 99, net: 89, fert: 1.6, age014: 16.2, age65: 22.5, region: 'Europe', culture: 'west_european', flag: '\uD83C\uDDEB\uD83C\uDDF7' },
    { code: 'KE', name: 'Kenya', pop: 55000000, incomeGroup: 'LM', leM: 61.0, leF: 66.0, urban: 29, gdpPc: 2099, elec: 77, water: 66, sanit: 41, net: 35, fert: 3.2, age014: 36.3, age65: 3.0, region: 'Africa', culture: 'sub_saharan', flag: '\uD83C\uDDF0\uD83C\uDDEA' },
    { code: 'IT', name: 'Italy', pop: 59000000, incomeGroup: 'H', leM: 81.0, leF: 85.4, urban: 71, gdpPc: 34776, elec: 100, water: 100, sanit: 100, net: 89, fert: 1.2, age014: 11.7, age65: 25.1, region: 'Europe', culture: 'west_european', flag: '\uD83C\uDDEE\uD83C\uDDF9' },
    { code: 'CO', name: 'Colombia', pop: 52000000, incomeGroup: 'UM', leM: 73.7, leF: 80.0, urban: 82, gdpPc: 6624, elec: 99, water: 97, sanit: 97, net: 79, fert: 1.6, age014: 20.0, age65: 10.2, region: 'South America', culture: 'latin_american', flag: '\uD83C\uDDE8\uD83C\uDDF4' },
    { code: 'ES', name: 'Spain', pop: 48000000, incomeGroup: 'H', leM: 80.7, leF: 86.2, urban: 81, gdpPc: 29674, elec: 100, water: 100, sanit: 100, net: 96, fert: 1.1, age014: 12.6, age65: 21.6, region: 'Europe', culture: 'west_european', flag: '\uD83C\uDDEA\uD83C\uDDF8' },
    { code: 'UG', name: 'Uganda', pop: 48000000, incomeGroup: 'L', leM: 61.0, leF: 66.0, urban: 26, gdpPc: 964, elec: 55, water: 63, sanit: 24, net: 9, fert: 4.2, age014: 43.1, age65: 2.2, region: 'Africa', culture: 'sub_saharan', flag: '\uD83C\uDDFA\uD83C\uDDEC' },
    { code: 'AR', name: 'Argentina', pop: 46000000, incomeGroup: 'UM', leM: 73.0, leF: 80.0, urban: 92, gdpPc: 13651, elec: 98, water: 99, sanit: 95, net: 90, fert: 1.5, age014: 21.0, age65: 12.6, region: 'South America', culture: 'latin_american', flag: '\uD83C\uDDE6\uD83C\uDDF7' },
    { code: 'DZ', name: 'Algeria', pop: 45000000, incomeGroup: 'LM', leM: 75.5, leF: 78.1, urban: 74, gdpPc: 4342, elec: 100, water: 92, sanit: 86, net: 77, fert: 2.7, age014: 29.9, age65: 6.8, region: 'Africa', culture: 'arab_middle_east', flag: '\uD83C\uDDE9\uD83C\uDDFF' },
    { code: 'SD', name: 'Sudan', pop: 48000000, incomeGroup: 'L', leM: 63.0, leF: 67.0, urban: 35, gdpPc: 1102, elec: 66, water: 65, sanit: 66, net: 19, fert: 4.3, age014: 40.2, age65: 3.4, region: 'Africa', culture: 'arab_middle_east', flag: '\uD83C\uDDF8\uD83C\uDDE9' },
    { code: 'IQ', name: 'Iraq', pop: 44000000, incomeGroup: 'UM', leM: 68.0, leF: 73.0, urban: 71, gdpPc: 5937, elec: 100, water: 98, sanit: 99, net: 82, fert: 3.2, age014: 36.0, age65: 3.4, region: 'Asia', culture: 'arab_middle_east', flag: '\uD83C\uDDEE\uD83C\uDDF6' },
    { code: 'AF', name: 'Afghanistan', pop: 42000000, incomeGroup: 'L', leM: 60.0, leF: 63.0, urban: 26, gdpPc: 356, elec: 88, water: 81, sanit: 55, net: 16, fert: 4.8, age014: 42.6, age65: 2.4, region: 'Asia', culture: 'south_asian', flag: '\uD83C\uDDE6\uD83C\uDDEB' },
    { code: 'PL', name: 'Poland', pop: 38000000, incomeGroup: 'H', leM: 73.5, leF: 81.4, urban: 60, gdpPc: 18688, elec: 100, water: 90, sanit: 99, net: 89, fert: 1.1, age014: 14.5, age65: 20.8, region: 'Europe', culture: 'east_european', flag: '\uD83C\uDDF5\uD83C\uDDF1' },
    { code: 'CA', name: 'Canada', pop: 40000000, incomeGroup: 'H', leM: 80.0, leF: 84.3, urban: 82, gdpPc: 55522, elec: 100, water: 98, sanit: 99, net: 94, fert: 1.2, age014: 15.0, age65: 20.3, region: 'North America', culture: 'north_american_oceanian', flag: '\uD83C\uDDE8\uD83C\uDDE6' },
    { code: 'MA', name: 'Morocco', pop: 37000000, incomeGroup: 'LM', leM: 76.0, leF: 78.5, urban: 64, gdpPc: 3527, elec: 100, water: 92, sanit: 88, net: 91, fert: 2.2, age014: 25.2, age65: 8.5, region: 'Africa', culture: 'arab_middle_east', flag: '\uD83C\uDDF2\uD83C\uDDE6' },
    { code: 'SA', name: 'Saudi Arabia', pop: 37000000, incomeGroup: 'H', leM: 76.0, leF: 79.5, urban: 84, gdpPc: 30436, elec: 100, water: 99, sanit: 98, net: 100, fert: 2.3, age014: 23.6, age65: 3.1, region: 'Asia', culture: 'arab_middle_east', flag: '\uD83C\uDDF8\uD83C\uDDE6' },
    { code: 'PE', name: 'Peru', pop: 34000000, incomeGroup: 'UM', leM: 74.0, leF: 79.5, urban: 78, gdpPc: 7126, elec: 97, water: 96, sanit: 79, net: 82, fert: 2.0, age014: 23.6, age65: 9.5, region: 'South America', culture: 'latin_american', flag: '\uD83C\uDDF5\uD83C\uDDEA' },
    { code: 'UZ', name: 'Uzbekistan', pop: 35000000, incomeGroup: 'LM', leM: 69.0, leF: 74.0, urban: 50, gdpPc: 2255, elec: 100, water: 97, sanit: 97, net: 90, fert: 3.5, age014: 31.3, age65: 6.1, region: 'Asia', culture: 'slavic', flag: '\uD83C\uDDFA\uD83C\uDDFF' },
    { code: 'MY', name: 'Malaysia', pop: 34000000, incomeGroup: 'UM', leM: 73.0, leF: 78.0, urban: 78, gdpPc: 11972, elec: 100, water: 98, sanit: 96, net: 98, fert: 1.5, age014: 21.3, age65: 8.0, region: 'Asia', culture: 'southeast_asian', flag: '\uD83C\uDDF2\uD83C\uDDFE' },
    { code: 'VE', name: 'Venezuela', pop: 28000000, incomeGroup: 'UM', leM: 68.0, leF: 76.0, urban: 88, gdpPc: 3474, elec: 100, water: 93, sanit: 98, net: 77, fert: 2.1, age014: 24.9, age65: 10.0, region: 'South America', culture: 'latin_american', flag: '\uD83C\uDDFB\uD83C\uDDEA' },
    { code: 'MZ', name: 'Mozambique', pop: 33000000, incomeGroup: 'L', leM: 57.0, leF: 63.0, urban: 38, gdpPc: 608, elec: 37, water: 67, sanit: 39, net: 21, fert: 4.7, age014: 44.2, age65: 2.7, region: 'Africa', culture: 'sub_saharan', flag: '\uD83C\uDDF2\uD83C\uDDFF' },
    { code: 'GH', name: 'Ghana', pop: 34000000, incomeGroup: 'LM', leM: 64.0, leF: 67.0, urban: 58, gdpPc: 2204, elec: 92, water: 90, sanit: 32, net: 72, fert: 3.3, age014: 35.4, age65: 3.8, region: 'Africa', culture: 'sub_saharan', flag: '\uD83C\uDDEC\uD83C\uDDED' },
    { code: 'YE', name: 'Yemen', pop: 34000000, incomeGroup: 'L', leM: 64.0, leF: 68.0, urban: 39, gdpPc: 617, elec: 86, water: 75, sanit: 63, net: 18, fert: 4.5, age014: 41.0, age65: 2.5, region: 'Asia', culture: 'arab_middle_east', flag: '\uD83C\uDDFE\uD83C\uDDEA' },
    { code: 'NP', name: 'Nepal', pop: 30000000, incomeGroup: 'LM', leM: 69.0, leF: 72.0, urban: 21, gdpPc: 1337, elec: 98, water: 94, sanit: 86, net: 46, fert: 2.0, age014: 28.1, age65: 6.6, region: 'Asia', culture: 'south_asian', flag: '\uD83C\uDDF3\uD83C\uDDF5' },
    { code: 'CM', name: 'Cameroon', pop: 28000000, incomeGroup: 'LM', leM: 59.0, leF: 62.0, urban: 58, gdpPc: 1667, elec: 72, water: 71, sanit: 47, net: 46, fert: 4.3, age014: 41.1, age65: 2.8, region: 'Africa', culture: 'sub_saharan', flag: '\uD83C\uDDE8\uD83C\uDDF2' },
    { code: 'CI', name: "Cote d'Ivoire", pop: 28000000, incomeGroup: 'LM', leM: 59.0, leF: 62.0, urban: 52, gdpPc: 2549, elec: 73, water: 77, sanit: 40, net: 41, fert: 4.2, age014: 40.5, age65: 2.7, region: 'Africa', culture: 'sub_saharan', flag: '\uD83C\uDDE8\uD83C\uDDEE' },
    { code: 'AU', name: 'Australia', pop: 26000000, incomeGroup: 'H', leM: 81.3, leF: 85.4, urban: 86, gdpPc: 65100, elec: 100, water: 100, sanit: 100, net: 96, fert: 1.5, age014: 17.7, age65: 18.1, region: 'Oceania', culture: 'north_american_oceanian', flag: '\uD83C\uDDE6\uD83C\uDDFA' },
    { code: 'NE', name: 'Niger', pop: 26000000, incomeGroup: 'L', leM: 60.0, leF: 63.0, urban: 17, gdpPc: 590, elec: 21, water: 53, sanit: 16, net: 16, fert: 5.9, age014: 46.2, age65: 2.6, region: 'Africa', culture: 'sub_saharan', flag: '\uD83C\uDDF3\uD83C\uDDEA' },
    { code: 'TW', name: 'Taiwan', pop: 24000000, incomeGroup: 'H', leM: 77.0, leF: 84.0, urban: 80, gdpPc: 32800, elec: 100, water: 100, sanit: 100, net: 90, fert: 1.1, age014: null, age65: null, region: 'Asia', culture: 'east_asian', flag: '\uD83C\uDDF9\uD83C\uDDFC' },
    { code: 'ML', name: 'Mali', pop: 23000000, incomeGroup: 'L', leM: 58.0, leF: 60.0, urban: 45, gdpPc: 833, elec: 50, water: 86, sanit: 48, net: 37, fert: 5.5, age014: 45.8, age65: 2.4, region: 'Africa', culture: 'sub_saharan', flag: '\uD83C\uDDF2\uD83C\uDDF1' },
    { code: 'BF', name: 'Burkina Faso', pop: 23000000, incomeGroup: 'L', leM: 58.0, leF: 61.0, urban: 32, gdpPc: 893, elec: 34, water: 50, sanit: 32, net: 28, fert: 4.1, age014: 41.2, age65: 2.7, region: 'Africa', culture: 'sub_saharan', flag: '\uD83C\uDDE7\uD83C\uDDEB' },
    { code: 'MW', name: 'Malawi', pop: 21000000, incomeGroup: 'L', leM: 61.0, leF: 67.0, urban: 18, gdpPc: 645, elec: 16, water: 73, sanit: 49, net: 19, fert: 3.6, age014: 40.1, age65: 2.6, region: 'Africa', culture: 'sub_saharan', flag: '\uD83C\uDDF2\uD83C\uDDFC' },
    { code: 'SY', name: 'Syria', pop: 23000000, incomeGroup: 'L', leM: 68.0, leF: 76.0, urban: 55, gdpPc: 925, elec: 89, water: 94, sanit: 96, net: 34, fert: 2.7, age014: 28.4, age65: 4.8, region: 'Asia', culture: 'arab_middle_east', flag: '\uD83C\uDDF8\uD83C\uDDFE' },
    { code: 'ZW', name: 'Zimbabwe', pop: 16000000, incomeGroup: 'LM', leM: 59.0, leF: 64.0, urban: 32, gdpPc: 1592, elec: 62, water: 67, sanit: 35, net: 42, fert: 3.7, age014: 40.3, age65: 3.6, region: 'Africa', culture: 'sub_saharan', flag: '\uD83C\uDDFF\uD83C\uDDFC' },
    { code: 'RO', name: 'Romania', pop: 19000000, incomeGroup: 'H', leM: 71.0, leF: 79.0, urban: 54, gdpPc: 15787, elec: 100, water: 100, sanit: 91, net: 91, fert: 1.4, age014: 15.6, age65: 20.1, region: 'Europe', culture: 'east_european', flag: '\uD83C\uDDF7\uD83C\uDDF4' },
    { code: 'VN', name: 'Vietnam', pop: 98000000, incomeGroup: 'LM', leM: 71.0, leF: 79.0, urban: 39, gdpPc: 4164, elec: 100, water: 99, sanit: 95, net: 84, fert: 1.9, age014: 22.9, age65: 9.5, region: 'Asia', culture: 'southeast_asian', flag: '\uD83C\uDDFB\uD83C\uDDF3' },
    { code: 'KR', name: 'South Korea', pop: 52000000, incomeGroup: 'H', leM: 80.3, leF: 86.1, urban: 81, gdpPc: 32255, elec: 100, water: 100, sanit: 100, net: 98, fert: 0.7, age014: 10.2, age65: 20.3, region: 'Asia', culture: 'east_asian', flag: '\uD83C\uDDF0\uD83C\uDDF7' },
    { code: 'MM', name: 'Myanmar', pop: 54000000, incomeGroup: 'LM', leM: 64.0, leF: 70.0, urban: 32, gdpPc: 1187, elec: 80, water: 86, sanit: 74, net: 45, fert: 2.1, age014: 24.1, age65: 7.5, region: 'Asia', culture: 'southeast_asian', flag: '\uD83C\uDDF2\uD83C\uDDF2' },
    { code: 'ZA', name: 'South Africa', pop: 60000000, incomeGroup: 'UM', leM: 62.0, leF: 68.0, urban: 68, gdpPc: 6776, elec: 90, water: 90, sanit: 77, net: 78, fert: 2.2, age014: 25.7, age65: 6.9, region: 'Africa', culture: 'sub_saharan', flag: '\uD83C\uDDFF\uD83C\uDDE6' },
    { code: 'IR', name: 'Iran', pop: 89000000, incomeGroup: 'LM', leM: 75.0, leF: 78.0, urban: 76, gdpPc: 4388, elec: 100, water: 98, sanit: 91, net: 85, fert: 1.7, age014: 22.0, age65: 8.6, region: 'Asia', culture: 'arab_middle_east', flag: '\uD83C\uDDEE\uD83C\uDDF7' },
    { code: 'UA', name: 'Ukraine', pop: 38000000, incomeGroup: 'LM', leM: 67.0, leF: 77.0, urban: 70, gdpPc: 4534, elec: 100, water: 93, sanit: 98, net: 82, fert: 1.0, age014: 13.7, age65: 19.0, region: 'Europe', culture: 'slavic', flag: '\uD83C\uDDFA\uD83C\uDDE6' },
    { code: 'AO', name: 'Angola', pop: 36000000, incomeGroup: 'LM', leM: 59.0, leF: 65.0, urban: 68, gdpPc: 3000, elec: 56, water: 68, sanit: 50, net: 41, fert: 5.0, age014: 44.1, age65: 2.9, region: 'Africa', culture: 'sub_saharan', flag: '\uD83C\uDDE6\uD83C\uDDF4' },
    { code: 'CL', name: 'Chile', pop: 20000000, incomeGroup: 'H', leM: 78.0, leF: 82.0, urban: 88, gdpPc: 15355, elec: 99, water: 99, sanit: 100, net: 96, fert: 1.1, age014: 16.5, age65: 14.6, region: 'South America', culture: 'latin_american', flag: '\uD83C\uDDE8\uD83C\uDDF1' },
    { code: 'KZ', name: 'Kazakhstan', pop: 20000000, incomeGroup: 'UM', leM: 69.0, leF: 77.0, urban: 58, gdpPc: 11244, elec: 100, water: 98, sanit: 98, net: 93, fert: 3.0, age014: 29.1, age65: 9.0, region: 'Asia', culture: 'slavic', flag: '\uD83C\uDDF0\uD83C\uDDFF' },
    { code: 'ZM', name: 'Zambia', pop: 20000000, incomeGroup: 'LM', leM: 60.0, leF: 66.0, urban: 46, gdpPc: 1487, elec: 54, water: 73, sanit: 37, net: 17, fert: 4.0, age014: 41.0, age65: 2.0, region: 'Africa', culture: 'sub_saharan', flag: '\uD83C\uDDFF\uD83C\uDDF2' },
    { code: 'SN', name: 'Senegal', pop: 18000000, incomeGroup: 'LM', leM: 66.0, leF: 70.0, urban: 49, gdpPc: 1637, elec: 83, water: 88, sanit: 63, net: 60, fert: 3.8, age014: 37.7, age65: 3.6, region: 'Africa', culture: 'sub_saharan', flag: '\uD83C\uDDF8\uD83C\uDDF3' },
    { code: 'GT', name: 'Guatemala', pop: 18000000, incomeGroup: 'UM', leM: 69.0, leF: 75.0, urban: 53, gdpPc: 5473, elec: 91, water: 93, sanit: 71, net: 60, fert: 2.3, age014: 31.0, age65: 5.0, region: 'North America', culture: 'latin_american', flag: '\uD83C\uDDEC\uD83C\uDDF9' },
    { code: 'BO', name: 'Bolivia', pop: 12000000, incomeGroup: 'LM', leM: 67.0, leF: 72.0, urban: 70, gdpPc: 3600, elec: 97, water: 93, sanit: 72, net: 80, fert: 2.5, age014: 29.4, age65: 5.7, region: 'South America', culture: 'latin_american', flag: '\uD83C\uDDE7\uD83C\uDDF4' },
    { code: 'HT', name: 'Haiti', pop: 12000000, incomeGroup: 'L', leM: 62.0, leF: 67.0, urban: 58, gdpPc: 1748, elec: 54, water: 73, sanit: 29, net: 48, fert: 2.6, age014: 30.8, age65: 4.8, region: 'North America', culture: 'latin_american', flag: '\uD83C\uDDED\uD83C\uDDF9' },
    { code: 'EC', name: 'Ecuador', pop: 18000000, incomeGroup: 'UM', leM: 74.0, leF: 79.0, urban: 64, gdpPc: 6391, elec: 99, water: 92, sanit: 91, net: 77, fert: 1.8, age014: 23.9, age65: 8.6, region: 'South America', culture: 'latin_american', flag: '\uD83C\uDDEA\uD83C\uDDE8' },
    { code: 'KH', name: 'Cambodia', pop: 17000000, incomeGroup: 'LM', leM: 68.0, leF: 73.0, urban: 25, gdpPc: 1785, elec: 99, water: 83, sanit: 83, net: 69, fert: 2.5, age014: 29.5, age65: 6.4, region: 'Asia', culture: 'southeast_asian', flag: '\uD83C\uDDF0\uD83C\uDDED' },
    { code: 'HN', name: 'Honduras', pop: 10000000, incomeGroup: 'LM', leM: 72.0, leF: 77.0, urban: 59, gdpPc: 3040, elec: 96, water: 96, sanit: 88, net: 59, fert: 2.5, age014: 30.3, age65: 4.5, region: 'North America', culture: 'latin_american', flag: '\uD83C\uDDED\uD83C\uDDF3' },
    { code: 'PG', name: 'Papua New Guinea', pop: 10000000, incomeGroup: 'LM', leM: 63.0, leF: 67.0, urban: 13, gdpPc: 2673, elec: 43, water: 53, sanit: 24, net: 19, fert: 3.1, age014: 33.1, age65: 3.6, region: 'Oceania', culture: 'southeast_asian', flag: '\uD83C\uDDF5\uD83C\uDDEC' },
    { code: 'RW', name: 'Rwanda', pop: 14000000, incomeGroup: 'L', leM: 67.0, leF: 71.0, urban: 18, gdpPc: 966, elec: 72, water: 61, sanit: 81, net: 32, fert: 3.6, age014: 37.0, age65: 4.0, region: 'Africa', culture: 'sub_saharan', flag: '\uD83C\uDDF7\uD83C\uDDFC' },
    { code: 'BJ', name: 'Benin', pop: 13000000, incomeGroup: 'LM', leM: 59.0, leF: 62.0, urban: 49, gdpPc: 1428, elec: 59, water: 70, sanit: 22, net: 34, fert: 4.5, age014: 41.3, age65: 3.2, region: 'Africa', culture: 'sub_saharan', flag: '\uD83C\uDDE7\uD83C\uDDEF' },
    { code: 'TN', name: 'Tunisia', pop: 12000000, incomeGroup: 'LM', leM: 74.0, leF: 78.0, urban: 70, gdpPc: 3807, elec: 100, water: 97, sanit: 99, net: 77, fert: 1.8, age014: 23.6, age65: 9.9, region: 'Africa', culture: 'arab_middle_east', flag: '\uD83C\uDDF9\uD83C\uDDF3' },
    { code: 'SO', name: 'Somalia', pop: 18000000, incomeGroup: 'L', leM: 55.0, leF: 59.0, urban: 47, gdpPc: 592, elec: 54, water: 75, sanit: 44, net: 28, fert: 6.0, age014: 46.6, age65: 2.6, region: 'Africa', culture: 'sub_saharan', flag: '\uD83C\uDDF8\uD83C\uDDF4' },
    { code: 'PT', name: 'Portugal', pop: 10000000, incomeGroup: 'H', leM: 78.0, leF: 84.0, urban: 67, gdpPc: 24540, elec: 100, water: 99, sanit: 100, net: 89, fert: 1.4, age014: 12.7, age65: 24.9, region: 'Europe', culture: 'west_european', flag: '\uD83C\uDDF5\uD83C\uDDF9' },
    { code: 'CZ', name: 'Czechia', pop: 11000000, incomeGroup: 'H', leM: 76.0, leF: 82.0, urban: 74, gdpPc: 27638, elec: 100, water: 99, sanit: 99, net: 88, fert: 1.4, age014: 15.1, age65: 21.2, region: 'Europe', culture: 'east_european', flag: '\uD83C\uDDE8\uD83C\uDDFF' },
    { code: 'GR', name: 'Greece', pop: 10000000, incomeGroup: 'H', leM: 79.0, leF: 84.0, urban: 80, gdpPc: 20867, elec: 100, water: 100, sanit: 99, net: 86, fert: 1.2, age014: 12.9, age65: 24.4, region: 'Europe', culture: 'west_european', flag: '\uD83C\uDDEC\uD83C\uDDF7' },
    { code: 'JO', name: 'Jordan', pop: 11000000, incomeGroup: 'UM', leM: 73.0, leF: 77.0, urban: 92, gdpPc: 4483, elec: 100, water: 99, sanit: 96, net: 96, fert: 2.6, age014: 30.2, age65: 4.8, region: 'Asia', culture: 'arab_middle_east', flag: '\uD83C\uDDEF\uD83C\uDDF4' },
    { code: 'BE', name: 'Belgium', pop: 12000000, incomeGroup: 'H', leM: 79.0, leF: 84.0, urban: 98, gdpPc: 49927, elec: 100, water: 100, sanit: 100, net: 96, fert: 1.4, age014: 15.7, age65: 21.0, region: 'Europe', culture: 'west_european', flag: '\uD83C\uDDE7\uD83C\uDDEA' },
    { code: 'NL', name: 'Netherlands', pop: 18000000, incomeGroup: 'H', leM: 80.0, leF: 83.0, urban: 93, gdpPc: 55985, elec: 100, water: 100, sanit: 98, net: 97, fert: 1.4, age014: 14.9, age65: 20.9, region: 'Europe', culture: 'west_european', flag: '\uD83C\uDDF3\uD83C\uDDF1' },
    { code: 'SE', name: 'Sweden', pop: 10000000, incomeGroup: 'H', leM: 81.0, leF: 85.0, urban: 88, gdpPc: 56424, elec: 100, water: 100, sanit: 99, net: 96, fert: 1.4, age014: 16.7, age65: 20.9, region: 'Europe', culture: 'west_european', flag: '\uD83C\uDDF8\uD83C\uDDEA' },
    { code: 'CH', name: 'Switzerland', pop: 9000000, incomeGroup: 'H', leM: 82.0, leF: 86.0, urban: 74, gdpPc: 92434, elec: 100, water: 100, sanit: 100, net: 97, fert: 1.3, age014: 14.9, age65: 20.4, region: 'Europe', culture: 'west_european', flag: '\uD83C\uDDE8\uD83C\uDDED' },
    { code: 'AT', name: 'Austria', pop: 9000000, incomeGroup: 'H', leM: 79.0, leF: 84.0, urban: 59, gdpPc: 52085, elec: 100, water: 100, sanit: 100, net: 92, fert: 1.3, age014: 14.1, age65: 21.1, region: 'Europe', culture: 'west_european', flag: '\uD83C\uDDE6\uD83C\uDDF9' },
    { code: 'IL', name: 'Israel', pop: 9700000, incomeGroup: 'H', leM: 81.0, leF: 85.0, urban: 93, gdpPc: 54930, elec: 100, water: 100, sanit: 100, net: 88, fert: 2.9, age014: 27.2, age65: 12.7, region: 'Asia', culture: 'arab_middle_east', flag: '\uD83C\uDDEE\uD83C\uDDF1' },
    { code: 'NO', name: 'Norway', pop: 5500000, incomeGroup: 'H', leM: 81.0, leF: 84.0, urban: 83, gdpPc: 106149, elec: 100, water: 100, sanit: 98, net: 99, fert: 1.4, age014: 15.9, age65: 19.1, region: 'Europe', culture: 'west_european', flag: '\uD83C\uDDF3\uD83C\uDDF4' },
    { code: 'AE', name: 'United Arab Emirates', pop: 9400000, incomeGroup: 'H', leM: 78.0, leF: 80.0, urban: 87, gdpPc: 53708, elec: 100, water: 100, sanit: 99, net: 100, fert: 1.2, age014: 16.0, age65: 1.8, region: 'Asia', culture: 'arab_middle_east', flag: '\uD83C\uDDE6\uD83C\uDDEA' },
    { code: 'SG', name: 'Singapore', pop: 5900000, incomeGroup: 'H', leM: 81.0, leF: 86.0, urban: 100, gdpPc: 82807, elec: 100, water: 100, sanit: 100, net: 94, fert: 1.0, age014: 11.7, age65: 14.2, region: 'Asia', culture: 'east_asian', flag: '\uD83C\uDDF8\uD83C\uDDEC' }
  ];

  // 2. model constants: age bands/weights
  var AGE_BANDS = [
    { min: 0, max: 4 },
    { min: 5, max: 14 },
    { min: 15, max: 24 },
    { min: 25, max: 54 },
    { min: 55, max: 64 },
    { min: 65, max: 100 }
  ];

  var AGE_WEIGHTS = {
    L: [0.150, 0.225, 0.195, 0.285, 0.080, 0.065],
    LM: [0.115, 0.195, 0.185, 0.330, 0.090, 0.085],
    UM: [0.080, 0.145, 0.150, 0.385, 0.125, 0.115],
    H: [0.050, 0.115, 0.115, 0.375, 0.145, 0.200]
  };

  // 3. occupations
  var OCCUPATIONS = [
    // Agriculture
    { id: 'subsistence_farmer', name: 'Subsistence farmer', icon: '\uD83C\uDF3E', category: 'Agriculture', minAge: 15, maxAge: 74, weights: { L: 35, LM: 18, UM: 5, H: 0 }, incomeRatio: [0.12, 0.35], habitat: 'rural' },
    { id: 'commercial_farmer', name: 'Commercial farmer', icon: '\uD83D\uDE9C', category: 'Agriculture', minAge: 20, maxAge: 69, weights: { L: 6, LM: 8, UM: 5, H: 3 }, incomeRatio: [0.45, 1.00], habitat: 'rural' },
    { id: 'fisherman', name: 'Fisher', icon: '\uD83C\uDFA3', category: 'Agriculture', minAge: 16, maxAge: 64, weights: { L: 3, LM: 4, UM: 2, H: 1 }, incomeRatio: [0.20, 0.65], habitat: null },
    { id: 'herder', name: 'Pastoralist / herder', icon: '\uD83D\uDC04', category: 'Agriculture', minAge: 12, maxAge: 65, weights: { L: 5, LM: 3, UM: 1, H: 0 }, incomeRatio: [0.10, 0.30], habitat: 'rural' },
    // Industry
    { id: 'factory_worker', name: 'Factory worker', icon: '\uD83C\uDFED', category: 'Industry', minAge: 16, maxAge: 64, weights: { L: 4, LM: 12, UM: 10, H: 4 }, incomeRatio: [0.50, 1.00], habitat: 'urban' },
    { id: 'construction_worker', name: 'Construction worker', icon: '\uD83D\uDC77', category: 'Industry', minAge: 18, maxAge: 60, weights: { L: 5, LM: 8, UM: 8, H: 4 }, incomeRatio: [0.40, 0.90], habitat: null },
    { id: 'mine_worker', name: 'Mine worker', icon: '\u26CF\uFE0F', category: 'Industry', minAge: 18, maxAge: 55, weights: { L: 2, LM: 3, UM: 2, H: 1 }, incomeRatio: [0.50, 1.00], habitat: 'rural' },
    // Services (low)
    { id: 'domestic_worker', name: 'Domestic worker', icon: '\uD83E\uDDF9', category: 'Services', minAge: 15, maxAge: 60, weights: { L: 5, LM: 6, UM: 3, H: 1 }, incomeRatio: [0.12, 0.35], habitat: 'urban' },
    { id: 'street_vendor', name: 'Street vendor / hawker', icon: '\uD83D\uDED2', category: 'Services', minAge: 15, maxAge: 65, weights: { L: 8, LM: 7, UM: 3, H: 0 }, incomeRatio: [0.10, 0.30], habitat: 'urban' },
    { id: 'driver', name: 'Driver (taxi / truck / auto)', icon: '\uD83D\uDE95', category: 'Services', minAge: 20, maxAge: 65, weights: { L: 3, LM: 5, UM: 5, H: 3 }, incomeRatio: [0.40, 0.85], habitat: null },
    { id: 'retail_worker', name: 'Retail / shop worker', icon: '\uD83D\uDECD\uFE0F', category: 'Services', minAge: 16, maxAge: 65, weights: { L: 2, LM: 5, UM: 7, H: 6 }, incomeRatio: [0.45, 0.90], habitat: 'urban' },
    { id: 'food_service', name: 'Food service / restaurant worker', icon: '\uD83C\uDF7D\uFE0F', category: 'Services', minAge: 16, maxAge: 60, weights: { L: 2, LM: 4, UM: 5, H: 5 }, incomeRatio: [0.40, 0.80], habitat: 'urban' },
    { id: 'market_trader', name: 'Market trader', icon: '\uD83C\uDFEA', category: 'Services', minAge: 18, maxAge: 65, weights: { L: 5, LM: 6, UM: 3, H: 1 }, incomeRatio: [0.20, 0.60], habitat: null },
    // Services (mid)
    { id: 'security_guard', name: 'Security guard / police officer', icon: '\uD83D\uDEE1\uFE0F', category: 'Services', minAge: 20, maxAge: 60, weights: { L: 2, LM: 3, UM: 3, H: 2 }, incomeRatio: [0.50, 0.95], habitat: null },
    { id: 'office_worker', name: 'Office worker / administrator', icon: '\uD83D\uDCBC', category: 'Services', minAge: 20, maxAge: 65, weights: { L: 1, LM: 4, UM: 7, H: 7 }, incomeRatio: [0.70, 1.30], habitat: 'urban' },
    { id: 'government_worker', name: 'Government employee', icon: '\uD83C\uDFDB\uFE0F', category: 'Public sector', minAge: 22, maxAge: 65, weights: { L: 2, LM: 4, UM: 4, H: 4 }, incomeRatio: [0.80, 1.50], habitat: null },
    { id: 'teacher', name: 'Teacher', icon: '\uD83D\uDCDA', category: 'Education', minAge: 22, maxAge: 65, weights: { L: 3, LM: 5, UM: 5, H: 5 }, incomeRatio: [0.65, 1.30], habitat: null },
    { id: 'nurse', name: 'Nurse / healthcare worker', icon: '\uD83C\uDFE5', category: 'Health', minAge: 22, maxAge: 65, weights: { L: 1, LM: 3, UM: 4, H: 5 }, incomeRatio: [0.75, 1.50], habitat: 'urban' },
    { id: 'small_business_owner', name: 'Small business owner', icon: '\uD83C\uDFE2', category: 'Business', minAge: 20, maxAge: 70, weights: { L: 3, LM: 4, UM: 5, H: 4 }, incomeRatio: [0.50, 2.50], habitat: null },
    // Professional
    { id: 'engineer', name: 'Engineer', icon: '\u2699\uFE0F', category: 'Professional', minAge: 23, maxAge: 65, weights: { L: 0, LM: 2, UM: 4, H: 6 }, incomeRatio: [1.20, 2.80], habitat: 'urban' },
    { id: 'doctor', name: 'Doctor / physician', icon: '\uD83D\uDC68\u200D\u2695\uFE0F', category: 'Health', minAge: 27, maxAge: 68, weights: { L: 0, LM: 1, UM: 2, H: 3 }, incomeRatio: [2.20, 5.50], habitat: 'urban' },
    { id: 'it_professional', name: 'IT / software professional', icon: '\uD83D\uDCBB', category: 'Professional', minAge: 22, maxAge: 55, weights: { L: 0, LM: 1, UM: 3, H: 6 }, incomeRatio: [1.50, 4.50], habitat: 'urban' },
    { id: 'business_professional', name: 'Business / finance professional', icon: '\uD83D\uDCCA', category: 'Business', minAge: 24, maxAge: 65, weights: { L: 0, LM: 1, UM: 3, H: 5 }, incomeRatio: [1.40, 4.00], habitat: 'urban' },
    { id: 'lawyer', name: 'Lawyer', icon: '\u2696\uFE0F', category: 'Professional', minAge: 25, maxAge: 68, weights: { L: 0, LM: 1, UM: 2, H: 3 }, incomeRatio: [1.50, 5.00], habitat: 'urban' },
    { id: 'artist_creative', name: 'Artist / creative professional', icon: '\uD83C\uDFA8', category: 'Creative', minAge: 18, maxAge: 65, weights: { L: 1, LM: 2, UM: 3, H: 3 }, incomeRatio: [0.40, 2.00], habitat: null },
    { id: 'craftsperson', name: 'Craftsperson / artisan', icon: '\uD83D\uDD28', category: 'Crafts', minAge: 18, maxAge: 65, weights: { L: 4, LM: 5, UM: 3, H: 2 }, incomeRatio: [0.30, 0.80], habitat: null },
    // Non-working
    { id: 'unemployed', name: 'Unemployed (seeking work)', icon: '\uD83D\uDCCB', category: 'Not employed', minAge: 16, maxAge: 65, weights: { L: 4, LM: 5, UM: 4, H: 3 }, incomeRatio: [0, 0.05], habitat: null },
    { id: 'homemaker', name: 'Homemaker / unpaid carer', icon: '\uD83C\uDFE0', category: 'Not employed', minAge: 18, maxAge: 70, weights: { L: 12, LM: 9, UM: 5, H: 3 }, incomeRatio: [0, 0], habitat: null }
  ];

  // 4. habitation definitions (by income group)
  var HABITATION = {
    rural: {
      L: [['Mud / earthen home', 45], ['Basic rural house', 35], ['Traditional village house', 20]],
      LM: [['Basic rural house', 40], ['Traditional village house', 35], ['Small concrete house', 25]],
      UM: [['Rural farmhouse', 35], ['Village house', 40], ['Modest rural home', 25]],
      H: [['Farmhouse', 35], ['Rural / suburban house', 45], ['Country home', 20]]
    },
    urban: {
      L: [['Informal settlement / slum', 50], ['Overcrowded shared room', 30], ['Basic urban dwelling', 20]],
      LM: [['Informal settlement', 25], ['Shared rented room', 30], ['Basic apartment', 35], ['Modest house', 10]],
      UM: [['Small apartment', 30], ['Standard apartment', 35], ['Townhouse / row house', 20], ['Suburban house', 15]],
      H: [['Standard apartment', 20], ['Modern apartment', 30], ['Suburban house', 25], ['Detached house', 20], ['Large family home', 5]]
    }
  };

  // 5. reactive data load status + loaders
  var DATA_LOAD_STATUS = { source: 'static', message: 'Using built-in data', loading: false };
  var _countries = STATIC_COUNTRIES.slice();
  var CACHE_KEY = 'randomLife.countries.v4';
  var CACHE_TTL = 1000 * 60 * 60 * 12; // 12 hours

  var WB_INDICATORS = {
    pop: 'SP.POP.TOTL',
    leM: 'SP.DYN.LE00.MA.IN',
    leF: 'SP.DYN.LE00.FE.IN',
    urban: 'SP.URB.TOTL.IN.ZS',
    gdpPc: 'NY.GDP.PCAP.CD',
    elec: 'EG.ELC.ACCS.ZS',
    water: 'SH.H2O.BASW.ZS',
    sanit: 'SH.STA.BASS.ZS',
    net: 'IT.NET.USER.ZS',
    fert: 'SP.DYN.TFRT.IN',
    age014: 'SP.POP.0014.TO.ZS',
    age65: 'SP.POP.65UP.TO.ZS'
  };

  function wbUrl(indicator) {
    return 'https://api.worldbank.org/v2/country/all/indicator/' + indicator +
      '?format=json&mrv=5&per_page=1500';
  }

  function buildMapByIso2(json) {
    var map = {};
    if (!Array.isArray(json) || json.length < 2 || !Array.isArray(json[1])) return map;
    json[1].forEach(function (row) {
      if (row && row.country && row.country.id && row.value != null) {
        if (map[row.country.id] === undefined) {
          map[row.country.id] = row.value;
        }
      }
    });
    return map;
  }

  function fetchIndicatorRaw(indicator) {
    return fetch(wbUrl(indicator)).then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    });
  }

  function fetchLiveData() {
    var keys = Object.keys(WB_INDICATORS);
    var promises = keys.map(function (k) { return fetchIndicatorRaw(WB_INDICATORS[k]); });

    return Promise.allSettled(promises).then(function (results) {
      var maps = {};
      var anyOk = false;
      results.forEach(function (r, i) {
        var key = keys[i];
        if (r.status === 'fulfilled') {
          maps[key] = buildMapByIso2(r.value);
          if (Object.keys(maps[key]).length > 0) anyOk = true;
        } else {
          maps[key] = {};
          console.warn('World Bank indicator failed (' + key + '):', r.reason && r.reason.message);
        }
      });

      if (!anyOk) return null;

      var merged = STATIC_COUNTRIES.map(function (c) {
        var copy = {};
        for (var p in c) { if (Object.prototype.hasOwnProperty.call(c, p)) copy[p] = c[p]; }
        var code = c.code;
        if (maps.pop && maps.pop[code] != null) copy.pop = Math.round(maps.pop[code]);
        if (maps.leM && maps.leM[code] != null) copy.leM = Math.round(maps.leM[code] * 10) / 10;
        if (maps.leF && maps.leF[code] != null) copy.leF = Math.round(maps.leF[code] * 10) / 10;
        if (maps.urban && maps.urban[code] != null) copy.urban = Math.round(maps.urban[code]);
        if (maps.gdpPc && maps.gdpPc[code] != null) copy.gdpPc = Math.round(maps.gdpPc[code]);
        if (maps.elec && maps.elec[code] != null) copy.elec = Math.round(maps.elec[code]);
        if (maps.water && maps.water[code] != null) copy.water = Math.round(maps.water[code]);
        if (maps.sanit && maps.sanit[code] != null) copy.sanit = Math.round(maps.sanit[code]);
        if (maps.net && maps.net[code] != null) copy.net = Math.round(maps.net[code]);
        if (maps.fert && maps.fert[code] != null) copy.fert = Math.round(maps.fert[code] * 10) / 10;
        if (maps.age014 && maps.age014[code] != null) copy.age014 = Math.round(maps.age014[code] * 10) / 10;
        if (maps.age65 && maps.age65[code] != null) copy.age65 = Math.round(maps.age65[code] * 10) / 10;
        return copy;
      });
      return merged;
    }).catch(function (err) {
      console.warn('fetchLiveData failed:', err && err.message);
      return null;
    });
  }

  function readCache() {
    try {
      var raw = global.sessionStorage && global.sessionStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (!parsed || !parsed.ts || !Array.isArray(parsed.countries)) return null;
      if (Date.now() - parsed.ts > CACHE_TTL) return null;
      return parsed.countries;
    } catch (e) {
      return null;
    }
  }

  function writeCache(countries) {
    try {
      if (global.sessionStorage) {
        global.sessionStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), countries: countries }));
      }
    } catch (e) { /* storage may be unavailable (private mode / file://) */ }
  }

  function loadData() {
    DATA_LOAD_STATUS.loading = true;

    // 1. try session cache first...
    var cached = readCache();
    if (cached && cached.length) {
      _countries = cached;
      DATA_LOAD_STATUS.source = 'cached';
      DATA_LOAD_STATUS.message = 'Using cached data (World Bank)';
      DATA_LOAD_STATUS.loading = false;
      return Promise.resolve(_countries);
    }

    // 2. try live api...
    return fetchLiveData().then(function (live) {
      if (live && live.length) {
        _countries = live;
        writeCache(live);
        DATA_LOAD_STATUS.source = 'live';
        DATA_LOAD_STATUS.message = 'Using live World Bank data';
      } else {
        _countries = STATIC_COUNTRIES.slice();
        DATA_LOAD_STATUS.source = 'static';
        DATA_LOAD_STATUS.message = 'Using built-in data';
      }
      DATA_LOAD_STATUS.loading = false;
      return _countries;
    }).catch(function () {
      _countries = STATIC_COUNTRIES.slice();
      DATA_LOAD_STATUS.source = 'static';
      DATA_LOAD_STATUS.message = 'Using built-in data';
      DATA_LOAD_STATUS.loading = false;
      return _countries;
    });
  }

  function getCountries() {
    return _countries;
  }

  function getStaticCountries() {
    return STATIC_COUNTRIES;
  }

  // expose on namespace
  App.STATIC_COUNTRIES = STATIC_COUNTRIES;
  App.AGE_BANDS = AGE_BANDS;
  App.AGE_WEIGHTS = AGE_WEIGHTS;
  App.OCCUPATIONS = OCCUPATIONS;
  App.HABITATION = HABITATION;
  App.DATA_LOAD_STATUS = DATA_LOAD_STATUS;
  App.fetchLiveData = fetchLiveData;
  App.loadData = loadData;
  App.getCountries = getCountries;
  App.getStaticCountries = getStaticCountries;
})(typeof window !== 'undefined' ? window : this);
