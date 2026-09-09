using Microsoft.Extensions.FileProviders;
using Microsoft.AspNetCore.StaticFiles;

string appRoot = FindAppRoot();
string webRoot = GetArg(args, "--web") ?? Path.Combine(appRoot, "web");
string dataRoot = GetArg(args, "--data") ?? Path.Combine(appRoot, "data");
string urls = GetArg(args, "--urls") ?? "http://127.0.0.1:5188";

var builder = WebApplication.CreateBuilder(new WebApplicationOptions
{
    Args = args,
    ContentRootPath = appRoot,
    WebRootPath = Directory.Exists(webRoot) ? webRoot : appRoot,
});
builder.WebHost.UseUrls(urls);
builder.Services.AddCors(o => o.AddDefaultPolicy(p =>
    p.AllowAnyOrigin().AllowAnyMethod().AllowAnyHeader()));

var app = builder.Build();
app.UseCors();

static void SetCacheHeaders(StaticFileResponseContext ctx)
{
    string name = ctx.File.Name;
    string ext = Path.GetExtension(name).ToLowerInvariant();
    ctx.Context.Response.Headers.CacheControl = ext switch
    {
        ".webp" or ".png" or ".hgt" or ".wrg" or ".ico" => "public, max-age=86400",
        ".js" or ".css" or ".json" => "public, max-age=3600",
        _ => "no-cache",
    };
}

app.UseDefaultFiles();
app.UseStaticFiles(new StaticFileOptions { OnPrepareResponse = SetCacheHeaders });

if (Directory.Exists(dataRoot))
{
    app.UseStaticFiles(new StaticFileOptions
    {
        FileProvider = new PhysicalFileProvider(dataRoot),
        RequestPath = "/data",
        ServeUnknownFileTypes = true,
        DefaultContentType = "application/octet-stream",
        OnPrepareResponse = SetCacheHeaders,
    });
}

app.MapGet("/api/health", () => Results.Ok(new
{
    ok = true,
    version = "v1.0.0",
    author = "model115",
    mode = "static",
}));

app.Run();
return 0;

static string? GetArg(string[] args, string name)
{
    for (int i = 0; i < args.Length - 1; i++)
        if (string.Equals(args[i], name, StringComparison.OrdinalIgnoreCase))
            return args[i + 1];
    return null;
}

static string FindAppRoot()
{
    string exeDir = AppContext.BaseDirectory;
    if (File.Exists(Path.Combine(exeDir, "data", "maps.json"))) return exeDir;

    var dir = new DirectoryInfo(exeDir);
    while (dir is not null)
    {
        if (File.Exists(Path.Combine(dir.FullName, "data", "maps.json"))) return dir.FullName;
        dir = dir.Parent;
    }
    return exeDir;
}

public partial class Program { }
