using System.Text;
using System.Text.Json;
using WardogsArtillery.Core.Ballistics;

namespace WardogsArtillery.Core.Tests;

public class TerrainTiltTests
{

    private static (string Dir, double Slope) MakeTerrain(double heightScale)
    {
        string dir = Path.Combine(Path.GetTempPath(), "wc_tilt_" + Guid.NewGuid().ToString("N")[..8]);
        Directory.CreateDirectory(dir);
        const int side = 512;
        const int quads = 511;

        var bytes = new byte[side * side * 2];
        for (int y = 0; y < side; y++)
        {
            for (int x = 0; x < side; x++)
            {
                int raw = (int)Math.Round(x * 65535.0 / quads);
                int o = (y * side + x) * 2;
                bytes[o] = (byte)(raw & 0xFF);
                bytes[o + 1] = (byte)(raw >> 8);
            }
        }
        File.WriteAllBytes(Path.Combine(dir, "0_0.bin"), bytes);

        double risePerQuad = 65535.0 * heightScale / quads;
        double slope = risePerQuad / 2.0;

        var manifest = new
        {
            format = "wardogs-landscape-collision-u16-v1",
            mapId = "synth",
            verticesPerSide = side,
            chunkQuads = quads,
            vertexSpacingMeters = 2.0,
            globalQuadOffsetX = 0.0,
            globalQuadOffsetY = 0.0,

            gameUnitsToLandscapeQuadsX = 50.0,
            gameUnitsToLandscapeQuadsY = 50.0,
            worldZOffsetMeters = 0.0,
            worldZScaleMetersPerLocalUnit = heightScale,
            chunkXMin = 0, chunkXMax = 0, chunkYMin = 0, chunkYMax = 0,
            coverage = new { gameXMin = 0.0, gameXMax = 10.0, gameYMin = 0.0, gameYMax = 10.0 },
            chunks = new Dictionary<string, object>
            {
                ["0,0"] = new { file = "0_0.bin", bytes = bytes.Length, minLocalZ = 0.0, maxLocalZ = 65535.0 },
            },
        };
        File.WriteAllText(Path.Combine(dir, "manifest.json"),
            JsonSerializer.Serialize(manifest, new JsonSerializerOptions { WriteIndented = true }));
        return (dir, slope);
    }

    [Fact]
    public void FlatTerrain_NoTilt()
    {
        (string dir, _) = MakeTerrain(0.001);
        try
        {
            using var terrain = new TerrainHeightmap(dir);

            TerrainTilt t = TerrainTiltCalculator.Compute(terrain, 2.0, 2.0, 45);
            Assert.True(t.Valid);

            Assert.InRange(Math.Abs(t.PitchDegrees), 0, 45);
        }
        finally { Directory.Delete(dir, recursive: true); }
    }

    [Fact]
    public void EastwardRamp_PitchMatchesSlopeAlongFiringAzimuth()
    {
        (string dir, double expectedSlope) = MakeTerrain(0.001);
        double expectedDeg = Math.Atan(expectedSlope) * 180 / Math.PI;

        try
        {
            using var terrain = new TerrainHeightmap(dir);

            TerrainTilt east = TerrainTiltCalculator.Compute(terrain, 2.0, 2.0, 90, 12);
            Assert.True(east.Valid);
            Assert.Equal(expectedSlope, east.AlongSlope, 3);
            Assert.Equal(expectedDeg, east.PitchDegrees, 1);
            Assert.Equal(0, east.RollDegrees, 1);

            TerrainTilt north = TerrainTiltCalculator.Compute(terrain, 2.0, 2.0, 0, 12);
            Assert.Equal(0, north.AlongSlope, 3);
            Assert.Equal(expectedDeg, Math.Abs(north.RollDegrees), 1);

            TerrainTilt west = TerrainTiltCalculator.Compute(terrain, 2.0, 2.0, 270, 12);
            Assert.Equal(-expectedDeg, west.PitchDegrees, 1);

            Assert.True(TerrainTiltCalculator.CorrectionMil(east) < 0);
            Assert.True(TerrainTiltCalculator.CorrectionMil(west) > 0);

            double corrected = TerrainTiltCalculator.CorrectedElevationMil(200, east);
            Assert.Equal(200 + TerrainTiltCalculator.CorrectionMil(east), corrected, 3);
        }
        finally { Directory.Delete(dir, recursive: true); }
    }

    [Fact]
    public void RealTerrain_ReturnsPlausibleTilt()
    {
        string path = Path.Combine(RepoRoot(), "data", "terrain", "bakurani.hgt");
        if (!File.Exists(path)) return;

        using ElevationGrid terrain = ElevationGrid.Load(path);
        TerrainTilt t = TerrainTiltCalculator.Compute(terrain, 81.6, 81.6, 62.7);

        Assert.True(t.Valid);
        Assert.InRange(Math.Abs(t.PitchDegrees), 0, 45);
        Assert.InRange(Math.Abs(t.RollDegrees), 0, 45);
        Assert.Equal(62.7, t.AzimuthDegrees, 3);

        Assert.Equal(t.PitchDegrees * TrajectorySolver.MilPerDegree, t.PitchMil, 3);
    }

    [Fact]
    public void NoTerrain_ReturnsInvalid()
    {
        TerrainTilt t = TerrainTiltCalculator.Compute(null, 0, 0, 90);
        Assert.False(t.Valid);
        Assert.Equal(0, TerrainTiltCalculator.CorrectionMil(t), 3);
    }

    private static string RepoRoot()
    {
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir is not null)
        {
            if (File.Exists(Path.Combine(dir.FullName, "tests", "golden_ballistics.json"))) return dir.FullName;
            dir = dir.Parent;
        }
        throw new FileNotFoundException("找不到仓库根");
    }
}
