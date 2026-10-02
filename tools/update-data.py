#!/usr/bin/env python3
"""Random Life data tool - builds js/dataset.js from official sources.

Developer-side only (never deployed). Python 3 standard library only: no
packages, no build step. Run by hand, only when you want fresh data:

    python3 tools/update-data.py            # build, validate, replace js/dataset.js
    python3 tools/update-data.py --check    # build and validate only, change nothing

What it does
  1. Downloads each official source into a private temp directory
     (UN WPP 2024 + the Jan 2026 Togo update, UN WUP 2025, ILOSTAT SDMX,
     World Bank WDI API).
  2. Streams / parses them, maps every country through tools/country-map.json,
     applies the documented fallback rule, quantises the result.
  3. Validates everything. Any HTTP error, schema change, indicator-ID change,
     unmapped major country or out-of-range value aborts the run.
  4. Only if every check passes, writes the new snapshot next to the old one and
     atomically replaces js/dataset.js.
  5. Deletes the temp directory (try/finally), also on failure. Nothing
     downloaded is ever kept.

Fallback rule: primary source -> World Bank value for the same concept (if one
exists) -> null (the generator then uses its existing default behaviour).
Values are never invented and a series with a different definition is never
substituted. Every fallback is listed in the snapshot (meta.fallbacks) and
printed by this tool.
"""
import argparse
import csv
import datetime
import gzip
import io
import json
import math
import os
import shutil
import sys
import tempfile
import time
import urllib.error
import urllib.request
import zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
MAP_PATH = os.path.join(HERE, 'country-map.json')
OUT_PATH = os.path.join(ROOT, 'js', 'dataset.js')

# ---- reference years (one deliberate choice per source family) ----------
WPP_YEAR = 2023   # last year the UN Population Division labels an estimate
WUP_YEAR = 2023   # same year as the WPP block (WUP 2025 mid-year value)
ILO_YEAR = 2024   # latest full year of the ILO modelled estimates (Nov 2025)

WPP_BASE = 'https://population.un.org/wpp/assets/Excel%20Files/1_Indicator%20(Standard)/'
URL_WPP_DI = WPP_BASE + 'CSV_FILES/WPP2024_Demographic_Indicators_Medium.csv.gz'
URL_WPP_SA = WPP_BASE + 'CSV_FILES/WPP2024_PopulationBySingleAgeSex_Medium_1950-2023.csv.gz'
URL_WPP_UPD = WPP_BASE + 'WPP2024_CSV_files_update.zip'
URL_WUP = ('https://population.un.org/wup/assets/Download/Countries%20and%20Aggregates/'
           'WUP2025-DB-National-Definitions-Population-Data.csv.gz')
ILO_BASE = 'https://sdmx.ilo.org/rest/data/ILO,'
URL_ILO_EMP = (ILO_BASE + 'DF_EMP_2EMP_SEX_ECO_NB,1.0/.A..SEX_T.'
               'ECO_SECTOR_TOTAL+ECO_SECTOR_AGR+ECO_SECTOR_IND+ECO_SECTOR_SER?startPeriod=%d' % ILO_YEAR)
URL_ILO_UNE = (ILO_BASE + 'DF_UNE_2EAP_SEX_AGE_RT,1.0/.A..SEX_T.AGE_YTHADULT_YGE15?startPeriod=%d' % ILO_YEAR)
URL_WB_META = 'https://api.worldbank.org/v2/country?format=json&per_page=400'
URL_WB_SOURCE = 'https://api.worldbank.org/v2/sources/2?format=json'


def wb_url(ind):
    # identical query to the one the browser used to make
    return 'https://api.worldbank.org/v2/country/all/indicator/%s?format=json&mrv=5&per_page=1500' % ind


# app field -> World Bank indicator.
WB_OWNED = {            # stay live in the browser (World Bank is the producer/publisher)
    'gdpPc': 'NY.GDP.PCAP.CD',
    'elec': 'EG.ELC.ACCS.ZS',
    'water': 'SH.H2O.BASW.ZS',
    'sanit': 'SH.STA.BASS.ZS',
    'net': 'IT.NET.USER.ZS',
}
WB_FALLBACK = {         # used ONLY when the primary source has no value for a country
    'pop': 'SP.POP.TOTL',
    'femaleShare': 'SP.POP.TOTL.FE.ZS',
    'age014': 'SP.POP.0014.TO.ZS',
    'age65': 'SP.POP.65UP.TO.ZS',
    'fert': 'SP.DYN.TFRT.IN',
    'leM': 'SP.DYN.LE00.MA.IN',
    'leF': 'SP.DYN.LE00.FE.IN',
    'urban': 'SP.URB.TOTL.IN.ZS',
    'agrShare': 'SL.AGR.EMPL.ZS',
    'indShare': 'SL.IND.EMPL.ZS',
    'srvShare': 'SL.SRV.EMPL.ZS',
    'unemp': 'SL.UEM.TOTL.ZS',
}
INCOME_MAP = {'LIC': 'L', 'LMC': 'LM', 'UMC': 'UM', 'HIC': 'H'}
AGE_N = 101
AGE_SCALE = 100000   # quantisation: each age distribution sums to exactly 100000

