using System.Text.Json;
using WardogsArtillery.Core.Ballistics;

namespace WardogsArtillery.Tools;

internal static class AssetBuilder
{

    internal static string RepoRoot
    {
        get
        {
            var dir = new DirectoryInfo(AppContext.BaseDirectory);
            while (dir is not null)
            {
                if (Directory.Exists(Path.Combine(dir.FullName, "src"))
                    && Directory.Exists(Path.Combine(dir.FullName, "web")))
                    return dir.FullName;
                dir = dir.Parent;
            }
            return Directory.GetCurrentDirectory();
        }
    }

    public static int Run(string[] args)
    {
        string? sourceArg = null;
        var rest = new List<string>();
        for (int i = 0; i < args.Length; i++)
        {
            if (args[i] == "--source" && i + 1 < args.Length) { sourceArg = args[++i]; continue; }
            rest.Add(args[i]);
        }
        string command = rest.Count > 0 ? rest[0].ToLowerInvariant() : "check";
        string dataRoot = Path.Combine(RepoRoot, "data");

        string? source = sourceArg ?? Environment.GetEnvironmentVariable("WARDOCS_CALC_SOURCE");
        if (!string.IsNullOrWhiteSpace(source)) source = Path.GetFullPath(source);

        Directory.CreateDirectory(dataRoot);
        Console.WriteLine($"仓库：{RepoRoot}");
        Console.WriteLine($"输出：{dataRoot}");

        bool needsSource = command is "maps" or "weapons" or "markers" or "images" or "grid" or "reach" or "all";
        if (needsSource)
        {
            if (string.IsNullOrWhiteSpace(source))
            {
                Console.Error.WriteLine($"命令 {command} 需要原始数据源：--source <wardogs-calculator 目录>");
                Console.Error.WriteLine("（或设置环境变量 WARDOCS_CALC_SOURCE）");
                return 2;
            }
            Console.WriteLine($"数据源：{source}");
            if (!Directory.Exists(source))
            {
                Console.Error.WriteLine($"找不到数据源目录：{source}");
                return 2;
            }
        }

        int rc = 0;
        switch (command)
        {
            case "maps": rc = Maps(source!, dataRoot); break;
            case "weapons": rc = Weapons(source!, dataRoot); break;
            case "markers": rc = Markers(source!, dataRoot); break;
            case "images": rc = Images(source!, dataRoot); break;
            case "grid": rc = Grids(source!, dataRoot); break;
            case "reach": rc = Reach(source!, dataRoot); break;
            case "all":
                rc = Maps(source!, dataRoot) | Weapons(source!, dataRoot) | Markers(source!, dataRoot)
                   | Grids(source!, dataRoot) | Images(source!, dataRoot) | Reach(source!, dataRoot);
                break;
            case "check": rc = Check(dataRoot, rest.Contains("--allow-missing")); break;
            default:
                Console.Error.WriteLine($"未知命令 {command}（maps|weapons|markers|images|grid|reach|all|check）");
                return 2;
        }
        if (command is "all" or "check" or "images" or "grid") PrintSizes(dataRoot);
        return rc;
    }

