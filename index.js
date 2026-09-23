const { addonBuilder, serveHTTP } = require("stremio-addon-sdk");
const axios = require("axios");

const API = "https://phimapi.com";

const manifest = {
  id: "org.kkphim.stremio",
  version: "1.0.0",
  name: "KKPhim",
  description: "Xem phim từ KKPhim trên Stremio",

  resources: ["catalog", "meta", "stream"],
  types: ["movie", "series"],

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

  idPrefixes: ["kkphim:", "tt"]
};

const builder = new addonBuilder(manifest);


// =========================
// CATALOG
// =========================

builder.defineCatalogHandler(async ({ type, extra }) => {
  try {
    const search = extra?.search?.trim();

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
        type,
        name: movie.name,
        poster:
          movie.poster_url ||
          `https://phimimg.com/${movie.poster_url || ""}`,
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
  poster:
    movie.poster_url ||
    `https://phimimg.com/${movie.poster_url || ""}`,
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

    const slug = id.replace("kkphim:", "");

    const response = await axios.get(
      `${API}/phim/${slug}`
    );

    const movie = response.data.movie;

    if (!movie) {
      return { meta: null };
    }

    const meta = {
      id,
      type,
      name: movie.name,
      poster: movie.poster_url,
      background: movie.thumb_url,
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

        servers[0].server_data.forEach((ep, index) => {

          episodes.push({
            id: `${id}:${index}`,
            title: ep.name || `Tập ${index + 1}`,
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

builder.defineStreamHandler(async ({ id }) => {
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

      response = await axios.get(
        `${API}/imdb/title/${imdbId}`
      );
    }

    else {
      return { streams: [] };
    }

    const servers =
      response.data.episodes || [];

    if (!servers.length) {
      return { streams: [] };
    }

    const episode =
      servers[0].server_data[episodeIndex];

    if (!episode) {
      return { streams: [] };
    }

    const streams = [];

    if (episode.link_m3u8) {
      streams.push({
        name: "KKPhim",
        title: "KKPhim • HLS",
        url: episode.link_m3u8
      });
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

serveHTTP(builder.getInterface(), {
  port
});

console.log(`KKPhim addon running on port ${port}`);
