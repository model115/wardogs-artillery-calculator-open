using System.Text.Json;
using OpenCvSharp;
using WardogsArtillery.Core.Ballistics;

namespace WardogsArtillery.Tools;

public static class TerrainImageComposer
{
    public const int DefaultSize = 1024;

    public readonly record struct Result(string Path, double MinHeight, double MaxHeight, double Megapixels);

    public static Result? Build(string mapsRoot, string terrainRoot, string cacheDir,
                                string mapId, int size, out string note)
    {
        size = Math.Clamp(size, 128, 2048);
        string terrainDir = Path.Combine(terrainRoot, mapId);
        if (!Directory.Exists(terrainDir))
        {
            note = $"没有 {mapId} 的地形数据";
            return null;
        }

        string mapJson = Path.Combine(mapsRoot, mapId + ".json");
        if (!File.Exists(mapJson))
        {
            note = $"没有 {mapId} 的地图定义";
            return null;
        }

        (double minX, double maxX, double minY, double maxY) = ReadTileBounds(mapJson);
        string cachePath = Path.Combine(cacheDir, $"{mapId}_terrain_v2_{size}.webp");
        string metaPath = Path.Combine(cacheDir, $"{mapId}_terrain_v2_{size}.json");

        if (File.Exists(cachePath) && File.Exists(metaPath))
        {
            try
            {
                using JsonDocument doc = JsonDocument.Parse(File.ReadAllText(metaPath));
                note = "缓存命中";
                return new Result(cachePath,
                    doc.RootElement.GetProperty("minHeight").GetDouble(),
                    doc.RootElement.GetProperty("maxHeight").GetDouble(), 0);
            }
            catch {  }
        }

        var sw = System.Diagnostics.Stopwatch.StartNew();
        using var terrain = new TerrainHeightmap(terrainDir);
        var heights = new float[size * size];
        float lo = float.MaxValue, hi = float.MinValue;
        double spanX = maxX - minX, spanY = maxY - minY;

        for (int py = 0; py < size; py++)
        {
            double wy = maxY - (py + 0.5) / size * spanY;
            for (int px = 0; px < size; px++)
            {
                double wx = minX + (px + 0.5) / size * spanX;
                double? h = terrain.HeightAt(wx, wy);
                if (h is null)
                {
                    heights[py * size + px] = float.NaN;
                    continue;
                }
                float v = (float)h.Value;
                heights[py * size + px] = v;
                if (v < lo) lo = v;
                if (v > hi) hi = v;
            }
        }

        if (lo > hi)
        {
            note = "整张图都没有地形数据";
            return null;
        }

        double span = hi - lo;
        if (span < 1e-6) span = 1;

        const int bins = 512;
        var hist = new int[bins];
        int valid = 0;
        foreach (float v in heights)
        {
            if (float.IsNaN(v)) continue;
            int b = (int)((v - lo) / span * (bins - 1));
            hist[Math.Clamp(b, 0, bins - 1)]++;
            valid++;
        }
        var cdf = new double[bins];
        int acc = 0;
        for (int b = 0; b < bins; b++)
        {
            acc += hist[b];
            cdf[b] = valid > 0 ? acc / (double)valid : 0;
        }

        var bgraBytes = new byte[size * size * 4];
        for (int i = 0; i < heights.Length; i++)
        {
            float v = heights[i];
            int o = i * 4;
            if (float.IsNaN(v))
            {
                bgraBytes[o] = bgraBytes[o + 1] = bgraBytes[o + 2] = bgraBytes[o + 3] = 0;
                continue;
            }
            int b = Math.Clamp((int)((v - lo) / span * (bins - 1)), 0, bins - 1);
            double t = cdf[b];
            (byte r, byte g, byte bl) = Ramp(t);
            bgraBytes[o] = bl;
            bgraBytes[o + 1] = g;
            bgraBytes[o + 2] = r;
            bgraBytes[o + 3] = 190;
        }
        using var bgra = Mat.FromPixelData(size, size, MatType.CV_8UC4, bgraBytes);

        Directory.CreateDirectory(cacheDir);
        string tmp = cachePath + ".tmp.webp";
        Cv2.ImWrite(tmp, bgra, new ImageEncodingParam(ImwriteFlags.WebPQuality, 90));
        File.Move(tmp, cachePath, overwrite: true);
        File.WriteAllText(metaPath, JsonSerializer.Serialize(new
        {
            mapId, size, minX, maxX, minY, maxY, minHeight = lo, maxHeight = hi,
        }));
        sw.Stop();
        note = $"热力图 {mapId} {size}×{size}（{lo:F0}~{hi:F0} m，{sw.ElapsedMilliseconds} ms）";
        return new Result(cachePath, lo, hi, size * (double)size / 1e6);
    }

    private static (byte R, byte G, byte B) Ramp(double t)
    {
        t = Math.Clamp(t, 0, 1);

        double hue = (1.0 - t) * 240.0;
        return HsvToRgb(hue, 0.85, 1.0);
    }

    private static (byte R, byte G, byte B) HsvToRgb(double h, double s, double v)
    {
        double c = v * s;
        double x = c * (1 - Math.Abs((h / 60.0) % 2 - 1));
        double m = v - c;
        (double r, double g, double b) = h switch
        {
            < 60 => (c, x, 0.0),
            < 120 => (x, c, 0.0),
            < 180 => (0.0, c, x),
            < 240 => (0.0, x, c),
            < 300 => (x, 0.0, c),
            _ => (c, 0.0, x),
        };
        return ((byte)((r + m) * 255), (byte)((g + m) * 255), (byte)((b + m) * 255));
    }

    private static (double MinX, double MaxX, double MinY, double MaxY) ReadTileBounds(string mapJson)
    {
        using JsonDocument doc = JsonDocument.Parse(File.ReadAllText(mapJson));
        JsonElement root = doc.RootElement;
        JsonElement b = root.TryGetProperty("tileBounds", out JsonElement tb) ? tb : root.GetProperty("bounds");
        return (b.GetProperty("minX").GetDouble(), b.GetProperty("maxX").GetDouble(),
                b.GetProperty("minY").GetDouble(), b.GetProperty("maxY").GetDouble());
    }
}
