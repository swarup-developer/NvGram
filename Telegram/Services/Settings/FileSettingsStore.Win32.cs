// Copyright (c) NvGram contributors.
// Distributed under the GNU General Public License v3.0. See LICENSE.

using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.Json;

namespace Telegram.Services.Settings
{
    /// <summary>
    /// File-backed settings for a future unpackaged host. The root owns the lock and must be
    /// disposed at shutdown. This backend is not selected by packaged builds.
    /// </summary>
    public sealed class FileSettingsStore : ISettingsStore, IDisposable
    {
        private sealed class Node
        {
            internal readonly Dictionary<string, object> Values = new(StringComparer.Ordinal);
            internal readonly Dictionary<string, Node> Containers = new(StringComparer.Ordinal);
        }

        private sealed class Owner : IDisposable
        {
            internal readonly object Gate = new();
            internal readonly string Path;
            private readonly FileStream _lock;
            internal Node Root;
            internal bool Disposed;

            internal Owner(string path)
            {
                Path = System.IO.Path.GetFullPath(path);
                Directory.CreateDirectory(System.IO.Path.GetDirectoryName(Path));
                // Never silently let two instances overwrite account/passcode settings.
                _lock = new FileStream(Path + ".lock", FileMode.OpenOrCreate, FileAccess.ReadWrite, FileShare.None);
                try
                {
                    if (File.Exists(Path))
                    {
                        if (new FileInfo(Path).Length > 16 * 1024 * 1024) throw new InvalidDataException("Settings exceed the 16 MiB limit.");
                        using var document = JsonDocument.Parse(File.ReadAllBytes(Path), new JsonDocumentOptions { MaxDepth = 64 });
                        if (document.RootElement.GetProperty("schemaVersion").GetInt32() != 1) throw new InvalidDataException("Unsupported settings schema.");
                        Root = ReadNode(document.RootElement.GetProperty("root"), 0);
                    }
                    else Root = new Node();
                }
                catch { _lock.Dispose(); throw; }
            }

            internal void Save()
            {
                var temporary = Path + "." + Guid.NewGuid().ToString("N") + ".tmp";
                try
                {
                    using (var stream = new FileStream(temporary, FileMode.CreateNew, FileAccess.Write, FileShare.None))
                    {
                        using (var writer = new Utf8JsonWriter(stream))
                        {
                            writer.WriteStartObject();
                            writer.WriteNumber("schemaVersion", 1);
                            writer.WritePropertyName("root");
                            WriteNode(writer, Root);
                            writer.WriteEndObject();
                            writer.Flush();
                        }
                        if (stream.Length > 16 * 1024 * 1024) throw new InvalidDataException("Settings exceed the 16 MiB limit.");
                        stream.Flush(flushToDisk: true);
                    }
                    File.Move(temporary, Path, overwrite: true);
                }
                finally { if (File.Exists(temporary)) File.Delete(temporary); }
            }

            public void Dispose()
            {
                lock (Gate)
                {
                    if (Disposed) return;
                    Disposed = true;
                    _lock.Dispose();
                }
            }
        }

        private readonly Owner _owner;
        private readonly Node _node;
        private readonly bool _ownsRoot;
        private readonly int _depth;
        private const int MaximumContainerDepth = 20;
        private bool _deleted;

        public FileSettingsStore(string path)
        {
            _owner = new Owner(path);
            _node = _owner.Root;
            _ownsRoot = true;
        }

        private FileSettingsStore(Owner owner, Node node, int depth) { _owner = owner; _node = node; _depth = depth; }
        private void EnsureActive()
        {
            ObjectDisposedException.ThrowIf(_owner.Disposed, this);
            if (_deleted || !ContainsNode(_owner.Root, _node)) throw new InvalidOperationException("This settings container was deleted.");
        }
        private static bool ContainsNode(Node root, Node candidate) => ReferenceEquals(root, candidate) || root.Containers.Values.Any(child => ContainsNode(child, candidate));
        private static void ValidateKey(string key) { if (string.IsNullOrWhiteSpace(key) || key.Length > 1024) throw new ArgumentException("A settings key of 1-1024 characters is required.", nameof(key)); }

