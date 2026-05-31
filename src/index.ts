import { createConnection, Socket } from "net";

/** Well-known service map for common ports */
const SERVICE_MAP: Record<number, { name: string; proto: "tcp" | "udp"; desc: string }> = {
  21: { name: "ftp", proto: "tcp", desc: "File Transfer Protocol" },
  22: { name: "ssh", proto: "tcp", desc: "Secure Shell" },
  23: { name: "telnet", proto: "tcp", desc: "Telnet" },
  25: { name: "smtp", proto: "tcp", desc: "Simple Mail Transfer" },
  53: { name: "dns", proto: "tcp", desc: "Domain Name System" },
  80: { name: "http", proto: "tcp", desc: "Hypertext Transfer Protocol" },
  110: { name: "pop3", proto: "tcp", desc: "Post Office Protocol v3" },
  143: { name: "imap", proto: "tcp", desc: "Internet Message Access" },
  443: { name: "https", proto: "tcp", desc: "HTTP over TLS/SSL" },
  445: { name: "smb", proto: "tcp", desc: "Server Message Block" },
  993: { name: "imaps", proto: "tcp", desc: "IMAP over TLS" },
  995: { name: "pop3s", proto: "tcp", desc: "POP3 over TLS" },
  1433: { name: "mssql", proto: "tcp", desc: "Microsoft SQL Server" },
  1521: { name: "oracle", proto: "tcp", desc: "Oracle DB" },
  3306: { name: "mysql", proto: "tcp", desc: "MySQL" },
  3389: { name: "rdp", proto: "tcp", desc: "Remote Desktop Protocol" },
  5432: { name: "postgresql", proto: "tcp", desc: "PostgreSQL" },
  5672: { name: "amqp", proto: "tcp", desc: "Advanced Message Queuing" },
  6379: { name: "redis", proto: "tcp", desc: "Redis" },
  8080: { name: "http-alt", proto: "tcp", desc: "HTTP Alternate / Proxy" },
  8443: { name: "https-alt", proto: "tcp", desc: "HTTPS Alternate" },
  9090: { name: "websm", proto: "tcp", desc: "WebSM / Openfire" },
  9200: { name: "elasticsearch", proto: "tcp", desc: "Elasticsearch HTTP" },
  9300: { name: "es-transport", proto: "tcp", desc: "Elasticsearch Transport" },
  11211: { name: "memcached", proto: "tcp", desc: "Memcached" },
  27017: { name: "mongodb", proto: "tcp", desc: "MongoDB" },
  27018: { name: "mongodb", proto: "tcp", desc: "MongoDB (sharding)" },
};

export interface ScanOptions {
  host: string;
  ports: number[];
  timeout: number;
  concurrency: number;
  grabBanner: boolean;
  serviceDetection: boolean;
}

export interface PortResult {
  port: number;
  state: "open" | "closed" | "filtered";
  service: string | null;
  serviceDesc: string | null;
  banner: string | null;
  responseTime: number;
}

export interface ScanResult {
  host: string;
  startTime: number;
  endTime: number;
  results: PortResult[];
  summary: {
    total: number;
    open: number;
    closed: number;
    filtered: number;
  };
}

/** Scan a single port */
function scanPort(
  host: string,
  port: number,
  timeout: number,
  grabBanner: boolean
): Promise<PortResult> {
  return new Promise((resolve) => {
    const start = Date.now();
    let settled = false;
    let banner: string | null = null;

    const finish = (state: "open" | "closed" | "filtered") => {
      if (settled) return;
      settled = true;
      const responseTime = Date.now() - start;
      const known = SERVICE_MAP[port];

      resolve({
        port,
        state,
        service: state === "open" && known ? known.name : null,
        serviceDesc: state === "open" && known ? known.desc : null,
        banner,
        responseTime,
      });
    };

    const socket: Socket = createConnection({ host, port }, () => {
      // Connection established — port is open
      if (grabBanner) {
        // Wait briefly for a banner
        const bannerTimeout = setTimeout(() => {
          socket.destroy();
          finish("open");
        }, 2000);

        let bannerBuf = "";
        socket.on("data", (data: Buffer) => {
          bannerBuf += data.toString("utf-8").slice(0, 512);
          socket.destroy();
          clearTimeout(bannerTimeout);
          banner = bannerBuf.trim() || null;
          finish("open");
        });

        socket.on("error", () => {
          clearTimeout(bannerTimeout);
          socket.destroy();
          finish("open");
        });
      } else {
        socket.destroy();
        finish("open");
      }
    });

    socket.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "ECONNREFUSED") {
        finish("closed");
      } else if (
        err.code === "ECONNRESET" ||
        err.code === "EHOSTUNREACH" ||
        err.code === "ENETUNREACH"
      ) {
        finish("filtered");
      } else {
        finish("filtered");
      }
    });

    socket.setTimeout(timeout, () => {
      socket.destroy();
      finish("filtered");
    });
  });
}

