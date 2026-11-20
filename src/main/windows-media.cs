using System;
using System.Collections;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Reflection;
using System.Text;
using System.Threading.Tasks;
using System.Web.Script.Serialization;

// .NET Framework projects WinRT types at runtime. This keeps the helper usable
// on a standard Windows installation without a Windows SDK.
internal static class LastraMedia
{
    private static readonly MethodInfo AsTask = typeof(System.WindowsRuntimeSystemExtensions).GetMethods()
        .Single(method => method.Name == "AsTask" && method.GetGenericArguments().Length == 1
                          && method.GetParameters().Length == 1 && method.GetParameters()[0].ParameterType.Name == "IAsyncOperation`1");
    private static readonly DateTimeOffset Epoch = new DateTimeOffset(1970, 1, 1, 0, 0, 0, TimeSpan.Zero);
    private static readonly JavaScriptSerializer Json = new JavaScriptSerializer { MaxJsonLength = 2 * 1024 * 1024 };
    private static Type managerType;
    private static object manager;
    private static readonly List<Player> Players = new List<Player>();
    private static Player defaultPlayer;

    private sealed class Player
    {
        public readonly object Session;
        public readonly string Id = Guid.NewGuid().ToString("N");
        public readonly string Source;
        public Tuple<string, string, string, int> Track;
        public string TrackId;
        public string Artwork;
        public bool ArtworkLoaded;

        public Player(object session)
        {
            Session = session;
            Source = Limit(Read(session, "SourceAppUserModelId") as string);
        }
    }

    private static void Main()
    {
        Console.InputEncoding = new UTF8Encoding(false);
        Console.OutputEncoding = new UTF8Encoding(false);
        string line;
        while ((line = Console.ReadLine()) != null)
        {
            int id = 0;
            object result;
            try
            {
                var request = Json.Deserialize<Dictionary<string, object>>(line);
                id = Convert.ToInt32(request["id"], CultureInfo.InvariantCulture);
                result = Handle(request);
            }
            catch (Exception error)
            {
                while (error.InnerException != null) error = error.InnerException;
                string status = error is TypeLoadException || error is PlatformNotSupportedException
                    ? "unsupported" : "unavailable";
                result = new { status = status };
            }
            Console.WriteLine(Json.Serialize(new { id = id, result = result }));
            Console.Out.Flush();
        }
    }

    private static object Handle(Dictionary<string, object> request)
    {
        if (manager == null)
        {
            managerType = WinRtType("Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager", "Windows.Media.Control");
            manager = Complete(managerType.GetMethod("RequestAsync"), null);
        }

        var current = managerType.GetMethod("GetCurrentSession").Invoke(manager, null);
        var reported = (IEnumerable)managerType.GetMethod("GetSessions").Invoke(manager, null);
        RefreshPlayers(reported.Cast<object>());
        if (!Object.ReferenceEquals(defaultPlayer == null ? null : defaultPlayer.Session, current))
        {
            // Windows may return a separate wrapper for the default. Keep that
            // target outside the picker rather than guessing which item aliases it.
            defaultPlayer = current == null ? null : FindPlayer(current) ?? new Player(current);
        }
        var selection = Value(request, "selectionId") as string;
        var route = Value(request, "route") as string;
        var available = route == null ? Players : Players.Where(item => MatchesRoute(route, item.Source)).ToList();
        var player = route != null
            ? RoutedPlayer(route, available, current)
            : selection == null ? defaultPlayer : Players.Find(item => item.Id == selection);
        string command = Value(request, "command") as string;
        if (command == "snapshot")
        {
            var detail = Value(request, "detail") as string;
            var listed = detail == null ? available : available.Take(128);
            var sessions = listed.Select(item => new {
                id = item.Id, source = detail == null ? item.Source : SourceKind(item.Source),
                isDefault = Object.ReferenceEquals(item.Session, current)
            }).ToArray();
            if (player == null) return new { status = selection == null ? "empty" : "missing", sessions = sessions };
            return Snapshot(player, Value(request, "artworkId") as string, sessions, detail);
        }
        if (player == null || (Value(request, "sessionId") as string) != player.Id)
            return new { status = "changed" };

