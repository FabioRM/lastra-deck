# Service health

Open **Apps → Service health** and select **Edit checks**. Lastra opens `service-checks.json` in its application data folder. Add the services you want Lastra to monitor and save the file. Lastra applies valid edits automatically and shows configuration errors alongside the last valid checks.

```json
{
  "version": 1,
  "checks": [
    { "id": "web", "name": "Local web app", "kind": "http", "target": "http://localhost:3000/health", "expectedStatus": 200 },
    { "id": "database", "name": "Database port", "kind": "tcp", "target": "localhost", "port": 5432 },
    { "id": "dns", "name": "Service DNS", "kind": "dns", "target": "example.com", "record": "A" },
    { "id": "host", "name": "Gateway", "kind": "ping", "target": "192.168.1.1" }
  ]
}
```

HTTP uses `HEAD` and reports the status of the configured endpoint. Without `expectedStatus`, responses below 400 succeed. TCP tests whether the configured port accepts a connection. DNS supports `A` and `AAAA` using the system DNS configuration. Ping uses the Windows ICMP echo API through PowerShell.

Each check can set `intervalSeconds` from 10 to 3,600 (default 30), `timeoutMs` from 250 to 8,000 (default 3,000), and `failureThreshold` from 2 to 10 (default 2). A failure below the threshold shows **Retrying**. A successful check clears the failure streak and shows **Available**. Each card shows its last result and the success rate across up to 120 checks during the current Lastra run.

Lastra runs configured checks while the app is open, including when you leave the Service health view. An empty configuration runs no checks. Up to three probes can run at once. Closing Lastra cancels pending checks. Use endpoints you administer or are authorised to monitor.

## Certificate expiry and job heartbeat

Add a `certificate` check to monitor the leaf certificate of an HTTPS server. Lastra reads it over a normal validated TLS connection and uses the URL's host and port. The check fails inside the configured `warningDays` window, from 1 to 365 days with a default of 30. Set up a separate `http` check if you also want the HTTP status.

Add a `heartbeat` check for a job that updates a local file when it succeeds. Choose an absolute local path and set `maxAgeSeconds` from 10 to 604,800. Lastra reads the last-modified time. Updating the file extends the deadline, and a missing or overdue heartbeat counts as a failed check.

```json
{
  "version": 1,
  "checks": [
    { "id": "site-tls", "name": "Site certificate", "kind": "certificate", "target": "https://example.com", "warningDays": 30 },
    { "id": "backup", "name": "Backup heartbeat", "kind": "heartbeat", "target": "C:\\Jobs\\backup.ok", "maxAgeSeconds": 900 }
  ]
}
```

The service card shows the last successful check, the certificate expiry or heartbeat deadline, and the most recent heartbeat when available. If a new check cannot read those values, the card labels retained values **last observed**. Existing thresholds control when repeat failures trigger an alert and count on the Service health badge. Recovery closes the alert as it does for other checks.

## Alert inbox

Open **Apps → Alert inbox** to review alerts from monitored services and other configured sources. **Acknowledge** records that you saw the alert. **View check** opens the related service card. A passing result after an outage moves the entry to **Recent history**. If the same check goes down later, the inbox groups it with the earlier alert, increments its occurrence count, and clears the old acknowledgement. Removing a check marks prior alerts as **Monitoring stopped**. Lastra keeps up to 150 entries and stores acknowledgements locally.
