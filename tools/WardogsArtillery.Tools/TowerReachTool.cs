using System.Text;
using System.Text.Json;
using OpenCvSharp;
using WardogsArtillery.Core.Ballistics;

namespace WardogsArtillery.Tools;

internal static class TowerReachTool
{
    public static int Run(string[] args)
    {

        string? srcArg = null, outArg = null;
        var pos = new List<string>();
        for (int i = 0; i < args.Length; i++)
        {
            if (args[i] == "--source" && i + 1 < args.Length) { srcArg = args[++i]; continue; }
            if (args[i] == "--out" && i + 1 < args.Length) { outArg = args[++i]; continue; }
            pos.Add(args[i]);
        }
        args = pos.ToArray();
        string root = FindRepoRoot();
        string srcRoot = srcArg ?? Path.Combine(root, "..", "reload", "wardogs-compass",
            "research", "repos", "wardogs-calculator");
        string mapId = args.Length > 0 && !int.TryParse(args[0], out _) ? args[0] : "bakurani";
        int azimuths = args.Length > 1 && int.TryParse(args[1], out int a) ? Math.Clamp(a, 36, 720) : 360;

        string mapsRoot = Path.Combine(srcRoot, "maps");
        string terrainRoot = Path.Combine(srcRoot, "data", "terrain");
        string outDir = outArg ?? Path.Combine(root, "data", "reach");
        Directory.CreateDirectory(outDir);

        string mapJson = Path.Combine(mapsRoot, mapId + ".json");
        if (!File.Exists(mapJson)) { Console.Error.WriteLine($"找不到地图：{mapJson}"); return 2; }
        string terrainDir = Path.Combine(terrainRoot, mapId);
        if (!Directory.Exists(terrainDir)) { Console.Error.WriteLine($"找不到地形：{terrainDir}"); return 2; }

        var towers = ReadTowers(mapJson);
        if (towers.Count == 0) { Console.Error.WriteLine("地图里没有 tower 标记"); return 2; }

        BallisticLibrary lib = BallisticLibrary.Load(Path.Combine(srcRoot, "data", "weapons.json"));
        BallisticTable[] spg = lib.Tables
            .Where(kv => kv.Key.StartsWith("spg/", StringComparison.OrdinalIgnoreCase))
            .OrderBy(kv => kv.Value.MaxMil)
            .Select(kv => kv.Value).ToArray();

        using var terrain = new TerrainHeightmap(terrainDir);
        var options = new ReachOptions { Azimuths = azimuths, StepMeters = 20, IgnoreMinRange = false };

        Console.WriteLine($"地图 {mapId}：{towers.Count} 个塔，{azimuths} 方位，统一弹道 {string.Join(" + ", spg.Select(t => t.Name))}");
        var results = new List<TowerResult>();
        var sw = System.Diagnostics.Stopwatch.StartNew();

        foreach (var (label, x, y) in towers)
        {
            double? h = terrain.HeightAt(x, y);
            if (h is null) { Console.WriteLine($"  {label}: 无地形数据，跳过"); continue; }
            var parts = spg.Select(t => ReachabilityCalculator.Compute(
                t, terrain, "target", x, y, h, options)).ToArray();
            ReachResult r = ReachabilityCalculator.Merge("target", x, y, parts, options);
            results.Add(new TowerResult(label, x, y, h.Value, r));
            Console.WriteLine($"  {label,-10} ({x,7:F2},{y,7:F2}) 高 {h.Value,8:F1} m  " +
                              $"被射范围 {r.MinEffectiveMeters,6:F0} ~ {r.MaxEffectiveMeters,6:F0} m  " +
                              $"可达方位 {r.Samples.Count(s => s.Reachable)}/{r.Samples.Count}");
        }
        sw.Stop();
        Console.WriteLine($"计算耗时 {sw.ElapsedMilliseconds} ms");

        var payload = new
        {
            mapId,
            generatedAt = DateTimeOffset.Now.ToString("O"),
            azimuths,
            weapons = spg.Select(t => t.Name).ToArray(),
            towers = results.Select(t => new
            {
                label = t.Label,
                x = t.X,
                y = t.Y,
                heightMeters = Math.Round(t.Height, 1),
                minRangeMeters = t.Result.MinEffectiveMeters,
                maxRangeMeters = t.Result.MaxEffectiveMeters,
                minTerrainMeters = t.Result.MinTerrainMeters,
                maxTerrainMeters = t.Result.MaxTerrainMeters,
                reachableAzimuths = t.Result.Samples.Count(s => s.Reachable),
                samples = t.Result.Samples.Select(s => new
                {
                    azimuthDeg = Math.Round(s.AzimuthDeg, 1),
                    minRangeMeters = Math.Round(s.MinRangeMeters, 1),
                    maxRangeMeters = Math.Round(s.MaxRangeMeters, 1),
                    reachable = s.Reachable,
                }).ToArray(),
            }).ToArray(),
        };
        string jsonPath = Path.Combine(outDir, $"{mapId}_towers.json");
        File.WriteAllText(jsonPath, JsonSerializer.Serialize(payload, new JsonSerializerOptions { WriteIndented = true }));
        Console.WriteLine($"JSON：{jsonPath}（{new FileInfo(jsonPath).Length / 1024.0:F1} KB）");

        string pngPath = Path.Combine(outDir, $"{mapId}_towers_preview.png");
        WritePreview(mapJson, results, pngPath);
        Console.WriteLine($"预览图：{pngPath}");
        return 0;
    }

