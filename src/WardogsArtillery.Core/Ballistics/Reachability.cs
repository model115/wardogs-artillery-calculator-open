namespace WardogsArtillery.Core.Ballistics;

public readonly record struct ReachSample(
    double AzimuthDeg,
    double MinRangeMeters,
    double MaxRangeMeters,
    bool Reachable,
    double? MinTerrainMeters,
    double? MaxTerrainMeters);

public sealed record ReachResult(
    string Kind,
    double CenterX,
    double CenterY,
    double TableMinRangeMeters,
    double TableMaxRangeMeters,
    double? MinEffectiveMeters,
    double? MaxEffectiveMeters,
    double? MinTerrainMeters,
    double? MaxTerrainMeters,
    bool TerrainUsed,
    IReadOnlyList<ReachSample> Samples);

public sealed record ReachOptions
{

    public int Azimuths { get; init; } = 72;

    public double StepMeters { get; init; } = 20.0;

    public double MaxRadiusMeters { get; init; }

    public bool IgnoreMinRange { get; init; }

    public bool TerrainMasking { get; init; }

    public double MaskClearanceMeters { get; init; } = 5.0;

    public int MaskSamples { get; init; } = 3;

    public bool OuterEdgeFromMainArcOnly { get; init; } = true;
}

public static class ReachabilityCalculator
{

    private const double MilTolerance = 1e-6;

    public static ReachResult Compute(
        BallisticTable table,
        ITerrainHeight? terrain,
        string kind,
        double centerX,
        double centerY,
        double? centerHeight,
        ReachOptions? options = null)
    {
        options ??= new ReachOptions();
        bool aroundTarget = string.Equals(kind, "target", StringComparison.OrdinalIgnoreCase);
        int azimuths = Math.Clamp(options.Azimuths, 4, 720);
        double step = Math.Max(1.0, options.StepMeters);
        double radius = options.MaxRadiusMeters > 0 ? options.MaxRadiusMeters : table.MaxRange;

        double? h0 = centerHeight ?? terrain?.HeightAt(centerX, centerY);
        bool terrainUsed = terrain is not null && h0 is not null;

        var samples = new List<ReachSample>(azimuths);
        double? minEff = null, maxEff = null, terrainMin = null, terrainMax = null;

        for (int i = 0; i < azimuths; i++)
        {
            double azDeg = 360.0 * i / azimuths;
            double azRad = azDeg * Math.PI / 180.0;
            double dirX = Math.Sin(azRad), dirY = Math.Cos(azRad);

            double? sMin = null, sMax = null, sTMin = null, sTMax = null;

            void Consider(double d)
            {
                double px = centerX + dirX * d / TrajectorySolver.MetresPerGameUnit;
                double py = centerY + dirY * d / TrajectorySolver.MetresPerGameUnit;

                double dz;
                double? h = null;
                if (terrainUsed)
                {
                    h = terrain!.HeightAt(px, py);
                    if (h is null) return;
                    dz = aroundTarget ? h0!.Value - h.Value : h.Value - h0!.Value;
                }
                else
                {
                    dz = 0;
                }

                FiringSolution sol = TrajectorySolver.Solve(table, d, dz);
                if (!sol.InRange || double.IsNaN(sol.ElevationMil)) return;

                if (!sol.Converged) return;
                if (sol.ElevationMil > table.MaxMil + MilTolerance) return;
                if (sol.ElevationMil < table.MinMil - MilTolerance) return;

                if (options.TerrainMasking && terrainUsed)
                {

                    double originX = aroundTarget ? px : centerX;
                    double originY = aroundTarget ? py : centerY;
                    double originH = aroundTarget ? h!.Value : h0!.Value;
                    if (!ClearsTerrain(terrain!, originX, originY, originH, dirX, dirY, d, dz,
                                       sol.ElevationMil, options, aroundTarget))
                        return;
                }

                sMin = sMin is null ? d : Math.Min(sMin.Value, d);
                sMax = sMax is null ? d : Math.Max(sMax.Value, d);
                if (h is not null)
                {
                    sTMin = sTMin is null ? h : Math.Min(sTMin.Value, h.Value);
                    sTMax = sTMax is null ? h : Math.Max(sTMax.Value, h.Value);
                }
            }

            double start = table.MinRange;
            double end = Math.Min(radius, table.MaxRange);
            int steps = (int)Math.Floor((end - start) / step);
            for (int k = 0; k <= steps; k++) Consider(start + k * step);
            if (start + steps * step < end - 1e-9) Consider(end);

            bool reachable = sMin is not null;
            if (reachable && options.IgnoreMinRange) sMin = 0;
            var sample = new ReachSample(azDeg, sMin ?? 0, sMax ?? 0, reachable, sTMin, sTMax);
            samples.Add(sample);

            if (!reachable) continue;
            minEff = minEff is null ? sMin : Math.Min(minEff.Value, sMin!.Value);
            maxEff = maxEff is null ? sMax : Math.Max(maxEff.Value, sMax!.Value);
            if (sTMin is not null)
            {
                terrainMin = terrainMin is null ? sTMin : Math.Min(terrainMin.Value, sTMin.Value);
                terrainMax = terrainMax is null ? sTMax : Math.Max(terrainMax.Value, sTMax!.Value);
            }
        }

        if (minEff is null || maxEff is null || minEff > maxEff)
        {
            minEff = table.MinRange;
            maxEff = table.MaxRange;
        }

        return new ReachResult(
            aroundTarget ? "target" : "gun",
            centerX, centerY,
            table.MinRange, table.MaxRange,
            Math.Round(minEff.Value, 1), Math.Round(maxEff.Value, 1),
            terrainMin is null ? null : Math.Round(terrainMin.Value, 1),
            terrainMax is null ? null : Math.Round(terrainMax.Value, 1),
            terrainUsed,
            samples);
    }

