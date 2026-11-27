const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const source = fs.readFileSync("index.js", "utf8");
const startMarker = "// Performance: bounded in-memory cache for stable GET responses only.";
const endMarker = 'const API = "https://phimapi.com";';
const start = source.indexOf(startMarker);
const end = source.indexOf(endMarker, start);
assert.notEqual(start, -1, "cache implementation marker must exist in index.js");
assert.notEqual(end, -1, "cache block must end before API declaration");
const cacheCode = source.slice(start, end);

let now = 1_000_000;
let calls = 0;
let nextStatus = 200;
const FakeDate = class extends Date {
  static now() { return now; }
};
const axios = {
  defaults: { timeout: 0, adapter: async config => {
    calls++;
    return {
      data: { count: calls },
      status: nextStatus,
      statusText: "OK",
      headers: {},
      config,
      request: {}
    };
  } },
  getAdapter(adapter) { return adapter; }
};
const context = { axios, Date: FakeDate, globalThis: null };
context.globalThis = context;
vm.runInNewContext(cacheCode + "\nglobalThis.__cacheTest = { getCachePolicy, responseCache, CACHE_MAX_ENTRIES, CACHE_TTL, stableParams };", context);
const cachedAdapter = axios.defaults.adapter;
const api = context.__cacheTest;

function config(url, params = {}, method = "get") {
  return { url, params, method };
}
async function request(cfg) {
  return cachedAdapter(cfg);
}
async function run() {
  assert.equal(axios.defaults.timeout, 8000, "default request timeout is 8 seconds");
  assert.equal(api.getCachePolicy(config("https://phimapi.com/v1/api/tim-kiem")), 90_000);
  assert.equal(api.getCachePolicy(config("https://phimapi.com/v1/api/danh-sach/phim-le")), 300_000);
  assert.equal(api.getCachePolicy(config("https://v3-cinemeta.strem.io/meta/movie/tt123.json")), 21_600_000);
  assert.equal(api.getCachePolicy(config("https://phimapi.com/v1/api/tim-kiem", {}, "post")), null);
  assert.equal(api.getCachePolicy(config("https://phimapi.com/phim/example")), null);
  assert.equal(api.getCachePolicy(config("https://phimapi.com/tmdb/movie/123")), null);
  assert.equal(api.getCachePolicy(config("https://phimapi.com/v1/api/stream/123")), null);

  // Same query parameters in different orders share one cache entry.
  const searchUrl = "https://phimapi.com/v1/api/tim-kiem";
  const first = await request(config(searchUrl, { page: 1, keyword: "Dune" }));
  const second = await request(config(searchUrl, { keyword: "Dune", page: 1 }));
  assert.equal(calls, 1, "equivalent parameter order should hit cache");
  assert.equal(second.data.count, first.data.count);

  // Cached data is cloned, so callers cannot mutate the stored value.
  second.data.count = 999;
  const third = await request(config(searchUrl, { keyword: "Dune", page: 1 }));
  assert.equal(third.data.count, 1, "mutating a returned value must not corrupt cache");

  // Search cache expires after 90 seconds.
  now += 90_001;
  await request(config(searchUrl, { keyword: "Dune", page: 1 }));
  assert.equal(calls, 2, "expired search entry should be fetched again");

  // Failed responses are not cached.
  api.responseCache.clear();
  nextStatus = 503;
  await request(config(searchUrl, { keyword: "Retry", page: 1 }));
  nextStatus = 200;
  await request(config(searchUrl, { keyword: "Retry", page: 1 }));
  assert.equal(calls, 4, "non-2xx response should not be cached");

  // Cache stays bounded at 300 entries and evicts the oldest inserted key.
  api.responseCache.clear();
  for (let i = 0; i < 301; i++) {
    await request(config(searchUrl, { keyword: "item-" + i, page: 1 }));
  }
  assert.equal(api.responseCache.size, 300, "cache must never exceed 300 entries");
  const beforeEvictedReload = calls;
  await request(config(searchUrl, { keyword: "item-0", page: 1 }));
  assert.equal(calls, beforeEvictedReload + 1, "oldest entry should have been evicted");

  console.log("Cache tests passed: policies, excluded endpoints, parameter keying, TTL, successful responses, cloning, and 300-entry eviction.");
}
run().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
