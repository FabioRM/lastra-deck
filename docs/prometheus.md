# Prometheus in Lastra

Open **Apps → Prometheus → Edit connections** to create or edit the local `prometheus.json` file. Lastra starts reading metrics after you add a source and open its view. A source URL can use HTTPS or HTTP on the same PC through a loopback address.

```json
{
  "version": 1,
  "intervalSeconds": 15,
  "sources": [
    {
      "id": "monitoring",
      "name": "Monitoring",
      "url": "http://127.0.0.1:9090",
      "dashboard": "http://127.0.0.1:9090/query",
      "metrics": [
        {
          "id": "up",
          "name": "Available instances",
          "host": "Lab",
          "service": "Example service",
          "query": "sum(up{job=\"example\"})"
        }
      ]
    }
  ]
}
```

Each metric has a display name, a host and service for grouping, and an optional `unit` such as `MiB` or `%`. Choose an instant PromQL query that returns a finite scalar or exactly one series. Up to two sources can provide four metrics each. Set `intervalSeconds` between 10 and 60 seconds. A cached value shows when Lastra last retrieved it. [Prometheus instant queries](https://prometheus.io/docs/prometheus/latest/querying/api/#instant-queries)

If the server requires a bearer credential, set a variable such as `LASTRA_PROMETHEUS_MONITOR_TOKEN` in the environment used to start Lastra. Add `"bearerEnv": "LASTRA_PROMETHEUS_MONITOR_TOKEN"` to that source in the configuration. Keep the credential in the environment and use the variable name in the file. Lastra sends it to the configured query endpoint and leaves it out of the deck view.

Save an optional `dashboard` URL to add **Open dashboard** to its source card. The link opens in the default browser after a tap.
