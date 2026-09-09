namespace WardogsArtillery.Core.Ballistics;

public interface ITerrainHeight
{

    string MapId { get; }

    double? HeightAt(double gameX, double gameY);

    TerrainBounds? Bounds { get; }
}

public readonly record struct TerrainBounds(double MinX, double MaxX, double MinY, double MaxY);