    private static bool ClearsTerrain(
        ITerrainHeight terrain, double originX, double originY, double originHeight,
        double dirX, double dirY, double range, double dz, double mil, ReachOptions options, bool reverseDir)
    {
        double th = TrajectorySolver.MilToRadians(mil);
        double sin2 = Math.Sin(2.0 * th);
        double cos = Math.Cos(th);
        if (sin2 <= 1e-6 || Math.Abs(cos) < 1e-6) return true;

        double v0 = Math.Sqrt(range * TrajectorySolver.Gravity / sin2);
        double tan = Math.Tan(th);
        double k = TrajectorySolver.Gravity / (2.0 * v0 * v0 * cos * cos);

        double dx = reverseDir ? -dirX : dirX;
        double dy = reverseDir ? -dirY : dirY;

        int samples = Math.Clamp(options.MaskSamples, 1, 12);
        for (int i = 1; i <= samples; i++)
        {
            double f = i / (double)(samples + 1);
            double x = range * f;
            double y = x * tan - k * x * x;
            double wx = originX + dx * x / TrajectorySolver.MetresPerGameUnit;
            double wy = originY + dy * x / TrajectorySolver.MetresPerGameUnit;
            double? h = terrain.HeightAt(wx, wy);
            if (h is null) continue;
            if (originHeight + y < h.Value + options.MaskClearanceMeters) return false;
        }
        _ = dz;
        return true;
    }

    public static ReachSample? NearestAzimuth(ReachResult result, double azimuthDeg)
    {
        if (result.Samples.Count == 0) return null;
        double best = double.MaxValue;
        ReachSample pick = default;
        foreach (ReachSample s in result.Samples)
        {
            double diff = Math.Abs(((s.AzimuthDeg - azimuthDeg + 540.0) % 360.0) - 180.0);
            if (diff < best)
            {
                best = diff;
                pick = s;
            }
        }
        return pick;
    }

    public static ReachResult Merge(string kind, double centerX, double centerY,
                                    IReadOnlyList<ReachResult> parts, ReachOptions? options = null)
    {
        if (parts.Count == 0)
            throw new ArgumentException("至少需要一张弹道的计算结果", nameof(parts));
        if (parts.Count == 1) return parts[0];

        bool mainArcOnly = options?.OuterEdgeFromMainArcOnly ?? true;
        int n = parts[0].Samples.Count;
        var samples = new List<ReachSample>(n);
        double? minEff = null, maxEff = null, tMin = null, tMax = null;

        for (int i = 0; i < n; i++)
        {
            double azDeg = parts[0].Samples[i].AzimuthDeg;
            double? sMin = null, sMax = null, sTMin = null, sTMax = null;
            foreach (ReachResult p in parts)
            {
                if (i >= p.Samples.Count) continue;
                ReachSample s = p.Samples[i];
                if (!s.Reachable) continue;
                sMin = sMin is null ? s.MinRangeMeters : Math.Min(sMin.Value, s.MinRangeMeters);
                sMax = sMax is null ? s.MaxRangeMeters : Math.Max(sMax.Value, s.MaxRangeMeters);
                if (s.MinTerrainMeters is not null)
                    sTMin = sTMin is null ? s.MinTerrainMeters : Math.Min(sTMin.Value, s.MinTerrainMeters.Value);
                if (s.MaxTerrainMeters is not null)
                    sTMax = sTMax is null ? s.MaxTerrainMeters : Math.Max(sTMax.Value, s.MaxTerrainMeters.Value);
            }

            if (mainArcOnly && i < parts[0].Samples.Count && parts[0].Samples[i].Reachable)
                sMax = parts[0].Samples[i].MaxRangeMeters;

            bool reachable = sMin is not null;
            samples.Add(new ReachSample(azDeg, sMin ?? 0, sMax ?? 0, reachable, sTMin, sTMax));
            if (!reachable) continue;
            minEff = minEff is null ? sMin : Math.Min(minEff.Value, sMin!.Value);
            maxEff = maxEff is null ? sMax : Math.Max(maxEff.Value, sMax!.Value);
            if (sTMin is not null) tMin = tMin is null ? sTMin : Math.Min(tMin.Value, sTMin.Value);
            if (sTMax is not null) tMax = tMax is null ? sTMax : Math.Max(tMax.Value, sTMax.Value);
        }

        double tableMin = parts.Min(p => p.TableMinRangeMeters);
        double tableMax = parts.Max(p => p.TableMaxRangeMeters);
        if (minEff is null || maxEff is null || minEff > maxEff)
        {
            minEff = tableMin;
            maxEff = tableMax;
        }

        return new ReachResult(
            parts[0].Kind, centerX, centerY, tableMin, tableMax,
            Math.Round(minEff.Value, 1), Math.Round(maxEff.Value, 1),
            tMin is null ? null : Math.Round(tMin.Value, 1),
            tMax is null ? null : Math.Round(tMax.Value, 1),
            parts.Any(p => p.TerrainUsed),
            samples);
    }
}
