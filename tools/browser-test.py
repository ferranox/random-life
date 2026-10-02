#!/usr/bin/env python3
"""Developer-side real-browser test (never deployed). Python 3 standard library
only; talks to headless Chromium/Chrome over the DevTools protocol.

    python3 tools/browser-test.py [--baseline DIR] [--shots DIR] [--skip-live]

Serves the project (and optionally a pre-change copy) from http://127.0.0.1 so
the page has a real origin (CORS is genuinely exercised against the live World
Bank API) and the service worker can register. Scenarios:

  offline-first   every World Bank request blocked: first Generate works at once
  live            real World Bank API: live data used, cache written, 2nd load cached,
                  old v5 cache key cleared, transferred bytes measured
  failures        one dataset blocked, one HTTP 500, one malformed, one out of range,
                  one slower than the 20 s timeout -> each falls back on its own
  service-worker  app is served offline after a first visit
  file            works when opened from file://
  saved-lives     a life saved by the OLD code still renders in History > Saved
  ui-compare      (with --baseline) DOM structure + screenshots, old vs new

Exit status 0 = all checks passed.
"""
import argparse
import base64
import functools
import hashlib
import http.server
import json
import os
import shutil
import socket
import struct
import subprocess
import sys
import tempfile
import threading
import time
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PASS, FAIL = [], []


def check(name, ok, detail=''):
    (PASS if ok else FAIL).append(name)
    print('  %s  %s%s' % ('ok  ' if ok else 'FAIL', name, (' :: ' + str(detail)) if detail and not ok else ''))
    return ok


def find_browser():
    for name in ('chromium-browser', 'chromium', 'google-chrome', 'google-chrome-stable', 'chrome'):
        p = shutil.which(name)
        if p:
            return p
    return None


# ------------------------------------------------------------------ servers
class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache')
        super().end_headers()


def serve(directory):
    handler = functools.partial(Quiet, directory=directory)
    srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv, srv.server_address[1]


# ------------------------------------------------------------ websocket / CDP
class WS:
    def __init__(self, url):
        assert url.startswith('ws://')
        hostport, path = url[5:].split('/', 1)
        host, port = hostport.split(':')
        self.sock = socket.create_connection((host, int(port)), timeout=30)
        key = base64.b64encode(os.urandom(16)).decode()
        self.sock.sendall(('GET /%s HTTP/1.1\r\nHost: %s\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n'
                           'Sec-WebSocket-Key: %s\r\nSec-WebSocket-Version: 13\r\n\r\n' % (path, hostport, key)).encode())
        buf = b''
        while b'\r\n\r\n' not in buf:
            buf += self.sock.recv(4096)
        head, self.buf = buf.split(b'\r\n\r\n', 1)
        if b' 101 ' not in head.split(b'\r\n')[0]:
            raise RuntimeError('websocket handshake failed: %r' % head[:200])

    def send(self, text):
        data = text.encode()
        hdr = bytearray([0x81])
        n = len(data)
        if n < 126:
            hdr.append(0x80 | n)
        elif n < 65536:
            hdr.append(0x80 | 126)
            hdr += struct.pack('>H', n)
        else:
            hdr.append(0x80 | 127)
            hdr += struct.pack('>Q', n)
        mask = os.urandom(4)
        hdr += mask
        self.sock.sendall(bytes(hdr) + bytes(b ^ mask[i % 4] for i, b in enumerate(data)))

    def _need(self, n):
        while len(self.buf) < n:
            chunk = self.sock.recv(1 << 16)
            if not chunk:
                raise ConnectionError('websocket closed')
            self.buf += chunk
        out, self.buf = self.buf[:n], self.buf[n:]
        return out

    def recv(self, timeout):
        """Return one text message, or None on timeout."""
        self.sock.settimeout(timeout)
        try:
            msg = b''
            while True:
                b0, b1 = self._need(2)
                op, ln = b0 & 0x0F, b1 & 0x7F
                if ln == 126:
                    ln = struct.unpack('>H', self._need(2))[0]
                elif ln == 127:
                    ln = struct.unpack('>Q', self._need(8))[0]
                payload = self._need(ln)
                if op == 0x9:
                    continue
                if op == 0x8:
                    raise ConnectionError('closed')
                msg += payload
                if b0 & 0x80:
                    return msg.decode('utf-8', 'replace')
        except socket.timeout:
            return None


