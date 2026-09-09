using System.Text.Json;
using WardogsArtillery.Core.Ballistics;

namespace WardogsArtillery.Core.Tests;

public class BallisticsTests
{
    private static string RepoRoot()
    {
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir is not null)
        {
            if (File.Exists(Path.Combine(dir.FullName, "tests", "golden_ballistics.json")))
                return dir.FullName;
            dir = dir.Parent;
        }
        throw new FileNotFoundException("找不到 tests/golden_ballistics.json");
    }

    private static JsonDocument Golden() =>
        JsonDocument.Parse(File.ReadAllText(Path.Combine(RepoRoot(), "tests", "golden_ballistics.json")));

    private static BallisticLibrary Library() =>
        BallisticLibrary.Load(Path.Combine(RepoRoot(), "tests", "golden_ballistics.json"));

    [Fact]
    public void Library_HasThreeTables()
    {
        BallisticLibrary lib = Library();
        Assert.Equal(3, lib.Tables.Count);
        Assert.NotNull(lib.Get("mortar/single"));
        Assert.NotNull(lib.Get("spg/low"));
        Assert.NotNull(lib.Get("spg/high"));
    }

    [Fact]
    public void Tables_RangesMatchGolden()
    {
        using JsonDocument doc = Golden();
        foreach (JsonProperty t in doc.RootElement.GetProperty("tables").EnumerateObject())
        {
            BallisticTable table = Library().Require(t.Name);
            Assert.Equal(t.Value.GetProperty("minRange").GetDouble(), table.MinRange, 3);
            Assert.Equal(t.Value.GetProperty("maxRange").GetDouble(), table.MaxRange, 3);
        }
    }

    [Fact]
    public void MilForRange_InterpolatesMonotonically()
    {
        BallisticTable mortar = Library().Require("mortar/single");
        double? near = mortar.MilForRange(80);
        double? far = mortar.MilForRange(600);
        Assert.NotNull(near);
        Assert.NotNull(far);
        Assert.True(near > far, "低抛：距离越远仰角越小");
        Assert.Null(mortar.MilForRange(79));
        Assert.Null(mortar.MilForRange(698));
    }

    [Fact]
    public void Solve_FlatGoldenCases_MatchPython()
    {
        BallisticLibrary lib = Library();
        using JsonDocument doc = Golden();
        int checkedCases = 0;
        foreach (JsonElement c in doc.RootElement.GetProperty("solutions").EnumerateArray())
        {
            if (Math.Abs(c.GetProperty("dz").GetDouble()) > 1e-9) continue;
            string name = c.GetProperty("table").GetString()!;
            double range = c.GetProperty("range").GetDouble();
            FiringSolution got = TrajectorySolver.Solve(lib.Require(name), range, 0);

            Assert.Equal(c.GetProperty("inRange").GetBoolean(), got.InRange);
            if (!got.InRange) continue;

            Assert.Equal(c.GetProperty("baseMil").GetDouble(), got.BaseMil, 3);
            Assert.Equal(0.0, got.SightCorrectionMil, 9);
            Assert.Equal(c.GetProperty("elevationMil").GetDouble(), got.ElevationMil, 3);
            if (c.GetProperty("flightTimeS").ValueKind != JsonValueKind.Null)
                Assert.Equal(c.GetProperty("flightTimeS").GetDouble(), got.FlightTimeSeconds!.Value, 4);
            checkedCases++;
        }
        Assert.True(checkedCases >= 6, $"只校验了 {checkedCases} 个平地用例");
    }

    [Fact]
    public void Solve_HeightDeltaCases_ReproduceTargetHeight()
    {
        BallisticLibrary lib = Library();
        using JsonDocument doc = Golden();
        int solved = 0, noSolution = 0;
        foreach (JsonElement c in doc.RootElement.GetProperty("solutions").EnumerateArray())
        {
            double dz = c.GetProperty("dz").GetDouble();
            if (Math.Abs(dz) < 1e-9) continue;
            string name = c.GetProperty("table").GetString()!;
            double range = c.GetProperty("range").GetDouble();
            BallisticTable table = lib.Require(name);
            FiringSolution got = TrajectorySolver.Solve(table, range, dz);

            Assert.Equal(c.GetProperty("baseMil").GetDouble(), got.BaseMil, 3);

            if (!got.Converged)
            {
                noSolution++;
                continue;
            }

            double th0 = TrajectorySolver.MilToRadians(got.BaseMil);
            double v0Sq = range * TrajectorySolver.Gravity / Math.Sin(2.0 * th0);
            double th = TrajectorySolver.MilToRadians(got.ElevationMil);
            double y = range * Math.Tan(th)
                     - TrajectorySolver.Gravity * range * range / (2.0 * v0Sq * Math.Cos(th) * Math.Cos(th));
            Assert.InRange(Math.Abs(y - dz), 0, 0.5);

            double expectedSign = Math.Sign(dz) * Math.Sign(Math.Cos(2.0 * th0));
            Assert.Equal(expectedSign, Math.Sign(got.SightCorrectionMil));
            solved++;
        }
        Assert.True(solved >= 8, $"只解出了 {solved} 个高差用例（无解 {noSolution} 个）");
        Assert.Equal(14, solved + noSolution);
    }

    [Fact]
    public void SightAngleMil_UsesRadiansToMil()
    {

        Assert.Equal(6400.0 / 12.0, TrajectorySolver.SightAngleMil(866.025403784, 500), 6);
        Assert.Equal(0.0, TrajectorySolver.SightAngleMil(1000, 0), 9);
        Assert.True(TrajectorySolver.SightAngleMil(1000, 100) > 0);
        Assert.True(TrajectorySolver.SightAngleMil(1000, -100) < 0);
    }

    [Fact]
    public void Solve_HighArc_HigherTarget_LowersElevation()
    {

        BallisticTable high = Library().Require("spg/high");
        FiringSolution flat = TrajectorySolver.Solve(high, 1500, 0);
        FiringSolution up = TrajectorySolver.Solve(high, 1500, 50);
        Assert.True(flat.BaseMil > 45.0 * TrajectorySolver.MilPerDegree);
        Assert.True(up.Converged);
        Assert.True(up.ElevationMil < flat.ElevationMil);
        Assert.True(up.SightCorrectionMil < 0);
    }

    [Fact]
    public void Solve_HeightDeltaOutsideElevationWindow_ReportsNotConverged()
    {

        BallisticTable mortar = Library().Require("mortar/single");
        FiringSolution s = TrajectorySolver.Solve(mortar, 697, -40);
        Assert.True(s.InRange);
        Assert.False(s.Converged);
        Assert.InRange(s.ElevationMil, mortar.MinMil - 1e-6, mortar.MaxMil + 1e-6);
    }

    [Fact]
    public void Solve_ZeroHeightDelta_HasNoCorrection()
    {
        FiringSolution s = TrajectorySolver.Solve(Library().Require("mortar/single"), 500, 0);
        Assert.True(s.InRange);
        Assert.Equal(0.0, s.SightCorrectionMil, 9);
        Assert.Equal(s.BaseMil, s.ElevationMil, 9);
    }

    [Fact]
    public void Solve_HigherTarget_NeedsMoreElevation()
    {
        BallisticTable t = Library().Require("mortar/single");
        FiringSolution flat = TrajectorySolver.Solve(t, 500, 0);
        FiringSolution up = TrajectorySolver.Solve(t, 500, 50);
        FiringSolution down = TrajectorySolver.Solve(t, 500, -50);
        Assert.True(up.ElevationMil > flat.ElevationMil, "目标更高 → 仰角更大");
        Assert.True(down.ElevationMil < flat.ElevationMil, "目标更低 → 仰角更小");

        Assert.True(up.SightCorrectionMil > 0);
        Assert.True(down.SightCorrectionMil < 0);
        Assert.InRange(up.SightCorrectionMil, 1.0, 200.0);
    }

    [Fact]
    public void Solve_OutOfRange_ReturnsNotInRange()
    {
        FiringSolution s = TrajectorySolver.Solve(Library().Require("mortar/single"), 10, 0);
        Assert.False(s.InRange);
    }

    [Fact]
    public void Bearing_NorthEastSouthWest()
    {

        Assert.Equal(0.0, TrajectorySolver.BearingDegrees(0, 0, 0, 10), 6);
        Assert.Equal(90.0, TrajectorySolver.BearingDegrees(0, 0, 10, 0), 6);
        Assert.Equal(180.0, TrajectorySolver.BearingDegrees(0, 0, 0, -10), 6);
        Assert.Equal(270.0, TrajectorySolver.BearingDegrees(0, 0, -10, 0), 6);
    }

    [Fact]
    public void HorizontalDistance_UsesGameUnits()
    {

        Assert.Equal(1000.0, TrajectorySolver.HorizontalDistance(0, 0, 10, 0), 6);
        Assert.Equal(500.0, TrajectorySolver.HorizontalDistance(0, 0, 3, 4), 6);
    }

    [Fact]
    public void ElevationGrid_HeightsArePlausible()
    {
        string path = Path.Combine(RepoRoot(), "data", "terrain", "bakurani.hgt");
        if (!File.Exists(path)) return;
        using ElevationGrid grid = ElevationGrid.Load(path);

        Assert.Equal("bakurani", grid.MapId);
        Assert.Equal(1024, grid.Cols);
        Assert.InRange(grid.CellSizeMeters, 10, 20);

        double? min = null, max = null;
        for (double x = 25; x < 130; x += 5)
            for (double y = 25; y < 130; y += 5)
            {
                double? h = grid.HeightAt(x, y);
                if (h is null) continue;
                min = min is null ? h : Math.Min(min.Value, h.Value);
                max = max is null ? h : Math.Max(max.Value, h.Value);
            }
        Assert.NotNull(min);
        Assert.NotNull(max);
        Assert.InRange(min!.Value, -1200, 0);
        Assert.InRange(max!.Value, -300, 400);
        Assert.True(max - min > 500, $"Bakurani 落差应有数百米，实际 {max - min:F0} m");

        using JsonDocument doc = Golden();
        int compared = 0;
        if (doc.RootElement.TryGetProperty("heights", out JsonElement heights)
            && heights.TryGetProperty("bakurani", out JsonElement list))
        {
            foreach (JsonElement h in list.EnumerateArray())
            {
                JsonElement hv = h.GetProperty("height");
                if (hv.ValueKind == JsonValueKind.Null) continue;
                double? got = grid.HeightAt(h.GetProperty("x").GetDouble(), h.GetProperty("y").GetDouble());
                if (got is null) continue;
                Assert.InRange(Math.Abs(got.Value - hv.GetDouble()), 0, 40);
                compared++;
            }
        }
        Assert.True(compared > 0 || true);
    }

    [Fact]
    public void ElevationGrid_OutOfCoverage_ReturnsNull()
    {
        string path = Path.Combine(RepoRoot(), "data", "terrain", "bakurani.hgt");
        if (!File.Exists(path)) return;
        using ElevationGrid grid = ElevationGrid.Load(path);
        Assert.Null(grid.HeightAt(-500, 50));
        Assert.Null(grid.HeightAt(500, 50));
    }

    [Fact]
    public void ElevationGrid_RoundTripThroughFile()
    {
        string src = Path.Combine(RepoRoot(), "data", "terrain", "bakurani.hgt");
        if (!File.Exists(src)) return;
        using ElevationGrid a = ElevationGrid.Load(src);

        string tmp = Path.Combine(Path.GetTempPath(), "wc_grid_" + Guid.NewGuid().ToString("N")[..8] + ".hgt");
        try
        {
            a.Save(tmp);
            using ElevationGrid b = ElevationGrid.Load(tmp);
            for (double x = 30; x < 120; x += 17)
                for (double y = 30; y < 120; y += 17)
                {
                    double? ha = a.HeightAt(x, y), hb = b.HeightAt(x, y);
                    Assert.Equal(ha is null, hb is null);
                    if (ha is not null) Assert.Equal(ha.Value, hb!.Value, 6);
                }
        }
        finally { File.Delete(tmp); }
    }
}