# sensible ranges for validation: (min, max)
RANGES = {
    'pop': (1, 2.0e9), 'femaleShare': (20, 75), 'fert': (0.3, 9.5), 'leM': (30, 95), 'leF': (30, 100),
    'urban': (0, 100), 'agrShare': (0, 100), 'indShare': (0, 100), 'srvShare': (0, 100),
    'unemp': (0, 60), 'gdpPc': (1, 1000000), 'elec': (0, 100), 'water': (0, 100), 'sanit': (0, 100),
    'net': (0, 100), 'age014': (0, 100), 'age65': (0, 100),
}


FALLBACK_NOTE = {}   # field -> codes that used the World Bank fallback (excluded from the like-for-like check)


class DataError(Exception):
    pass


def log(msg=''):
    print(msg, flush=True)


# --------------------------------------------------------------- download
def download(url, dest, retries=3):
    last = None
    for attempt in range(1, retries + 1):
        try:
            req = urllib.request.Request(url, headers={
                'User-Agent': 'random-life-data-tool/1.0 (+https://randomlife.fyi)',
                'Accept': '*/*'})
            with urllib.request.urlopen(req, timeout=180) as res:
                if res.status != 200:
                    raise DataError('HTTP %s for %s' % (res.status, url))
                expected = res.headers.get('Content-Length')
                n = 0
                with open(dest, 'wb') as fh:
                    while True:
                        chunk = res.read(1 << 20)
                        if not chunk:
                            break
                        fh.write(chunk)
                        n += len(chunk)
                if n == 0:
                    raise DataError('empty response for %s' % url)
                if expected and int(expected) != n:
                    raise DataError('truncated download (%d of %s bytes) for %s' % (n, expected, url))
                return n
        except (urllib.error.URLError, OSError, DataError) as exc:
            last = exc
            if attempt < retries:
                time.sleep(3 * attempt)
    raise DataError('download failed after %d attempts: %s (%s)' % (retries, url, last))


def ilo_download(url, dest, retries=4):
    # the ILO SDMX gateway occasionally answers 504 on the first big query
    headers_sdmx = {'Accept': 'application/vnd.sdmx.data+csv'}
    last = None
    for attempt in range(1, retries + 1):
        try:
            req = urllib.request.Request(url, headers=dict(
                headers_sdmx, **{'User-Agent': 'random-life-data-tool/1.0 (+https://randomlife.fyi)'}))
            with urllib.request.urlopen(req, timeout=240) as res:
                data = res.read()
            if res.status != 200 or len(data) < 1000:
                raise DataError('bad ILO response (%s, %d bytes)' % (res.status, len(data)))
            with open(dest, 'wb') as fh:
                fh.write(data)
            return len(data)
        except (urllib.error.URLError, OSError, DataError) as exc:
            last = exc
            time.sleep(5 * attempt)
    raise DataError('ILO download failed: %s (%s)' % (url, last))


def open_csv_gz(path):
    return csv.reader(io.TextIOWrapper(gzip.open(path), encoding='utf-8-sig', newline=''))


def require_columns(header, needed, label):
    missing = [c for c in needed if c not in header]
    if missing:
        raise DataError('%s: expected columns missing %s (schema changed?)' % (label, missing))


def num(x):
    try:
        v = float(x)
    except (TypeError, ValueError):
        return None
    return v if math.isfinite(v) else None


