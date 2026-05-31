import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parsePorts, PRESETS, formatText, formatJSON, formatMarkdown, SERVICE_MAP, scan } from "../src/index.js";
import { createServer } from "net";

describe("parsePorts", () => {
  it("parses single port", () => {
    assert.deepStrictEqual(parsePorts("80"), [80]);
  });

  it("parses multiple ports", () => {
    assert.deepStrictEqual(parsePorts("80,443,8080"), [80, 443, 8080]);
  });

  it("parses port range", () => {
    const result = parsePorts("3000-3003");
    assert.deepStrictEqual(result, [3000, 3001, 3002, 3003]);
  });

  it("parses mixed ports and ranges", () => {
    const result = parsePorts("80,443,3000-3002");
    assert.deepStrictEqual(result, [80, 443, 3000, 3001, 3002]);
  });

  it("deduplicates ports", () => {
    const result = parsePorts("80,80,443");
    assert.deepStrictEqual(result, [80, 443]);
  });

  it("sorts ports", () => {
    const result = parsePorts("8080,80,443");
    assert.deepStrictEqual(result, [80, 443, 8080]);
  });

  it("throws on invalid port", () => {
    assert.throws(() => parsePorts("0"), /Invalid port/);
    assert.throws(() => parsePorts("70000"), /Invalid port/);
  });

  it("throws on invalid range", () => {
    assert.throws(() => parsePorts("100-50"), /Invalid port range/);
  });

  it("throws on non-numeric", () => {
    assert.throws(() => parsePorts("abc"), /Invalid port/);
  });
});

describe("PRESETS", () => {
  it("has web preset", () => {
    assert.ok(PRESETS.web);
    assert.ok(PRESETS.web.includes("80"));
  });

  it("has db preset", () => {
    assert.ok(PRESETS.db);
    assert.ok(PRESETS.db.includes("3306"));
  });

  it("has common preset", () => {
    assert.ok(PRESETS.common);
    assert.ok(PRESETS.common.includes("22"));
    assert.ok(PRESETS.common.includes("80"));
  });

  it("has top100 preset", () => {
    assert.ok(PRESETS.top100);
  });
});

describe("SERVICE_MAP", () => {
  it("maps port 80 to http", () => {
    assert.strictEqual(SERVICE_MAP[80].name, "http");
  });

  it("maps port 443 to https", () => {
    assert.strictEqual(SERVICE_MAP[443].name, "https");
  });

  it("maps port 3306 to mysql", () => {
    assert.strictEqual(SERVICE_MAP[3306].name, "mysql");
  });

  it("maps port 5432 to postgresql", () => {
    assert.strictEqual(SERVICE_MAP[5432].name, "postgresql");
  });
});

describe("formatText", () => {
  it("formats basic result", () => {
    const result = {
      host: "localhost",
      startTime: 1000,
      endTime: 2000,
      results: [
        { port: 80, state: "open" as const, service: "http", serviceDesc: "HTTP", banner: null, responseTime: 50 },
        { port: 443, state: "closed" as const, service: null, serviceDesc: null, banner: null, responseTime: 10 },
      ],
      summary: { total: 2, open: 1, closed: 1, filtered: 0 },
    };
    const text = formatText(result);
    assert.ok(text.includes("localhost"));
    assert.ok(text.includes("80"));
    assert.ok(text.includes("http"));
    assert.ok(text.includes("1 open"));
  });

  it("handles no open ports", () => {
    const result = {
      host: "example.com",
      startTime: 1000,
      endTime: 2000,
      results: [
        { port: 80, state: "closed" as const, service: null, serviceDesc: null, banner: null, responseTime: 10 },
      ],
      summary: { total: 1, open: 0, closed: 1, filtered: 0 },
    };
    const text = formatText(result);
    assert.ok(text.includes("No open ports found"));
  });
});

describe("formatJSON", () => {
  it("produces valid JSON", () => {
    const result = {
      host: "localhost",
      startTime: 1000,
      endTime: 2000,
      results: [],
      summary: { total: 0, open: 0, closed: 0, filtered: 0 },
    };
    const json = formatJSON(result);
    const parsed = JSON.parse(json);
    assert.strictEqual(parsed.host, "localhost");
  });
});

describe("formatMarkdown", () => {
  it("produces markdown table", () => {
    const result = {
      host: "localhost",
      startTime: 1000,
      endTime: 2000,
      results: [
        { port: 80, state: "open" as const, service: "http", serviceDesc: "HTTP", banner: null, responseTime: 50 },
      ],
      summary: { total: 1, open: 1, closed: 0, filtered: 0 },
    };
    const md = formatMarkdown(result);
    assert.ok(md.includes("| Port |"));
    assert.ok(md.includes("80"));
  });
});

describe("scan (integration)", () => {
  it("scans localhost with open server", async () => {
    // Create a test server on a random port
    const server = createServer((socket) => {
      socket.write("TEST-BANNER\r\n");
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    const addr = server.address() as { port: number };
    const testPort = addr.port;

    try {
      const result = await scan({
        host: "127.0.0.1",
        ports: [testPort],
        timeout: 2000,
        concurrency: 10,
        grabBanner: true,
        serviceDetection: true,
      });

      assert.strictEqual(result.results.length, 1);
      assert.strictEqual(result.results[0].port, testPort);
      assert.strictEqual(result.results[0].state, "open");
      assert.strictEqual(result.summary.open, 1);
    } finally {
      server.close();
    }
  });

  it("detects closed port", async () => {
    // Scan an unlikely-to-be-open high port
    const result = await scan({
      host: "127.0.0.1",
      ports: [59999],
      timeout: 1000,
      concurrency: 1,
      grabBanner: false,
      serviceDetection: false,
    });

    assert.strictEqual(result.results.length, 1);
    assert.ok(result.results[0].state === "closed" || result.results[0].state === "filtered");
    assert.strictEqual(result.summary.open, 0);
  });
});
