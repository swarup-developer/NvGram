using Telegram.Services.Settings;

var directory = Path.Combine(Path.GetTempPath(), "nvgram-settings-test-" + Guid.NewGuid());
Directory.CreateDirectory(directory);
int checks = 0;
void Check(bool condition, string message) { if (!condition) throw new Exception(message); checks++; }
void Throws<T>(Action action) where T : Exception
{
    try { action(); } catch (T) { checks++; return; }
    throw new Exception("Expected " + typeof(T).Name);
}
try
{
    var path = Path.Combine(directory, "development", "settings.json");
    object[] values = { "value", true, 42, long.MaxValue, uint.MaxValue, ulong.MaxValue, (short)-12, (ushort)12, (byte)5, (sbyte)-5, 0.25d, 0.5f, new byte[] { 1, 2 }, new string[] { "a", "b" } };
    using (var root = new FileSettingsStore(path))
    {
        for (int i = 0; i < values.Length; i++) root.SetValue("value" + i, values[i]);
        Throws<IOException>(() => { using var competing = new FileSettingsStore(path); });
        var child = root.GetContainer("../arbitrary-name");
        child.SetValue("nested", 99);
        root.Clear();
        Check(child.TryGetValue("nested", out var nested) && (int)nested == 99, "Clear must preserve child containers");
        for (int i = 0; i < values.Length; i++) root.SetValue("value" + i, values[i]);
        var bytes = (byte[])values[12]; bytes[0] = 9;
        root.TryGetValue("value12", out var copy); Check(((byte[])copy)[0] == 1, "Set must copy mutable arrays");
        ((byte[])copy)[0] = 8; root.TryGetValue("value12", out copy); Check(((byte[])copy)[0] == 1, "Get must copy mutable arrays");
        Throws<ArgumentException>(() => root.SetValue("unsupported", new object()));
        Throws<ArgumentException>(() => root.SetValue("nan", double.NaN));
        Check(!root.ContainsKey("unsupported") && !root.ContainsKey("nan"), "Rejected values must not mutate settings");
        root.DeleteContainer("../arbitrary-name");
        Throws<InvalidOperationException>(() => child.SetValue("nested", 100));
        Check(!root.TryGetContainer("missing", out _), "TryGetContainer must not create a container");
        root.SetValue("nullable", null); root.Flush();
    }
    values[12] = new byte[] { 1, 2 };
    using (var reloaded = new FileSettingsStore(path))
    {
        for (int i = 0; i < values.Length; i++)
        {
            Check(reloaded.TryGetValue("value" + i, out var value), "Missing roundtrip value");
            Check(value.GetType() == values[i].GetType(), "Type changed during persistence");
            Check(value is Array array ? array.Cast<object>().SequenceEqual(((Array)values[i]).Cast<object>()) : Equals(value, values[i]), "Value changed during persistence");
        }
        Check(reloaded.TryGetValue("nullable", out var nullable) && nullable == null, "Null value roundtrip");
        reloaded.Remove("value0"); Check(!reloaded.ContainsKey("value0"), "Remove must persist");
    }
    using (var stable = new FileSettingsStore(Path.Combine(directory, "stable", "settings.json"))) Check(!stable.ContainsKey("value1"), "Channel stores must stay isolated");
    var corrupted = Path.Combine(directory, "corrupt.json"); File.WriteAllText(corrupted, "not json");
    Throws<System.Text.Json.JsonException>(() => { using var invalid = new FileSettingsStore(corrupted); });
    Check(File.ReadAllText(corrupted) == "not json", "Corrupt files must never be silently overwritten");
    File.WriteAllText(corrupted, "{\"schemaVersion\":2}");
    Throws<InvalidDataException>(() => { using var invalid = new FileSettingsStore(corrupted); });
    var deepPath = Path.Combine(directory, "deep.json");
    using (var deep = new FileSettingsStore(deepPath))
    {
        ISettingsStore nested = deep;
        for (int i = 0; i < 20; i++) nested = nested.GetContainer("level");
        nested.SetValue("leaf", 42);
        Throws<InvalidOperationException>(() => nested.GetContainer("too-deep"));
    }
    using (var deep = new FileSettingsStore(deepPath))
    {
        ISettingsStore nested = deep;
        for (int i = 0; i < 20; i++) nested = nested.GetContainer("level");
        Check(nested.TryGetValue("leaf", out var leaf) && (int)leaf == 42, "Every accepted nesting level must be reloadable");
    }
    var disposed = new FileSettingsStore(Path.Combine(directory, "disposed.json")); disposed.Dispose();
    Throws<ObjectDisposedException>(() => disposed.SetValue("x", 1));
    Check(!Directory.GetFiles(directory, "*.tmp", SearchOption.AllDirectories).Any(), "Temporary files must be cleaned");
    Console.WriteLine($"PASS: {checks} settings persistence and safety assertions");
}
finally { Directory.Delete(directory, recursive: true); }
