const { addonBuilder, getRouter } = require("stremio-addon-sdk");
const express = require("express");
const axios = require("axios");
const API = "https://phimapi.com";
const GENRES = {
  "hanh-dong": "Hành động",
  "tinh-cam": "Tình cảm",
  "kinh-di": "Kinh dị",
  "vien-tuong": "Viễn tưởng",
  "hai-huoc": "Hài hước",
  "hinh-su": "Hình sự",
  "chien-tranh": "Chiến tranh",
  "phieu-luu": "Phiêu lưu",
  "hoat-hinh": "Hoạt hình",
  "gia-dinh": "Gia đình",
  "tai-lieu": "Tài liệu",
  "than-thoai": "Thần thoại"
};
const manifest = {
  id: "org.kkphim.stremio",
  version: "1.2.4",
  name: "KKPhim",
  description: "Kho phim KKPhim – Phim Lẻ, Phim Bộ, Thuyết Minh và Vietsub.",
logo: "https://raw.githubusercontent.com/HoangAnh662/KKPhim/main/logo.png",
  stremioAddonsConfig: {
  issuer: "https://stremio-addons.net",
  signature: "eyJhbGciOiJkaXIiLCJlbmMiOiJBMTI4Q0JDLUhTMjU2In0..Tq6L-iuX2mORRdfcq0gB0A.rIyAX0bP5vA3UCdMnoEFDRSqLTN6WaPgTrPPGtQqQs4DmIRYf2QfF4eSa9wd5x_deZ7TZqphcVhGnRoYUQQbwCbo1wh6WKiREbtq2l8cdFvkUWKmPokrw0ZXhN5wfFVb.W-nbuM8oysDzOvLhewzevw"
},
  resources: ["catalog", "meta", "stream"],
  types: ["movie", "series"],

behaviorHints: {
  configurable: true
},

catalogs: [
  {
    type: "movie",
    id: "kkphim-movie",
    name: "KKPhim - Phim lẻ",
    extra: [
  { name: "search", isRequired: false },
  { name: "skip", isRequired: false }
]
  },
  {
    type: "series",
    id: "kkphim-series",
    name: "KKPhim - Phim bộ",
    extra: [
  { name: "search", isRequired: false },
  { name: "skip", isRequired: false }
]
  }
],

  idPrefixes: ["kkphim:", "tt", "tmdb:"]
};

function normalizeImage(url) {
  if (!url) return undefined;
  return url.startsWith("http") ? url : `https://phimimg.com/${url.replace(/^\/+/, "")}`;
}

function normalizeType(movie, fallbackType = "movie") {
  const raw = String(movie?.type || movie?.category || "").toLowerCase();
  if (raw === "series" || raw === "tvshows" || raw === "phim-bo") return "series";
  if (raw === "single" || raw === "movie" || raw === "phim-le") return "movie";
  return fallbackType;
}


function yearMatches(candidateYear, requestedYear) {
  const a = Number(candidateYear || 0);
  const b = Number(requestedYear || 0);
  return !a || !b || Math.abs(a - b) <= 1;
}

