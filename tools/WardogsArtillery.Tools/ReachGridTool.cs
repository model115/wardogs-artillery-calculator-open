using System.Text;
using System.Text.Json;
using OpenCvSharp;
using WardogsArtillery.Core.Ballistics;

namespace WardogsArtillery.Tools;

internal static class ReachGridTool
{
    private const uint Version = 1;

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
        string mapId = args.Length > 0 && !double.TryParse(args[0], out _) ? args[0] : "bakurani";
        double radius = args.Length > 1 && double.TryParse(args[1], out double r) ? r : 300;
        double step = args.Length > 2 && double.TryParse(args[2], out double s) ? s : 10;

        string mapsRoot = Path.Combine(srcRoot, "maps");
        string terrainRoot = Path.Combine(srcRoot, "data", "terrain");
        string outDir = outArg ?? Path.Combine(root, "data", "reach");
        Directory.CreateDirectory(outDir);

        string mapJson = Path.Combine(mapsRoot, mapId + ".json");
        if (!File.Exists(mapJson)) { Console.Error.WriteLine($"找不到地图：{mapJson}"); return 2; }
        string terrainDir = Path.Combine(terrainRoot, mapId);
        if (!Directory.Exists(terrainDir)) { Console.Error.WriteLine($"找不到地形：{terrainDir}"); return 2; }

        (double minX, double maxX, double minY, double maxY) = ReadBounds(mapJson, "bounds");
        double cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
        int half = (int)Math.Ceiling(radius / step);
        int cols = half * 2 + 1, rows = half * 2 + 1;
        double originX = cx - half * (step / 100.0);
        double originY = cy - half * (step / 100.0);

        BallisticLibrary lib = BallisticLibrary.Load(Path.Combine(srcRoot, "data", "weapons.json"));
        IReadOnlyList<BallisticTable> spg = lib.Tables
            .Where(kv => kv.Key.StartsWith("spg/", StringComparison.OrdinalIgnoreCase))
            .Select(kv => kv.Value).ToArray();

        using var terrain = new TerrainHeightmap(terrainDir);
        var options = new ReachOptions { Azimuths = 16, StepMeters = 25 };
        var cells = new float[cols * rows * 2];
        int reachable = 0;

        Console.WriteLine($"地图 {mapId} 中心 ({cx:F2}, {cy:F2})，半径 {radius:F0} m，步长 {step:F0} m → {cols}×{rows} = {cols * rows} 格");
        Console.WriteLine($"统一弹道：{string.Join(" + ", spg.Select(t => t.Name))}；每格 {options.Azimuths} 方位 × {options.StepMeters:F0} m 步长");

        var sw = System.Diagnostics.Stopwatch.StartNew();
        for (int row = 0; row < rows; row++)
        {
            for (int col = 0; col < cols; col++)
            {
                double gx = originX + col * (step / 100.0);
                double gy = originY + row * (step / 100.0);

                if (Math.Sqrt((gx - cx) * (gx - cx) + (gy - cy) * (gy - cy)) * 100 > radius + 1e-6) continue;

                double? h = terrain.HeightAt(gx, gy);
                if (h is null) continue;

                var parts = spg.Select(t => ReachabilityCalculator.Compute(
                    t, terrain, "gun", gx, gy, h, options)).ToArray();
                ReachResult merged = ReachabilityCalculator.Merge("gun", gx, gy, parts);
                if (merged.MinEffectiveMeters is null || merged.MaxEffectiveMeters is null) continue;

                int o = (row * cols + col) * 2;
                cells[o] = (float)merged.MinEffectiveMeters.Value;
                cells[o + 1] = (float)merged.MaxEffectiveMeters.Value;
                reachable++;
            }
            if (row % 10 == 0) Console.Write($"\r  {row * 100 / rows}%");
        }
        sw.Stop();
        Console.WriteLine($"\r  100%  可达格 {reachable}/{cols * rows}，耗时 {sw.ElapsedMilliseconds} ms");

        string baseName = $"{mapId}_r{radius:F0}_s{step:F0}";
        string dataPath = Path.Combine(outDir, baseName + ".wrg");
        using (var fs = new FileStream(dataPath, FileMode.Create, FileAccess.Write))
        using (var bw = new BinaryWriter(fs, Encoding.UTF8))
        {
            bw.Write(Encoding.ASCII.GetBytes("WRG1"));
            bw.Write(Version);
            byte[] idBytes = Encoding.UTF8.GetBytes(mapId);
            bw.Write((uint)idBytes.Length);
            bw.Write(idBytes);
            bw.Write(cx); bw.Write(cy);
            bw.Write(radius); bw.Write(step);
            bw.Write((uint)cols); bw.Write((uint)rows);
            bw.Write(originX); bw.Write(originY);
            foreach (float v in cells) bw.Write(v);
        }

