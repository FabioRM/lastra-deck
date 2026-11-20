# Dashboard agenda

Select **Choose .ics file** under **Lastra → Settings → Display → Dashboard calendar file** and pick a local `.ics` export. Lastra shows the next event and its time, or marks an event already in progress. Replace the export at the same location to refresh it, or use **Choose .ics file** to select another source. **Clear file** removes the selection from Lastra and leaves the calendar file in place.

**Join** opens a direct Google Meet, Microsoft Teams or Zoom meeting link found in the selected event. Lastra checks the event again when you tap. The file stays on this PC and Lastra reads it without signing in to the calendar. View-only mode can display the event.

Calendar exports of up to 512 KiB support all-day and timed events, local and UTC times, embedded time-zone definitions, and common recurrence rules with occurrence exclusions and replacements. Lastra reports when it cannot include some events, including when a recurring series exceeds the look-ahead limits or a named time zone lacks a definition in the file. [iCalendar format](https://www.rfc-editor.org/rfc/rfc5545) · [iCalendar parser](https://github.com/kewisch/ical.js)