/** Run scan with concurrency control */
export async function scan(options: ScanOptions): Promise<ScanResult> {
  const { host, ports, timeout, concurrency, grabBanner, serviceDetection } = options;
  const startTime = Date.now();
  const results: PortResult[] = [];

  // Process ports in batches
  for (let i = 0; i < ports.length; i += concurrency) {
    const batch = ports.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map((port) => scanPort(host, port, timeout, grabBanner && serviceDetection))
    );
    results.push(...batchResults);
  }

  // Sort by port number
  results.sort((a, b) => a.port - b.port);

  const endTime = Date.now();

  return {
    host,
    startTime,
    endTime,
    results,
    summary: {
      total: results.length,
      open: results.filter((r) => r.state === "open").length,
      closed: results.filter((r) => r.state === "closed").length,
      filtered: results.filter((r) => r.state === "filtered").length,
    },
  };
}

/** Parse port range string like "80,443,3000-3010" */
export function parsePorts(input: string): number[] {
  const ports = new Set<number>();
  const parts = input.split(",").map((p) => p.trim());

  for (const part of parts) {
    if (part.includes("-")) {
      const [startStr, endStr] = part.split("-", 2);
      const start = parseInt(startStr, 10);
      const end = parseInt(endStr, 10);
      if (isNaN(start) || isNaN(end) || start < 1 || end > 65535 || start > end) {
        throw new Error(`Invalid port range: ${part}`);
      }
      for (let p = start; p <= end; p++) ports.add(p);
    } else {
      const p = parseInt(part, 10);
      if (isNaN(p) || p < 1 || p > 65535) {
        throw new Error(`Invalid port: ${part}`);
      }
      ports.add(p);
    }
  }

  return Array.from(ports).sort((a, b) => a - b);
}

/** Common port presets */
export const PRESETS: Record<string, string> = {
  web: "80,443,8080,8443,3000,3001,4000,5000,8000,8888,9090",
  db: "3306,5432,1433,1521,27017,6379,11211,9200",
  mail: "25,110,143,465,587,993,995",
  common: "21,22,23,25,53,80,110,143,443,445,993,995,3306,3389,5432,6379,8080,27017",
  top100: "7,9,13,21,22,23,25,26,37,53,79,80,81,110,111,113,119,135,139,143,144,179,199,389,427,443,444,445,465,513,514,515,543,544,548,554,587,631,646,873,990,993,995,1025,1026,1027,1028,1029,1110,1433,1720,1723,1755,1900,2000,2001,2049,2121,2717,3000,3128,3306,3389,3986,4899,5000,5009,5051,5060,5101,5190,5357,5432,5631,5666,5800,5900,6000,6001,6646,7070,8000,8008,8009,8080,8081,8443,8888,9100,9999,10000,32768,49152,49153,49154,49155,49156,49157",
};

/** Format results as text */
export function formatText(result: ScanResult): string {
  const lines: string[] = [];
  const openResults = result.results.filter((r) => r.state === "open");

  lines.push(`portscan — ${result.host}`);
  lines.push(`Scanned ${result.summary.total} ports in ${result.endTime - result.startTime}ms`);
  lines.push("");

  if (openResults.length === 0) {
    lines.push("No open ports found.");
    return lines.join("\n");
  }

  lines.push(`OPEN PORTS (${openResults.length}):`);
  lines.push("");

  for (const r of openResults) {
    const svc = r.service ? ` [${r.service}]` : "";
    const ms = `${r.responseTime}ms`;
    const banner = r.banner ? `\n  └─ ${r.banner.slice(0, 80)}` : "";
    lines.push(`  ${r.port}/tcp${svc} — ${ms}${banner}`);
  }

  lines.push("");
  lines.push(
    `Summary: ${result.summary.open} open, ${result.summary.closed} closed, ${result.summary.filtered} filtered`
  );

  return lines.join("\n");
}

/** Format results as JSON */
export function formatJSON(result: ScanResult): string {
  return JSON.stringify(result, null, 2);
}

/** Format results as markdown */
export function formatMarkdown(result: ScanResult): string {
  const lines: string[] = [];
  const openResults = result.results.filter((r) => r.state === "open");

  lines.push(`# portscan — ${result.host}`);
  lines.push("");
  lines.push(`Scanned **${result.summary.total}** ports in **${result.endTime - result.startTime}ms**`);
  lines.push("");

  if (openResults.length === 0) {
    lines.push("*No open ports found.*");
    return lines.join("\n");
  }

  lines.push("| Port | State | Service | Response Time | Banner |");
  lines.push("|------|-------|---------|---------------|--------|");

  for (const r of result.results) {
    if (r.state !== "open") continue;
    const svc = r.service || "-";
    const banner = r.banner ? "`" + r.banner.slice(0, 50).replace(/`/g, "'") + "`" : "-";
    lines.push(`| ${r.port}/tcp | ${r.state} | ${svc} | ${r.responseTime}ms | ${banner} |`);
  }

  lines.push("");
  lines.push(
    `**Summary:** ${result.summary.open} open, ${result.summary.closed} closed, ${result.summary.filtered} filtered`
  );

  return lines.join("\n");
}

// Re-export SERVICE_MAP for testing
export { SERVICE_MAP };
