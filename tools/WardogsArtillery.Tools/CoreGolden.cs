using System.Text.Json;
using WardogsArtillery.Core.Ballistics;

namespace WardogsArtillery.Tools;

internal static class CoreGolden
{
    public static int Run(string[] args)
    {
        string outPath = Path.Combine(AssetBuilder.RepoRoot, "tests", "golden_core.json");
        string dataRoot = Path.Combine(AssetBuilder.RepoRoot, "data");
        for (int i = 0; i < args.Length - 1; i++)
        {
            if (args[i] == "--out") outPath = Path.GetFullPath(args[i + 1]);
            if (args[i] == "--data") dataRoot = Path.GetFullPath(args[i + 1]);
        }

        BallisticLibrary lib = BallisticLibrary.Load(Path.Combine(dataRoot, "weapons.json"));
        var maps = new Dictionary<string, ElevationGrid>();
        foreach (string id in new[] { "bakurani", "ozeti" })
        {
            string p = Path.Combine(dataRoot, "terrain", id + ".hgt");
            if (File.Exists(p)) maps[id] = ElevationGrid.Load(p);
        }

        var root = new Dictionary<string, object?>
        {
            ["generatedBy"] = "WardogsArtillery.Tools core-golden（C# Core）",
            ["tolerance"] = 1e-9,
            ["constants"] = new
            {
                gravity = TrajectorySolver.Gravity,
                milPerDegree = TrajectorySolver.MilPerDegree,
                milPerRadian = TrajectorySolver.MilPerRadian,
                metresPerGameUnit = TrajectorySolver.MetresPerGameUnit,
                convergenceMil = TrajectorySolver.ConvergenceMil,
            },
            ["tables"] = lib.Tables.ToDictionary(
                kv => kv.Key,
                kv => new
                {
                    minRange = kv.Value.MinRange,
                    maxRange = kv.Value.MaxRange,
                    minMil = kv.Value.MinMil,
                    maxMil = kv.Value.MaxMil,
                    isHighArc = kv.Value.IsHighArc,
                    points = kv.Value.Points.Select(p => new[] { p.Range, p.Mil }).ToArray(),
                }),
            ["solutions"] = Solutions(lib),
            ["interp"] = Interp(lib),
            ["tilt"] = Tilt(maps),
            ["reach"] = Reach(lib, maps),
            ["impact"] = Impact(lib, maps),
        };

        Directory.CreateDirectory(Path.GetDirectoryName(outPath)!);
        var opts = new JsonSerializerOptions { WriteIndented = false };
        File.WriteAllText(outPath, JsonSerializer.Serialize(root, opts));
        Console.WriteLine($"金标准已写出：{outPath}（{new FileInfo(outPath).Length / 1024.0:F1} KB）");
        Console.WriteLine($"  solutions={((List<object>)root["solutions"]!).Count}" +
                          $" interp={((List<object>)root["interp"]!).Count}" +
                          $" tilt={((List<object>)root["tilt"]!).Count}" +
                          $" reach={((List<object>)root["reach"]!).Count}" +
                          $" impact={((List<object>)root["impact"]!).Count}");
        return 0;
    }

    private static object? N(double v) => double.IsFinite(v) ? v : null;

    private static List<object> Solutions(BallisticLibrary lib)
    {
        double[] dzs = { 0, 5, 20, 50, -20, -50, 120, -120, 300, -300 };
        var list = new List<object>();
        foreach (BallisticTable t in lib.Tables.Values)
        {
            double span = t.MaxRange - t.MinRange;
            for (int i = 0; i <= 12; i++)
            {
                double range = Math.Round(t.MinRange + span * i / 12.0, 2);
                foreach (double dz in dzs)
                {
                    FiringSolution s = TrajectorySolver.Solve(t, range, dz);
                    list.Add(new
                    {
                        table = t.Name, range, dz,
                        inRange = s.InRange,
                        baseMil = N(s.BaseMil),
                        sightCorrectionMil = N(s.SightCorrectionMil),
                        elevationMil = N(s.ElevationMil),
                        flightTimeSeconds = N(s.FlightTimeSeconds ?? double.NaN),
                        converged = s.Converged,
                    });
                }
            }
        }
        return list;
    }

