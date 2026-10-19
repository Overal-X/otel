import { createServer } from "node:http";

// A fake OTLP/HTTP intake. The protobuf decoding is hand-rolled over the handful of OTLP trace
// fields the tests assert on, so the tests do not trust the same library that encoded them.

export const SpanKind = { INTERNAL: 1, SERVER: 2, CLIENT: 3 };
export const StatusCode = { UNSET: 0, OK: 1, ERROR: 2 };

export async function startReceiver() {
  const requests = [];
  const waiters = new Set();
  const server = createServer((req, res) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const body = Buffer.concat(chunks);
      requests.push({ method: req.method, path: req.url, headers: req.headers, body: decodeRequest(body) });
      res.writeHead(200, { "content-type": "application/x-protobuf" });
      res.end();
      for (const check of waiters) check();
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

  const spans = () =>
    requests.flatMap((r) =>
      r.body.resourceSpans.flatMap((rs) =>
        rs.scopeSpans.flatMap((ss) => ss.spans.map((span) => ({ ...span, resource: rs.resource, scope: ss.scope }))),
      ),
    );

  return {
    url: `http://127.0.0.1:${server.address().port}`,
    requests,
    spans,
    waitForSpan(predicate, timeoutMs = 8000) {
      return new Promise((resolve, reject) => {
        const check = () => {
          const found = spans().find(predicate);
          if (found) {
            waiters.delete(check);
            clearTimeout(timer);
            resolve(found);
          }
        };
        const timer = setTimeout(() => {
          waiters.delete(check);
          reject(new Error(`no matching span; got ${JSON.stringify(spans().map((s) => s.name))}`));
        }, timeoutMs);
        waiters.add(check);
        check();
      });
    },
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

function decodeRequest(buf) {
  return { resourceSpans: repeated(buf, 1, decodeResourceSpans) };
}

function decodeResourceSpans(buf) {
  const resource = single(buf, 1, (b) => ({ attributes: attributes(b, 1) })) ?? { attributes: {} };
  return { resource, scopeSpans: repeated(buf, 2, decodeScopeSpans) };
}

function decodeScopeSpans(buf) {
  const scope = single(buf, 1, (b) => ({ name: string(single(b, 1)) })) ?? {};
  return { scope, spans: repeated(buf, 2, decodeSpan) };
}

function decodeSpan(buf) {
  const status = single(buf, 15, (b) => ({
    message: string(single(b, 2)),
    code: Number(single(b, 3) ?? 0n),
  })) ?? { message: "", code: 0 };
  return {
    traceId: hex(single(buf, 1)),
    spanId: hex(single(buf, 2)),
    parentSpanId: hex(single(buf, 4)),
    name: string(single(buf, 5)),
    kind: Number(single(buf, 6) ?? 0n),
    attributes: attributes(buf, 9),
    events: repeated(buf, 11, (b) => ({ name: string(single(b, 2)), attributes: attributes(b, 3) })),
    status,
  };
}

function attributes(buf, field) {
  const out = {};
  for (const kv of repeated(buf, field, (b) => b)) {
    out[string(single(kv, 1))] = single(kv, 2, anyValue);
  }
  return out;
}

function anyValue(buf) {
  for (const [field, value] of fields(buf)) {
    if (field === 1) return string(value);
    if (field === 2) return value !== 0n;
    if (field === 3) return Number(value);
    if (field === 4) return value.readDoubleLE(0);
  }
  return undefined;
}

function single(buf, field, decode = (v) => v) {
  let last;
  for (const [f, v] of fields(buf)) if (f === field) last = v;
  return last === undefined ? undefined : decode(last);
}

function repeated(buf, field, decode) {
  const out = [];
  for (const [f, v] of fields(buf)) if (f === field) out.push(decode(v));
  return out;
}

function* fields(buf) {
  let pos = 0;
  while (pos < buf.length) {
    let key;
    [key, pos] = varint(buf, pos);
    const field = Number(key >> 3n);
    switch (Number(key & 7n)) {
      case 0: {
        let value;
        [value, pos] = varint(buf, pos);
        yield [field, value];
        break;
      }
      case 1:
        yield [field, buf.subarray(pos, pos + 8)];
        pos += 8;
        break;
      case 2: {
        let len;
        [len, pos] = varint(buf, pos);
        yield [field, buf.subarray(pos, pos + Number(len))];
        pos += Number(len);
        break;
      }
      case 5:
        yield [field, buf.subarray(pos, pos + 4)];
        pos += 4;
        break;
      default:
        throw new Error(`unsupported wire type in field ${field}`);
    }
  }
}

function varint(buf, pos) {
  let result = 0n;
  let shift = 0n;
  for (;;) {
    const byte = buf[pos++];
    result |= BigInt(byte & 0x7f) << shift;
    if (byte < 0x80) return [result, pos];
    shift += 7n;
  }
}

const string = (b) => (b ? Buffer.from(b).toString("utf8") : "");
const hex = (b) => (b ? Buffer.from(b).toString("hex") : "");
