<h1 class="text-center mb-5">BounceBack</h1>
<p class="text-gray">Unmask recovery vectors — safely.</p>

---

## Automated Facebook Recovery Checker (Node.js)

BounceBack is a Node.js tool that automates checks against Facebook's default account recovery page to identify phone-based recovery paths. Designed for security professionals, researchers, and account owners who want to proactively test recovery flows for authorized accounts.

> ⚠️ **Responsible use:** Only run BounceBack against accounts you own or have explicit written permission to test. Unauthorized use may be illegal and violate Facebook's Terms of Service.

---

## Features

- Test Facebook phone-number combos (one per line input).
- Proxy support (HTTP/HTTPS/SOCKS, including auth) with optional proxy pool.
- Multi-worker concurrency using Puppeteer browser instances.
- Uses Facebook's default recovery page (`https://web.facebook.com/login/identify/?ctx=recover&from_login_screen=0`).
- Live progress and logs via Socket.IO UI.
- Output of discovered/"valid" numbers to `valid.txt`.

---

## Quick Start

### Requirements
- Node.js 16+
- npm or yarn
- OS dependencies for Puppeteer (Chrome)

### Installation

```bash
git clone https://github.com/your-org/bounceback.git
cd bounceback
npm install
````

### File Layout

```
/uploads/numbers.txt      # phone combos
/uploads/proxy.txt        # optional proxy list
/uploads/valid.txt        # results
/public                   # web UI files
index.js           # main server + checker
```

### Running the App

```bash
node index.js
```

Open the web UI at `http://localhost:3000` to upload `numbers.txt` and optional `proxy.txt`, then start the checker.

---

## Usage

* Upload `numbers.txt` (one phone per line).
* Upload `proxy.txt` (optional).
* Start/stop the run and monitor logs via web UI.

### Input Example

```
+15551234567
+15557654321
+447911123456
```

### Proxy Example

```
http://12.34.56.78:8080
socks5://user:pass@10.11.12.13:1080
```

---

## How It Works

1. Multiple Puppeteer browser instances (workers) submit phone numbers to Facebook's recovery page.
2. The page is parsed using Cheerio to detect recovery-related phrases.
3. Positive hits are saved to `/uploads/valid.txt` and emitted via Socket.IO.
4. Optional proxies can be used per worker.
5. Randomized delays help reduce detection and throttling.

---

## Configuration

Runtime options (can be moved to `config.json`):

* `PORT` — default `3000`
* `WORKERS` — default 5
* `UPLOAD_DIR` — folder for `numbers.txt`, `proxy.txt`, `valid.txt`
* Request timeouts and delay ranges
* Puppeteer launch arguments

Example `config.json`:

```json
{
  "port": 3000,
  "workers": 5,
  "timeout": 30000,
  "minDelayMs": 800,
  "maxDelayMs": 1500,
  "userAgent": "BounceBack/1.0"
}
```

---

## Output

`/uploads/valid.txt` — appended list of numbers with a potential recovery path.

Fields:

* `input_value` (phone number)
* `timestamp` (UTC)
* `status` (`potential_recovery_path_found`, `no_recovery_path`, `rate_limited`, `error`)
* `notes` (optional context)

---

## Ethics & Legal

* Test only authorized accounts.
* Do not attempt account takeover.
* Respect platform rate limits and local laws.

---

## Best Practices

* Use a moderate number of workers.
* Rotate proxies to avoid IP bans.
* Implement exponential backoff and handle CAPTCHAs.
* Secure logs and `valid.txt` files.

---

## Contributing

1. Fork the repo
2. Create a feature branch
3. Add tests and update `package.json`
4. Submit a pull request

---

## License

MIT or your chosen license.


