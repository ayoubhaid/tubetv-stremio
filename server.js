const express = require("express");
const axios = require("axios");
const { XMLParser } = require("fast-xml-parser");
const app = express();
const parser = new XMLParser();

app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', '*');
    next();
});

// Helper: Finds the real UC... ID even from handles
async function getChannelId(input) {
    const cleanInput = input.replace("@", "").trim();
    if (cleanInput.startsWith('UC')) return cleanInput;
    
    try {
        const url = "https://www.youtube.com/@" + cleanInput;
        const response = await axios.get(url, { 
            headers: { 'User-Agent': 'Mozilla/5.0' } 
        });
        const match = response.data.match(/"channelId":"(UC[^"]+)"/);
        return match ? match[1] : null;
    } catch (e) { 
        console.error("ID Fetch Error:", e.message);
        return null; 
    }
}

// 1. CONFIGURATOR UI
app.get("/", (req, res) => {
    res.send(`
        <body style="background:#0f0f0f;color:white;font-family:sans-serif;text-align:center;padding:50px;">
            <h1 style="color:#ff0000;">📺 TubeTV Configurator</h1>
            <p>Enter a YouTube Handle (e.g. @NASA) to create your addon.</p>
            <input type="text" id="chan" placeholder="@NASA" style="width:60%;padding:12px;background:#222;color:white;border:1px solid #444;border-radius:5px;">
            <br><br>
            <button onclick="install()" style="padding:12px 25px;background:#cc0000;color:white;border:none;border-radius:5px;cursor:pointer;font-weight:bold;">Install Addon</button>
            <script>
                function install() {
                    const val = document.getElementById('chan').value.trim();
                    if(!val) return alert('Enter a handle!');
                    const link = window.location.host + '/' + btoa(val) + '/manifest.json';
                    window.location.href = 'stremio://' + link;
                }
            </script>
        </body>
    `);
});

// 2. MANIFEST
app.get("/:config/manifest.json", (req, res) => {
    const handle = Buffer.from(req.params.config, 'base64').toString();
    res.json({
        id: "org.tubetv." + req.params.config.substring(0, 8),
        version: "1.0.0",
        name: "TubeTV: " + handle,
        resources: ["catalog", "stream"],
        types: ["tv"],
        catalogs: [{ type: "tv", id: "youtube_feed", name: "Latest Uploads" }]
    });
});

// 3. CATALOG
app.get("/:config/catalog/:type/:id.json", async (req, res) => {
    try {
        const handle = Buffer.from(req.params.config, 'base64').toString();
        const channelId = await getChannelId(handle);
        
        if (!channelId) return res.json({ metas: [] });

        const rssUrl = "https://www.youtube.com/feeds/videos.xml?channel_id=" + channelId;
        const rss = await axios.get(rssUrl);
        const feed = parser.parse(rss.data);
        const entries = Array.isArray(feed.feed.entry) ? feed.feed.entry : [feed.feed.entry];

        const metas = entries.map(entry => ({
            id: "yt_" + entry['yt:videoId'],
            type: "tv",
            name: entry.title,
            poster: "https://i.ytimg.com/vi/" + entry['yt:videoId'] + "/hqdefault.jpg",
            background: "https://i.ytimg.com/vi/" + entry['yt:videoId'] + "/maxresdefault.jpg",
            posterShape: "landscape"
        }));
        res.json({ metas });
    } catch (e) { 
        res.json({ metas: [] }); 
    }
});

// 4. STREAM (Corrected path to include /:config/)
app.get("/:config/stream/:type/:id.json", (req, res) => {
    const ytId = req.params.id.replace("yt_", "");
    res.json({
        streams: [{ 
            title: "Watch on YouTube", 
            ytId: ytId // Tells Stremio to use native YouTube player
        }]
    });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log("TubeTV Live on Port " + PORT));