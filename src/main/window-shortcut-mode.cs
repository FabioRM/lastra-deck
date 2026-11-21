using System;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.RegularExpressions;
using System.Windows.Automation;
using Accessibility;

public static class LastraWindowShortcutMode
{
    [DllImport("user32.dll")]
    private static extern IntPtr GetForegroundWindow();

    private delegate bool WindowCallback(IntPtr window, IntPtr data);

    [DllImport("user32.dll")]
    private static extern bool EnumChildWindows(IntPtr window, WindowCallback callback, IntPtr data);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern int GetClassName(IntPtr window, StringBuilder value, int size);

    [DllImport("user32.dll")]
    private static extern bool IsWindowVisible(IntPtr window);

    [DllImport("oleacc.dll")]
    private static extern int AccessibleObjectFromWindow(IntPtr window, uint objectId, ref Guid iid,
        [MarshalAs(UnmanagedType.Interface)] out IAccessible accessible);

    private static readonly Condition Visible = new PropertyCondition(AutomationElement.IsOffscreenProperty, false);

    public static bool Matches(long handle, string pack)
    {
        var window = new IntPtr(handle);
        if (handle == 0 || GetForegroundWindow() != window) return false;
        var root = AutomationElement.FromHandle(window);
        if (root == null) return false;

        bool matched;
        switch (pack)
        {
            case "teams":
                matched = HasMeetingControls(root, true);
                break;
            case "zoom":
                matched = root.Current.ClassName == "ZPContentViewWndClass" && HasMeetingControls(root, false);
                break;
            default:
                matched = IsEditor(window, root, pack);
                break;
        }
        return matched && GetForegroundWindow() == window;
    }

    private static bool HasMeetingControls(AutomationElement root, bool teams)
    {
        var buttons = root.FindAll(TreeScope.Descendants, new AndCondition(Visible,
            new PropertyCondition(AutomationElement.ControlTypeProperty, ControlType.Button),
            new PropertyCondition(AutomationElement.IsEnabledProperty, true)));
        bool leave = false;
        bool media = false;
        foreach (AutomationElement button in buttons)
        {
            var properties = button.Current;
            string id = properties.AutomationId;
            string name = properties.Name;
            // Pre-join and lobby screens can expose audio controls. The in-call exit action is also required.
            leave |= (teams && (id == "hangup-button" || id == "leave-button")) || Label(name,
                "Leave", "Leave call", "Leave meeting", "End call", "End meeting", "End", "Abbandona",
                "Abbandona riunione", "Lascia", "Lascia riunione", "Termina", "Termina riunione");
            media |= (teams && (id == "microphone-button" || id == "video-button" || id == "camera-button")) || Label(name,
                "Mute", "Unmute", "Mute my microphone", "Unmute my microphone", "Mute my audio", "Unmute my audio",
                "Join Audio", "Start Video", "Stop Video", "Start my video", "Stop my video",
                "You are currently muted", "You are currently unmuted",
                "Disattiva audio", "Riattiva audio", "Attiva audio", "Disattiva microfono", "Riattiva microfono", "Attiva microfono",
                "Avvia video", "Interrompi video", "Disattiva video");
            if (leave && media) return true;
        }
        return false;
    }

    private static bool Label(string name, params string[] labels)
    {
        if (String.IsNullOrEmpty(name)) return false;
        foreach (string label in labels)
        {
            if (String.Equals(name, label, StringComparison.OrdinalIgnoreCase) ||
                name.StartsWith(label + " (", StringComparison.OrdinalIgnoreCase) ||
                name.StartsWith(label + ",", StringComparison.OrdinalIgnoreCase)) return true;
        }
        return false;
    }

    private static bool IsEditor(IntPtr window, AutomationElement root, string pack)
    {
        // Traversing from focus keeps URLs from other tabs and embedded documents out of the match.
        var walker = TreeWalker.ControlViewWalker;
        var focus = AutomationElement.FocusedElement;
        if (focus == null) return false;
        var type = focus.Current.ControlType;
        if ((pack == "canva" || pack == "miro") && type == ControlType.Edit) return false;

        AutomationElement document = null;
        var item = focus;
        for (int depth = 0; item != null && depth < 64; depth++, item = walker.GetParent(item))
        {
            if (item.Equals(root)) break;
            var properties = item.Current;
            if (properties.IsOffscreen || (properties.ControlType == ControlType.Window &&
                properties.NativeWindowHandle != 0)) return false;
            if (properties.ControlType == ControlType.Document) document = item;
        }
        if (document == null || item == null || !item.Equals(root)) return false;

        object pattern;
        if (document.TryGetCurrentPattern(ValuePattern.Pattern, out pattern))
        {
            string url = ((ValuePattern)pattern).Current.Value;
            if (!String.IsNullOrEmpty(url)) return EditorUrl(pack, url);
        }
        return EditorUrl(pack, ChromiumDocumentUrl(window));
    }

    private static string ChromiumDocumentUrl(IntPtr window)
    {
        // Some Chromium versions expose the document URL only through MSAA. Require a unique visible web surface.
        IntPtr renderWindow = IntPtr.Zero;
        bool ambiguous = false;
        var className = new StringBuilder(80);
        EnumChildWindows(window, delegate(IntPtr child, IntPtr data)
        {
            if (IsWindowVisible(child) && GetClassName(child, className, className.Capacity) > 0 &&
                className.ToString() == "Chrome_RenderWidgetHostHWND")
            {
                if (renderWindow != IntPtr.Zero)
                {
                    ambiguous = true;
                    return false;
                }
                renderWindow = child;
            }
            return true;
        }, IntPtr.Zero);
        if (renderWindow == IntPtr.Zero || ambiguous) return null;

        Guid iid = typeof(IAccessible).GUID;
        IAccessible client;
        if (AccessibleObjectFromWindow(renderWindow, 0xfffffffc, ref iid, out client) != 0 || client == null) return null;
        object role = client.get_accRole(0);
        if (role is int && (int)role == 15) return client.get_accValue(0); // ROLE_SYSTEM_DOCUMENT
        // Chromium's legacy client contains one root document. Avoid reading any descendant text or input values.
        if (client.accChildCount != 1) return null;
        var document = client.get_accChild(1) as IAccessible;
        if (document == null) return null;
        role = document.get_accRole(0);
        return role is int && (int)role == 15 ? document.get_accValue(0) : null;
    }

    public static bool EditorUrl(string pack, string value)
    {
        Uri url;
        if (!Uri.TryCreate(value, UriKind.Absolute, out url) || url.Scheme != Uri.UriSchemeHttps ||
            !url.IsDefaultPort || url.UserInfo.Length != 0) return false;

        string route;
        switch (pack)
        {
            case "gdocs": route = "document"; break;
            case "gsheets": route = "spreadsheets"; break;
            case "google-slides": route = "presentation"; break;
            case "canva":
                return (url.Host == "www.canva.com" || url.Host == "canva.com") &&
                    Regex.IsMatch(url.AbsolutePath, @"^/design/[\w-]+(?:/[\w-]+)?/edit/?$");
            case "miro":
                return url.Host == "miro.com" && Regex.IsMatch(url.AbsolutePath, @"^/app/board/[\w=-]+/?$");
            case "photoshop-web":
                return url.Host == "photoshop.adobe.com" && Regex.IsMatch(url.AbsolutePath, @"^/id/urn:aaid:sc:[\w:-]+/?$");
            default: return false;
        }
        return url.Host == "docs.google.com" && Regex.IsMatch(url.AbsolutePath,
            "^/" + route + @"/(?:u/\d+/)?d/[\w-]+/edit/?$");
    }
}
