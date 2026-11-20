# Now Playing

Open **Dashboard** to see the current player reported by Windows. Now Playing shows available cover art, track title, artist, album, elapsed time, and duration.

Use **Previous**, **Play** or **Pause**, and **Next** to control the displayed player. Drag the progress bar to seek when the player supports it. Lastra disables controls the player does not expose. A live stream can have no duration, and some players provide only part of the track information. If the target player or track changes before a command reaches Windows, Lastra asks you to try again.

Now Playing uses Windows Global System Media Transport Controls, available on Windows 10 version 1809 and later. The first open builds a small helper with the Windows .NET Framework compiler. The helper starts when Lastra reads media data and stops a few seconds after the last media view or widget is hidden. Now Playing reads artwork from the local Windows media session.

Add the **Spotify** widget from the widget catalog to follow the Spotify desktop app independently of the Windows default player. Start a track in Spotify to see its artwork, artist, and available transport controls. Spotify must publish a Windows media session. Web playback appears on **Dashboard** when Windows reports the browser as the current player. The optional Spotify Connect panel in **Apps → Spotify** shows playback devices and queue controls when the account supports them. [Spotify Connect setup](app-views.md#spotify-connect)

[Windows media session API](https://learn.microsoft.com/windows/uwp/api/windows.media.control.globalsystemmediatransportcontrolssession)
