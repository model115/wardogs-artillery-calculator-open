using System.Text.Json;
using OpenCvSharp;

namespace WardogsArtillery.Tools;

public static class MapImageComposer
{
    public const int MaxSideDefault = 4096;

    public readonly record struct MapTiles(int TileSize, int MinZoom, int MaxZoom, string Extension);

    public static MapTiles ReadTiles(string mapsRoot, string mapId)
    {
        string path = Path.Combine(mapsRoot, mapId + ".json");
        if (!File.Exists(path)) return new MapTiles(256, 0, 7, "webp");
        try
        {
            using JsonDocument doc = JsonDocument.Parse(File.ReadAllText(path));
            if (!doc.RootElement.TryGetProperty("tiles", out JsonElement t)) return new MapTiles(256, 0, 7, "webp");
            return new MapTiles(
                t.TryGetProperty("tileSize", out JsonElement ts) ? ts.GetInt32() : 256,
                t.TryGetProperty("minZoom", out JsonElement mn) ? mn.GetInt32() : 0,
                t.TryGetProperty("maxZoom", out JsonElement mx) ? mx.GetInt32() : 7,
                t.TryGetProperty("extension", out JsonElement ext) ? ext.GetString() ?? "webp" : "webp");
        }
        catch
        {
            return new MapTiles(256, 0, 7, "webp");
        }
    }

    public static int PickZoom(MapTiles tiles, int maxSide)
    {
        int z = tiles.MinZoom;
        while (z < tiles.MaxZoom && (1 << (z + 1)) * tiles.TileSize <= maxSide) z++;
        return z;
    }

    public static string? Build(string mapsRoot, string cacheDir, string mapId, int zoom, out string note)
    {
        MapTiles tiles = ReadTiles(mapsRoot, mapId);
        int z = Math.Clamp(zoom, tiles.MinZoom, tiles.MaxZoom);
        int n = 1 << z;
        int side = n * tiles.TileSize;
        string tileDir = Path.Combine(mapsRoot, "tiles", mapId, $"zoom_{z}");
        string cachePath = Path.Combine(cacheDir, $"{mapId}_z{z}_{side}.webp");

        if (File.Exists(cachePath))
        {
            note = $"缓存命中 {mapId} z{z} {side}×{side}";
            return cachePath;
        }
        if (!Directory.Exists(tileDir))
        {
            note = $"瓦片目录不存在：{tileDir}";
            return null;
        }

        var sw = System.Diagnostics.Stopwatch.StartNew();
        using var canvas = new Mat(side, side, MatType.CV_8UC3, Scalar.All(0));
        int placed = 0;
        for (int ty = 0; ty < n; ty++)
        {
            for (int tx = 0; tx < n; tx++)
            {
                string file = Path.Combine(tileDir, $"{tx}_{ty}.{tiles.Extension}");
                if (!File.Exists(file)) continue;
                using Mat tile = Cv2.ImRead(file);
                if (tile.Empty()) continue;
                if (tile.Rows != tiles.TileSize || tile.Cols != tiles.TileSize)
                    Cv2.Resize(tile, tile, new Size(tiles.TileSize, tiles.TileSize));
                var roi = new Rect(tx * tiles.TileSize, ty * tiles.TileSize, tiles.TileSize, tiles.TileSize);
                using Mat dst = new(canvas, roi);
                tile.CopyTo(dst);
                placed++;
            }
        }
        if (placed == 0)
        {
            note = $"没有可用瓦片：{tileDir}";
            return null;
        }

        Directory.CreateDirectory(cacheDir);
        string tmp = cachePath + ".tmp.webp";
        Cv2.ImWrite(tmp, canvas, new ImageEncodingParam(ImwriteFlags.WebPQuality, 88));
        File.Move(tmp, cachePath, overwrite: true);
        sw.Stop();
        note = $"拼接 {mapId} z{z} {side}×{side}（{placed} 张瓦片，{sw.ElapsedMilliseconds} ms）";
        return cachePath;
    }

    public static double CacheMegabytes(string cacheDir)
    {
        if (!Directory.Exists(cacheDir)) return 0;
        return Directory.GetFiles(cacheDir, "*.webp").Sum(f => new FileInfo(f).Length) / (1024.0 * 1024.0);
    }
}
