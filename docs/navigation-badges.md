# Navigation badges

- **Apps** and the **Alert inbox** card show the number of active, unacknowledged Lastra alerts. Acknowledging an alert lowers the count even if the underlying issue is still active. A finished countdown counts as an alert until you acknowledge it or dismiss the timer. [Timers](timers.md)
- The **Service health** card shows how many configured checks are confirmed down. A check still retrying sits below its failure threshold. The count appears after every configured check has a fresh result. **…** indicates pending first results, **Stale** indicates expired readings or a problem reading the check configuration, and **?** indicates unavailable data. With no service checks configured, the card has no numeric badge.
- **OBS** and its **Timers** button show the number of active production timers. The countdown and current rundown segment each count once, including when they overrun. A completed rundown stops counting.

Zero counts are available in the control's accessible description. Badges use the live state already maintained by Lastra and update when a source changes.