    private static List<object> Interp(BallisticLibrary lib)
    {
        var list = new List<object>();
        foreach (BallisticTable t in lib.Tables.Values)
        {
            double span = t.MaxRange - t.MinRange;
            for (int i = 0; i <= 40; i++)
            {
                double range = t.MinRange + span * i / 40.0;
                double? mil = t.MilForRange(range);
                list.Add(new { table = t.Name, mode = "milForRange", input = range, output = N(mil ?? double.NaN) });
            }
            double mspan = t.MaxMil - t.MinMil;
            for (int i = 0; i <= 20; i++)
            {
                double mil = t.MinMil + mspan * i / 20.0;
                double? r = t.RangeForMil(mil);
                list.Add(new { table = t.Name, mode = "rangeForMil", input = mil, output = N(r ?? double.NaN) });
            }
            list.Add(new { table = t.Name, mode = "milForRange", input = t.MinRange - 1, output = N(t.MilForRange(t.MinRange - 1) ?? double.NaN) });
            list.Add(new { table = t.Name, mode = "milForRange", input = t.MaxRange + 1, output = N(t.MilForRange(t.MaxRange + 1) ?? double.NaN) });
            list.Add(new { table = t.Name, mode = "rangeForMil", input = t.MinMil - 1, output = N(t.RangeForMil(t.MinMil - 1) ?? double.NaN) });
            list.Add(new { table = t.Name, mode = "rangeForMil", input = t.MaxMil + 1, output = N(t.RangeForMil(t.MaxMil + 1) ?? double.NaN) });
        }
        return list;
    }

    private static List<object> Tilt(Dictionary<string, ElevationGrid> maps)
    {
        var list = new List<object>();
        foreach ((string mapId, ElevationGrid g) in maps)
        {
            for (double x = 25; x <= 130; x += 7.5)
            {
                for (double y = 25; y <= 130; y += 7.5)
                {
                    foreach (double az in new[] { 0.0, 45.0, 108.0, 200.0, 315.0 })
                    {
                        TerrainTilt t = TerrainTiltCalculator.Compute(g, x, y, az);
                        list.Add(new
                        {
                            mapId, x = Math.Round(x, 3), y = Math.Round(y, 3), azimuthDeg = az,
                            valid = t.Valid,
                            gradientX = t.GradientX, gradientY = t.GradientY,
                            pitchDegrees = t.PitchDegrees, rollDegrees = t.RollDegrees,
                            height = N(g.HeightAt(x, y) ?? double.NaN),
                            cellSizeMeters = g.CellSizeMeters,
                        });
                    }
                }
            }
        }
        return list;
    }

    private static List<object> Reach(BallisticLibrary lib, Dictionary<string, ElevationGrid> maps)
    {
        var list = new List<object>();
        (double X, double Y)[] centers = { (81.6, 81.6), (94.0, 88.0), (60.0, 95.0), (110.0, 70.0) };
        foreach ((string mapId, ElevationGrid g) in maps)
        {
            foreach ((double cx, double cy) in centers)
            {
                foreach (string weapon in new[] { "spg", "mortar" })
                {
                    BallisticTable[] tables = lib.Tables.Values
                        .Where(t => t.Name.StartsWith(weapon + "/", StringComparison.OrdinalIgnoreCase))
                        .OrderBy(t => t.MaxMil).ToArray();
                    if (tables.Length == 0) continue;
                    foreach (string kind in new[] { "gun", "target" })
                    {
                        foreach (int samples in new[] { 24, 72 })
                        {
                            foreach (bool masking in new[] { false, true })
                            {
                                var opt = new ReachOptions
                                {
                                    Azimuths = samples,
                                    StepMeters = 40,
                                    TerrainMasking = masking,
                                    IgnoreMinRange = kind == "target",
                                };
                                double? h0 = g.HeightAt(cx, cy);
                                ReachResult[] parts = tables
                                    .Select(t => ReachabilityCalculator.Compute(t, g, kind, cx, cy, h0, opt))
                                    .ToArray();
                                ReachResult r = ReachabilityCalculator.Merge(kind, cx, cy, parts, opt);
                                list.Add(new
                                {
                                    mapId, ringKind = kind, weapon, samples, masking,
                                    centerX = cx, centerY = cy,
                                    r.TableMinRangeMeters, r.TableMaxRangeMeters,
                                    r.MinEffectiveMeters, r.MaxEffectiveMeters,
                                    r.MinTerrainMeters, r.MaxTerrainMeters, r.TerrainUsed,
                                    samplesData = r.Samples.Select(s => new
                                    {
                                        s.AzimuthDeg, s.MinRangeMeters, s.MaxRangeMeters, s.Reachable,
                                        s.MinTerrainMeters, s.MaxTerrainMeters,
                                    }).ToArray(),
                                });
                            }
                        }
                    }
                }
            }
        }
        return list;
    }