# ------------------------------------------------------------------ WPP
def read_wpp(tmp, cmap):
    """Return {app_code: {...}} for the WPP block (reference year WPP_YEAR)."""
    loc_to_app = {}
    for code, m in cmap['countries'].items():
        if m['wpp'] is not None:
            loc_to_app[int(m['wpp'])] = code
    yr = str(WPP_YEAR)

    # Interim update (Jan 2026, Togo): rows for any location in the update zip
    # replace the base rows for that location.
    upd_di, upd_sa, upd_locs = {}, {}, set()
    with zipfile.ZipFile(os.path.join(tmp, 'wpp_update.zip')) as z:
        names = z.namelist()
        for need in ('WPP2024_Demographic_Indicators_Medium_Update.csv',
                     'WPP2024_PopulationBySingleAgeSex_Medium_Update.csv'):
            if need not in names:
                raise DataError('WPP update zip lacks %s (layout changed?)' % need)
        r = csv.reader(io.TextIOWrapper(z.open('WPP2024_Demographic_Indicators_Medium_Update.csv'),
                                        encoding='utf-8-sig', newline=''))
        h = next(r)
        require_columns(h, ['LocID', 'Time', 'Variant', 'TPopulation1July', 'TPopulationFemale1July',
                            'TFR', 'LExMale', 'LExFemale'], 'WPP update demographic indicators')
        ix = {c: i for i, c in enumerate(h)}
        for row in r:
            if row[ix['Time']] == yr and row[ix['Variant']] == 'Medium':
                lid = int(row[ix['LocID']])
                upd_locs.add(lid)
                upd_di[lid] = row
        r = csv.reader(io.TextIOWrapper(z.open('WPP2024_PopulationBySingleAgeSex_Medium_Update.csv'),
                                        encoding='utf-8-sig', newline=''))
        h2 = next(r)
        require_columns(h2, ['LocID', 'Time', 'AgeGrp', 'PopTotal'], 'WPP update single-age')
        ix2 = {c: i for i, c in enumerate(h2)}
        for row in r:
            if row[ix2['Time']] == yr:
                upd_sa.setdefault(int(row[ix2['LocID']]), {})[row[ix2['AgeGrp']]] = num(row[ix2['PopTotal']])
    log('  WPP update (rev.1) overrides locations: %s' % sorted(upd_locs))

    out = {}
    r = open_csv_gz(os.path.join(tmp, 'wpp_di.csv.gz'))
    h = next(r)
    need = ['LocID', 'LocTypeName', 'Variant', 'Time', 'TPopulation1July', 'TPopulationFemale1July',
            'TFR', 'LExMale', 'LExFemale']
    require_columns(h, need, 'WPP demographic indicators')
    ix = {c: i for i, c in enumerate(h)}
    rows = {}
    for row in r:
        if row[ix['Time']] != yr or row[ix['Variant']] != 'Medium' or row[ix['LocTypeName']] != 'Country/Area':
            continue
        lid = int(row[ix['LocID']])
        if lid in loc_to_app:
            rows[lid] = row
    for lid, row in upd_di.items():
        if lid in loc_to_app:
            rows[lid] = row
    for lid, row in rows.items():
        pop_k = num(row[ix['TPopulation1July']])
        fem_k = num(row[ix['TPopulationFemale1July']])
        if not pop_k or fem_k is None:
            continue
        out[loc_to_app[lid]] = {
            'pop': int(round(pop_k * 1000)),
            'femaleShare': round(100.0 * fem_k / pop_k, 2),
            'fert': round(num(row[ix['TFR']]), 2) if num(row[ix['TFR']]) is not None else None,
            'leM': round(num(row[ix['LExMale']]), 1) if num(row[ix['LExMale']]) is not None else None,
            'leF': round(num(row[ix['LExFemale']]), 1) if num(row[ix['LExFemale']]) is not None else None,
            '_pop_k': pop_k,
        }

    # single-year-of-age population, both sexes pooled
    ages = {}
    r = open_csv_gz(os.path.join(tmp, 'wpp_sa.csv.gz'))
    h = next(r)
    require_columns(h, ['LocID', 'Time', 'AgeGrp', 'PopTotal', 'Variant'], 'WPP single-age population')
    ix = {c: i for i, c in enumerate(h)}
    iL, iT, iA, iP, iV = ix['LocID'], ix['Time'], ix['AgeGrp'], ix['PopTotal'], ix['Variant']
    for row in r:
        if row[iT] != yr or row[iV] != 'Medium':
            continue
        try:
            lid = int(row[iL])
        except ValueError:
            continue
        if lid in loc_to_app and lid not in upd_sa:
            ages.setdefault(lid, {})[row[iA]] = num(row[iP])
    for lid, d in upd_sa.items():
        if lid in loc_to_app:
            ages[lid] = d
    for lid, d in ages.items():
        code = loc_to_app[lid]
        if code not in out:
            continue
        vals = []
        ok = True
        for a in range(AGE_N):
            key = '100+' if a == 100 else str(a)
            v = d.get(key)
            if v is None or v < 0:
                ok = False
                break
            vals.append(v)
        if not ok:
            continue
        total = sum(vals)
        if abs(total - out[code]['_pop_k']) / out[code]['_pop_k'] > 0.005:
            raise DataError('WPP %s: single-age total %.1f differs from total population %.1f'
                            % (code, total, out[code]['_pop_k']))
        out[code]['age'] = quantise(vals)
    return out


def quantise(vals):
    """Largest-remainder rounding to integers summing to exactly AGE_SCALE."""
    total = float(sum(vals))
    raw = [v / total * AGE_SCALE for v in vals]
    base = [int(math.floor(x)) for x in raw]
    short = AGE_SCALE - sum(base)
    order = sorted(range(len(raw)), key=lambda i: raw[i] - base[i], reverse=True)
    for i in order[:short]:
        base[i] += 1
    return base


# ------------------------------------------------------------------ WUP
def read_wup(tmp, cmap):
    loc_to_app = {int(m['wup']): c for c, m in cmap['countries'].items() if m['wup'] is not None}
    r = open_csv_gz(os.path.join(tmp, 'wup_nd.csv.gz'))
    h = next(r)
    require_columns(h, ['LocID', 'LocTypeName', 'Category', 'Year', 'TimeMid', 'percPop'], 'WUP national definitions')
    ix = {c: i for i, c in enumerate(h)}
    out = {}
    for row in r:
        if row[ix['Category']] != 'Urban' or row[ix['Year']] != str(WUP_YEAR):
            continue
        if row[ix['LocTypeName']] != 'Country/Area':
            continue
        lid = int(row[ix['LocID']])
        if lid in loc_to_app:
            if abs(float(row[ix['TimeMid']]) - (WUP_YEAR + 0.5)) > 0.01:
                raise DataError('WUP TimeMid is not mid-year %d (layout changed?)' % WUP_YEAR)
            v = num(row[ix['percPop']])
            if v is not None:
                out[loc_to_app[lid]] = {'urban': round(v, 1)}
    return out