        double mb = new FileInfo(dataPath).Length / (1024.0 * 1024.0);
        var minEffs = cells.Where((_, i) => i % 2 == 0).Where(v => v > 0).ToArray();
        var maxEffs = cells.Where((_, i) => i % 2 == 1).Where(v => v > 0).ToArray();
        var meta = new
        {
            mapId, centerX = cx, centerY = cy, radiusMeters = radius, stepMeters = step,
            cols, rows, originX, originY,
            reachableCells = reachable, totalCells = cols * rows,
            minEffectiveMeters = minEffs.Length > 0 ? minEffs.Min() : 0,
            maxEffectiveMeters = maxEffs.Length > 0 ? maxEffs.Max() : 0,
            minOfMinEffectiveMeters = minEffs.Length > 0 ? minEffs.Min() : 0,
            maxOfMinEffectiveMeters = minEffs.Length > 0 ? minEffs.Max() : 0,
            minOfMaxEffectiveMeters = maxEffs.Length > 0 ? maxEffs.Min() : 0,
            maxOfMaxEffectiveMeters = maxEffs.Length > 0 ? maxEffs.Max() : 0,
            weapons = spg.Select(t => t.Name).ToArray(),
            azimuths = options.Azimuths, scanStepMeters = options.StepMeters,
            file = Path.GetFileName(dataPath),
            bytes = new FileInfo(dataPath).Length,
            megabytes = Math.Round(mb, 3),
            computedAt = DateTimeOffset.Now.ToString("O"),
        };
        string metaPath = Path.Combine(outDir, baseName + ".json");
        File.WriteAllText(metaPath, JsonSerializer.Serialize(meta, new JsonSerializerOptions { WriteIndented = true }));

        WritePreview(cells, cols, rows, Path.Combine(outDir, baseName + "_preview.png"));

        Console.WriteLine($"文件：{dataPath}（{mb:F3} MB，{(mb <= 50 ? "在 50 MB 预算内" : "超过 50 MB！")}）");
        Console.WriteLine($"元数据：{metaPath}");
        Console.WriteLine($"预览图：{Path.Combine(outDir, baseName + "_preview.png")}");
        Console.WriteLine($"射程范围：{meta.minEffectiveMeters:F0} ~ {meta.maxEffectiveMeters:F0} m");
        return mb <= 50 ? 0 : 1;
    }

    private static void WritePreview(float[] cells, int cols, int rows, string path)
    {
        float max = 1;
        for (int i = 1; i < cells.Length; i += 2) if (cells[i] > max) max = cells[i];

        var bytes = new byte[cols * rows * 4];
        for (int i = 0; i < cols * rows; i++)
        {
            float v = cells[i * 2 + 1];
            int o = i * 4;
            if (v <= 0) { bytes[o + 3] = 0; continue; }
            double t = Math.Clamp(v / max, 0, 1);
            double hue = (1.0 - t) * 240.0;
            (byte r, byte g, byte b) = Hsv(hue, 0.85, 1.0);
            bytes[o] = b; bytes[o + 1] = g; bytes[o + 2] = r; bytes[o + 3] = 255;
        }
        using var img = Mat.FromPixelData(rows, cols, MatType.CV_8UC4, bytes);
        using var flipped = new Mat();
        Cv2.Flip(img, flipped, FlipMode.X);
        int scale = Math.Max(1, 512 / Math.Max(cols, rows));
        using var big = new Mat();
        Cv2.Resize(flipped, big, new Size(cols * scale, rows * scale), interpolation: InterpolationFlags.Nearest);
        Cv2.ImWrite(path, big);
    }

    private static (byte R, byte G, byte B) Hsv(double h, double s, double v)
    {
        double c = v * s;
        double x = c * (1 - Math.Abs(h / 60.0 % 2 - 1));
        double m = v - c;
        (double r, double g, double b) = h switch
        {
            < 60 => (c, x, 0.0),
            < 120 => (x, c, 0.0),
            < 180 => (0.0, c, x),
            < 240 => (0.0, x, c),
            _ => (x, 0.0, c),
        };
        return ((byte)((r + m) * 255), (byte)((g + m) * 255), (byte)((b + m) * 255));
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
