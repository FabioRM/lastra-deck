# Push-to-talk

1. Tap the microphone icon beside the level slider in Deck Keys and select the input your call or recording app uses.
2. Mute that microphone in Windows, or use the top-right microphone button to mute every active input.
3. Hold the square **Push to talk** button at the bottom right until it shows **Talking**. Release it to re-mute the selected microphone. A quick tap leaves the microphone muted.

The control temporarily changes the mute of the selected Windows capture device. Other inputs keep their current mute settings. Set any app-specific mute controls separately.

Moving off the button, opening a mixer, changing the selected input or deck page, and losing the deck window all end the hold. The top-right microphone button acts as an emergency mute while a push-to-talk hold is active. Lastra also ends the hold when Windows locks or suspends and limits any one hold to 30 seconds.

If Windows cannot confirm the microphone was re-muted, Lastra shows **Mute unverified** and retries while running, including after the device reconnects. Check the device's mute in Windows before relying on it. A short-lived guard starts before the microphone can open and tries to re-mute it if the main process exits unexpectedly. If Windows stops responding, the audio device is unavailable, or the entire Lastra process tree is terminated, use hardware mute or check the mute in Windows.
