using System.Text.Json;
using System.Text.Json.Serialization;

namespace WardogsArtillery.Core.Ballistics;

public sealed class TerrainManifest
{
    [JsonPropertyName("format")] public string Format { get; set; } = "";
    [JsonPropertyName("mapId")] public string MapId { get; set; } = "";
    [JsonPropertyName("verticesPerSide")] public int VerticesPerSide { get; set; }
    [JsonPropertyName("chunkQuads")] public int ChunkQuads { get; set; }
    [JsonPropertyName("vertexSpacingMeters")] public double VertexSpacingMeters { get; set; }
    [JsonPropertyName("globalQuadOffsetX")] public double GlobalQuadOffsetX { get; set; }
    [JsonPropertyName("globalQuadOffsetY")] public double GlobalQuadOffsetY { get; set; }
    [JsonPropertyName("gameUnitsToLandscapeQuadsX")] public double GameUnitsToLandscapeQuadsX { get; set; }
    [JsonPropertyName("gameUnitsToLandscapeQuadsY")] public double GameUnitsToLandscapeQuadsY { get; set; }
    [JsonPropertyName("worldZOffsetMeters")] public double WorldZOffsetMeters { get; set; }
    [JsonPropertyName("worldZScaleMetersPerLocalUnit")] public double WorldZScaleMetersPerLocalUnit { get; set; }
    [JsonPropertyName("chunkXMin")] public int ChunkXMin { get; set; }
    [JsonPropertyName("chunkXMax")] public int ChunkXMax { get; set; }
    [JsonPropertyName("chunkYMin")] public int ChunkYMin { get; set; }
    [JsonPropertyName("chunkYMax")] public int ChunkYMax { get; set; }
    [JsonPropertyName("coverage")] public Coverage? CoverageArea { get; set; }
    [JsonPropertyName("chunks")] public Dictionary<string, ChunkEntry> Chunks { get; set; } = new();
}

public sealed class Coverage
{
    [JsonPropertyName("gameXMin")] public double GameXMin { get; set; }
    [JsonPropertyName("gameXMax")] public double GameXMax { get; set; }
    [JsonPropertyName("gameYMin")] public double GameYMin { get; set; }
    [JsonPropertyName("gameYMax")] public double GameYMax { get; set; }
}

public sealed class ChunkEntry
{
    [JsonPropertyName("file")] public string File { get; set; } = "";
    [JsonPropertyName("bytes")] public int Bytes { get; set; }
    [JsonPropertyName("minLocalZ")] public double MinLocalZ { get; set; }
    [JsonPropertyName("maxLocalZ")] public double MaxLocalZ { get; set; }
    [JsonPropertyName("sha256")] public string? Sha256 { get; set; }
}

public sealed class TerrainHeightmap : ITerrainHeight, IDisposable
{

    public const int DefaultMaxCachedChunks = 64;

    private readonly TerrainManifest _m;
    private readonly string _dir;
    private readonly Dictionary<string, float[]?> _cache = new();
    private readonly Queue<string> _order = new();
    private readonly int _maxCachedChunks;
    private readonly object _gate = new();

    public string MapId => _m.MapId;
    public string Format => _m.Format;
    public Coverage? Coverage => _m.CoverageArea;

    public TerrainBounds? Bounds => _m.CoverageArea is null
        ? null
        : new TerrainBounds(_m.CoverageArea.GameXMin, _m.CoverageArea.GameXMax,
                            _m.CoverageArea.GameYMin, _m.CoverageArea.GameYMax);
    public TerrainManifest Manifest => _m;
    public int CachedChunks { get { lock (_gate) return _cache.Count; } }

    public long Evictions { get; private set; }