function normalizeText(value = "") {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

async function resolveImdbFallback(imdbId, type) {
  const metaType = type === "series" ? "series" : "movie";
  let info = {};
  try {
    const cinemeta = await axios.get(
      `https://v3-cinemeta.strem.io/meta/${metaType}/${encodeURIComponent(imdbId)}.json`,
      { timeout: 8000 }
    );
    info = cinemeta.data?.meta || {};
  } catch (error) {
    console.log(`Cinemeta unavailable for ${imdbId}: ${error.message}`);
  }

  const title = info.name || "";
  const year = Number(
    info.year ||
    String(info.releaseInfo || "").match(/\d{4}/)?.[0] ||
    0
  );

  // Cinemeta metadata includes TMDB IDs in links for many titles.
  let tmdbId = null;
  const links = Array.isArray(info.links) ? info.links : [];
  for (const link of links) {
    const raw = String(link?.url || link?.id || link?.name || "");
    const match = raw.match(/tmdb[:/](\d+)/i);
    if (match) {
      tmdbId = match[1];
      break;
    }
  }

  if (tmdbId) {
    try {
      const byTmdb = await axios.get(
        `${API}/tmdb/${type === "series" ? "tv" : "movie"}/${tmdbId}`,
        { timeout: 8000 }
      );
      if (byTmdb.data?.status && byTmdb.data?.episodes?.length) {
        console.log(`KKPhim TMDB match: ${imdbId} -> ${tmdbId}`);
        return byTmdb;
      }
    } catch (_) {}
  }

  // If Cinemeta did not expose TMDB ID, try KKPhim search as a final fallback.
  if (!title) return null;
  const wanted = normalizeText(title);
  const searchVariants = [...new Set([title, normalizeText(title)])];
  for (const keyword of searchVariants) {
    try {
      const search = await axios.get(`${API}/v1/api/tim-kiem`, {
        params: { keyword, page: 1 }, timeout: 8000
      });
      const items = search.data?.data?.items || search.data?.items || [];
      const candidates = items.filter(item => {
        const itemYear = Number(item.year || 0);
        const yearOk = yearMatches(itemYear, year);
        const nameOk = [item.name, item.origin_name]
          .filter(Boolean)
          .some(name => normalizeText(name) === wanted);
        return item.slug && yearOk && nameOk;
      });
      for (const candidate of candidates.slice(0, 3)) {
        const detail = await axios.get(
          `${API}/phim/${encodeURIComponent(candidate.slug)}`,
          { timeout: 8000 }
        );
        if (detail.data?.episodes?.length &&
            yearMatches(detail.data?.movie?.year, year) &&
            [detail.data?.movie?.name, detail.data?.movie?.origin_name]
              .some(name => normalizeText(name) === wanted)) {
          console.log(`KKPhim normalized title match: ${imdbId} -> ${candidate.slug}`);
          return detail;
        }
      }
    } catch (error) {
      console.log(`KKPhim title lookup failed: ${error.message}`);
    }
  }

  // Final fallback: resolve localized/alternative titles from Wikidata by IMDb ID.
  // Useful when external metadata uses an English title but KKPhim stores a Vietnamese title.
  try {
    const sparql = `
      SELECT ?item ?itemLabel ?altLabel WHERE {
        ?item wdt:P345 "${imdbId}".
        OPTIONAL {
          ?item skos:altLabel ?altLabel.
          FILTER(LANG(?altLabel) IN ("vi", "en"))
        }
        SERVICE wikibase:label {
          bd:serviceParam wikibase:language "vi,en".
        }
      }
    `;

    const wikidata = await axios.get(
      "https://query.wikidata.org/sparql",
      {
        params: { query: sparql, format: "json" },
        headers: {
          "User-Agent": "KKPhim-Stremio-Addon/1.2.4"
        },
        timeout: 8000
      }
    );

    const bindings = wikidata.data?.results?.bindings || [];
    const aliases = Array.from(new Set(
      bindings.flatMap(row => [
        row.itemLabel?.value,
        row.altLabel?.value
      ]).filter(Boolean)
    ));

    for (const alias of aliases) {
      const aliasSearch = await axios.get(`${API}/v1/api/tim-kiem`, {
        params: { keyword: alias, year: year || undefined, page: 1 },
        timeout: 8000
      });

      const aliasItems =
        aliasSearch.data?.data?.items ||
        aliasSearch.data?.items ||
        [];

      const aliasWanted = normalizeText(alias);
      const aliasCandidate = aliasItems.find(item => {
        const itemYear = Number(item.year || 0);
        const yearOk = !year || !itemYear || itemYear === year;
        const nameOk = [item.name, item.origin_name]
          .filter(Boolean)
          .some(name => normalizeText(name) === aliasWanted);
        return yearOk && nameOk;
      });

      if (aliasCandidate?.slug) {
        const detail = await axios.get(
          `${API}/phim/${encodeURIComponent(aliasCandidate.slug)}`,
          { timeout: 8000 }
        );
        console.log(
          `KKPhim Wikidata fallback: ${imdbId} -> ${aliasCandidate.slug} via "${alias}"`
        );
        return detail;
      }
    }
  } catch (wikidataError) {
    console.log(
      `Wikidata fallback failed for ${imdbId}: ${wikidataError.message}`
    );
  }

  return null;
}


function extractSeason(movie) {
  const value = [movie?.name, movie?.origin_name, movie?.slug].filter(Boolean).join(" ");
  const match = value.match(/(?:phần|phan|season|ss)\s*[-_. ]*([0-9]{1,2})\b/i);
  return match ? Number(match[1]) : null;
}

function baseSeriesTitle(value) {
  return normalizeText(String(value || "")
    .replace(/\s*[\(\[]?\s*(?:phần|phan|season|ss)\s*[-_. ]*\d{1,2}\s*[\)\]]?/gi, " "));
}


const IMDB_SERIES_ALIASES = {
  tt0903747: ["Breaking Bad", "Tập Làm Người Xấu"],
  tt0944947: ["Game of Thrones", "Trò Chơi Vương Quyền"]
};

async function resolveKnownSeriesSeason(imdbId, season) {
  const aliases = IMDB_SERIES_ALIASES[imdbId];
  if (!aliases) return null;
  const normalizedAliases = aliases.map(baseSeriesTitle);
  for (const keyword of aliases) {
    try {
      const result = await axios.get(`${API}/v1/api/tim-kiem`, {
        params: { keyword, page: 1 }, timeout: 6000
      });
      const items = result.data?.data?.items || result.data?.items || [];
      const matches = items.filter(item =>
        item.slug &&
        extractSeason(item) === season &&
        [item.name, item.origin_name].some(v =>
          normalizedAliases.includes(baseSeriesTitle(v))
        )
      );
      for (const item of matches.slice(0, 3)) {
        const detail = await axios.get(
          `${API}/phim/${encodeURIComponent(item.slug)}`,
          { timeout: 6000 }
        );
        if (extractSeason(detail.data?.movie) === season &&
            Array.isArray(detail.data?.episodes) &&
            detail.data.episodes.length) {
          console.log(`KKPhim alias season match: ${imdbId} S${season} -> ${item.slug}`);
          return detail;
        }
      }
    } catch (error) {
      console.log(`KKPhim alias lookup failed: ${error.message}`);
    }
  }
  return null;
}

async function resolveMatchingSeason(sourceMovie, season) {
  if (!Number.isInteger(season) || season < 1 || season > 99) return null;
  const names = [sourceMovie?.origin_name, sourceMovie?.name]
    .filter(Boolean).map(baseSeriesTitle).filter(Boolean);
  if (!names.length) return null;
  const queries = [...new Set([sourceMovie?.origin_name, sourceMovie?.name]
    .filter(Boolean).map(v => String(v).replace(/\s*[\(\[]?\s*(?:phần|phan|season|ss)\s*[-_. ]*\d{1,2}\s*[\)\]]?/gi, "").trim()))];
  for (const keyword of queries.slice(0, 2)) {
    try {
      const result = await axios.get(`${API}/v1/api/tim-kiem`, {
        params: { keyword, page: 1 }, timeout: 6000
      });
      const items = result.data?.data?.items || result.data?.items || [];
      const matches = items.filter(item =>
        extractSeason(item) === season &&
        [item.name, item.origin_name].some(v => names.includes(baseSeriesTitle(v))) &&
        item.slug
      );
      for (const item of matches.slice(0, 3)) {
        const detail = await axios.get(`${API}/phim/${encodeURIComponent(item.slug)}`, { timeout: 6000 });
        if (extractSeason(detail.data?.movie) === season &&
            Array.isArray(detail.data?.episodes) && detail.data.episodes.length) {
          return detail;
        }
      }
    } catch (error) {
      console.log(`KKPhim season lookup failed: ${error.message}`);
    }
  }
  return null;
}

const builder = new addonBuilder(manifest);


// =========================
// CATALOG
// =========================

builder.defineCatalogHandler(async ({
  type, id, extra }) => {
  try {
    const search = extra?.search?.trim();
// =====================
// CATALOG THỂ LOẠI
// =====================
if (id?.startsWith("genre-")) {
  const genre = id.replace("genre-", "");

  if (!GENRES[genre]) {
    return { metas: [] };
  }

  const skip = Number(extra?.skip || 0);
  const ITEMS_PER_PAGE = 24;
  const page =
    Math.floor(skip / ITEMS_PER_PAGE) + 1;

  const response = await axios.get(
    `${API}/v1/api/the-loai/${genre}`,
    { params: { page } }
  );

  const items =
    response.data?.data?.items ||
    response.data?.items ||
    [];

  const metas = items.map(movie => ({
    id: `kkphim:${movie.slug}`,
    type: normalizeType(movie, "movie"),
    name: movie.name,
    poster: normalizeImage(movie.poster_url),
    description: movie.origin_name || ""
  }));

  return { metas };
}
    // =========================
    // SEARCH
    // =========================
    if (search) {
      const response = await axios.get(`${API}/v1/api/tim-kiem`, {
        params: {
          keyword: search,
          page: 1
        }
      });

      const items =
        response.data?.data?.items ||
        response.data?.items ||
        [];

      const metas = items.map(movie => ({
        id: `kkphim:${movie.slug}`,
        type: normalizeType(movie, type),
        name: movie.name,
        poster: normalizeImage(movie.poster_url),
        description: movie.origin_name || ""
      }));

      return { metas };
    }

    // =========================
    // CATALOG BÌNH THƯỜNG
    // =========================
    const endpoint =
  type === "series"
    ? `${API}/danh-sach/phim-bo`
    : `${API}/danh-sach/phim-le`;

// KKPhim hiện trả khoảng 24 phim / trang
const ITEMS_PER_PAGE = 24;

const skip = Number(extra?.skip || 0);

// Xác định trang KKPhim cần lấy
const page = Math.floor(skip / ITEMS_PER_PAGE) + 1;

const response = await axios.get(endpoint, {
  params: { page }
});

const items = response.data?.items || [];

// Loại phim trùng slug
const uniqueItems = Array.from(
  new Map(
    items.map(movie => [movie.slug, movie])
  ).values()
);

const metas = uniqueItems.map(movie => ({
  id: `kkphim:${movie.slug}`,
  type,
  name: movie.name,
  poster: normalizeImage(movie.poster_url),
  description: movie.origin_name || ""
}));

    return { metas };

  } catch (error) {
    console.error("Catalog error:", error.message);
    return { metas: [] };
  }
});

// =========================
// META
// =========================

builder.defineMetaHandler(async ({ type, id }) => {

  try {

    // META của addon chỉ quản lý các ID nội bộ kkphim:<slug>.
    // IMDb/TMDB IDs thuộc metadata addon khác; không được biến chúng thành slug KKPhim.
    if (!id || !id.startsWith("kkphim:")) {
      return { meta: null };
    }

    const slug = id.slice("kkphim:".length).split(":")[0];

    if (!slug) {
      return { meta: null };
    }

    const response = await axios.get(
      `${API}/phim/${encodeURIComponent(slug)}`
    );

    const movie = response.data.movie;

    if (!movie) {
      return { meta: null };
    }

    const meta = {
      id,
      type,
      name: movie.name,
      poster: normalizeImage(movie.poster_url),
      background: normalizeImage(movie.thumb_url),
      description: movie.content || "",
      releaseInfo: movie.year
        ? String(movie.year)
        : undefined
    };


    // SERIES / PHIM BỘ

    if (type === "series") {

      const episodes = [];

      const servers = response.data.episodes || [];

      if (servers.length > 0) {

        const bestServer = servers.reduce((best, server) => {
          const count = Array.isArray(server?.server_data) ? server.server_data.length : 0;
          const bestCount = Array.isArray(best?.server_data) ? best.server_data.length : 0;
          return count > bestCount ? server : best;
        }, servers[0]);

        (bestServer.server_data || []).forEach((ep, index) => {
          episodes.push({
            id: `${id}:${index}`,
            title: ep.name || `Tập ${index + 1}`,
            thumbnail: meta.background || meta.poster,
            season: 1,
            episode: index + 1
          });
        });

      }

      meta.videos = episodes;

    }

    return { meta };

  } catch (error) {

    console.error("Meta error:", error.message);

    return { meta: null };

  }

});


// =========================
// STREAM
// =========================

builder.defineStreamHandler(async ({ type, id }) => {
  try {
    let response;
    let episodeIndex = 0;

    // =====================================
    // PHIM MỞ TỪ CATALOG KKPHIM
    // =====================================
    if (id.startsWith("kkphim:")) {
      const parts = id.split(":");
      const slug = parts[1];

      episodeIndex =
        parts.length >= 3
          ? Number(parts[2])
          : 0;

      response = await axios.get(
        `${API}/phim/${slug}`
      );
    }

    // TMDB catalog: resolve directly by TMDB ID, without title guessing.
    else if (id.startsWith("tmdb:")) {
      const match = id.match(/^tmdb:(\\d+)(?::(\\d+):(\\d+))?$/);
      if (!match) return { streams: [] };
      const [, tmdbId, season, episode] = match;
      if (type === "series") {
        if (!season || !episode || Number(season) < 1 || Number(episode) < 1) {
          return { streams: [] };
        }
        episodeIndex = Number(episode) - 1;
      }
      try {
        response = await axios.get(
          `${API}/tmdb/${type === "series" ? "tv" : "movie"}/${tmdbId}`,
          { timeout: 8000 }
        );
      } catch (error) {
        if (error.response?.status === 404) return { streams: [] };
        throw error;
      }
      if (!response.data?.status || !response.data?.episodes?.length) {
        return { streams: [] };
      }
      if (type === "series") {
        const actualSeason = Number(response.data.movie?.tmdb?.season);
        if (Number.isInteger(actualSeason) && actualSeason > 0 && actualSeason !== Number(season)) {
          return { streams: [] };
        }
      }
    }

    // =====================================
    // PHIM TỪ TÌM KIẾM STREMIO / IMDB
    // =====================================
    else if (id.startsWith("tt")) {
      const parts = id.split(":");
      const imdbId = parts[0];

      // Nếu là series, Stremio thường gửi:
      // tt1234567:season:episode
      if (parts.length >= 3) {
        const episodeNumber = Number(parts[2]);

        if (!isNaN(episodeNumber) && episodeNumber > 0) {
          episodeIndex = episodeNumber - 1;
        }
      }

      try {
        response = await axios.get(
          `${API}/imdb/title/${encodeURIComponent(imdbId)}`,
          {
            params: {
              type: type === "series" ? "tv" : "movie"
            },
            timeout: 8000
          }
        );
      } catch (directError) {
        if (directError.response?.status !== 404) throw directError;

        response = await resolveImdbFallback(imdbId, type);

        if (!response && type === "series") {
          response = await resolveKnownSeriesSeason(imdbId, Number(parts[1]));
        }
        if (!response) {
          console.log(`No KKPhim match for IMDb: ${imdbId}`);
          return { streams: [] };
        }
      }
    }

    else {
      return { streams: [] };
    }

    // IMDb series: prevent returning a different season when KKPhim
    // resolves a season-specific title (e.g. Part 4 for season 1).
    // Conservative guard: it does not guess a replacement season.
    if (type === "series" && id.startsWith("tt")) {
      const parts = id.split(":");
      const requestedSeason = Number(parts[1]);
      const requestedEpisode = Number(parts[2]);
      if (!Number.isInteger(requestedSeason) || requestedSeason < 1 ||
          !Number.isInteger(requestedEpisode) || requestedEpisode < 1) {
        return { streams: [] };
      }
      if (!response.data?.episodes?.length) {
        const aliasMatch = await resolveKnownSeriesSeason(parts[0], requestedSeason);
        if (aliasMatch) response = aliasMatch;
      }
      const movie = response.data?.movie || {};
      const seasonText = [movie.name, movie.origin_name, movie.slug]
        .filter(Boolean).join(" ");
      const seasonMatch = seasonText.match(
        /(?:phần|phan|season|ss)\s*[-_. ]*([0-9]{1,2})\b/i
      );
      if (seasonMatch && Number(seasonMatch[1]) !== requestedSeason) {
        console.log(`KKPhim season mismatch: ${id} -> ${movie.name}`);
        const matching = await resolveMatchingSeason(movie, requestedSeason);
        if (!matching) {
          const aliasMatch = await resolveKnownSeriesSeason(parts[0], requestedSeason);
          if (!aliasMatch) return { streams: [] };
          response = aliasMatch;
        } else {
          response = matching;
        }
      }
    }

    const servers =
      response.data.episodes || [];

    if (!servers.length) {
      return { streams: [] };
    }
const movieName =
  response.data.movie?.name ||
  response.data.movie?.origin_name ||
  "KKPhim";
    const movieYear = response.data.movie?.year || "";
    const quality =
  response.data.movie?.quality || "";

const displayName =
  movieYear ? `${movieName} • ${movieYear}` : movieName;
    const streams = [];

for (const server of servers) {
  const episode = server.server_data?.[episodeIndex];

  if (!episode) continue;

  const serverName =
  (server.server_name || "Server")
    .replace(/Lồng Tiếng/gi, "Thuyết Minh");
  
const qualityRaw = response.data.movie?.quality || "";

let resolution = "";

if (/4K|2160/i.test(qualityRaw)) {
  resolution = "4K";
} else if (/FHD|1080/i.test(qualityRaw)) {
  resolution = "1080p";
} else if (/HD|720/i.test(qualityRaw)) {
  resolution = "720p";
} else if (/480/i.test(qualityRaw)) {
  resolution = "480p";
}
  if (episode.link_m3u8) {
    streams.push({
  name: displayName,
  title: `KKPhim • ${serverName}${resolution ? ` • ${resolution}` : ""}`,
  url: episode.link_m3u8
});
  }
}
return { streams };

  } catch (error) {
    console.error(
      "Stream error:",
      error.response?.status || "",
      error.message
    );

    return { streams: [] };
  }
});


// =========================
// START SERVER
// =========================

const port = process.env.PORT || 7000;

const app = express();

// =====================
// TRANG CẤU HÌNH KKPHIM
// =====================

app.get("/configure", (req, res) => {
  res.send(`
<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">

<title>Cấu hình KKPhim</title>

<style>
* {
  box-sizing: border-box;
}

body {
  margin: 0;
  min-height: 100vh;
  font-family: Arial, sans-serif;
  color: #fff;

  background:
    linear-gradient(
      rgba(7, 5, 20, 0.78),
      rgba(7, 5, 20, 0.94)
    ),
    url("https://raw.githubusercontent.com/HoangAnh662/KKPhim/main/background.jpg");

  background-size: cover;
  background-position: center;
  background-attachment: fixed;
}

.page {
  min-height: 100vh;
  padding: 35px 16px;
  display: flex;
  justify-content: center;
}

.container {
  width: 100%;
  max-width: 850px;
}

.logo {
  text-align: center;
  margin-bottom: 18px;
}

.logo img {
  width: 105px;
  height: 105px;
  border-radius: 22px;
}

.panel {
  background: rgba(15, 10, 35, 0.88);
  border: 1px solid #873cff;
  border-radius: 25px;
  padding: 25px;
  backdrop-filter: blur(12px);
  box-shadow: 0 0 40px rgba(122, 50, 255, .22);
}

h1 {
  text-align: center;
  margin: 0 0 8px;
  font-size: 30px;
}

.subtitle {
  text-align: center;
  color: #c8c2dc;
  margin-bottom: 28px;
  line-height: 1.5;
}

.section-title {
  color: #c75cff;
  font-size: 20px;
  font-weight: bold;
  margin: 20px 0 12px;
}

.grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
}

.option {
  background: rgba(35, 28, 62, .85);
  border: 1px solid rgba(157, 80, 255, .4);
  border-radius: 14px;
  padding: 16px;
  display: flex;
  align-items: center;
  gap: 12px;
  cursor: pointer;
}

.option:hover {
  border-color: #b44cff;
}

.option input {
  width: 21px;
  height: 21px;
  accent-color: #a73cff;
}

.option span {
  font-size: 16px;
}

.default {
  border-color: #963cff;
}

.divider {
  height: 1px;
  background: rgba(255,255,255,.13);
  margin: 25px 0;
}

.genre-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
}

.select-all {
  border: 1px solid #8242e8;
  border-radius: 10px;
  background: rgba(80,40,130,.35);
  color: white;
  padding: 9px 13px;
  cursor: pointer;
}

.install {
  width: 100%;
  margin-top: 28px;
  padding: 17px;
  border: 0;
  border-radius: 14px;

  background: linear-gradient(
    90deg,
    #bd2cff,
    #5c3cff
  );

  color: white;
  font-size: 18px;
  font-weight: bold;
  cursor: pointer;
  box-shadow: 0 8px 25px rgba(129,55,255,.35);
}

.note {
  text-align: center;
  color: #aaa2bf;
  margin-top: 14px;
  font-size: 13px;
}

@media (max-width: 600px) {
  .grid {
    grid-template-columns: repeat(2, 1fr);
  }

  .panel {
    padding: 18px;
  }

  h1 {
    font-size: 25px;
  }
} 
/* Phim lẻ + Phim bộ luôn nằm cùng 1 hàng */
.grid:has(.default) {
  grid-template-columns: repeat(2, 1fr);
}

/* Các thể loại bên dưới nhỏ gọn */
#genres {
  gap: 10px;
}

#genres .option {
  padding: 8px 8px;
  min-height: 52px;
  font-size: 14px;
  min-width: 0;
}

#genres .option input {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}

#genres .option span {
  white-space: nowrap;
  font-size: 14px;
}
.install-btn {
  width: 100%;
  padding: 18px;
  border: none;
  border-radius: 22px;
  background: linear-gradient(90deg, #1296f3, #304ffe);
  color: white;
  font-size: 18px;
  font-weight: 700;
  cursor: pointer;
}
</style>
</head>

<body>

<div class="page">
<div class="container">

  <div class="logo">
    <img
      src="https://raw.githubusercontent.com/HoangAnh662/KKPhim/main/logo.png"
      alt="KKPhim"
    >
  </div>

  <div class="panel">

    <h1>⚙️ Cấu hình KKPhim</h1>

    <div class="subtitle">
      Chọn các danh mục bạn muốn hiển thị trong Stremio.<br>
      Mặc định chỉ có Phim lẻ và Phim bộ.
    </div>

    <div class="section-title">
      Danh mục cơ bản
    </div>

    <div class="grid">

       <label class="option default">
  <input type="checkbox" id="movie" value="movie" checked>
  <span>🎞️ Phim lẻ</span>
</label>

<label class="option default">
  <input type="checkbox" id="series" value="series" checked>
  <span>🎬 Phim bộ</span>
</label>

    </div>

    <div class="divider"></div>

    <div class="genre-head">

      <div class="section-title">
        Thể loại tùy chọn
      </div>

      <button
        class="select-all"
        type="button"
        onclick="toggleAll()">
        ✓ Chọn tất cả
      </button>

    </div>

    <div class="grid" id="genres">

      <label class="option">
        <input type="checkbox" value="hanh-dong">
        <span>🔥 Hành động</span>
      </label>

      <label class="option">
        <input type="checkbox" value="tinh-cam">
        <span>❤️ Tình cảm</span>
      </label>

      <label class="option">
        <input type="checkbox" value="kinh-di">
        <span>👻 Kinh dị</span>
      </label>

      <label class="option">
        <input type="checkbox" value="vien-tuong">
        <span>🪐 Viễn tưởng</span>
      </label>

      <label class="option">
        <input type="checkbox" value="hai-huoc">
        <span>😄 Hài hước</span>
      </label>

      <label class="option">
        <input type="checkbox" value="hinh-su">
        <span>🛡️ Hình sự</span>
      </label>

      <label class="option">
        <input type="checkbox" value="chien-tranh">
        <span>🪖 Chiến tranh</span>
      </label>

      <label class="option">
        <input type="checkbox" value="phieu-luu">
        <span>🧭 Phiêu lưu</span>
      </label>

      <label class="option">
        <input type="checkbox" value="hoat-hinh">
        <span>🐻 Hoạt hình</span>
      </label>

      <label class="option">
        <input type="checkbox" value="gia-dinh">
        <span>🏠 Gia đình</span>
      </label>

      <label class="option">
        <input type="checkbox" value="tai-lieu">
        <span>📄 Tài liệu</span>
      </label>

      <label class="option">
        <input type="checkbox" value="than-thoai">
        <span>🔱 Thần thoại</span>
      </label>

    </div>

    <button
      class="install"
      type="button"
      onclick="installAddon()">
      🧩 CÀI VÀO STREMIO →
    </button>
<div style="margin-top:16px;">
  <button class="install-btn" onclick="copyManifest()">
    📋 SAO CHÉP ĐƯỜNG DẪN MANIFEST
  </button>
</div>
    <div class="note">
      Sau khi chọn xong, nhấn nút để cài addon vào Stremio.
    </div>

  </div>
</div>
</div>

<script>
let allSelected = false;
const savedConfig = new URLSearchParams(window.location.search)
  .get("selected");

if (savedConfig) {
  const saved = savedConfig.split(",");

  const movie = document.getElementById("movie");
  const series = document.getElementById("series");

  movie.checked = saved.includes("movie");
  series.checked = saved.includes("series");

  document.querySelectorAll("#genres input").forEach(input => {
    input.checked = saved.includes(input.value);
  });
}
function toggleAll() {
  allSelected = !allSelected;

  document
    .querySelectorAll("#genres input")
    .forEach(input => {
      input.checked = allSelected;
    });
}
function copyManifest() {
  const selected = [];

  if (document.getElementById("movie").checked) {
    selected.push("movie");
  }

  if (document.getElementById("series").checked) {
    selected.push("series");
  }

  document.querySelectorAll("#genres input:checked")
    .forEach(input => selected.push(input.value));

  const config = selected.join(",");

  const url =
    "https://kkphim-stremio-addon-ymoc.onrender.com/config/" +
    config +
    "/manifest.json";

  navigator.clipboard.writeText(url);

  const msg = document.createElement("div");
msg.innerHTML = "✅ ĐÃ SAO CHÉP!";
msg.style.cssText = "position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:#22183d;color:white;padding:18px 28px;border:2px solid #a83cff;border-radius:18px;font-size:18px;font-weight:700;z-index:9999;box-shadow:0 0 25px #8b2cff;white-space:nowrap;";

document.body.appendChild(msg);

setTimeout(() => {
  msg.remove();
}, 1800);
}
function installAddon() {
  const selected = [];

  if (document.getElementById("movie").checked) {
    selected.push("movie");
  }

  if (document.getElementById("series").checked) {
    selected.push("series");
  }

  document.querySelectorAll("#genres input:checked")
    .forEach(input => selected.push(input.value));

  const config = selected.join(",");

  window.location.href =
    "stremio://kkphim-stremio-addon-ymoc.onrender.com/config/" +
    config +
    "/manifest.json";
}
</script>

</body>
</html>
  `);
});
// =====================
// MANIFEST THEO CẤU HÌNH
// =====================
app.get("/config/:genres/configure", (req, res) => {
  res.redirect("/configure?selected=" + encodeURIComponent(req.params.genres));
});
app.get("/config/:genres/manifest.json", (req, res) => {
  const selected = req.params.genres.split(",");

  const showMovie = selected.includes("movie");
  const showSeries = selected.includes("series");

  const selectedGenres = selected.filter(
    item => GENRES[item]
  );

  const catalogs = [];

  if (showMovie) {
    catalogs.push(manifest.catalogs[0]);
  }

  if (showSeries) {
    catalogs.push(manifest.catalogs[1]);
  }

  selectedGenres.forEach(genre => {
    catalogs.push({
      type: "movie",
      id: `genre-${genre}`,
      name: `KKPhim - ${GENRES[genre]}`,
      extra: [
        { name: "skip", isRequired: false }
      ]
    });
  });

  const customManifest = {
    ...manifest,
    catalogs
  };

  res.json(customManifest);
});
// Các route catalog / meta / stream hiện tại
// Route cho addon đã cấu hình
app.use("/config/:genres", (req, res, next) => {
  getRouter(builder.getInterface())(req, res, next);
});
app.get("/", (req, res) => {
  res.redirect("/configure");
});
app.use("/", getRouter(builder.getInterface()));

app.listen(port, () => {
console.log(`KKPhim addon running on port ${port}`);
});
