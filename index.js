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
      name: "KKPhim - Phim mới"
    },
    {
      type: "series",
      id: "kkphim-series",
      name: "KKPhim - Phim bộ"
    }
  ],

  idPrefixes: ["kkphim:"]
};

const builder = new addonBuilder(manifest);


// =========================
// CATALOG
// =========================

builder.defineCatalogHandler(async ({ type }) => {

  try {

    const endpoint =
    type === "series"
        ? `${API}/v1/api/danh-sach/phim-bo`
        : `${API}/v1/api/danh-sach/phim-le`;

const response = await axios.get(endpoint);

const items =
    response.data?.data?.items ||
    response.data?.items ||
    [];

const metas = items
      .map(movie => ({
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

    const parts = id.split(":");

    const slug = parts[1];

    const episodeIndex =
      parts.length >= 3
        ? Number(parts[2])
        : 0;

    const response = await axios.get(
      `${API}/phim/${slug}`
    );

    const servers = response.data.episodes || [];

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

    console.error("Stream error:", error.message);

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