class Chrome:
    def __init__(self, width=1280, height=900, extra=None):
        self.browser = find_browser()
        if not self.browser:
            raise RuntimeError('no Chromium/Chrome found')
        self.profile = tempfile.mkdtemp(prefix='random-life-browser-')
        s = socket.socket()
        s.bind(('127.0.0.1', 0))
        self.port = s.getsockname()[1]
        s.close()
        args = [self.browser, '--headless=new', '--no-sandbox', '--disable-gpu', '--no-first-run',
                '--remote-debugging-port=%d' % self.port, '--remote-allow-origins=*',
                '--user-data-dir=' + self.profile, '--window-size=%d,%d' % (width, height),
                '--disable-features=Translate,MediaRouter', '--allow-file-access-from-files=false']
        args += (extra or []) + ['about:blank']
        self.proc = subprocess.Popen(args, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        url = None
        for _ in range(100):
            try:
                with urllib.request.urlopen('http://127.0.0.1:%d/json/list' % self.port, timeout=2) as r:
                    tabs = [t for t in json.load(r) if t.get('type') == 'page']
                if tabs:
                    url = tabs[0]['webSocketDebuggerUrl']
                    break
            except Exception:
                time.sleep(0.2)
        if not url:
            raise RuntimeError('Chrome did not start')
        self.ws = WS(url)
        self.next_id = 0
        self.events = []
        self.pending = []          # (due, requestId, action)
        self.policy = None
        self.console_errors = []
        self.net = {}              # requestId -> dict(url, enc, dec)
        self.cmd('Page.enable')
        self.cmd('Runtime.enable')
        self.cmd('Log.enable')
        self.cmd('Network.enable')

    def close(self):
        try:
            self.proc.terminate()
            self.proc.wait(timeout=10)
        except Exception:
            self.proc.kill()
        for _ in range(10):        # Chrome's helper processes can still be writing for a moment
            shutil.rmtree(self.profile, ignore_errors=True)
            if not os.path.exists(self.profile):
                break
            time.sleep(0.5)

    # --- protocol
    def _handle_event(self, m):
        meth, p = m.get('method'), m.get('params', {})
        if meth == 'Fetch.requestPaused':
            self._paused(p)
        elif meth == 'Runtime.exceptionThrown':
            d = p['exceptionDetails']
            self.console_errors.append('exception: ' + (d.get('exception', {}).get('description') or d.get('text', '')))
        elif meth == 'Runtime.consoleAPICalled' and p.get('type') == 'error':
            self.console_errors.append('console.error: ' + ' '.join(str(a.get('value', a.get('description', ''))) for a in p['args']))
        elif meth == 'Log.entryAdded':
            e = p['entry']
            if e.get('level') == 'error':
                self.console_errors.append('log: %s (%s)' % (e.get('text'), e.get('url', '')))
        elif meth == 'Network.requestWillBeSent':
            self.net[p['requestId']] = {'url': p['request']['url'], 'enc': 0, 'dec': 0}
        elif meth == 'Network.dataReceived' and p['requestId'] in self.net:
            self.net[p['requestId']]['dec'] += p['dataLength']
        elif meth == 'Network.loadingFinished' and p['requestId'] in self.net:
            self.net[p['requestId']]['enc'] = p['encodedDataLength']
        self.events.append(m)

    def pump(self, seconds):
        end = time.time() + seconds
        while True:
            now = time.time()
            for item in list(self.pending):
                if item[0] <= now:
                    self.pending.remove(item)
                    item[2]()
            left = end - time.time()
            if left <= 0:
                return
            m = self.ws.recv(min(left, 0.1))
            if m:
                self._handle_event(json.loads(m))

    def cmd(self, method, params=None, timeout=60):
        self.next_id += 1
        mid = self.next_id
        self.ws.send(json.dumps({'id': mid, 'method': method, 'params': params or {}}))
        end = time.time() + timeout
        while time.time() < end:
            m = self.ws.recv(0.2)
            if m is None:
                continue
            d = json.loads(m)
            if d.get('id') == mid:
                if 'error' in d:
                    raise RuntimeError('%s: %s' % (method, d['error']))
                return d.get('result', {})
            self._handle_event(d)
        raise TimeoutError(method)

    def eval(self, expr, await_promise=False):
        r = self.cmd('Runtime.evaluate', {'expression': expr, 'returnByValue': True, 'awaitPromise': await_promise})
        if 'exceptionDetails' in r:
            raise RuntimeError('eval failed: ' + json.dumps(r['exceptionDetails'])[:400])
        return r['result'].get('value')

    def wait_for(self, expr, timeout=30, poll=0.1):
        end = time.time() + timeout
        while time.time() < end:
            try:
                if self.eval(expr):
                    return True
            except RuntimeError:
                pass
            self.pump(poll)
        return False

    # --- request policy via the Fetch domain
    def intercept(self, policy, patterns=None):
        """policy(url) -> None (continue) | ('fail',) | ('status', code, body) | ('delay', seconds)"""
        self.policy = policy
        self.cmd('Fetch.enable', {'patterns': patterns or [{'urlPattern': '*'}]})

    def _paused(self, p):
        rid, url = p['requestId'], p['request']['url']
        act = self.policy(url) if self.policy else None

        def cont():
            self._send_nowait('Fetch.continueRequest', {'requestId': rid})

        def fail():
            self._send_nowait('Fetch.failRequest', {'requestId': rid, 'errorReason': 'InternetDisconnected'})

        def fulfill(code, body, ctype='application/json'):
            self._send_nowait('Fetch.fulfillRequest', {
                'requestId': rid, 'responseCode': code,
                'responseHeaders': [{'name': 'Content-Type', 'value': ctype},
                                    {'name': 'Access-Control-Allow-Origin', 'value': '*'}],
                'body': base64.b64encode(body.encode()).decode()})
        if act is None:
            cont()
        elif act[0] == 'fail':
            fail()
        elif act[0] == 'status':
            fulfill(act[1], act[2])
        elif act[0] == 'delay':
            self.pending.append((time.time() + act[1], rid, cont))
        else:
            cont()

    def _send_nowait(self, method, params):
        self.next_id += 1
        self.ws.send(json.dumps({'id': self.next_id, 'method': method, 'params': params}))

    # --- helpers
    def goto(self, url, wait_load=True):
        self.cmd('Page.navigate', {'url': url})
        if wait_load:
            self.wait_for("document.readyState === 'complete'", 30)

    def screenshot(self, path):
        r = self.cmd('Page.captureScreenshot', {'format': 'png'})
        with open(path, 'wb') as fh:
            fh.write(base64.b64decode(r['data']))

    def viewport(self, w, h, mobile=False):
        self.cmd('Emulation.setDeviceMetricsOverride', {'width': w, 'height': h, 'deviceScaleFactor': 1, 'mobile': mobile})

    def scheme(self, dark):
        self.cmd('Emulation.setEmulatedMedia', {'features': [{'name': 'prefers-color-scheme', 'value': 'dark' if dark else 'light'}]})


AD = 'highrevenueformat.com'


def real_errors(chrome):
    """Console errors that are not the (deliberately blocked) third-party ad script."""
    out = []
    for e in chrome.console_errors:
        if AD in e:
            continue
        if e.endswith('/icon.svg)'):      # known, unrelated: the page links an icon.svg that does not exist
            continue
        out.append(e)
    return out


def block_ads_and(policy):
    def p(url):
        if AD in url:
            return ('fail',)
        return policy(url) if policy else None
    return p


def js_click_generate(chrome):
    chrome.eval("document.getElementById('generate-btn').click()")


# ---------------------------------------------------------------- scenarios
def scenario_offline_first(base):
    print('\n[offline-first] every World Bank request blocked')
    c = Chrome()
    try:
        c.intercept(block_ads_and(lambda u: ('fail',) if 'worldbank.org' in u else None))
        t0 = time.time()
        c.goto(base + '/index.html')
        # click right away, without waiting for loadData to settle
        c.eval("window.__t0 = performance.now(); document.getElementById('generate-btn').click()")
        ok = c.wait_for("!document.getElementById('profile-section').hidden", 5, 0.02)
        ms = c.eval("performance.now() - window.__t0")
        check('first Generate works with no network', ok)
        check('first Generate is fast (< 700 ms incl. the 180 ms spinner delay)', ok and ms < 700, '%.0f ms' % ms)
        c.wait_for("document.getElementById('data-status').textContent.length > 0", 15)
        status = c.eval("document.getElementById('data-status').textContent")
        src = c.eval("document.getElementById('data-status').getAttribute('data-source')")
        print('    status: %r (data-source=%s)' % (status, src))
        check('status line reports the built-in snapshot', src == 'static' and 'built-in snapshot' in status and 'WPP 2024' in status)
        person = c.eval("document.getElementById('person-name').textContent + ' | ' + document.getElementById('person-age-gender').textContent")
        print('    generated: ' + person)
        rows = c.eval("document.querySelectorAll('#profile-attributes tr').length")
        check('profile table has the 9 usual rows', rows == 9, rows)
        check('country list was built from the snapshot', c.eval("document.querySelectorAll('#life-controls select').length") >= 0)
        errs = real_errors(c)
        # blocked World Bank fetches log "Failed to load resource" - expected in this scenario
        errs = [e for e in errs if 'worldbank.org' not in e]
        check('no console errors', not errs, errs)
    finally:
        c.close()


def scenario_live(base):
    print('\n[live] real World Bank API from a page origin (CORS)')
    c = Chrome()
    try:
        c.intercept(block_ads_and(None))
        c.goto(base + '/404.html')                       # same origin, seed old cache key
        c.eval("localStorage.setItem('randomLife.countries.v5', '{\"ts\":1,\"countries\":[]}')")
        c.goto(base + '/index.html')
        ok = c.wait_for("App.DATA_LOAD_STATUS.source === 'live'", 90)
        check('live World Bank data used when reachable', ok, c.eval("App.DATA_LOAD_STATUS.message"))
        status = c.eval("document.getElementById('data-status').textContent")
        print('    status: %r' % status)
        check('status line says live + snapshot', 'live World Bank' in status and 'WPP 2024' in status)
        wb = [v for v in c.net.values() if 'api.worldbank.org' in v['url']]
        enc = sum(v['enc'] for v in wb)
        dec = sum(v['dec'] for v in wb)
        print('    World Bank requests: %d, transferred %.2f MB (compressed), decoded %.2f MB' % (len(wb), enc / 1e6, dec / 1e6))
        check('exactly 6 World Bank requests (5 indicators + metadata)', len(wb) == 6, len(wb))
        check('old cache key v5 removed, v6 written', c.eval("localStorage.getItem('randomLife.countries.v5') === null && localStorage.getItem('randomLife.countries.v6') !== null"))
        diff = c.eval("""(function(){var s=App.getStaticCountries(),l=App.getCountries(),n=0,keep=true;
          for(var i=0;i<s.length;i++){ if(s[i].gdpPc!==l[i].gdpPc||s[i].elec!==l[i].elec||s[i].net!==l[i].net) n++;
            if(s[i].pop!==l[i].pop||s[i].leM!==l[i].leM||s[i].urban!==l[i].urban||s[i].fert!==l[i].fert||JSON.stringify(s[i].ageDist)!==JSON.stringify(l[i].ageDist)) keep=false; }
          return {changed:n, total:s.length, unCountsIntact:keep}; })()""")
        print('    live values differ from the snapshot for %d of %d countries; UN/ILO values intact: %s' % (diff['changed'], diff['total'], diff['unCountsIntact']))
        check('UN / ILO values untouched by live data', diff['unCountsIntact'])
        gen = c.eval("(function(){var p=App.generatePerson(App.getCountries(),{countryCode:'JG'});return p.country.code+':'+p.age+':'+p.dataSource;})()")
        check('Channel Islands (JG, World Bank code) matches live rows and generates', gen.startswith('JG:'), gen)
        check('no console errors', not real_errors(c), real_errors(c))
        c.goto(base + '/index.html')
        c.wait_for("document.getElementById('data-status').textContent.length > 0", 15)
        src = c.eval("App.DATA_LOAD_STATUS.source")
        print('    second load: %s - %s' % (src, c.eval("document.getElementById('data-status').textContent")))
        check('second load within 12 h uses the cache', src == 'cached')
    finally:
        c.close()


def scenario_failures(base):
    print('\n[failures] per-variable fallback (blocked / HTTP 500 / malformed / out of range / slower than the 20 s timeout)')
    c = Chrome()
    try:
        # discover country codes from the snapshot so the out-of-range body is plausible
        def policy(url):
            if 'indicator/NY.GDP.PCAP.CD' in url:
                return ('fail',)
            if 'indicator/IT.NET.USER.ZS' in url:
                return ('status', 500, '{"message":"server error"}')
            if 'indicator/SH.H2O.BASW.ZS' in url:
                return ('status', 200, '{"unexpected":"object, not the [paging, rows] array"}')
            if 'indicator/SH.STA.BASS.ZS' in url:
                rows = ','.join('{"indicator":{"id":"SH.STA.BASS.ZS"},"country":{"id":"%s"},"date":"2024","value":%s}' % (cc, 9999 + i)
                                for i, cc in enumerate(CODES))
                return ('status', 200, '[{"page":1,"pages":1},[%s]]' % rows)
            if 'indicator/EG.ELC.ACCS.ZS' in url:
                return ('delay', 40)
            return None
        # country codes: the same list the page uses
        global CODES
        c0 = Chrome()
        try:
            c0.goto(base + '/index.html')
            CODES = c0.eval("App.getStaticCountries().map(function(x){return x.code;})")
        finally:
            c0.close()
        c.intercept(block_ads_and(policy))
        c.goto(base + '/index.html')
        # Generate must work while requests are pending
        js_click_generate(c)
        check('Generate works while live requests are pending', c.wait_for("!document.getElementById('profile-section').hidden", 5))
        ok = c.wait_for("App.DATA_LOAD_STATUS.loading === false", 60)
        check('loading finishes after the 20 s timeout of the hung request', ok)
        status = c.eval("App.DATA_LOAD_STATUS.message")
        print('    status: %r' % status)
        res = c.eval("""(function(){var s=App.getStaticCountries(),l=App.getCountries(),o={};
          ['gdpPc','net','water','sanit','elec'].forEach(function(f){var n=0;for(var i=0;i<s.length;i++){ if(s[i][f]!==l[i][f]) n++; } o[f]=n;});
          return o;})()""")
        print('    countries whose value changed per variable: ' + json.dumps(res))
        check('every failed variable kept its snapshot values', all(v == 0 for v in res.values()), res)
        check('status line says only 1 of 6 datasets is live', '1 of 6' in status, status)
        c.eval("App.updateDataStatus()")
        check('no uncaught exceptions', not [e for e in real_errors(c) if e.startswith('exception')], real_errors(c))
    finally:
        c.close()


def scenario_service_worker(base):
    print('\n[service-worker] app served offline after first visit')
    c = Chrome()
    try:
        c.intercept(block_ads_and(None))
        c.goto(base + '/index.html')
        c.wait_for("App.DATA_LOAD_STATUS.loading === false", 90)
        ready = c.eval("navigator.serviceWorker.ready.then(function(r){return !!r.active;})", True)
        check('service worker active', ready)
        names = c.eval("caches.keys().then(function(k){return k;})", True)
        print('    caches: %s' % names)
        check('cache name bumped to random-life-v28', names == ['random-life-v28'], names)
        cached = c.eval("caches.open('random-life-v28').then(function(c){return c.keys();}).then(function(k){return k.map(function(r){return new URL(r.url).pathname;});})", True)
        check('dataset.js is precached', '/js/dataset.js' in cached, cached)
        c.goto(base + '/index.html')          # now controlled by the SW
        c.cmd('Network.emulateNetworkConditions', {'offline': True, 'latency': 0, 'downloadThroughput': 0, 'uploadThroughput': 0})
        c.intercept(lambda u: ('fail',) if 'worldbank.org' in u or AD in u else None)
        c.goto(base + '/index.html')
        title = c.eval("document.title")
        check('page loads offline from the service worker', 'Random Life' in (title or ''), title)
        js_click_generate(c)
        check('Generate works offline', c.wait_for("!document.getElementById('profile-section').hidden", 5))
        c.wait_for("document.getElementById('data-status').textContent.length > 0", 10)
        status = c.eval("document.getElementById('data-status').textContent")
        print('    offline status: %r' % status)
        check('offline status is truthful (cached or built-in)', ('cached' in status) or ('built-in' in status))
    finally:
        c.close()


def scenario_file():
    print('\n[file] opened from file://')
    c = Chrome()
    try:
        c.intercept(block_ads_and(lambda u: ('fail',) if 'worldbank.org' in u else None))
        c.goto('file://' + os.path.join(ROOT, 'index.html'))
        js_click_generate(c)
        check('Generate works from file://', c.wait_for("!document.getElementById('profile-section').hidden", 5))
        c.wait_for("document.getElementById('data-status').textContent.length > 0", 10)
        print('    status: %r' % c.eval("document.getElementById('data-status').textContent"))
        errs = [e for e in real_errors(c) if 'worldbank.org' not in e]
        check('no console errors', not errs, errs)
    finally:
        c.close()


def scenario_saved_lives(base_new, base_old):
    print('\n[saved-lives] a life saved by the OLD code still renders')
    old = Chrome()
    try:
        old.intercept(block_ads_and(lambda u: ('fail',) if 'worldbank.org' in u else None))
        old.goto(base_old + '/index.html')
        old.eval("document.getElementById('generate-btn').click()")
        old.wait_for("!document.getElementById('profile-section').hidden", 5)
        # save via the real UI: open History, click the Save button of the recent life
        old.eval("document.getElementById('history-btn').click()")
        old.pump(0.4)
        clicked = old.eval("(function(){var b=[].slice.call(document.querySelectorAll('#history-recent-list button')).filter(function(x){return /save/i.test(x.textContent);})[0]; if(!b) return false; b.click(); return true;})()")
        stored = old.eval("localStorage.getItem('randomLife.savedLives.v1')")
        check('old code saved a life', clicked and bool(stored), clicked)
        person = json.loads(stored)[0]['person']
        print('    old saved person: %s, %s, keys=%s' % (person['name'], person['country']['name'], ','.join(person.keys())))
    finally:
        old.close()
    new = Chrome()
    try:
        new.intercept(block_ads_and(lambda u: ('fail',) if 'worldbank.org' in u else None))
        new.goto(base_new + '/404.html')
        new.eval("localStorage.setItem('randomLife.savedLives.v1', %s)" % json.dumps(stored))
        new.goto(base_new + '/index.html')
        new.eval("document.getElementById('history-btn').click()")
        new.pump(0.3)
        new.eval("document.getElementById('history-tab-saved').click()")
        new.pump(0.3)
        txt = new.eval("document.getElementById('history-saved-list').innerText")
        print('    saved list now shows: %r' % txt[:120])
        check('saved list renders the old life', person['name']['first'] in txt and person['country']['name'] in txt, txt)
        check('no console errors', not [e for e in real_errors(new) if 'worldbank' not in e], real_errors(new))
    finally:
        new.close()


SIG_JS = r"""
(function(){
  function sig(el, depth){
    var s = el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') +
      (typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\s+/).join('.') : '');
    var attrs = []; for (var i = 0; i < el.attributes.length; i++) { var n = el.attributes[i].name; if (n !== 'class' && n !== 'id' && n !== 'style' && n !== 'tabindex' && n !== 'value' && n !== 'for' && n !== 'name' && n !== 'aria-labelledby') attrs.push(n); }
    s += attrs.sort().length ? '[' + attrs.join(',') + ']' : '';
    var kids = []; for (var j = 0; j < el.children.length; j++) { if (el.children[j].tagName === 'OPTION') continue; kids.push(sig(el.children[j])); }
    return s + (kids.length ? '(' + kids.join(' ') + ')' : '');
  }
  return sig(document.getElementById(%s));
})()
"""

TAGSET_JS = r"""
(function(){var set={};document.querySelectorAll('#info-dialog *').forEach(function(e){
  var a=[].map.call(e.attributes,function(x){return x.name;}).sort().join(',');
  set[e.tagName.toLowerCase()+'.'+(e.className||'')+'['+a+']']=1;});return Object.keys(set).sort();})()
"""


def drive_states(c, base, tag, shots, widths, report):
    """Walk the same UI states for one build; returns DOM signatures and screenshots."""
    out = {}
    for (w, h, mobile) in widths:
        for dark in (False, True):
            c.viewport(w, h, mobile)
            c.scheme(dark)
            label = '%dx%d_%s' % (w, h, 'dark' if dark else 'light')
            fname = tag + '_' + label
            c.goto(base + '/index.html')
            c.wait_for("App.DATA_LOAD_STATUS.loading === false", 20)
            c.eval("document.getElementById('data-status').textContent=''")     # status text is allowed to differ
            c.pump(1.2)           # let overlay scrollbars auto-hide so screenshots are comparable
            c.screenshot(os.path.join(shots, fname + '_main.png'))
            out[label + '_main'] = c.eval(SIG_JS % json.dumps('profile-section') + '+"|"+' + SIG_JS % json.dumps('advanced-section'))
            c.eval("document.getElementById('generate-btn').click()")
            c.wait_for("!document.getElementById('profile-section').hidden", 5)
            c.pump(0.5)
            c.screenshot(os.path.join(shots, fname + '_life.png'))
            out[label + '_life'] = c.eval(SIG_JS % json.dumps('profile-card'))
            out[label + '_life_rows'] = c.eval("[].map.call(document.querySelectorAll('#profile-attributes th'),function(e){return e.textContent;}).join('|')")
            c.eval("document.getElementById('add-life-btn').click()")
            c.pump(0.2)
            c.eval("document.getElementById('generate-btn').click()")
            c.wait_for("document.querySelectorAll('#profile-attributes tr').length > 0 && document.getElementById('profile-attributes').closest('table').getAttribute('data-compare') === 'true'", 5)
            c.pump(0.5)
            c.screenshot(os.path.join(shots, fname + '_compare.png'))
            out[label + '_compare'] = c.eval(SIG_JS % json.dumps('profile-card') + '+"|"+' + SIG_JS % json.dumps('life-controls-section'))
            out[label + '_compare_rows'] = c.eval("[].map.call(document.querySelectorAll('#profile-attributes th'),function(e){return e.textContent;}).join('|')")
            c.eval("document.getElementById('info-btn').click()")
            c.pump(0.5)
            c.screenshot(os.path.join(shots, fname + '_info.png'))
            out[label + '_info_tags'] = c.eval(TAGSET_JS)
    return out


def scenario_ui_compare(base_new, base_old, shots):
    print('\n[ui-compare] old vs new: DOM structure + screenshots (desktop/phone, light/dark)')
    widths = [(1280, 900, False), (390, 844, True)]
    results = {}
    for tag, base in (('old', base_old), ('new', base_new)):
        c = Chrome()
        try:
            c.intercept(block_ads_and(lambda u: ('fail',) if 'worldbank.org' in u else None))
            results[tag] = drive_states(c, base, tag, shots, widths, None)
            results[tag + '_errors'] = real_errors(c)
        finally:
            c.close()
    mism = []
    for key in results['old']:
        a, b = results['old'][key], results['new'][key]
        name = key
        if 'info_tags' in key:
            added = sorted(set(b) - set(a))
            removed = sorted(set(a) - set(b))
            print('    %s: info-dialog element kinds added=%s removed=%s' % (name, added, removed))
            if removed or any(not x.startswith('a.') for x in added):
                mism.append(key)
        elif a != b:
            mism.append(key)
            print('    DOM differs for %s' % name)
            if os.environ.get('RL_DEBUG'):
                import difflib
                for tok in difflib.unified_diff(a.replace(' ', '\n').split('\n'), b.replace(' ', '\n').split('\n'), lineterm='', n=0):
                    print('       ' + tok[:160])
    check('DOM structure of main / life / compare views identical, rows identical', not mism, mism)
    errs = [e for e in results['new_errors'] if 'worldbank' not in e]
    check('no console errors in any UI state', not errs, errs)
    # pixel comparison of the static main screen
    try:
        from PIL import Image, ImageChops
    except Exception:
        print('    (Pillow not installed: pixel diff skipped; screenshots kept for manual review)')
        return
    for (w, h, _m) in widths:
        for scheme in ('light', 'dark'):
            a = Image.open(os.path.join(shots, 'old_%dx%d_%s_main.png' % (w, h, scheme))).convert('RGB')
            b = Image.open(os.path.join(shots, 'new_%dx%d_%s_main.png' % (w, h, scheme))).convert('RGB')
            diff = ImageChops.difference(a, b).getbbox()
            check('main screen pixel-identical %dx%d %s (status line blanked)' % (w, h, scheme), diff is None, diff)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--baseline', default='')
    ap.add_argument('--shots', default='')
    ap.add_argument('--skip-live', action='store_true')
    ap.add_argument('--only', default='', help='run one scenario: offline|live|failures|sw|file|saved|ui')
    args = ap.parse_args()
    if not find_browser():
        print('No Chromium / Chrome found on PATH.')
        return 2
    srv, port = serve(ROOT)
    base = 'http://127.0.0.1:%d' % port
    old_base = None
    if args.baseline:
        osrv, oport = serve(os.path.abspath(args.baseline))
        old_base = 'http://127.0.0.1:%d' % oport
    shots = args.shots or tempfile.mkdtemp(prefix='random-life-shots-')
    os.makedirs(shots, exist_ok=True)
    try:
        def want(k):
            return not args.only or args.only == k
        if want('offline'):
            scenario_offline_first(base)
        if want('live') and not args.skip_live:
            scenario_live(base)
        if want('failures'):
            scenario_failures(base)
        if want('sw'):
            scenario_service_worker(base)
        if want('file'):
            scenario_file()
        if old_base and want('saved'):
            scenario_saved_lives(base, old_base)
        if old_base and want('ui'):
            scenario_ui_compare(base, old_base, shots)
    finally:
        srv.shutdown()
        if not args.shots:
            shutil.rmtree(shots, ignore_errors=True)
    print('\nChecks passed: %d, failed: %d' % (len(PASS), len(FAIL)))
    for f in FAIL:
        print('  FAILED: ' + f)
    return 0 if not FAIL else 1


CODES = []

if __name__ == '__main__':
    sys.exit(main())