        public bool TryGetValue(string key, out object value)
        {
            lock (_owner.Gate)
            {
                EnsureActive();
                var found = _node.Values.TryGetValue(key, out value);
                if (value is byte[] bytes) value = bytes.ToArray();
                if (value is string[] strings) value = strings.ToArray();
                return found;
            }
        }
        public bool ContainsKey(string key) { lock (_owner.Gate) { EnsureActive(); return _node.Values.ContainsKey(key); } }
        public void SetValue(string key, object value)
        {
            ValidateKey(key);
            // Validate before mutation, including nonfinite numbers and unsupported runtime types.
            using (var stream = new MemoryStream()) using (var writer = new Utf8JsonWriter(stream)) WriteValue(writer, value);
            lock (_owner.Gate)
            {
                EnsureActive();
                var existed = _node.Values.TryGetValue(key, out var old);
                _node.Values[key] = value is byte[] bytes ? bytes.ToArray() : value is string[] strings ? strings.ToArray() : value;
                try { _owner.Save(); }
                catch { if (existed) _node.Values[key] = old; else _node.Values.Remove(key); throw; }
            }
        }
        public void Remove(string key)
        {
            lock (_owner.Gate)
            {
                EnsureActive();
                if (!_node.Values.Remove(key, out var old)) return;
                try { _owner.Save(); } catch { _node.Values.Add(key, old); throw; }
            }
        }
        public void Clear()
        {
            lock (_owner.Gate)
            {
                EnsureActive();
                var previous = _node.Values.ToArray();
                _node.Values.Clear(); // Match ApplicationData: Clear affects values, not child containers.
                try { _owner.Save(); } catch { foreach (var item in previous) _node.Values.Add(item.Key, item.Value); throw; }
            }
        }
        public IEnumerable<string> ContainerNames { get { lock (_owner.Gate) { EnsureActive(); return _node.Containers.Keys.ToArray(); } } }
        public ISettingsStore GetContainer(string name)
        {
            ValidateKey(name);
            lock (_owner.Gate)
            {
                EnsureActive();
                if (_depth >= MaximumContainerDepth) throw new InvalidOperationException("Settings container nesting exceeds the supported limit.");
                if (!_node.Containers.TryGetValue(name, out var child))
                {
                    child = new Node(); _node.Containers.Add(name, child);
                    try { _owner.Save(); } catch { _node.Containers.Remove(name); throw; }
                }
                return new FileSettingsStore(_owner, child, _depth + 1);
            }
        }
        public bool TryGetContainer(string name, out ISettingsStore container)
        {
            lock (_owner.Gate)
            {
                EnsureActive();
                var found = _node.Containers.TryGetValue(name, out var node);
                container = found ? new FileSettingsStore(_owner, node, _depth + 1) : null;
                return found;
            }
        }
        public void DeleteContainer(string name)
        {
            lock (_owner.Gate)
            {
                EnsureActive();
                if (!_node.Containers.Remove(name, out var old)) return;
                try { _owner.Save(); } catch { _node.Containers.Add(name, old); throw; }
            }
        }
        public void Flush() { lock (_owner.Gate) { EnsureActive(); _owner.Save(); } }
        public void Dispose() { if (_ownsRoot) _owner.Dispose(); else _deleted = true; }

        private static void WriteNode(Utf8JsonWriter writer, Node node)
        {
            writer.WriteStartObject(); writer.WriteStartObject("values");
            foreach (var item in node.Values) { writer.WritePropertyName(item.Key); WriteValue(writer, item.Value); }
            writer.WriteEndObject(); writer.WriteStartObject("containers");
            foreach (var item in node.Containers) { writer.WritePropertyName(item.Key); WriteNode(writer, item.Value); }
            writer.WriteEndObject(); writer.WriteEndObject();
        }
        private static Node ReadNode(JsonElement element, int depth)
        {
            if (depth > MaximumContainerDepth) throw new InvalidDataException("Settings container nesting exceeds the supported limit.");
            var node = new Node();
            foreach (var item in element.GetProperty("values").EnumerateObject()) { ValidateKey(item.Name); node.Values.Add(item.Name, ReadValue(item.Value)); }
            foreach (var item in element.GetProperty("containers").EnumerateObject()) { ValidateKey(item.Name); node.Containers.Add(item.Name, ReadNode(item.Value, depth + 1)); }
            return node;
        }
        private static void WriteValue(Utf8JsonWriter writer, object value)
        {
            writer.WriteStartObject();
            writer.WriteString("type", value switch {
                null => "null", string => "string", bool => "bool", int => "int", long => "long", uint => "uint", ulong => "ulong",
                short => "short", ushort => "ushort", byte => "byte", sbyte => "sbyte", double => "double", float => "float",
                byte[] => "bytes", string[] => "strings", _ => throw new ArgumentException("Unsupported settings value type.", nameof(value)) });
            writer.WritePropertyName("value");
            switch (value)
            {
                case null: writer.WriteNullValue(); break;
                case string text: writer.WriteStringValue(text); break;
                case bool flag: writer.WriteBooleanValue(flag); break;
                case int number: writer.WriteNumberValue(number); break;
                case long number: writer.WriteNumberValue(number); break;
                case uint number: writer.WriteNumberValue(number); break;
                case ulong number: writer.WriteNumberValue(number); break;
                case short number: writer.WriteNumberValue(number); break;
                case ushort number: writer.WriteNumberValue(number); break;
                case byte number: writer.WriteNumberValue(number); break;
                case sbyte number: writer.WriteNumberValue(number); break;
                case double number: writer.WriteNumberValue(number); break;
                case float number: writer.WriteNumberValue(number); break;
                case byte[] bytes: writer.WriteBase64StringValue(bytes); break;
                case string[] strings: writer.WriteStartArray(); foreach (var text in strings) writer.WriteStringValue(text); writer.WriteEndArray(); break;
            }
            writer.WriteEndObject();
        }
        private static object ReadValue(JsonElement element)
        {
            var value = element.GetProperty("value");
            return element.GetProperty("type").GetString() switch {
                "null" => null, "string" => value.GetString(), "bool" => value.GetBoolean(), "int" => value.GetInt32(), "long" => value.GetInt64(),
                "uint" => value.GetUInt32(), "ulong" => value.GetUInt64(), "short" => value.GetInt16(), "ushort" => value.GetUInt16(),
                "byte" => value.GetByte(), "sbyte" => value.GetSByte(), "double" => value.GetDouble(), "float" => value.GetSingle(),
                "bytes" => value.GetBytesFromBase64(), "strings" => value.EnumerateArray().Select(item => item.GetString()).ToArray(),
                _ => throw new InvalidDataException("Unsupported settings value type.") };
        }
    }
}