    private static int Maps(string source, string dataRoot)
    {
        string mapsDir = Path.Combine(source, "maps");
        var list = new List<object>();
        foreach (string file in Directory.GetFiles(mapsDir, "*.json"))
        {
            string name = Path.GetFileNameWithoutExtension(file);
            if (name is "index" or "example_map" or "assets") continue;
            using JsonDocument doc = JsonDocument.Parse(File.ReadAllText(file));
            JsonElement root = doc.RootElement;
            if (!root.TryGetProperty("bounds", out _)) continue;

            list.Add(new
            {
                id = Str(root, "id") ?? name,
                name = Str(root, "name") ?? name,
                bounds = Bounds(root.GetProperty("bounds")),
                tileBounds = root.TryGetProperty("tileBounds", out JsonElement tb) ? Bounds(tb) : null,
                markers = root.TryGetProperty("markers", out JsonElement mk)
                    ? mk.EnumerateArray().Select(m => new
                    {
                        x = m.GetProperty("x").GetDouble(),
                        y = m.GetProperty("y").GetDouble(),
                        label = Str(m, "label"),
                        icon = Str(m, "icon"),
                        minZoom = m.TryGetProperty("minZoom", out JsonElement mz) ? mz.GetDouble() : 0,
                    }).ToArray()
                    : Array.Empty<object>(),
                polygons = root.TryGetProperty("polygons", out JsonElement pg)
                    ? pg.EnumerateArray().Select(p => new
                    {
                        label = Str(p, "label"),
                        color = Str(p, "color") ?? "#888888",
                        fillOpacity = p.TryGetProperty("fillOpacity", out JsonElement fo) ? fo.GetDouble() : 0.12,
                        dashed = p.TryGetProperty("dashed", out JsonElement dd) && dd.GetBoolean(),
                        points = p.TryGetProperty("points", out JsonElement pp)
                            ? pp.EnumerateArray().Select(pt => new
                            {
                                x = pt.GetProperty("x").GetDouble(),
                                y = pt.GetProperty("y").GetDouble(),
                            }).ToArray()
                            : Array.Empty<object>(),
                    }).ToArray()
                    : Array.Empty<object>(),
            });
        }

        string outPath = Path.Combine(dataRoot, "maps.json");
        File.WriteAllText(outPath, JsonSerializer.Serialize(list, new JsonSerializerOptions { WriteIndented = true }));
        Console.WriteLine($"maps.json：{list.Count} 张地图 → {outPath}");
        return 0;

        static object Bounds(JsonElement b) => new
        {
            minX = b.GetProperty("minX").GetDouble(), maxX = b.GetProperty("maxX").GetDouble(),
            minY = b.GetProperty("minY").GetDouble(), maxY = b.GetProperty("maxY").GetDouble(),
        };
        static string? Str(JsonElement e, string key)
            => e.TryGetProperty(key, out JsonElement v) && v.ValueKind == JsonValueKind.String ? v.GetString() : null;
    }

    private static int Weapons(string source, string dataRoot)
    {
        string src = Path.Combine(source, "data", "weapons.json");
        if (!File.Exists(src)) { Console.Error.WriteLine($"缺少 {src}"); return 2; }
        File.Copy(src, Path.Combine(dataRoot, "weapons.json"), overwrite: true);
        Console.WriteLine("weapons.json 已复制");
        return 0;
    }

    private static int Markers(string source, string dataRoot)
    {
        string src = Path.Combine(source, "assets", "map-markers");
        if (!Directory.Exists(src)) { Console.Error.WriteLine($"缺少 {src}"); return 2; }
        string dst = Path.Combine(dataRoot, "markers");
        Directory.CreateDirectory(dst);
        int n = 0;
        foreach (string f in Directory.GetFiles(src, "*.webp"))
        {
            File.Copy(f, Path.Combine(dst, Path.GetFileName(f)), overwrite: true);
            n++;
        }
        Console.WriteLine($"markers：{n} 个图标 → {dst}");
        return 0;
    }

    private static int Images(string source, string dataRoot)
    {
        string mapsRoot = Path.Combine(source, "maps");
        string terrainRoot = Path.Combine(source, "data", "terrain");
        string dst = Path.Combine(dataRoot, "images");
        Directory.CreateDirectory(dst);

        foreach (string file in Directory.GetFiles(mapsRoot, "*.json"))
        {
            string mapId = Path.GetFileNameWithoutExtension(file);
            if (mapId is "index" or "example_map" or "assets") continue;
            using JsonDocument doc = JsonDocument.Parse(File.ReadAllText(file));
            if (!doc.RootElement.TryGetProperty("bounds", out _)) continue;

            int zoom = MapImageComposer.PickZoom(MapImageComposer.ReadTiles(mapsRoot, mapId), 4096);
            string? big = MapImageComposer.Build(mapsRoot, dst, mapId, zoom, out string note);
            if (big is not null) big = Rename(big, Path.Combine(dst, mapId + "_map.webp"));
            Console.WriteLine($"  地图图 {mapId}：{note}" + (big is null ? "" : $" → {Path.GetFileName(big)}"));

            if (Directory.Exists(Path.Combine(terrainRoot, mapId)))
            {
                TerrainImageComposer.Result? heat = TerrainImageComposer.Build(
                    mapsRoot, terrainRoot, dst, mapId, TerrainImageComposer.DefaultSize, out string hnote);
                if (heat is not null)
                {
                    string target = Path.Combine(dst, mapId + "_terrain.webp");
                    Rename(heat.Value.Path, target);
                    hnote += $" → {Path.GetFileName(target)}";
                }
                Console.WriteLine($"  热力图 {mapId}：{hnote}");
            }
        }
        return 0;
    }

