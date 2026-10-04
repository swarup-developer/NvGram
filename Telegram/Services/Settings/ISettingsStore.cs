// Copyright (c) Fela Ameghino 2015-2026.
// Distributed under the GNU General Public License v3.0. See LICENSE.

using System.Collections.Generic;

namespace Telegram.Services.Settings
{
    public interface ISettingsStore
    {
        bool TryGetValue(string key, out object value);
        void SetValue(string key, object value);
        bool ContainsKey(string key);
        void Remove(string key);
        void Clear();
        IEnumerable<string> ContainerNames { get; }
        ISettingsStore GetContainer(string name);
        bool TryGetContainer(string name, out ISettingsStore container);
        void DeleteContainer(string name);
        void Flush();
    }
}
