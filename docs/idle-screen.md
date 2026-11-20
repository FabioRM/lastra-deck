# Idle screen

In the profile editor, open **Appearance → Idle screen after** and choose a timeout. The setting is off by default and applies to the deck across activities.

The idle screen shows the current time and date. It also shows your timers and stopwatches, an active production countdown or rundown segment, OBS streaming and recording status when observed, and the deck’s view-only status. The rundown shows the segment number and remaining time without its name.

Tap anywhere on the idle screen to wake the deck. **Enter**, **Space** and **Escape** also wake it from a keyboard. The wake gesture ends at the idle screen. Use a second gesture to select a key or change views.

An open deck dialog or held control postpones entry to the idle screen. Hiding the deck with **Reveal desktop** clears the overlay. When you restore Lastra, the inactivity timer restarts. Both touch and keyboard wake retain the current view and do not invoke a deck command.

## Windows session and night dimming

The local deck shows a full-screen cover while Windows is locked or suspended. Lastra cancels held inputs and pending confirmations on the deck, suspends embedded web content, and restores the current view after Windows unlocks. A release from a range control held across the lock is discarded.

Use **Night dimming** under **Lastra → Settings → Display** to set the deck interface to 80%, 55%, or 35% brightness. **Off** is the default. The setting uses software dimming and preserves the monitor’s hardware brightness setting.

## Hardware backlight

In **Deck Keys → Tools → Display backlight**, Lastra reads the XENEON EDGE’s brightness through Windows DDC/CI. Choose a percentage and select **Apply**. Lastra checks that the display and brightness still match the reading, then verifies the new value. Use **Read brightness** if you adjust the monitor elsewhere or leave the dialog open for over a minute. View-only mode permits reading the level.

The physical control requires a selected XENEON EDGE with an identifiable Windows monitor interface and working DDC/CI. The available cabling and display configuration determine whether Windows can reach it. Software dimming remains available if Windows cannot read the hardware level.