# ------------------------------------------------------------------ ILO
def read_ilo(tmp, cmap):
    code_of = {m['ilo']: c for c, m in cmap['countries'].items() if m['ilo']}
    yr = str(ILO_YEAR)
    eco = {}
    with open(os.path.join(tmp, 'ilo_emp.csv'), encoding='utf-8-sig', newline='') as fh:
        rd = csv.DictReader(fh)
        require_columns(rd.fieldnames, ['REF_AREA', 'MEASURE', 'SEX', 'ECO', 'TIME_PERIOD', 'OBS_VALUE',
                                        'UNIT_MEASURE', 'UNIT_MULT', 'SOURCE'], 'ILO employment')
        seen_src = set()
        for x in rd:
            if x['TIME_PERIOD'] != yr or x['SEX'] != 'SEX_T' or x['MEASURE'] != 'EMP_2EMP_NB':
                continue
            seen_src.add(x['SOURCE'])
            eco.setdefault(x['REF_AREA'], {})[x['ECO']] = num(x['OBS_VALUE'])
        if seen_src != {'ILO - Modelled Estimates'}:
            raise DataError('ILO employment source label changed: %s' % seen_src)
    une = {}
    with open(os.path.join(tmp, 'ilo_une.csv'), encoding='utf-8-sig', newline='') as fh:
        rd = csv.DictReader(fh)
        require_columns(rd.fieldnames, ['REF_AREA', 'MEASURE', 'SEX', 'AGE', 'TIME_PERIOD', 'OBS_VALUE', 'SOURCE'],
                        'ILO unemployment')
        seen_src = set()
        for x in rd:
            if x['TIME_PERIOD'] != yr or x['SEX'] != 'SEX_T' or x['AGE'] != 'AGE_YTHADULT_YGE15':
                continue
            if x['MEASURE'] != 'UNE_2EAP_RT':
                raise DataError('ILO unemployment measure changed: %s' % x['MEASURE'])
            seen_src.add(x['SOURCE'])
            une[x['REF_AREA']] = num(x['OBS_VALUE'])
        if seen_src != {'ILO - Modelled Estimates'}:
            raise DataError('ILO unemployment source label changed: %s' % seen_src)
    out = {}
    unmapped = []
    for area, d in eco.items():
        if area in code_of:
            tot, a, i, s = (d.get('ECO_SECTOR_TOTAL'), d.get('ECO_SECTOR_AGR'),
                            d.get('ECO_SECTOR_IND'), d.get('ECO_SECTOR_SER'))
            if not tot or None in (a, i, s):
                continue
            if abs((a + i + s) - tot) / tot > 0.01:
                raise DataError('ILO %s: sector employment does not add up to the total' % area)
            out.setdefault(code_of[area], {}).update({
                'agrShare': round(100.0 * a / tot, 1), 'indShare': round(100.0 * i / tot, 1),
                'srvShare': round(100.0 * s / tot, 1)})
        elif len(area) == 3 and area.isalpha() and area in {m['iso3'] for m in cmap['countries'].values()}:
            unmapped.append(area)
    for area, v in une.items():
        if area in code_of and v is not None:
            out.setdefault(code_of[area], {})['unemp'] = round(v, 1)
    if unmapped:
        log('  WARNING: ILO has data for areas the map marks as missing: %s' % sorted(unmapped))
    return out


# ------------------------------------------------------------ World Bank
def read_wb(tmp, cmap):
    app_codes = set(cmap['countries'])
    with open(os.path.join(tmp, 'wb_meta.json'), encoding='utf-8') as fh:
        meta_json = json.load(fh)
    if not (isinstance(meta_json, list) and len(meta_json) == 2 and isinstance(meta_json[1], list)):
        raise DataError('World Bank country metadata schema changed')
    if meta_json[0].get('pages') != 1:
        raise DataError('World Bank country metadata is paginated (raise per_page)')
    members = {}
    for c in meta_json[1]:
        code = c.get('iso2Code')
        if (isinstance(code, str) and len(code) == 2 and code.isalpha()
                and c.get('region') and c['region'].get('id') != 'NA'):
            members[code.upper()] = c
    current = set(members)
    expected = set(cmap['countries']) - {'TW'}
    if expected - current:
        raise DataError('country-map has codes the World Bank no longer lists as members: %s'
                        % sorted(expected - current))
    if current - expected:
        log('  NOTE: World Bank lists members not in country-map (NOT added, list is fixed): %s'
            % sorted(current - expected))
    for code in expected:
        if members[code].get('id') != cmap['countries'][code]['iso3']:
            raise DataError('World Bank ISO3 for %s changed (%s vs %s)'
                            % (code, members[code].get('id'), cmap['countries'][code]['iso3']))
    info = {}
    for code in expected:
        m = members[code]
        lvl = (m.get('incomeLevel') or {}).get('id')
        if lvl not in INCOME_MAP:
            raise DataError('unexpected income level %r for %s' % (lvl, code))
        info[code] = {'name': m['name'].strip(), 'rid': m['region']['id'],
                      'region': m['region']['value'].strip(), 'incomeGroup': INCOME_MAP[lvl]}

    series = {}
    years = {}
    by_year = {}        # every non-null value per year, used only for the like-for-like ILO check
    for field, ind in list(WB_OWNED.items()) + list(WB_FALLBACK.items()):
        with open(os.path.join(tmp, 'wb_%s.json' % ind), encoding='utf-8') as fh:
            j = json.load(fh)
        if not (isinstance(j, list) and len(j) == 2 and isinstance(j[1], list)):
            raise DataError('World Bank %s: response schema changed' % ind)
        if j[0].get('pages') != 1:
            raise DataError('World Bank %s: response is paginated (raise per_page)' % ind)
        vals = {}
        for row in j[1]:
            if (row.get('indicator') or {}).get('id') != ind:
                raise DataError('World Bank %s: indicator id in response is %r' % (ind, (row.get('indicator') or {}).get('id')))
            cid = (row.get('country') or {}).get('id')
            if row.get('value') is None or cid not in app_codes:
                continue
            by_year.setdefault(field, {}).setdefault(cid, {})[int(row['date'])] = float(row['value'])
            if cid in vals:
                continue
            vals[cid] = (float(row['value']), int(row['date']))
        series[field] = vals
        ys = [y for _, y in vals.values()]
        years[field] = {'min': min(ys), 'max': max(ys), 'n': len(vals)} if ys else {'n': 0}
        if len(vals) < 150:
            raise DataError('World Bank %s: only %d countries returned (outage or schema change)' % (ind, len(vals)))
    return info, series, years, by_year


