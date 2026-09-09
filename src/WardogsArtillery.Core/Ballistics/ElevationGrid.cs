using System.Text;
using System.Text.Json;

namespace WardogsArtillery.Core.Ballistics;

public sealed class ElevationGrid : ITerrainHeight, IDisposable
{
    public const string Magic = "WHG1";
    public const uint Version = 1;
    public const short NoData = short.MinValue;

    private readonly short[] _cells;

    public string MapId { get; }
    public int Cols { get; }
    public int Rows { get; }
    public double OriginX { get; }
    public double OriginY { get; }

    public double StepX { get; }

    public double StepY { get; }
    public double BaseHeight { get; }
    public double HeightScale { get; }
    public TerrainBounds? Bounds { get; }

    private ElevationGrid(string mapId, int cols, int rows, double originX, double originY,
                          double stepX, double stepY, double baseHeight, double heightScale, short[] cells)
    {
        MapId = mapId;
        Cols = cols;
        Rows = rows;
        OriginX = originX;
        OriginY = originY;
        StepX = stepX;
        StepY = stepY;
        BaseHeight = baseHeight;
        HeightScale = heightScale;
        _cells = cells;
        Bounds = new TerrainBounds(originX, originX + cols * stepX, originY, originY + rows * stepY);
    }

    public double CellSizeMeters => StepX * TrajectorySolver.MetresPerGameUnit;

    public double? HeightAt(double gameX, double gameY)
    {
        double fx = (gameX - OriginX) / StepX;
        double fy = (gameY - OriginY) / StepY;
        if (fx < 0 || fy < 0 || fx > Cols - 1 || fy > Rows - 1) return null;

        int x0 = (int)Math.Floor(fx), y0 = (int)Math.Floor(fy);
        int x1 = Math.Min(Cols - 1, x0 + 1), y1 = Math.Min(Rows - 1, y0 + 1);
        double tx = fx - x0, ty = fy - y0;

        short v00 = _cells[y0 * Cols + x0], v10 = _cells[y0 * Cols + x1];
        short v01 = _cells[y1 * Cols + x0], v11 = _cells[y1 * Cols + x1];
        if (v00 == NoData || v10 == NoData || v01 == NoData || v11 == NoData)
        {

            short fallback = v00 != NoData ? v00 : v10 != NoData ? v10 : v01 != NoData ? v01 : v11;
            if (fallback == NoData) return null;
            return Decode(fallback);
        }

        double a = Decode(v00) * (1 - tx) + Decode(v10) * tx;
        double b = Decode(v01) * (1 - tx) + Decode(v11) * tx;
        return a * (1 - ty) + b * ty;
    }

    private double Decode(short raw) => BaseHeight + raw * HeightScale;

    public static ElevationGrid Load(string path)
    {
        using FileStream fs = File.OpenRead(path);
        using var br = new BinaryReader(fs, Encoding.UTF8);
        byte[] magic = br.ReadBytes(4);
        if (magic.Length != 4 || Encoding.ASCII.GetString(magic) != Magic)
            throw new InvalidDataException($"不是高程网格文件：{path}");
        uint version = br.ReadUInt32();
        if (version != Version) throw new InvalidDataException($"高程网格版本不支持：{version}");

        int idLen = (int)br.ReadUInt32();
        string mapId = Encoding.UTF8.GetString(br.ReadBytes(idLen));
        int cols = (int)br.ReadUInt32(), rows = (int)br.ReadUInt32();
        double originX = br.ReadDouble(), originY = br.ReadDouble();
        double stepX = br.ReadDouble(), stepY = br.ReadDouble();
        double baseHeight = br.ReadSingle(), heightScale = br.ReadSingle();

        var cells = new short[cols * rows];
        for (int i = 0; i < cells.Length; i++) cells[i] = br.ReadInt16();

        return new ElevationGrid(mapId, cols, rows, originX, originY, stepX, stepY, baseHeight, heightScale, cells);
    }

    public static ElevationGrid BuildFrom(ITerrainHeight source, TerrainBounds? bounds = null, int size = 1024)
    {
        TerrainBounds b = bounds ?? source.Bounds
            ?? throw new InvalidOperationException("源地形没有覆盖范围，必须显式指定 bounds");
        size = Math.Clamp(size, 64, 4096);

        double stepX = (b.MaxX - b.MinX) / (size - 1);
        double stepY = (b.MaxY - b.MinY) / (size - 1);
        var heights = new double?[size * size];
        double lo = double.MaxValue, hi = double.MinValue;
        int valid = 0;

        for (int row = 0; row < size; row++)
        {
            double y = b.MinY + row * stepY;
            for (int col = 0; col < size; col++)
            {
                double x = b.MinX + col * stepX;
                double? h = source.HeightAt(x, y);
                heights[row * size + col] = h;
                if (h is null) continue;
                valid++;
                if (h.Value < lo) lo = h.Value;
                if (h.Value > hi) hi = h.Value;
            }
        }
        if (valid == 0) throw new InvalidDataException("源地形在该范围内没有任何数据");

        double span = Math.Max(hi - lo, 1e-3);
        double scale = span / (short.MaxValue - 1);
        var cells = new short[size * size];
        for (int i = 0; i < cells.Length; i++)
        {
            double? h = heights[i];
            cells[i] = h is null ? NoData : (short)Math.Round((h.Value - lo) / scale);
        }

        return new ElevationGrid(source.MapId, size, size, b.MinX, b.MinY, stepX, stepY, lo, scale, cells);
    }

    public void Save(string path)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        using FileStream fs = File.Create(path);
        using var bw = new BinaryWriter(fs, Encoding.UTF8);
        bw.Write(Encoding.ASCII.GetBytes(Magic));
        bw.Write(Version);
        byte[] id = Encoding.UTF8.GetBytes(MapId);
        bw.Write((uint)id.Length);
        bw.Write(id);
        bw.Write((uint)Cols);
        bw.Write((uint)Rows);
        bw.Write(OriginX);
        bw.Write(OriginY);
        bw.Write(StepX);
        bw.Write(StepY);
        bw.Write((float)BaseHeight);
        bw.Write((float)HeightScale);
        foreach (short v in _cells) bw.Write(v);
    }

    public object Describe() => new
    {
        mapId = MapId, cols = Cols, rows = Rows,
        originX = Math.Round(OriginX, 3), originY = Math.Round(OriginY, 3),
        stepX = Math.Round(StepX, 4), stepY = Math.Round(StepY, 4),
        cellSizeMeters = Math.Round(CellSizeMeters, 2),
        baseHeight = Math.Round(BaseHeight, 2),
        heightScale = HeightScale,
        heightRangeMeters = new
        {
            min = Math.Round(BaseHeight, 1),
            max = Math.Round(BaseHeight + short.MaxValue * HeightScale, 1),
        },
        bytes = Cols * Rows * 2,
    };

    public void Dispose() {  }
}
