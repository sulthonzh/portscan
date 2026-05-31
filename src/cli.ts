#!/usr/bin/env node

import {
  scan,
  parsePorts,
  PRESETS,
  formatText,
  formatJSON,
  formatMarkdown,
  type ScanOptions,
} from "./index.js";

function printUsage(): void {
  console.log(`portscan — zero-dep port scanner with service detection

USAGE:
  portscan <host> [ports] [options]

ARGUMENTS:
  host              Target hostname or IP
  ports             Port range (e.g. 80,443,3000-3010) or preset name

PRESETS:
  common            Common service ports (22,80,443,3306,etc)
  web               Web server ports
  db                Database ports
  mail              Mail server ports
  top100            Top 100 most common ports

OPTIONS:
  -t, --timeout <ms>        Connection timeout (default: 3000)
  -c, --concurrency <n>     Parallel scans (default: 50)
  --banner                  Grab service banners
  --open                    Only show open ports
  --format <fmt>            Output: text, json, markdown (default: text)
  -p, --ports <range>       Port range (alternative to positional arg)
  -h, --help                Show this help
  -v, --version             Show version

EXAMPLES:
  portscan localhost 80,443,8080
  portscan 192.168.1.1 common
  portscan example.com top100 --banner
  portscan localhost 1-1024 --format json
  portscan localhost --ports 3000-4000 --open --timeout 5000
`);
}

function parseArgs(args: string[]): {
  host: string;
  ports: string;
  timeout: number;
  concurrency: number;
  banner: boolean;
  openOnly: boolean;
  format: "text" | "json" | "markdown";
} {
  const result = {
    host: "",
    ports: "common",
    timeout: 3000,
    concurrency: 50,
    banner: false,
    openOnly: false,
    format: "text" as "text" | "json" | "markdown",
  };

  let i = 0;
  while (i < args.length) {
    const arg = args[i];
    switch (arg) {
      case "-h":
      case "--help":
        printUsage();
        process.exit(0);
      case "-v":
      case "--version":
        console.log("portscan v1.0.0");
        process.exit(0);
      case "-t":
      case "--timeout":
        result.timeout = parseInt(args[++i], 10);
        if (isNaN(result.timeout) || result.timeout < 100) {
          console.error("Error: timeout must be >= 100ms");
          process.exit(1);
        }
        break;
      case "-c":
      case "--concurrency":
        result.concurrency = parseInt(args[++i], 10);
        if (isNaN(result.concurrency) || result.concurrency < 1) {
          console.error("Error: concurrency must be >= 1");
          process.exit(1);
        }
        break;
      case "--banner":
        result.banner = true;
        break;
      case "--open":
        result.openOnly = true;
        break;
      case "--format":
        const fmt = args[++i];
        if (!["text", "json", "markdown"].includes(fmt)) {
          console.error("Error: format must be text, json, or markdown");
          process.exit(1);
        }
        result.format = fmt as "text" | "json" | "markdown";
        break;
      case "-p":
      case "--ports":
        result.ports = args[++i];
        break;
      default:
        if (!result.host) {
          result.host = arg;
        } else {
          result.ports = arg;
        }
        break;
    }
    i++;
  }

  return result;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    printUsage();
    process.exit(1);
  }

  const parsed = parseArgs(args);

  if (!parsed.host) {
    console.error("Error: host is required");
    process.exit(1);
  }

  // Resolve preset or parse port range
  let portList: number[];
  const preset = PRESETS[parsed.ports.toLowerCase()];
  if (preset) {
    portList = parsePorts(preset);
  } else {
    try {
      portList = parsePorts(parsed.ports);
    } catch (err: any) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
  }

  const options: ScanOptions = {
    host: parsed.host,
    ports: portList,
    timeout: parsed.timeout,
    concurrency: parsed.concurrency,
    grabBanner: parsed.banner,
    serviceDetection: true,
  };

  const result = await scan(options);

  // Filter if --open
  if (parsed.openOnly) {
    result.results = result.results.filter((r) => r.state === "open");
    result.summary.closed = 0;
    result.summary.filtered = 0;
  }

  // Output
  let output: string;
  switch (parsed.format) {
    case "json":
      output = formatJSON(result);
      break;
    case "markdown":
      output = formatMarkdown(result);
      break;
    default:
      output = formatText(result);
  }

  console.log(output);
}

main().catch((err) => {
  console.error("Fatal:", err.message);
  process.exit(1);
});
