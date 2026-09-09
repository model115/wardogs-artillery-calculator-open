namespace WardogsArtillery.Core.Ballistics;

public sealed record ImpactCorrection(
    double RangeErrorMeters,
    double BearingErrorDegrees,
    double RangeMetersPerMil,
    double MilCorrection,
    double BearingCorrectionMil,
    double NextMil,
    double NextBearingDegrees,
    double ImpactRangeMeters,
    double TargetRangeMeters,
    bool RangePerMilFromTable);

public static class ImpactCorrectionCalculator
{
    public static ImpactCorrection? Compute(
        BallisticTable table,
        double gunX, double gunY,
        double targetX, double targetY,
        double firedMil, double firedBearingDeg,
        double impactX, double impactY)
    {
        if (table is null) return null;

        double targetRange = TrajectorySolver.HorizontalDistance(gunX, gunY, targetX, targetY);
        double impactRange = TrajectorySolver.HorizontalDistance(gunX, gunY, impactX, impactY);
        if (targetRange <= 0 || impactRange <= 0) return null;

        double targetBearing = TrajectorySolver.BearingDegrees(gunX, gunY, targetX, targetY);
        double impactBearing = TrajectorySolver.BearingDegrees(gunX, gunY, impactX, impactY);

        double rangeError = impactRange - targetRange;
        double bearingError = Wrap180(impactBearing - targetBearing);

        (double perMil, bool fromTable) = RangePerMil(table, targetRange);
        if (Math.Abs(perMil) <= 1e-6) return null;

        double milCorrection = -rangeError / perMil;
        double bearingCorrectionMil = -bearingError * TrajectorySolver.MilPerDegree;

        return new ImpactCorrection(
            rangeError, bearingError, perMil,
            milCorrection, bearingCorrectionMil,
            firedMil + milCorrection,
            Wrap360(firedBearingDeg - bearingError),
            impactRange, targetRange, fromTable);
    }

    private static (double MetresPerMil, bool FromTable) RangePerMil(BallisticTable table, double range)
    {
        const double probe = 50.0;
        double? m1 = table.MilForRange(range - probe);
        double? m2 = table.MilForRange(range + probe);
        if (m1 is not null && m2 is not null && Math.Abs(m2.Value - m1.Value) > 1e-6)
            return ((2 * probe) / (m2.Value - m1.Value), true);

        double span = table.MaxRange - table.MinRange;
        double milSpan = table.MaxMil - table.MinMil;
        if (Math.Abs(milSpan) < 1e-6) return (0, false);
        return (span / milSpan, false);
    }

    private static double Wrap180(double deg)
    {
        double d = (deg + 180.0) % 360.0;
        if (d < 0) d += 360.0;
        return d - 180.0;
    }

    private static double Wrap360(double deg) => (deg % 360.0 + 360.0) % 360.0;
}
