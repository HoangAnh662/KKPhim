const { addonBuilder, getRouter } = require("stremio-addon-sdk");
const express = require("express");
const axios = require("axios");

const API = "https://phimapi.com";

const manifest = {
  id: "org.kkphim.stremio",
  version: "1.0.0",
  name: "KKPhim",
  description: "Kho phim KKPhim – Phim Lẻ, Phim Bộ, Thuyết Minh và Vietsub.",

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

const manifestUrl =
  "https://kkphim-stremio-addon-ymoc.onrender.com/manifest.json";

app.get("/", (req, res) => {
  res.send(`
<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">

  <title>KKPhim Addon</title>

  <style>
    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
      background: #0f0f12;
      color: #fff;
      font-family: Arial, sans-serif;
    }

    .box {
      width: 100%;
      max-width: 430px;
      padding: 35px 25px;
      text-align: center;
      background: #1c1c22;
      border-radius: 22px;
    }

    h1 {
      margin: 0 0 12px;
      font-size: 34px;
    }

    p {
      margin: 0 0 30px;
      color: #bbb;
      line-height: 1.6;
    }

    .button {
      display: block;
      width: 100%;
      margin-top: 15px;
      padding: 17px;
      border-radius: 14px;
      color: white;
      text-decoration: none;
      font-size: 18px;
      font-weight: bold;
    }

    .stremio {
      background: #7b5cff;
    }

    .nuvio {
      background: #20b86a;
    }
  </style>
</head>

<body>

  <div class="box">

    <h1>🎬 KKPhim</h1>

    <p>
      Kho phim KKPhim – Phim Lẻ, Phim Bộ,
      Thuyết Minh và Vietsub.
    </p>

    <a
      class="button stremio"
      href="stremio://kkphim-stremio-addon-ymoc.onrender.com/manifest.json">
      Cài vào Stremio
    </a>

    <a
      class="button nuvio"
      href="nuvio://addon?url=${encodeURIComponent(manifestUrl)}">
      Cài vào Nuvio
    </a>

  </div>

</body>
</html>
  `);
});

app.use(getRouter(builder.getInterface()));

app.listen(port, () => {
  console.log(`KKPhim addon running on port ${port}`);
});