        var session = player.Session;
        var playback = Call(session, "GetPlaybackInfo");
        var before = Value(request, "before") as string;
        if (before != null && !String.Equals(before, Read(playback, "PlaybackStatus").ToString(), StringComparison.OrdinalIgnoreCase))
            return new { status = "changed" };
        var expectedTrackId = Value(request, "expectedTrackId") as string;
        if (expectedTrackId != null && (expectedTrackId != player.TrackId || !TrackKey(CurrentProperties(session)).Equals(player.Track)))
            return new { status = "changed" };
        var controls = Read(playback, "Controls");
        string method;
        switch (command)
        {
            case "play":
                if (!Enabled(controls, "IsPlayEnabled")) return new { status = "disabled" };
                method = "TryPlayAsync";
                break;
            case "pause":
                if (!Enabled(controls, "IsPauseEnabled")) return new { status = "disabled" };
                method = "TryPauseAsync";
                break;
            case "toggle":
                if (!Enabled(controls, "IsPlayPauseToggleEnabled")) return new { status = "disabled" };
                method = "TryTogglePlayPauseAsync";
                break;
            case "previous":
                if (!Enabled(controls, "IsPreviousEnabled")) return new { status = "disabled" };
                method = "TrySkipPreviousAsync";
                break;
            case "next":
                if (!Enabled(controls, "IsNextEnabled")) return new { status = "disabled" };
                method = "TrySkipNextAsync";
                break;
            case "seek":
                return Seek(player, request, controls);
            default:
                return new { status = "disabled" };
        }
        return new { status = (bool)Complete(session.GetType().GetMethod(method), session) ? "ok" : "rejected" };
    }

    private static Player RoutedPlayer(string route, List<Player> available, object current)
    {
        var active = available.Find(item => Object.ReferenceEquals(item.Session, current));
        if (active != null) return active;
        if (defaultPlayer != null && MatchesRoute(route, defaultPlayer.Source)) return defaultPlayer;
        return available.FirstOrDefault();
    }

    private static bool MatchesRoute(string route, string source)
    {
        if (route == "netflix")
            return source.Equals("4DF9E0F8.Netflix_mcm4njqhnhss8!Netflix.App", StringComparison.OrdinalIgnoreCase);
        if (route != "spotify") return false;
        var name = source.Replace('\\', '/').Split('/').Last();
        return name.Equals("Spotify.exe", StringComparison.OrdinalIgnoreCase)
            || name.Equals("Spotify", StringComparison.OrdinalIgnoreCase)
            || name.Equals("SpotifyAB.SpotifyMusic_zpdnekdrzrea0!Spotify", StringComparison.OrdinalIgnoreCase);
    }

    private static Player FindPlayer(object session)
    {
        return Players.Find(item => Object.ReferenceEquals(item.Session, session));
    }

    private static void RefreshPlayers(IEnumerable<object> reported)
    {
        // The runtime's COM wrappers retain session identity. App IDs alone
        // cannot distinguish simultaneous sessions or detect a replacement.
        var active = reported.Where(session => session != null).ToList();
        Players.RemoveAll(item => !active.Exists(session => Object.ReferenceEquals(item.Session, session)));
        foreach (var session in active)
        {
            if (FindPlayer(session) == null) Players.Add(new Player(session));
        }
    }

    private static object Seek(Player player, Dictionary<string, object> request, object controls)
    {
        if (!Enabled(controls, "IsPlaybackPositionEnabled")) return new { status = "disabled" };
        var session = player.Session;
        var properties = CurrentProperties(session);
        if (!TrackKey(properties).Equals(player.Track) || (Value(request, "trackId") as string) != player.TrackId)
            return new { status = "changed" };

        var timeline = Call(session, "GetTimelineProperties");
        var start = (TimeSpan)Read(timeline, "StartTime");
        var min = (TimeSpan)Read(timeline, "MinSeekTime");
        var max = (TimeSpan)Read(timeline, "MaxSeekTime");
        if (max <= min) return new { status = "disabled" };

