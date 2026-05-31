# portscan

Zero-dep port scanner with service detection, banner grabbing, and multiple output formats.

Built because `nmap` is overkill for "which ports are open on my dev server?" and most Node port scanners have 15 dependencies for no reason.

## Install

```bash
npm install -g portscan
```

## Usage

```bash
# Scan common ports
portscan localhost common

# Scan specific ports
portscan 192.168.1.1 80,443,8080

# Scan a range
portscan example.com 3000-4000

# Use a preset with banner grabbing
portscan myserver.db common --banner

# JSON output for scripts
portscan localhost web --format json

# Markdown for reports
portscan 10.0.0.1 db --format markdown

# Only show open ports
portscan localhost top100 --open

# Custom timeout and concurrency
portscan slow-server.com common --timeout 5000 --concurrency 20
```

## Presets

| Preset | Description | Example Ports |
|--------|-------------|---------------|
| `common` | Common services | 22, 80, 443, 3306, 5432, 8080 |
| `web` | Web servers | 80, 443, 3000, 5000, 8080, 8443 |
| `db` | Databases | 3306, 5432, 1433, 27017, 6379, 9200 |
| `mail` | Mail servers | 25, 110, 143, 465, 587, 993, 995 |
| `top100` | Top 100 ports | Full nmap-style top 100 |

## Service Detection

Automatically maps well-known ports to service names:

- `22` → SSH
- `80` → HTTP
- `443` → HTTPS
- `3306` → MySQL
- `5432` → PostgreSQL
- `6379` → Redis
- `27017` → MongoDB
- ...and 20+ more

## Banner Grabbing

Use `--banner` to read the first bytes from open services. Useful for identifying what's actually running:

```
$ portscan localhost 80,443 --banner
portscan — localhost
Scanned 2 ports in 45ms

OPEN PORTS (1):

  80/tcp [http] — 12ms
  └─ nginx/1.24.0
```

## Output Formats

### Text (default)
```
portscan — localhost
Scanned 5 ports in 123ms

OPEN PORTS (2):

  22/tcp [ssh] — 5ms
  80/tcp [http] — 3ms

Summary: 2 open, 2 closed, 1 filtered
```

### JSON (`--format json`)
Structured output for scripting, CI, or piping to `jq`.

### Markdown (`--format markdown`)
Piped into reports, PRs, or documentation.

## API

```typescript
import { scan, parsePorts } from 'portscan';

const result = await scan({
  host: 'localhost',
  ports: parsePorts('80,443,3000-3010'),
  timeout: 3000,
  concurrency: 50,
  grabBanner: true,
  serviceDetection: true,
});

console.log(result.summary);
// { total: 12, open: 3, closed: 7, filtered: 2 }
```

## Why This Exists

I needed a lightweight port scanner that:
- Works as a CLI and as a library
- Doesn't pull in 30 dependencies
- Tells me what service is on each port
- Can grab banners
- Outputs JSON for scripting

`nmap` is great but it's a whole ecosystem. Sometimes you just want to know if port 5432 is reachable.

## License

MIT
