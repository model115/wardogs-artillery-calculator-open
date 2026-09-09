namespace WardogsArtillery.Tools;

internal static class Program
{
    private static int Main(string[] args)
    {
        try { Console.OutputEncoding = System.Text.Encoding.UTF8; } catch {  }

        if (args.Length == 0) { Console.WriteLine(Usage); return 2; }
        switch (args[0].ToLowerInvariant())
        {
            case "assets": return AssetBuilder.Run(args[1..]);
            case "reach-grid": return ReachGridTool.Run(args[1..]);
            case "tower-reach": return TowerReachTool.Run(args[1..]);
            case "core-golden": return CoreGolden.Run(args[1..]);
            case "-h" or "--help" or "help": Console.WriteLine(Usage); return 0;
            default:
                Console.Error.WriteLine($"未知命令：{args[0]}");
                Console.WriteLine(Usage);
                return 2;
        }
    }

    private const string Usage = """
        WARDOGS 火炮解算器 —— 构建期资产工具

          assets all                              生成全部资产到 data/
          assets check                            资产自检
          assets maps|weapons|markers|images|grid|reach   只生成某一类
          reach-grid <地图> [半径m] [步长m]       射程范围网格文件（默认 300 100? 实际 300 10）
          tower-reach <地图> [方位数]             1~5 塔被射图（默认 360 方位）

        通用参数：
          --source <wardogs-calculator 目录>      原始数据位置
          --out <目录>                            输出目录（默认 data/reach）
        """;
}