    private static List<object> Impact(BallisticLibrary lib, Dictionary<string, ElevationGrid> maps)
    {
        var list = new List<object>();
        (double GX, double GY, double TX, double TY, double IX, double IY)[] cases =
        {
            (81.6, 81.6, 94.0, 88.0, 94.9, 88.9),
            (81.6, 81.6, 94.0, 88.0, 93.1, 87.1),
            (60.0, 95.0, 82.0, 69.0, 82.6, 69.4),
            (81.6, 81.6, 82.4, 82.4, 82.5, 82.5),
            (110.0, 70.0, 90.0, 100.0, 89.5, 99.4),
        };
        foreach (string weapon in new[] { "spg", "mortar" })
        {
            BallisticTable[] tables = lib.Tables.Values
                .Where(t => t.Name.StartsWith(weapon + "/", StringComparison.OrdinalIgnoreCase))
                .ToArray();
            if (tables.Length == 0) continue;
            foreach ((double gx, double gy, double tx, double ty, double ix, double iy) in cases)
            {
                foreach (string mapId in maps.Keys)
                {
                    ElevationGrid g = maps[mapId];
                    double range = TrajectorySolver.HorizontalDistance(gx, gy, tx, ty);
                    double dz = (g.HeightAt(tx, ty) ?? 0) - (g.HeightAt(gx, gy) ?? 0);
                    (BallisticTable table, FiringSolution sol) = SolveBest(tables, range, dz);
                    if (!sol.InRange || double.IsNaN(sol.ElevationMil)) continue;

                    double firedMil = sol.ElevationMil;
                    double firedBearing = TrajectorySolver.BearingDegrees(gx, gy, tx, ty);
                    ImpactCorrection? c = ImpactCorrectionCalculator.Compute(
                        table, gx, gy, tx, ty, firedMil, firedBearing, ix, iy);
                    if (c is null) continue;

                    list.Add(new
                    {
                        mapId, weapon, table = table.Name,
                        gunX = gx, gunY = gy, targetX = tx, targetY = ty, impactX = ix, impactY = iy,
                        firedMil, firedBearing,
                        c.RangeErrorMeters, c.BearingErrorDegrees, c.RangeMetersPerMil,
                        c.MilCorrection, c.BearingCorrectionMil, c.NextMil, c.NextBearingDegrees,
                        c.ImpactRangeMeters, c.TargetRangeMeters, c.RangePerMilFromTable,
                    });
                }
            }
        }
        return list;
    }

    private static (BallisticTable, FiringSolution) SolveBest(BallisticTable[] tables, double range, double dz)
    {
        BallisticTable? best = null;
        FiringSolution bestSol = default;
        int bestRank = -1;
        foreach (BallisticTable t in tables)
        {
            FiringSolution s = TrajectorySolver.Solve(t, range, dz);
            int rank = !s.InRange || double.IsNaN(s.ElevationMil) ? 0 : (s.Converged ? 2 : 1);
            bool better = best is null
                || rank > bestRank
                || (rank == bestRank && rank > 0 && s.ElevationMil < bestSol.ElevationMil);
            if (better) { best = t; bestSol = s; bestRank = rank; }
        }
        return (best!, bestSol);
    }
}