    public TerrainHeightmap(string terrainDir, TerrainManifest? manifest = null, int maxCachedChunks = DefaultMaxCachedChunks)
    {
        _dir = terrainDir;
        _maxCachedChunks = Math.Max(1, maxCachedChunks);
        string path = Path.Combine(terrainDir, "manifest.json");
        _m = manifest ?? JsonSerializer.Deserialize<TerrainManifest>(File.ReadAllText(path))
            ?? throw new InvalidDataException($"manifest 解析失败: {path}");
        if (_m.Format != "wardogs-landscape-collision-u16-v1")
            throw new InvalidDataException($"不支持的地形格式: {_m.Format}");
        if (_m.VerticesPerSide != _m.ChunkQuads + 1)
            throw new InvalidDataException($"顶点数与 chunk 尺寸不一致: {_m.VerticesPerSide} vs {_m.ChunkQuads}");
    }

    public static TerrainHeightmap Load(string terrainDir) => new(terrainDir);

    public double? HeightAt(double gameX, double gameY)
    {
        double qx = _m.GlobalQuadOffsetX + gameX * _m.GameUnitsToLandscapeQuadsX;
        double qy = _m.GlobalQuadOffsetY + gameY * _m.GameUnitsToLandscapeQuadsY;
        int cx = (int)Math.Floor(qx / _m.ChunkQuads);
        int cy = (int)Math.Floor(qy / _m.ChunkQuads);
        if (cx < _m.ChunkXMin || cx > _m.ChunkXMax || cy < _m.ChunkYMin || cy > _m.ChunkYMax)
            return null;

        float[]? z = GetChunk(cx, cy);
        if (z is null) return null;

        int side = _m.VerticesPerSide;
        double lx = Math.Clamp(qx - cx * (double)_m.ChunkQuads, 0, _m.ChunkQuads);
        double ly = Math.Clamp(qy - cy * (double)_m.ChunkQuads, 0, _m.ChunkQuads);
        int x0 = (int)Math.Floor(lx), y0 = (int)Math.Floor(ly);
        int x1 = Math.Min(_m.ChunkQuads, x0 + 1), y1 = Math.Min(_m.ChunkQuads, y0 + 1);
        double fx = lx - x0, fy = ly - y0;

        return z[y0 * side + x0] * (1 - fx) * (1 - fy)
             + z[y0 * side + x1] * fx * (1 - fy)
             + z[y1 * side + x0] * (1 - fx) * fy
             + z[y1 * side + x1] * fx * fy;
    }

    public double? HeightDelta(double x0, double y0, double x1, double y1)
    {
        double? h0 = HeightAt(x0, y0);
        double? h1 = HeightAt(x1, y1);
        if (h0 is null || h1 is null) return null;
        return h1.Value - h0.Value;
    }

    private float[]? GetChunk(int cx, int cy)
    {
        string key = $"{cx},{cy}";
        lock (_gate)
        {
            if (_cache.TryGetValue(key, out float[]? cached)) return cached;
        }

        float[]? decoded = null;
        if (_m.Chunks.TryGetValue(key, out ChunkEntry? entry))
        {
            string path = Path.Combine(_dir, entry.File);
            if (File.Exists(path))
            {
                byte[] bytes = File.ReadAllBytes(path);
                int expected = _m.VerticesPerSide * _m.VerticesPerSide * 2;
                if (bytes.Length == expected)
                {
                    decoded = new float[_m.VerticesPerSide * _m.VerticesPerSide];
                    double lo = entry.MinLocalZ, hi = entry.MaxLocalZ;
                    double span = hi - lo;
                    for (int i = 0; i < decoded.Length; i++)
                    {
                        ushort raw = (ushort)(bytes[i * 2] | (bytes[i * 2 + 1] << 8));
                        double localZ = lo + raw / 65535.0 * span;
                        decoded[i] = (float)(_m.WorldZOffsetMeters + localZ * _m.WorldZScaleMetersPerLocalUnit);
                    }
                }
            }
        }

        lock (_gate)
        {
            _cache[key] = decoded;
            _order.Enqueue(key);
            while (_order.Count > _maxCachedChunks)
            {
                string oldest = _order.Dequeue();
                if (oldest != key && _cache.Remove(oldest)) Evictions++;
            }
        }
        return decoded;
    }

    public void Dispose()
    {
        lock (_gate)
        {
            _cache.Clear();
            _order.Clear();
        }
    }
}