# ----------------------------------------------------------------- build
def rounded(field, v):
    if field in ('gdpPc', 'elec', 'water', 'sanit', 'net'):
        return int(round(v))          # same rounding the browser applies to live values
    if field == 'pop':
        return int(round(v))
    if field in ('fert', 'femaleShare'):
        return round(v, 2)
    return round(v, 1)


def build(cmap, wpp, wup, ilo, wb_info, wb_series, wb_years):
    countries = []
    fallbacks = {}
    legacy = {}
    missing = {}

    def note(var, code, kind):
        (fallbacks if kind == 'wb' else missing).setdefault(var, []).append(code)

    for code in sorted(cmap['countries']):
        m = cmap['countries'][code]
        is_tw = code == 'TW'
        info = wb_info.get(code) or {'name': 'Taiwan', 'rid': 'EAS', 'region': 'East Asia & Pacific', 'incomeGroup': 'H'}
        rec = {'code': code, 'name': info['name'], 'rid': info['rid'], 'region': info['region'],
               'incomeGroup': info['incomeGroup']}
        w = wpp.get(code, {})
        u = wup.get(code, {})
        o = ilo.get(code, {})

        def pick(field, primary):
            if primary is not None:
                return primary
            fb = wb_series.get(field, {}).get(code)
            if fb is not None:
                note(field, code, 'wb')
                return rounded(field, fb[0])
            note(field, code, 'null')
            return None

        for f in ('pop', 'femaleShare'):
            rec[f] = pick(f, w.get(f))
        if 'age' in w:
            rec['age'] = w['age']
            rec['age014'] = None
            rec['age65'] = None
        else:
            rec['age'] = None
            # documented fallback: the previous 6-band model, anchored on the World Bank shares
            a14 = wb_series['age014'].get(code)
            a65 = wb_series['age65'].get(code)
            rec['age014'] = rounded('age014', a14[0]) if a14 else None
            rec['age65'] = rounded('age65', a65[0]) if a65 else None
            note('age', code, 'wb' if (a14 and a65) else 'null')
        for f in ('fert', 'leM', 'leF'):
            rec[f] = pick(f, w.get(f))
        rec['urban'] = pick('urban', u.get('urban'))
        for f in ('agrShare', 'indShare', 'srvShare', 'unemp'):
            rec[f] = pick(f, o.get(f))
        for f in WB_OWNED:
            v = wb_series[f].get(code)
            if v is not None:
                rec[f] = rounded(f, v[0])
            elif code in cmap.get('legacy', {}) and f in cmap['legacy'][code]:
                rec[f] = cmap['legacy'][code][f]
                legacy.setdefault(code, []).append(f)
            else:
                rec[f] = None
                note(f, code, 'null')
        countries.append(rec)
    return countries, fallbacks, missing, legacy


def validate(countries, cmap, wpp):
    problems = []
    seen = set()
    min_major = cmap.get('majorCountryMinPopulation', 5000000)
    for c in countries:
        code = c['code']
        if code in seen:
            problems.append('duplicate %s' % code)
        seen.add(code)
        for f, (lo, hi) in RANGES.items():
            v = c.get(f)
            if v is None:
                continue
            if not isinstance(v, (int, float)) or not math.isfinite(v) or v < lo or v > hi:
                problems.append('%s.%s out of range: %r' % (code, f, v))
        if not c['pop'] or c['pop'] <= 0:
            problems.append('%s has no population' % code)
        age = c.get('age')
        if age is not None:
            if len(age) != AGE_N or any((not isinstance(a, int)) or a < 0 for a in age) or sum(age) != AGE_SCALE:
                problems.append('%s: invalid age distribution' % code)
        else:
            if c.get('age014') is None or c.get('age65') is None:
                problems.append('%s: no age distribution and no World Bank shares for the 6-band fallback' % code)
            elif c['age014'] + c['age65'] >= 100:
                problems.append('%s: 0-14 + 65+ shares >= 100' % code)
        secs = [c.get('agrShare'), c.get('indShare'), c.get('srvShare')]
        if None not in secs and not (99.6 <= sum(secs) <= 100.4):
            problems.append('%s: sector shares sum to %.1f' % (code, sum(secs)))
        if (None in secs) != (secs.count(None) == 3):
            problems.append('%s: partial sector shares %r' % (code, secs))
        if c['incomeGroup'] not in ('L', 'LM', 'UM', 'H'):
            problems.append('%s: bad income group' % code)
    # every major country must map to WPP and WUP (fail loudly)
    for c in countries:
        m = cmap['countries'][c['code']]
        if c['pop'] >= min_major:
            if m['wpp'] is None or c['code'] not in wpp or c.get('age') is None:
                problems.append('major country %s (%s) is not mapped to WPP' % (c['code'], c['name']))
            if m['wup'] is None:
                problems.append('major country %s (%s) is not mapped to WUP' % (c['code'], c['name']))
    return problems