    private static string Rename(string from, string to)
    {
        if (string.Equals(from, to, StringComparison.OrdinalIgnoreCase)) return to;
        File.Move(from, to, overwrite: true);
        return to;
    }

    private static int Grids(string source, string dataRoot, int size = 1024)
    {
        string terrainRoot = Path.Combine(source, "data", "terrain");
        string mapsRoot = Path.Combine(source, "maps");
        string dst = Path.Combine(dataRoot, "terrain");
        Directory.CreateDirectory(dst);

        foreach (string dir in Directory.GetDirectories(terrainRoot))
        {
            string mapId = Path.GetFileName(dir);
            string mapJson = Path.Combine(mapsRoot, mapId + ".json");
            if (!File.Exists(mapJson)) continue;

            using JsonDocument doc = JsonDocument.Parse(File.ReadAllText(mapJson));
            JsonElement b = doc.RootElement.TryGetProperty("tileBounds", out JsonElement tb)
                ? tb : doc.RootElement.GetProperty("bounds");
            var bounds = new TerrainBounds(
                b.GetProperty("minX").GetDouble(), b.GetProperty("maxX").GetDouble(),
                b.GetProperty("minY").GetDouble(), b.GetProperty("maxY").GetDouble());

            var sw = System.Diagnostics.Stopwatch.StartNew();
            using var chunks = new TerrainHeightmap(dir);
            ElevationGrid grid = ElevationGrid.BuildFrom(chunks, bounds, size);
            string outPath = Path.Combine(dst, mapId + ".hgt");
            grid.Save(outPath);
            File.WriteAllText(Path.Combine(dst, mapId + ".json"),
                JsonSerializer.Serialize(grid.Describe(), new JsonSerializerOptions { WriteIndented = true }));
            sw.Stop();
            Console.WriteLine($"  高程网格 {mapId}：{size}×{size}（{grid.CellSizeMeters:F1} m/格）" +
                              $" → {Path.GetFileName(outPath)}（{new FileInfo(outPath).Length / 1024.0 / 1024.0:F2} MB，{sw.ElapsedMilliseconds} ms）");
        }
        return 0;
    }

    private static int Reach(string source, string dataRoot)
    {
        string mapsRoot = Path.Combine(source, "maps");
        string terrainRoot = Path.Combine(source, "data", "terrain");
        string dst = Path.Combine(dataRoot, "reach");
        Directory.CreateDirectory(dst);

        foreach (string dir in Directory.GetDirectories(terrainRoot))
        {
            string mapId = Path.GetFileName(dir);
            if (!File.Exists(Path.Combine(mapsRoot, mapId + ".json"))) continue;

            Console.WriteLine($"  {mapId} 射程网格（中心 300 m）：");
            ReachGridTool.Run(new[] { mapId, "300", "10", "--source", source, "--out", dst });
            Console.WriteLine($"  {mapId} 塔被射图：");
            TowerReachTool.Run(new[] { mapId, "360", "--source", source, "--out", dst });
        }
        return 0;
    }