    private sealed record TowerResult(string Label, double X, double Y, double Height, ReachResult Result);

    private static List<(string Label, double X, double Y)> ReadTowers(string mapJson)
    {
        using JsonDocument doc = JsonDocument.Parse(File.ReadAllText(mapJson));
        var list = new List<(string, double, double)>();
        if (!doc.RootElement.TryGetProperty("markers", out JsonElement markers)) return list;
        foreach (JsonElement m in markers.EnumerateArray())
        {
            if (!m.TryGetProperty("icon", out JsonElement icon) || icon.GetString() != "tower") continue;
            string label = m.TryGetProperty("label", out JsonElement l) ? l.GetString() ?? "Tower" : "Tower";

            list.Add((label, m.GetProperty("x").GetDouble() / 100.0, m.GetProperty("y").GetDouble() / 100.0));
        }
        return list.OrderBy(t => t.Item1, StringComparer.OrdinalIgnoreCase).ToList();
    }

    private static void WritePreview(string mapJson, List<TowerResult> towers, string path)
    {
        (double minX, double maxX, double minY, double maxY) = ReadBounds(mapJson, "tileBounds");
        const int size = 1024;
        var img = new byte[size * size * 4];
        byte[][] colors =
        {
            new byte[] { 78, 163, 255 }, new byte[] { 51, 209, 122 }, new byte[] { 255, 176, 32 },
            new byte[] { 220, 120, 255 }, new byte[] { 255, 90, 90 },
        };

        double spanX = maxX - minX, spanY = maxY - minY;
        for (int py = 0; py < size; py++)
        {
            double wy = maxY - (py + 0.5) / size * spanY;
            for (int px = 0; px < size; px++)
            {
                double wx = minX + (px + 0.5) / size * spanX;
                int o = (py * size + px) * 4;
                for (int t = 0; t < towers.Count; t++)
                {
                    TowerResult tw = towers[t];
                    double dx = (wx - tw.X) * 100, dy = (wy - tw.Y) * 100;
                    double dist = Math.Sqrt(dx * dx + dy * dy);
                    if (dist < 1) continue;
                    double az = (Math.Atan2(dx, dy) * 180 / Math.PI % 360 + 360) % 360;

                    int idx = (int)Math.Round(az / 360.0 * tw.Result.Samples.Count) % tw.Result.Samples.Count;
                    ReachSample s = tw.Result.Samples[idx];
                    if (!s.Reachable) continue;
                    if (dist < s.MinRangeMeters || dist > s.MaxRangeMeters) continue;
                    byte[] c = colors[t % colors.Length];
                    img[o] = (byte)Math.Min(255, img[o] + c[2] / 2);
                    img[o + 1] = (byte)Math.Min(255, img[o + 1] + c[1] / 2);
                    img[o + 2] = (byte)Math.Min(255, img[o + 2] + c[0] / 2);
                    img[o + 3] = 255;
                }
            }
        }

        using var mat = Mat.FromPixelData(size, size, MatType.CV_8UC4, img);
        using var bgr = new Mat();
        Cv2.CvtColor(mat, bgr, ColorConversionCodes.BGRA2BGR);

        for (int t = 0; t < towers.Count; t++)
        {
            TowerResult tw = towers[t];
            int px = (int)((tw.X - minX) / spanX * size);
            int py = (int)((maxY - tw.Y) / spanY * size);
            byte[] c = colors[t % colors.Length];
            Cv2.Circle(bgr, new Point(px, py), 6, new Scalar(c[0], c[1], c[2]), -1);
            Cv2.PutText(bgr, tw.Label, new Point(px + 9, py + 4),
                        HersheyFonts.HersheySimplex, 0.5, new Scalar(255, 255, 255), 1, LineTypes.AntiAlias);
        }
        Cv2.ImWrite(path, bgr);
    }

    private static (double MinX, double MaxX, double MinY, double MaxY) ReadBounds(string mapJson, string key)
    {
        using JsonDocument doc = JsonDocument.Parse(File.ReadAllText(mapJson));
        JsonElement root = doc.RootElement;
        JsonElement b = root.TryGetProperty(key, out JsonElement tb) ? tb : root.GetProperty("bounds");
        return (b.GetProperty("minX").GetDouble(), b.GetProperty("maxX").GetDouble(),
                b.GetProperty("minY").GetDouble(), b.GetProperty("maxY").GetDouble());
    }

    private static string FindRepoRoot()
    {
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir is not null)
        {
            if (File.Exists(Path.Combine(dir.FullName, "assets", "templates.bin"))) return dir.FullName;
            dir = dir.Parent;
        }
        return Directory.GetCurrentDirectory();
    }
}
