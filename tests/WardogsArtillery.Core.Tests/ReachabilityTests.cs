using WardogsArtillery.Core.Ballistics;

namespace WardogsArtillery.Core.Tests;

public class ReachabilityTests
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

    private static BallisticLibrary Library() =>
        BallisticLibrary.Load(Path.Combine(RepoRoot(), "tests", "golden_ballistics.json"));

    private static ElevationGrid? Terrain()
    {
        string path = Path.Combine(RepoRoot(), "data", "terrain", "bakurani.hgt");
        return File.Exists(path) ? ElevationGrid.Load(path) : null;
    }

    private static BallisticTable Synthetic() => new("test/low", new[]
    {
        (1000.0, 10.0),
        (2000.0, 110.0),
        (3000.0, 210.0),
    });

    [Fact]
    public void NoTerrain_ProducesFlatCircleAtTableBounds()
    {
        ReachResult r = ReachabilityCalculator.Compute(
            Synthetic(), null, "gun", 81.6, 81.6, null, new ReachOptions { Azimuths = 12, StepMeters = 20 });

        Assert.False(r.TerrainUsed);
        Assert.Equal(12, r.Samples.Count);
        Assert.Equal(1000, r.MinEffectiveMeters);
        Assert.Equal(3000, r.MaxEffectiveMeters);
        Assert.All(r.Samples, s =>
        {
            Assert.True(s.Reachable);
            Assert.Equal(1000, s.MinRangeMeters);
            Assert.Equal(3000, s.MaxRangeMeters);
        });

        Assert.Single(r.Samples.Select(s => s.MaxRangeMeters).Distinct());
    }

    [Fact]
    public void WithTerrain_SamplesDifferPerAzimuth()
    {
        using ElevationGrid? terrain = Terrain();
        if (terrain is null) return;

        ReachResult r = ReachabilityCalculator.Compute(
            Library().Require("spg/low"), terrain, "gun", 81.6, 81.6,
            terrain.HeightAt(81.6, 81.6), new ReachOptions { Azimuths = 36, StepMeters = 25 });

        Assert.True(r.TerrainUsed);
        Assert.Equal(36, r.Samples.Count);
        Assert.True(r.Samples.Count(s => s.Reachable) > 6, "几乎没有方位可达，地形/射表参数可能不对");

        var maxes = r.Samples.Where(s => s.Reachable).Select(s => s.MaxRangeMeters).ToArray();
        Assert.True(maxes.Max() - maxes.Min() > 1, "各方位最大射程完全一致 —— 没有用上地形");
        Assert.InRange(r.MinEffectiveMeters!.Value, 1181 - 1, 2629 + 1);
        Assert.InRange(r.MaxEffectiveMeters!.Value, 1181 - 1, 2629 + 1);
        Assert.True(r.MinEffectiveMeters <= r.MaxEffectiveMeters);
    }

    [Fact]
    public void TargetKind_IntervalCoversTheGunPosition()
    {
        using ElevationGrid? terrain = Terrain();
        if (terrain is null) return;

        BallisticTable table = Library().Require("spg/low");
        double gx = 81.6, gy = 81.6, tx = 94.0, ty = 88.0;

        ReachResult gun = ReachabilityCalculator.Compute(
            table, terrain, "gun", gx, gy, terrain.HeightAt(gx, gy), new ReachOptions { Azimuths = 24 });
        ReachResult target = ReachabilityCalculator.Compute(
            table, terrain, "target", tx, ty, terrain.HeightAt(tx, ty), new ReachOptions { Azimuths = 24 });

        Assert.Equal("gun", gun.Kind);
        Assert.Equal("target", target.Kind);
        Assert.Equal(tx, target.CenterX, 3);
        Assert.Equal(ty, target.CenterY, 3);

        double dx = (gx - tx) * 100, dy = (gy - ty) * 100;
        double dist = Math.Sqrt(dx * dx + dy * dy);
        double azToGun = (Math.Atan2(dx, dy) * 180 / Math.PI % 360 + 360) % 360;

        ReachSample? near = ReachabilityCalculator.NearestAzimuth(target, azToGun);
        Assert.NotNull(near);
        Assert.True(near!.Value.Reachable, "炮位方向应当可达（1395 m 在射程内）");
        Assert.InRange(dist, near.Value.MinRangeMeters - 25, near.Value.MaxRangeMeters + 25);
    }

    [Fact]
    public void NoTerrain_FallsBackToTableBounds()
    {
        var table = new BallisticTable("tiny/low", new[] { (1000.0, 10.0), (1001.0, 11.0) });
        ReachResult r = ReachabilityCalculator.Compute(
            table, null, "gun", 80, 80, null, new ReachOptions { Azimuths = 4, StepMeters = 5 });

        Assert.Equal(1000, r.MinEffectiveMeters);
        Assert.InRange(r.MaxEffectiveMeters!.Value, 1000, 1001);
    }

    [Fact]
    public void HighTarget_ShrinksMaxRange()
    {

        BallisticTable table = Synthetic();
        ReachResult flat = ReachabilityCalculator.Compute(
            table, null, "gun", 0, 0, null, new ReachOptions { Azimuths = 4, StepMeters = 50 });
        Assert.Equal(3000, flat.MaxEffectiveMeters);
    }

    [Fact]
    public void NearestAzimuth_PicksClosestSample()
    {
        ReachResult r = ReachabilityCalculator.Compute(
            Synthetic(), null, "gun", 0, 0, null, new ReachOptions { Azimuths = 8, StepMeters = 100 });

        ReachSample? s = ReachabilityCalculator.NearestAzimuth(r, 47);
        Assert.NotNull(s);
        Assert.Equal(45, s!.Value.AzimuthDeg, 1);

        ReachSample? wrap = ReachabilityCalculator.NearestAzimuth(r, 358);
        Assert.NotNull(wrap);
        Assert.Equal(0, wrap!.Value.AzimuthDeg, 1);
    }

    [Fact]
    public void IgnoreMinRange_TargetRingHasNoInnerHole()
    {
        using ElevationGrid? terrain = Terrain();
        if (terrain is null) return;

        ReachResult r = ReachabilityCalculator.Compute(
            Library().Require("spg/low"), terrain, "target", 94.0, 88.0,
            terrain.HeightAt(94.0, 88.0),
            new ReachOptions { Azimuths = 16, IgnoreMinRange = true });

        Assert.All(r.Samples.Where(s => s.Reachable), s => Assert.Equal(0, s.MinRangeMeters));
        Assert.Equal(0, r.MinEffectiveMeters);
        Assert.True(r.MaxEffectiveMeters > 1000);
    }

    [Fact]
    public void StepAndAzimuths_AreClampedToSaneRange()
    {
        ReachResult r = ReachabilityCalculator.Compute(
            Synthetic(), null, "gun", 0, 0, null, new ReachOptions { Azimuths = 1, StepMeters = 0 });

        Assert.InRange(r.Samples.Count, 4, 720);
    }

    [Fact]
    public void ImpactCorrection_OvershootAndRight_PullsBack()
    {
        BallisticTable table = Synthetic();

        ImpactCorrection? c = ImpactCorrectionCalculator.Compute(
            table, 0, 0, 0, 15.0, 110, 0, 0, 15.5);

        Assert.NotNull(c);
        Assert.Equal(50, c!.RangeErrorMeters, 1);
        Assert.Equal(0, c.BearingErrorDegrees, 2);
        Assert.Equal(10, c.RangeMetersPerMil, 2);
        Assert.Equal(-5, c.MilCorrection, 1);
        Assert.Equal(105, c.NextMil, 1);
        Assert.Equal(0, c.NextBearingDegrees, 2);
        Assert.True(c.RangePerMilFromTable);
    }

    [Fact]
    public void ImpactCorrection_RightOfTarget_AimsLeft()
    {
        BallisticTable table = Synthetic();

        ImpactCorrection? c = ImpactCorrectionCalculator.Compute(
            table, 0, 0, 0, 15.0, 110, 0, 0.5, 15.0);

        Assert.NotNull(c);
        Assert.InRange(c!.BearingErrorDegrees, 1.5, 2.5);
        Assert.True(c.BearingCorrectionMil < 0, "偏右应往左补");

        Assert.InRange(c.NextBearingDegrees, 355, 360);
        Assert.InRange(c.RangeErrorMeters, -1, 1);
    }

    [Fact]
    public void ImpactCorrection_ShortOfTarget_AddsMil()
    {
        BallisticTable table = Synthetic();
        ImpactCorrection? c = ImpactCorrectionCalculator.Compute(
            table, 0, 0, 0, 15.0, 110, 0, 0, 14.5);

        Assert.NotNull(c);
        Assert.Equal(-50, c!.RangeErrorMeters, 1);
        Assert.Equal(5, c.MilCorrection, 1);
        Assert.Equal(115, c.NextMil, 1);
    }

    [Fact]
    public void ImpactCorrection_HighArcTable_FlipsDirection()
    {

        BallisticTable mortar = Library().Require("mortar/single");

        ImpactCorrection? over = ImpactCorrectionCalculator.Compute(
            mortar, 0, 0, 0, 4.0, 500, 0, 0, 4.3);
        Assert.NotNull(over);
        Assert.Equal(30, over!.RangeErrorMeters, 1);
        Assert.True(over.RangeMetersPerMil < 0, "高抛表的 dR/dMil 应为负");
        Assert.True(over.MilCorrection > 0, "高抛表打远了要加刻度");
        Assert.True(over.NextMil > 500, "下一发刻度应大于上一发");

        ImpactCorrection? under = ImpactCorrectionCalculator.Compute(
            mortar, 0, 0, 0, 4.0, 500, 0, 0, 3.7);
        Assert.NotNull(under);
        Assert.True(under!.MilCorrection < 0, "高抛表打近了要减刻度");
        Assert.True(under.NextMil < 500);

        BallisticTable low = Library().Require("spg/low");
        ImpactCorrection? lowOver = ImpactCorrectionCalculator.Compute(
            low, 0, 0, 0, 20.0, 100, 0, 0, 20.3);
        Assert.NotNull(lowOver);
        Assert.True(lowOver!.RangeMetersPerMil > 0);
        Assert.True(lowOver.MilCorrection < 0, "低抛表打远了要减刻度");
    }
}
