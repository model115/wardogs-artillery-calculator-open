using System.Text.Json;
using System.Text.Json.Serialization;

namespace WardogsArtillery.Core.Ballistics;

public sealed class BallisticLibrary
{
    private readonly Dictionary<string, BallisticTable> _tables;

    public IReadOnlyDictionary<string, BallisticTable> Tables => _tables;

    private BallisticLibrary(Dictionary<string, BallisticTable> tables) => _tables = tables;

    public BallisticTable? Get(string name)
        => _tables.TryGetValue(name, out BallisticTable? t) ? t : null;

    public BallisticTable Require(string name)
        => Get(name) ?? throw new KeyNotFoundException($"未知弹道: {name}（可选: {string.Join(", ", _tables.Keys)}）");

    public static BallisticLibrary Load(string path)
    {
        using JsonDocument doc = JsonDocument.Parse(File.ReadAllText(path));
        var tables = new Dictionary<string, BallisticTable>();

        if (doc.RootElement.TryGetProperty("weapons", out JsonElement weapons))
        {
            foreach (JsonElement w in weapons.EnumerateArray())
            {
                string id = w.GetProperty("id").GetString()!;
                foreach (JsonProperty arc in w.GetProperty("ballistics").EnumerateObject())
                {
                    var pts = new List<(double, double)>();
                    foreach (JsonElement p in arc.Value.EnumerateArray())
                        pts.Add((p[0].GetDouble(), p[1].GetDouble()));
                    tables[$"{id}/{arc.Name}"] = new BallisticTable($"{id}/{arc.Name}", pts);
                }
            }
        }
        else if (doc.RootElement.TryGetProperty("tables", out JsonElement t))
        {
            foreach (JsonProperty table in t.EnumerateObject())
            {
                var pts = new List<(double, double)>();
                foreach (JsonElement p in table.Value.GetProperty("points").EnumerateArray())
                    pts.Add((p[0].GetDouble(), p[1].GetDouble()));
                tables[table.Name] = new BallisticTable(table.Name, pts);
            }
        }
        else
        {
            throw new InvalidDataException($"无法识别的射表文件: {path}");
        }

        return new BallisticLibrary(tables);
    }
}