    private static int Check(string dataRoot, bool allowMissing = false)
    {
        bool ok = true;
        bool missing = false;
        void Fail(string rel, string why)
        {
            Console.WriteLine($"  [×] {rel,-40} {why}");
            ok = false;
        }
        void Miss(string rel, string what)
        {
            Console.WriteLine($"  [ ] {rel,-40} 缺失（{what}）");
            missing = true;
        }
        void Pass(string rel, string what) => Console.WriteLine($"  [√] {rel,-40} {what}");

        Console.WriteLine("资产自检：");

        string mapsPath = Path.Combine(dataRoot, "maps.json");
        if (!File.Exists(mapsPath)) Miss("maps.json", "地图元数据");
        else
        {
            try
            {
                using JsonDocument doc = JsonDocument.Parse(File.ReadAllText(mapsPath));
                int n = doc.RootElement.ValueKind == JsonValueKind.Array ? doc.RootElement.GetArrayLength() : 0;
                if (n == 0) Fail("maps.json", "没有地图");
                else Pass("maps.json", $"地图元数据（{n} 张）");
            }
            catch (Exception ex) { Fail("maps.json", $"解析失败：{ex.Message}"); }
        }

        string weaponsPath = Path.Combine(dataRoot, "weapons.json");
        if (!File.Exists(weaponsPath)) Miss("weapons.json", "射表");
        else
        {
            try
            {
                BallisticLibrary lib = BallisticLibrary.Load(weaponsPath);
                if (lib.Tables.Count == 0) Fail("weapons.json", "没有弹道表");
                else Pass("weapons.json", $"射表（{lib.Tables.Count} 张：{string.Join(", ", lib.Tables.Keys)}）");
            }
            catch (Exception ex) { Fail("weapons.json", $"载入失败：{ex.Message}"); }
        }

        string towerIcon = Path.Combine(dataRoot, "markers", "tower.webp");
        if (!IsWebp(towerIcon)) Miss("markers/tower.webp", "标记图标");
        else Pass("markers/tower.webp", "标记图标");

        foreach (string map in new[] { "bakurani", "ozeti" })
        {

            string hgt = Path.Combine(dataRoot, "terrain", map + ".hgt");
            if (!File.Exists(hgt)) Miss($"terrain/{map}.hgt", $"{map} 高程网格");
            else
            {
                try
                {
                    using ElevationGrid g = ElevationGrid.Load(hgt);
                    Pass($"terrain/{map}.hgt", $"{g.Cols}×{g.Rows} @ {g.CellSizeMeters:F0} m/格");
                }
                catch (Exception ex) { Fail($"terrain/{map}.hgt", $"解码失败：{ex.Message}"); }
            }

            foreach (string suffix in new[] { "_map", "_terrain" })
            {
                string img = Path.Combine(dataRoot, "images", map + suffix + ".webp");
                if (!IsWebp(img)) Miss($"images/{map}{suffix}.webp", $"{map} 图片");
                else Pass($"images/{map}{suffix}.webp", $"{new FileInfo(img).Length / 1024.0 / 1024.0:F2} MB");
            }
        }

        if (!ok) { Console.WriteLine("自检未通过（有文件损坏，不是单纯缺失）"); return 1; }
        if (missing)
        {
            Console.WriteLine(allowMissing
                ? "自检通过（部分素材缺失，按 --allow-missing 放行）—— 用 assets all --source <数据源> 生成"
                : "自检未通过：缺少素材 —— 用 assets all --source <数据源> 生成");
            return allowMissing ? 0 : 1;
        }
        Console.WriteLine("自检通过");
        return 0;
    }

    private static bool IsWebp(string path)
    {
        if (!File.Exists(path) || new FileInfo(path).Length < 512) return false;
        Span<byte> head = stackalloc byte[12];
        using FileStream fs = File.OpenRead(path);
        if (fs.Read(head) != head.Length) return false;
        return head[0] == 'R' && head[1] == 'I' && head[2] == 'F' && head[3] == 'F'
            && head[8] == 'W' && head[9] == 'E' && head[10] == 'B' && head[11] == 'P';
    }

    private static void PrintSizes(string dataRoot)
    {
        var files = Directory.GetFiles(dataRoot, "*", SearchOption.AllDirectories);
        long total = files.Sum(f => new FileInfo(f).Length);
        Console.WriteLine($"data/ 合计 {total / 1024.0 / 1024.0:F2} MB（{files.Length} 个文件）");
    }
}
