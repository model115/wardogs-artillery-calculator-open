namespace WardogsArtillery.Core.Ballistics;

public readonly record struct FiringSolution(
    bool InRange,
    double Range,
    double HeightDelta,
    double BaseMil,
    double SightCorrectionMil,
    double ElevationMil,
    double? FlightTimeSeconds,
    bool Converged)
{
    public static FiringSolution OutOfRange(double range, double dz) =>
        new(false, range, dz, double.NaN, double.NaN, double.NaN, null, false);
}

public static class TrajectorySolver
{
    public const double Gravity = 9.80665;

    public const double MilPerDegree = 6400.0 / 360.0;

    public const double MilPerRadian = 6400.0 / (2.0 * Math.PI);

    public const double MetresPerGameUnit = 100.0;
    public const double ConvergenceMil = 0.05;

    public const int MaxIterations = 80;

    public static double MilToRadians(double mil) => mil / MilPerRadian;

    public static FiringSolution Solve(BallisticTable table, double range, double dz = 0.0)
    {
        if (range <= 0)
            return FiringSolution.OutOfRange(range, dz);

        double? baseMil = table.MilForRange(range);
        if (baseMil is null)
            return FiringSolution.OutOfRange(range, dz);

        double baseMilValue = baseMil.Value;
        if (Math.Abs(dz) < 1e-9)
        {
            return new FiringSolution(true, range, dz, baseMilValue, 0.0, baseMilValue,
                                      FlightTime(range, baseMilValue), true);
        }

        double th0 = MilToRadians(baseMilValue);
        double sin2th0 = Math.Sin(2.0 * th0);
        double cos0 = Math.Cos(th0);
        if (sin2th0 <= 1e-9 || Math.Abs(cos0) < 1e-9)
            return FiringSolution.OutOfRange(range, dz);
        double v0Squared = range * Gravity / sin2th0;

        double HeightAt(double mil)
        {
            double th = MilToRadians(mil);
            double cos = Math.Cos(th);
            if (Math.Abs(cos) < 1e-12) return double.PositiveInfinity;
            return range * Math.Tan(th) - Gravity * range * range / (2.0 * v0Squared * cos * cos);
        }
        double F(double mil) => HeightAt(mil) - dz;

        double thetaStarMil = Math.Atan(1.0 / sin2th0) * MilPerRadian;
        bool ascending = baseMilValue < thetaStarMil;
        double marchLo = ascending ? table.MinMil : Math.Max(table.MinMil, thetaStarMil);
        double marchHi = ascending ? Math.Min(table.MaxMil, thetaStarMil) : table.MaxMil;
        if (marchLo > marchHi) { marchLo = table.MinMil; marchHi = table.MaxMil; }

        double dir = (dz > 0 ? 1.0 : -1.0) * (Math.Cos(2.0 * th0) >= 0 ? 1.0 : -1.0);
        double a = baseMilValue, fA = F(a);
        double b = double.NaN;
        for (int i = 1; i < 64; i++)
        {
            double cand = baseMilValue + dir * (Math.Pow(2.0, i) - 1.0);
            if (cand < marchLo || cand > marchHi)
            {
                cand = dir > 0 ? marchHi : marchLo;
                if (fA * F(cand) <= 0) b = cand;
                break;
            }
            double fc = F(cand);
            if (fA * fc <= 0) { b = cand; break; }
            a = cand; fA = fc;
        }

        if (double.IsNaN(b))
        {

            double edge = dir > 0 ? marchHi : marchLo;
            double thetaEdge = Math.Abs(F(edge)) < Math.Abs(fA) ? edge : a;
            return new FiringSolution(true, range, dz, baseMilValue, thetaEdge - baseMilValue, thetaEdge,
                                      FlightTime(range, baseMilValue), false);
        }

        double lo = Math.Min(a, b), hi = Math.Max(a, b);
        double fLo = F(lo);
        for (int i = 0; i < MaxIterations && hi - lo > ConvergenceMil; i++)
        {
            double mid = 0.5 * (lo + hi);
            if (fLo * F(mid) <= 0) hi = mid;
            else { lo = mid; fLo = F(mid); }
        }
        double theta = 0.5 * (lo + hi);

        return new FiringSolution(true, range, dz, baseMilValue, theta - baseMilValue, theta,
                                  FlightTime(range, baseMilValue), true);
    }

    public static double SightAngleMil(double range, double dz)
    {
        if (range <= 0) return 0.0;
        double slant = Math.Sqrt(range * range + dz * dz);
        return Math.Asin(Math.Clamp(dz / slant, -1.0, 1.0)) * MilPerRadian;
    }

    public static double? FlightTime(double range, double mil)
    {
        double th = MilToRadians(mil);
        double s = Math.Sin(2.0 * th);
        if (s <= 1e-6 || range <= 0) return null;
        double v0 = Math.Sqrt(range * Gravity / s);
        return 2.0 * v0 * Math.Sin(th) / Gravity;
    }

    public static double BearingDegrees(double x0, double y0, double x1, double y1)
    {
        double dx = (x1 - x0) * MetresPerGameUnit;
        double dy = (y1 - y0) * MetresPerGameUnit;
        double deg = Math.Atan2(dx, dy) * 180.0 / Math.PI;
        return (deg % 360.0 + 360.0) % 360.0;
    }

    public static double HorizontalDistance(double x0, double y0, double x1, double y1)
        => Math.Sqrt(Math.Pow((x1 - x0) * MetresPerGameUnit, 2)
                   + Math.Pow((y1 - y0) * MetresPerGameUnit, 2));
}
