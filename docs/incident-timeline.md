# Stats incident timeline

Open **Stats → Timeline** to see the launches, deployments, and service incidents in the displayed time range. Select **Launch** or **Deployment**, enter a short name, and tap **Add marker** to record an event at the current time. Each graph marks the events within its own time range.

Lastra adds a service incident when a configured service check reaches its failure threshold. It adds a recovery when the same check succeeds. The timeline saves up to 256 events from the last seven days in the local Lastra user data. Service entries contain the check name and the event time.

Set the Grafana dashboard URL under **Lastra → Settings → Stats**. A Grafana server on the same machine can also use an HTTP loopback address. **Grafana** on each metric opens that graph's exact time range. **Open Grafana** in the timeline opens the range shown at the top of the dialog. Both preserve dashboard filters and set Grafana's `from` and `to` parameters in epoch milliseconds. [Grafana dashboard links](https://grafana.com/docs/grafana/latest/visualizations/dashboards/build-dashboards/manage-dashboard-links/) · [Grafana dashboard URL variables](https://grafana.com/docs/grafana/latest/visualizations/dashboards/build-dashboards/create-dashboard-url-variables/)