        var position = Convert.ToInt64(Value(request, "positionMs"), CultureInfo.InvariantCulture);
        var requested = start + TimeSpan.FromMilliseconds(position);
        if (requested < min || requested > max) return new { status = "disabled" };
        bool accepted = (bool)Complete(session.GetType().GetMethod("TryChangePlaybackPositionAsync"), session, requested.Ticks);
        return new { status = accepted ? "ok" : "rejected" };
    }

    private static string SourceKind(string source)
    {
        if (MatchesRoute("spotify", source)) return "spotify";
        if (MatchesRoute("netflix", source)) return "netflix";
        return "windows";
    }

    private static object Snapshot(Player player, string lastArtworkId, object sessions, string detail)
    {
        var session = player.Session;
        Tuple<string, string, string, int> metadata = null;
        bool review = detail == "review";
        if (detail == null || review)
        {
            var properties = CurrentProperties(session);
            var next = TrackKey(properties);
            if (!next.Equals(player.Track))
            {
                player.Track = next;
                player.TrackId = Guid.NewGuid().ToString("N");
                player.Artwork = null;
                player.ArtworkLoaded = false;
            }
            if (detail == null && !player.ArtworkLoaded)
            {
                player.Artwork = ReadArtwork(properties);
                player.ArtworkLoaded = true;
            }
            metadata = player.Track;
        }
        else if (detail == "metadata") metadata = TrackKey(CurrentProperties(session));

        var timeline = Call(session, "GetTimelineProperties");
        var playback = Call(session, "GetPlaybackInfo");
        var controls = Read(playback, "Controls");
        string playbackState = Read(playback, "PlaybackStatus").ToString().ToLowerInvariant();
        var start = (TimeSpan)Read(timeline, "StartTime");
        var end = (TimeSpan)Read(timeline, "EndTime");
        var min = (TimeSpan)Read(timeline, "MinSeekTime");
        var max = (TimeSpan)Read(timeline, "MaxSeekTime");
        var position = (TimeSpan)Read(timeline, "Position");
        var updated = (DateTimeOffset)Read(timeline, "LastUpdatedTime");
        double durationMs = Math.Round((end - start).TotalMilliseconds);
        bool hasTimeline = durationMs > 0 && durationMs <= TimeSpan.FromDays(7).TotalMilliseconds;
        bool seekable = hasTimeline && max > min && min >= start && max <= end && Enabled(controls, "IsPlaybackPositionEnabled");
        object rawRate = Read(playback, "PlaybackRate");
        double rate = rawRate is double ? (double)rawRate : 1;
        var view = new Dictionary<string, object> {
            { "status", "ready" },
            { "sessionId", player.Id },
            { "sessions", sessions },
            { "source", detail == null || review ? player.Source : SourceKind(player.Source) },
            { "playback", playbackState },
            { "canPlay", Enabled(controls, "IsPlayEnabled") },
            { "canPause", Enabled(controls, "IsPauseEnabled") },
            { "canToggle", Enabled(controls, "IsPlayPauseToggleEnabled") },
            { "canPrevious", Enabled(controls, "IsPreviousEnabled") },
            { "canNext", Enabled(controls, "IsNextEnabled") },
            { "durationMs", hasTimeline ? (double?)durationMs : null },
            { "positionMs", hasTimeline ? (double?)Math.Max(0, Math.Min(durationMs, Math.Round((position - start).TotalMilliseconds))) : null },
            { "positionUpdatedAt", updated > Epoch ? (long)(updated - Epoch).TotalMilliseconds : 0 },
            { "rate", rate > 0 && rate <= 16 ? rate : 1 },
            { "seekMinMs", seekable ? (double?)Math.Ceiling((min - start).TotalMilliseconds) : null },
            { "seekMaxMs", seekable ? (double?)Math.Floor((max - start).TotalMilliseconds) : null }
        };
        if (metadata != null)
        {
            view.Add("title", metadata.Item1);
            view.Add("artist", metadata.Item2);
            view.Add("album", metadata.Item3);
        }
        if (detail == null || review)
        {
            view.Add("trackId", player.TrackId);
            if (detail == null && player.TrackId != lastArtworkId) view.Add("artwork", player.Artwork);
        }
        return view;
    }