def js_literal(countries, meta):
    def one(c):
        parts = []
        for k, v in c.items():
            parts.append('%s:%s' % (json.dumps(k), json.dumps(v, separators=(',', ':'), ensure_ascii=False)))
        return '{' + ','.join(parts) + '}'
    head = json.dumps(meta, indent=1, ensure_ascii=False)
    body = ',\n'.join('    ' + one(c) for c in countries)
    return head, body


def render(countries, meta):
    head, body = js_literal(countries, meta)
    lines = [
        '/* dataset.js - built-in data snapshot. GENERATED by tools/update-data.py: do not edit by hand.',
        ' *',
        ' * Official sources (all reference years and licences are repeated in meta below):',
    ]
    for s in meta['sources']:
        lines.append(' *   - %s: %s; reference year %s; retrieved %s; licence %s.' % (
            s['short'], s['release'], s['refYear'], s['retrieved'], s['licence']))
    lines += [
        ' * The WPP / WUP / ILO values never change in the browser. The World Bank values',
        ' * (GDP per capita, internet, water, sanitation, electricity, income group, region)',
        ' * are refreshed live when reachable; the numbers here are the built-in fallback.',
        ' * age[] = share of the population at each single year of age 0..100 (100 = 100+),',
        ' * both sexes pooled, in units of 1/100000 (each array sums to exactly 100000).',
        ' */',
        '(function (global) {',
        "  'use strict';",
        '  var App = global.App = global.App || {};',
        '  App.SNAPSHOT = {',
        '  "meta": ' + head.replace('\n', '\n  ') + ',',
        '  "countries": [',
        body,
        '  ]',
        '  };',
        "})(typeof window !== 'undefined' ? window : this);",
        '',
    ]
    return '\n'.join(lines)


def compare_report(countries, wb_series, wb_by_year):
    top = sorted(countries, key=lambda c: -c['pop'])[:30]
    log('\n=== Old (World Bank, newest value) vs new, 30 largest countries by WPP population ===')
    log('%-3s %-26s | %6s %6s %6s | %5s %5s %5s | %5s %5s %5s | %5s %5s %5s | %5s %5s %5s' % (
        'cc', 'name', 'popWB', 'popWPP', 'd%', 'urbWB', 'urbWU', 'diff', 'agrWB', 'agrIL', 'diff',
        'srvWB', 'srvIL', 'diff', 'unWB', 'unIL', 'diff'))

    def g(f, c):
        v = wb_series[f].get(c['code'])
        return v[0] if v else None

    def fmt(v, w=5, d=1):
        return ('%*.*f' % (w, d, v)) if v is not None else ' ' * (w - 1) + '-'

    def diff(a, b):
        return fmt(b - a, 5, 1) if a is not None and b is not None else '    -'
    for c in top:
        pw = g('pop', c)
        pd = ((c['pop'] - pw) / pw * 100) if pw else None
        ua, ia, sa, na = g('urban', c), g('agrShare', c), g('srvShare', c), g('unemp', c)
        log('%-3s %-26s | %6.0f %6.0f %6s | %5s %5s %5s | %5s %5s %5s | %5s %5s %5s | %5s %5s %5s' % (
            c['code'], c['name'][:26], (pw or 0) / 1e6, c['pop'] / 1e6, fmt(pd, 6, 1),
            fmt(ua), fmt(c['urban']), diff(ua, c['urban']),
            fmt(ia), fmt(c['agrShare']), diff(ia, c['agrShare']),
            fmt(sa), fmt(c['srvShare']), diff(sa, c['srvShare']),
            fmt(na), fmt(c['unemp']), diff(na, c['unemp'])))
    log('(pop in millions; WB values are the newest of mrv=5, so they can be a year newer than the WPP/WUP/ILO year)')
    log('\nLike-for-like ILO check: ILOSTAT %d vs World Bank SL.* series for the same year %d (all countries both have)' % (ILO_YEAR, ILO_YEAR))
    for f, label in (('agrShare', 'agriculture %'), ('indShare', 'industry %'), ('srvShare', 'services %'),
                     ('unemp', 'unemployment %')):
        diffs = []
        for c in countries:
            wbv = wb_by_year.get(f, {}).get(c['code'], {}).get(ILO_YEAR)
            if wbv is not None and c.get(f) is not None and c['code'] not in FALLBACK_NOTE.get(f, ()):
                diffs.append(abs(c[f] - wbv))
        if diffs:
            log('  %-15s n=%3d  mean |diff| %.3f  max |diff| %.2f' % (label, len(diffs), sum(diffs) / len(diffs), max(diffs)))
    log('\n%-3s %-26s | %5s %5s | %5s %5s | %5s %5s | %5s %5s' % (
        'cc', 'name', 'leMWB', 'leMWP', 'leFWB', 'leFWP', 'fertW', 'fertP', 'fem%W', 'fem%P'))
    for c in top:
        log('%-3s %-26s | %5s %5s | %5s %5s | %5s %5s | %5s %5s' % (
            c['code'], c['name'][:26], fmt(g('leM', c)), fmt(c['leM']), fmt(g('leF', c)), fmt(c['leF']),
            fmt(g('fert', c), 5, 2), fmt(c['fert'], 5, 2), fmt(g('femaleShare', c)), fmt(c['femaleShare'], 5, 1)))


