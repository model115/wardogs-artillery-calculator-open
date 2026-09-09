using System.Net;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc.Testing;

namespace WardogsArtillery.Server.Tests;

public static class RepoPaths
{
    public static string Root { get; } = Find();

    private static string Find()
    {
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir is not null)
        {
            if (Directory.Exists(Path.Combine(dir.FullName, "web"))
                && File.Exists(Path.Combine(dir.FullName, "data", "maps.json")))
                return dir.FullName;
            dir = dir.Parent;
        }
        return Directory.GetCurrentDirectory();
    }

    public static string Data => Path.Combine(Root, "data");
    public static string Web => Path.Combine(Root, "web");
    public static bool HasTerrain(string mapId) => File.Exists(Path.Combine(Data, "terrain", mapId + ".hgt"));
}

public class StaticHostTests : IClassFixture<WebApplicationFactory<Program>>
{
    private readonly WebApplicationFactory<Program> _factory;
    public StaticHostTests(WebApplicationFactory<Program> factory) => _factory = factory;
    private HttpClient Client() => _factory.CreateClient();

    [Fact]
    public async Task Index_ServesPageThatLoadsCoreScriptsInOrder()
    {
        string html = await Client().GetStringAsync("/");
        Assert.Contains("WARDOGS", html);
        Assert.Contains("id=\"tutorial\"", html);

        int core = html.IndexOf("core/ballistics.js", StringComparison.Ordinal);
        int store = html.IndexOf("store.js", StringComparison.Ordinal);
        int app = html.IndexOf("app.js", StringComparison.Ordinal);
        Assert.True(core > 0 && store > core && app > store, "脚本加载顺序不对");

        Assert.DoesNotContain("EventSource", html);
    }

    [Theory]
    [InlineData("/app.js")]
    [InlineData("/app.css")]
    [InlineData("/core/ballistics.js")]
    [InlineData("/core/terrain.js")]
    [InlineData("/core/reach.js")]
    [InlineData("/store.js")]
    public async Task FrontendFiles_AreServed(string path)
    {
        HttpResponseMessage res = await Client().GetAsync(path);
        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        Assert.True((await res.Content.ReadAsByteArrayAsync()).Length > 100, $"{path} 内容为空");
    }

    [Theory]
    [InlineData("/data/maps.json")]
    [InlineData("/data/weapons.json")]
    public async Task CoreData_AreServed(string path)
    {
        HttpResponseMessage res = await Client().GetAsync(path);
        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        Assert.True((await res.Content.ReadAsByteArrayAsync()).Length > 100, $"{path} 内容为空");
    }

    [Theory]
    [InlineData("images/bakurani_map.webp")]
    [InlineData("images/bakurani_terrain.webp")]
    [InlineData("markers/tower.webp")]
    [InlineData("terrain/bakurani.hgt")]
    [InlineData("reach/bakurani_towers.json")]
    public async Task GameAssets_AreServedWhenPresent(string rel)
    {
        string local = Path.Combine(RepoPaths.Data, rel.Replace('/', Path.DirectorySeparatorChar));
        if (!File.Exists(local)) return;

        HttpResponseMessage res = await Client().GetAsync("/data/" + rel);
        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        Assert.True((await res.Content.ReadAsByteArrayAsync()).Length > 100, $"{rel} 内容为空");
    }

    [Fact]
    public async Task MapsJson_HasBoundsAndMarkers()
    {
        using JsonDocument doc = JsonDocument.Parse(await Client().GetStringAsync("/data/maps.json"));
        Assert.Equal(JsonValueKind.Array, doc.RootElement.ValueKind);
        JsonElement first = doc.RootElement[0];
        Assert.True(first.TryGetProperty("id", out _));
        Assert.True(first.TryGetProperty("bounds", out JsonElement b));
        Assert.True(b.GetProperty("maxX").GetDouble() > b.GetProperty("minX").GetDouble());
    }

    [Fact]
    public async Task ElevationGrid_HasWhg1Magic()
    {
        if (!RepoPaths.HasTerrain("bakurani")) return;
        byte[] bytes = await Client().GetByteArrayAsync("/data/terrain/bakurani.hgt");
        Assert.True(bytes.Length > 1_000_000, $"高程文件太小：{bytes.Length} B");
        Assert.Equal((byte)'W', bytes[0]);
        Assert.Equal((byte)'H', bytes[1]);
        Assert.Equal((byte)'G', bytes[2]);
        Assert.Equal((byte)'1', bytes[3]);
    }

    [Fact]
    public async Task Health_ReportsStaticMode()
    {
        using JsonDocument doc = JsonDocument.Parse(await Client().GetStringAsync("/api/health"));
        Assert.True(doc.RootElement.GetProperty("ok").GetBoolean());
        Assert.Equal("static", doc.RootElement.GetProperty("mode").GetString());
    }

    [Theory]
    [InlineData("/api/solution")]
    [InlineData("/api/range-ring")]
    [InlineData("/api/tilt")]
    [InlineData("/api/state")]
    [InlineData("/api/stream")]
    public async Task BusinessApiEndpoints_AreGone(string path)
    {
        HttpResponseMessage res = await Client().GetAsync(path);
        Assert.Equal(HttpStatusCode.NotFound, res.StatusCode);
    }
}

public class LauncherScriptTests
{
    [Fact]
    public void StartupCmd_IsCrlfAndPureAscii()
    {
        string path = Path.Combine(RepoPaths.Root, "packaging", "启动.cmd");
        Assert.True(File.Exists(path), $"找不到启动脚本：{path}");

        byte[] bytes = File.ReadAllBytes(path);
        Assert.Equal(0x40, bytes[0]);
        Assert.Equal(bytes.Count(b => b == 10), bytes.Count(b => b == 13));
        Assert.DoesNotContain(bytes, b => b > 127);

        string text = File.ReadAllText(path);
        Assert.Contains("WardogsArtillery.exe", text);
        Assert.Contains("--urls http://127.0.0.1:5188", text);
    }
}
