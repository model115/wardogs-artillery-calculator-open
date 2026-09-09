namespace WardogsArtillery.Core.Ballistics;

public sealed class BallisticTable
{
    private readonly double[] _dist;
    private readonly double[] _mil;
    private readonly double[] _milAsc;
    private readonly double[] _distByMil;

    public string Name { get; }
    public double MinRange { get; }
    public double MaxRange { get; }
    public double MinMil { get; }
    public double MaxMil { get; }

    public bool IsHighArc { get; }

    public IReadOnlyList<(double Range, double Mil)> Points { get; }

    public BallisticTable(string name, IEnumerable<(double Range, double Mil)> points)
    {
        Name = name;
        var sorted = points.OrderBy(p => p.Range).ToArray();
        if (sorted.Length < 2)
            throw new ArgumentException("射表至少需要 2 个点", nameof(points));

        _dist = sorted.Select(p => p.Range).ToArray();
        _mil = sorted.Select(p => p.Mil).ToArray();
        Points = sorted;

        MinRange = _dist[0];
        MaxRange = _dist[^1];
        MinMil = _mil.Min();
        MaxMil = _mil.Max();

        var byMil = sorted.OrderBy(p => p.Mil).ToArray();
        _milAsc = byMil.Select(p => p.Mil).ToArray();
        _distByMil = byMil.Select(p => p.Range).ToArray();

        IsHighArc = _mil[^1] > _mil[0] && MaxMil > 900;
    }

    public double? MilForRange(double range)
    {
        if (range < MinRange - 1e-6 || range > MaxRange + 1e-6) return null;
        return Interp(range, _dist, _mil);
    }

    public double? RangeForMil(double mil)
    {
        if (mil < MinMil - 1e-6 || mil > MaxMil + 1e-6) return null;
        return Interp(mil, _milAsc, _distByMil);
    }

    private static double Interp(double x, double[] xs, double[] ys)
    {
        int n = xs.Length;
        if (x <= xs[0]) return ys[0];
        if (x >= xs[^1]) return ys[^1];
        int lo = 0, hi = n - 1;
        while (hi - lo > 1)
        {
            int mid = (lo + hi) / 2;
            if (xs[mid] <= x) lo = mid; else hi = mid;
        }
        double t = (x - xs[lo]) / (xs[hi] - xs[lo]);
        return ys[lo] + t * (ys[hi] - ys[lo]);
    }
}
