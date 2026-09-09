namespace WardogsArtillery.Core.Ballistics;

public readonly record struct TerrainTilt(
    double GradientX,
    double GradientY,
    double AlongSlope,
    double CrossSlope,
    double PitchDegrees,
    double RollDegrees,
    double AzimuthDegrees,
    double SampleSpacingMeters,
    bool Valid)
{
    public static TerrainTilt None(double azimuthDeg = 0) =>
        new(0, 0, 0, 0, 0, 0, azimuthDeg, 0, false);

    public double PitchMil => PitchDegrees * TrajectorySolver.MilPerDegree;

    public double RollMil => RollDegrees * TrajectorySolver.MilPerDegree;
}

public static class TerrainTiltCalculator
{

    public const double DefaultSpacingMeters = 12.0;

    public static TerrainTilt Compute(
        ITerrainHeight? terrain, double x, double y, double azimuthDeg,
        double spacingMeters = DefaultSpacingMeters)
    {
        if (terrain is null) return TerrainTilt.None(azimuthDeg);
        double spacing = Math.Max(1.0, spacingMeters);
        double d = spacing / TrajectorySolver.MetresPerGameUnit;

        double? hx1 = terrain.HeightAt(x + d, y), hx0 = terrain.HeightAt(x - d, y);
        double? hy1 = terrain.HeightAt(x, y + d), hy0 = terrain.HeightAt(x, y - d);
        if (hx1 is null || hx0 is null || hy1 is null || hy0 is null)
            return TerrainTilt.None(azimuthDeg);

        double gx = (hx1.Value - hx0.Value) / (2.0 * spacing);
        double gy = (hy1.Value - hy0.Value) / (2.0 * spacing);

        double az = azimuthDeg * Math.PI / 180.0;
        double dirX = Math.Sin(az), dirY = Math.Cos(az);
        double along = gx * dirX + gy * dirY;
        double cross = gx * dirY - gy * dirX;

        return new TerrainTilt(
            gx, gy, along, cross,
            Math.Atan(along) * 180.0 / Math.PI,
            Math.Atan(cross) * 180.0 / Math.PI,
            azimuthDeg, spacing, true);
    }

    public static double CorrectionMil(TerrainTilt tilt)
        => tilt.Valid ? -tilt.PitchMil : 0.0;

    public static double CorrectedElevationMil(double requiredMil, TerrainTilt tilt)
    {
        if (!tilt.Valid) return requiredMil;
        double theta = TrajectorySolver.MilToRadians(requiredMil);
        double pitch = tilt.PitchDegrees * Math.PI / 180.0;
        double roll = tilt.RollDegrees * Math.PI / 180.0;
        double sin = Math.Sin(theta - pitch) / Math.Cos(roll);
        sin = Math.Clamp(sin, -1.0, 1.0);
        return Math.Asin(sin) * TrajectorySolver.MilPerRadian;
    }

    public static double CorrectedBearingDegrees(double requiredBearingDeg, double elevationMil, TerrainTilt tilt)
    {
        if (!tilt.Valid) return requiredBearingDeg;
        double theta = TrajectorySolver.MilToRadians(elevationMil);
        double roll = tilt.RollDegrees * Math.PI / 180.0;
        double delta = Math.Atan(Math.Tan(theta) * Math.Sin(roll)) * 180.0 / Math.PI;
        double v = requiredBearingDeg + delta;
        return (v % 360.0 + 360.0) % 360.0;
    }

    public static double BearingCorrectionDegrees(double requiredBearingDeg, double elevationMil, TerrainTilt tilt)
    {
        double corrected = CorrectedBearingDegrees(requiredBearingDeg, elevationMil, tilt);
        double d = corrected - requiredBearingDeg;
        while (d > 180) d -= 360;
        while (d < -180) d += 360;
        return d;
    }
}