    private static object CurrentProperties(object session)
    {
        return Complete(session.GetType().GetMethod("TryGetMediaPropertiesAsync"), session);
    }

    private static Tuple<string, string, string, int> TrackKey(object properties)
    {
        return Tuple.Create(Limit(Read(properties, "Title") as string), Limit(Read(properties, "Artist") as string),
                            Limit(Read(properties, "AlbumTitle") as string), Convert.ToInt32(Read(properties, "TrackNumber"), CultureInfo.InvariantCulture));
    }

    private static string ReadArtwork(object properties)
    {
        try
        {
            var thumbnail = properties.GetType().GetProperty("Thumbnail");
            var reference = thumbnail.GetValue(properties);
            if (reference == null) return null;
            var method = thumbnail.PropertyType.GetMethod("OpenReadAsync");
            var stream = Complete(method, reference);
            using (stream as IDisposable)
            {
                var randomAccess = WinRtType("Windows.Storage.Streams.IRandomAccessStream", "Windows.Storage.Streams");
                var size = (ulong)randomAccess.GetProperty("Size").GetValue(stream);
                if (size == 0 || size > 512 * 1024) return null;
                var dataReaderType = WinRtType("Windows.Storage.Streams.DataReader", "Windows.Storage.Streams");
                var reader = Activator.CreateInstance(dataReaderType, stream);
                using (reader as IDisposable)
                {
                    uint loaded = (uint)Complete(dataReaderType.GetMethod("LoadAsync"), reader, (uint)size);
                    if (loaded == 0) return null;
                    var bytes = new byte[loaded];
                    dataReaderType.GetMethod("ReadBytes").Invoke(reader, new object[] { bytes });
                    string mediaType = ImageType(bytes);
                    return mediaType == null ? null : "data:" + mediaType + ";base64," + Convert.ToBase64String(bytes);
                }
            }
        }
        catch (Exception)
        {
            // Missing or unreadable cover art must not hide the track controls.
            return null;
        }
    }

    private static string ImageType(byte[] bytes)
    {
        if (bytes.Length < 12) return null;
        if (bytes[0] == 0xff && bytes[1] == 0xd8 && bytes[2] == 0xff) return "image/jpeg";
        if (bytes[0] == 0x89 && Encoding.ASCII.GetString(bytes, 1, 3) == "PNG") return "image/png";
        if (Encoding.ASCII.GetString(bytes, 0, 3) == "GIF") return "image/gif";
        if (Encoding.ASCII.GetString(bytes, 0, 4) == "RIFF" && Encoding.ASCII.GetString(bytes, 8, 4) == "WEBP") return "image/webp";
        return null;
    }

    private static Type WinRtType(string name, string contract)
    {
        return Type.GetType(name + ", " + contract + ", ContentType=WindowsRuntime", true);
    }

    private static object Complete(MethodInfo method, object instance, params object[] arguments)
    {
        var operation = method.Invoke(instance, arguments);
        var resultType = method.ReturnType.IsGenericType
            ? method.ReturnType : method.ReturnType.GetInterfaces().Single(type => type.Name == "IAsyncOperation`1");
        var task = (Task)AsTask.MakeGenericMethod(resultType.GetGenericArguments()[0]).Invoke(null, new[] { operation });
        task.GetAwaiter().GetResult();
        return task.GetType().GetProperty("Result").GetValue(task);
    }

    private static object Read(object value, string property)
    {
        return value.GetType().GetProperty(property).GetValue(value);
    }

    private static object Call(object value, string method)
    {
        return value.GetType().GetMethod(method).Invoke(value, null);
    }

    private static bool Enabled(object controls, string name)
    {
        return (bool)Read(controls, name);
    }

    private static string Limit(string value)
    {
        return String.IsNullOrEmpty(value) ? "" : value.Substring(0, Math.Min(value.Length, 500)).Trim();
    }

    private static object Value(Dictionary<string, object> dictionary, string key)
    {
        object value;
        return dictionary.TryGetValue(key, out value) ? value : null;
    }
}