# ------------------------------------------------------------------ main
def main():
    ap = argparse.ArgumentParser(description='Build js/dataset.js from official sources.')
    ap.add_argument('--check', action='store_true', help='build and validate only; do not write js/dataset.js')
    ap.add_argument('--quiet', action='store_true', help='skip the old-vs-new comparison tables')
    args = ap.parse_args()

    with open(MAP_PATH, encoding='utf-8') as fh:
        cmap = json.load(fh)

    tmp = tempfile.mkdtemp(prefix='random-life-data-')
    staged = None
    try:
        free = shutil.disk_usage(tmp).free
        if free < 1.5 * 1024 ** 3:
            raise DataError('only %.0f MB free in %s; need ~1.5 GB headroom' % (free / 1e6, tmp))
        log('Temp dir: %s (%.1f GB free); everything downloaded is deleted at the end.' % (tmp, free / 1e9))

        retrieved = datetime.date.today().isoformat()
        log('Downloading UN WPP 2024 ...')
        for url, name in ((URL_WPP_DI, 'wpp_di.csv.gz'), (URL_WPP_SA, 'wpp_sa.csv.gz'),
                          (URL_WPP_UPD, 'wpp_update.zip')):
            n = download(url, os.path.join(tmp, name))
            log('  %-18s %7.1f MB' % (name, n / 1e6))
        log('Downloading UN WUP 2025 ...')
        log('  %-18s %7.1f MB' % ('wup_nd.csv.gz', download(URL_WUP, os.path.join(tmp, 'wup_nd.csv.gz')) / 1e6))
        log('Downloading ILOSTAT modelled estimates ...')
        log('  %-18s %7.1f MB' % ('ilo_emp.csv', ilo_download(URL_ILO_EMP, os.path.join(tmp, 'ilo_emp.csv')) / 1e6))
        log('  %-18s %7.1f MB' % ('ilo_une.csv', ilo_download(URL_ILO_UNE, os.path.join(tmp, 'ilo_une.csv')) / 1e6))
        log('Downloading World Bank WDI ...')
        download(URL_WB_META, os.path.join(tmp, 'wb_meta.json'))
        download(URL_WB_SOURCE, os.path.join(tmp, 'wb_source.json'))
        wb_bytes = 0
        for ind in list(WB_OWNED.values()) + list(WB_FALLBACK.values()):
            wb_bytes += download(wb_url(ind), os.path.join(tmp, 'wb_%s.json' % ind))
        owned_bytes = sum(os.path.getsize(os.path.join(tmp, 'wb_%s.json' % i)) for i in WB_OWNED.values())
        meta_bytes = os.path.getsize(os.path.join(tmp, 'wb_meta.json'))
        log('  17 indicators + metadata: %.2f MB (the browser now fetches only 5 indicators + metadata: %.2f MB)'
            % ((wb_bytes + meta_bytes) / 1e6, (owned_bytes + meta_bytes) / 1e6))

        log('Parsing ...')
        wpp = read_wpp(tmp, cmap)
        wup = read_wup(tmp, cmap)
        ilo = read_ilo(tmp, cmap)
        wb_info, wb_series, wb_years, wb_by_year = read_wb(tmp, cmap)
        with open(os.path.join(tmp, 'wb_source.json'), encoding='utf-8') as fh:
            wb_src = json.load(fh)[1][0]
        wdi_updated = wb_src.get('lastupdated') or 'unknown'

        countries, fallbacks, missing, legacy = build(cmap, wpp, wup, ilo, wb_info, wb_series, wb_years)

        FALLBACK_NOTE.update(fallbacks)
        problems = validate(countries, cmap, wpp)
        if problems:
            for p in problems:
                log('  FAIL: ' + p)
            raise DataError('%d validation problem(s); js/dataset.js left untouched' % len(problems))

        meta = {
            'format': 1,
            'generated': retrieved,
            'tool': 'tools/update-data.py',
            'sources': [
                {'id': 'wpp', 'short': 'UN WPP 2024', 'org': 'United Nations, DESA, Population Division',
                 'dataset': 'World Population Prospects 2024 (medium variant), CSV bulk downloads, '
                            'including the January 2026 interim update for Togo',
                 'release': 'WPP 2024 (released 11 July 2024; rev.1 Togo update 19 January 2026)',
                 'url': 'https://population.un.org/wpp/', 'retrieved': retrieved, 'refYear': WPP_YEAR,
                 'refNote': '1 July %d; the last year WPP labels an estimate (2024 onward are projections)' % WPP_YEAR,
                 'licence': 'CC BY 3.0 IGO',
                 'variables': ['pop', 'femaleShare', 'age', 'fert', 'leM', 'leF']},
                {'id': 'wup', 'short': 'UN WUP 2025', 'org': 'United Nations, DESA, Population Division',
                 'dataset': 'World Urbanization Prospects 2025, percentage urban by national definitions',
                 'release': 'WUP 2025 (2025 Revision)', 'url': 'https://population.un.org/wup/',
                 'retrieved': retrieved, 'refYear': WUP_YEAR,
                 'refNote': 'mid-year %d, national definitions of urban (not Degree of Urbanization)' % WUP_YEAR,
                 'licence': 'CC BY 3.0 IGO', 'variables': ['urban']},
                {'id': 'ilo', 'short': 'ILO Nov 2025', 'org': 'International Labour Organization',
                 'dataset': 'ILOSTAT, ILO modelled estimates: DF_EMP_2EMP_SEX_ECO_NB (employment by '
                            'economic activity) and DF_UNE_2EAP_SEX_AGE_RT (unemployment rate, ages 15+)',
                 'release': 'ILO modelled estimates, November 2025', 'url': 'https://ilostat.ilo.org/',
                 'retrieved': retrieved, 'refYear': ILO_YEAR,
                 'refNote': 'latest full year; later years in the release are nowcasts / projections',
                 'licence': 'CC BY 4.0', 'variables': ['agrShare', 'indShare', 'srvShare', 'unemp']},
                {'id': 'wb', 'short': 'World Bank WDI', 'org': 'World Bank (Open Data)',
                 'dataset': 'World Development Indicators: NY.GDP.PCAP.CD, EG.ELC.ACCS.ZS, SH.H2O.BASW.ZS, '
                            'SH.STA.BASS.ZS, IT.NET.USER.ZS, plus country metadata (income group, region)',
                 'release': 'WDI, last updated %s' % wdi_updated, 'url': 'https://data.worldbank.org/',
                 'retrieved': retrieved, 'refYear': 'newest value per country (mrv=5)',
                 'refNote': 'originators: ITU (internet), WHO/UNICEF JMP (water, sanitation), '
                            'SDG 7.1.1 custodians (electricity); GDP: national accounts / OECD / World Bank staff',
                 'licence': 'CC BY 4.0',
                 'variables': ['gdpPc', 'elec', 'water', 'sanit', 'net', 'incomeGroup', 'region']},
            ],
            'wbYears': {f: wb_years[f] for f in WB_OWNED},
            'ageQuantisation': AGE_SCALE,
            'fallbacks': {k: sorted(v) for k, v in sorted(fallbacks.items())},
            'unavailable': {k: sorted(v) for k, v in sorted(missing.items())},
            'legacy': legacy,
            'counts': {'countries': len(countries),
                       'withWppAge': sum(1 for c in countries if c.get('age') is not None)},
        }

        text = render(countries, meta)
        staged = os.path.join(tmp, 'dataset.js')
        with open(staged, 'w', encoding='utf-8') as fh:
            fh.write(text)
        size = os.path.getsize(staged)
        if size > 400 * 1024:
            raise DataError('snapshot is %d bytes, over the 400 KB budget' % size)

        log('\n=== Snapshot: %d countries, %.1f KB ===' % (len(countries), size / 1024))
        log('Fallbacks to the World Bank value (primary source had no value):')
        for k, v in meta['fallbacks'].items():
            log('  %-12s %3d  %s' % (k, len(v), ' '.join(v)))
        log('No value anywhere (stays null; generator default applies):')
        for k, v in meta['unavailable'].items():
            log('  %-12s %3d  %s' % (k, len(v), ' '.join(v)))
        if legacy:
            log('Legacy hand-typed values retained (no official source in scope): %s' % json.dumps(legacy))
        log('World Bank value years: %s' % json.dumps(wb_years_summary(wb_years)))
        if not args.quiet:
            compare_report(countries, wb_series, wb_by_year)

        if args.check:
            log('\n--check: all validation passed; js/dataset.js not modified.')
        else:
            dest_tmp = OUT_PATH + '.new'
            try:
                shutil.copyfile(staged, dest_tmp)
                os.replace(dest_tmp, OUT_PATH)
            finally:
                if os.path.exists(dest_tmp):
                    os.remove(dest_tmp)
            log('\nWrote %s (%.1f KB).' % (OUT_PATH, size / 1024))
        return 0
    except DataError as exc:
        log('\nERROR: %s' % exc)
        return 1
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
        log('Temp dir removed.' if not os.path.exists(tmp) else 'WARNING: could not remove %s' % tmp)


def wb_years_summary(wb_years):
    return {k: '%s-%s (n=%s)' % (v.get('min'), v.get('max'), v.get('n')) for k, v in wb_years.items()
            if k in WB_OWNED}


if __name__ == '__main__':
    sys.exit(main())
